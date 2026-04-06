#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/artifacts/api-server/.env"
API_PORT_DEFAULT=8080
FRONTEND_PORT_DEFAULT=18936
DB_READY_TIMEOUT_SECONDS="${DB_READY_TIMEOUT_SECONDS:-60}"
DB_READY_POLL_SECONDS=2
API_READY_TIMEOUT_SECONDS="${API_READY_TIMEOUT_SECONDS:-45}"
API_READY_POLL_SECONDS=1

cd "$ROOT_DIR"

load_env_fallbacks() {
  if [ ! -f "$ENV_FILE" ]; then
    return
  fi

  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      "" | \#*) continue ;;
    esac

    key="${line%%=*}"
    value="${line#*=}"
    if [ -z "${!key:-}" ]; then
      export "$key=$value"
    fi
  done < "$ENV_FILE"
}

resolve_database_url() {
  DATABASE_URL_SOURCE=""
  if [ -n "${DATABASE_URL:-}" ]; then
    DATABASE_URL_SOURCE="DATABASE_URL"
    return
  fi

  for key in POSTGRES_URL POSTGRES_URL_NON_POOLING POSTGRES_PRISMA_URL POSTGRESQL_URL; do
    value="${!key:-}"
    if [ -n "$value" ]; then
      export DATABASE_URL="$value"
      DATABASE_URL_SOURCE="$key"
      return
    fi
  done
}

mask_database_url() {
  node -e '
    try {
      const u = new URL(process.argv[1]);
      const username = u.username ? `${u.username}@` : "";
      const port = u.port || "5432";
      const dbName = u.pathname.replace(/^\//, "") || "(no-db)";
      console.log(`${u.protocol}//${username}${u.hostname}:${port}/${dbName}`);
    } catch {
      console.log("(invalid DATABASE_URL)");
    }
  ' "$1"
}

probe_db() {
  local url="$1"
  PGPASSWORD="${PGPASSWORD:-}" psql "$url" -c "select 1;" >/dev/null 2>&1
}

maybe_fix_local_6543_url() {
  if [[ -z "${DATABASE_URL:-}" ]]; then
    return
  fi

  if [[ "$DATABASE_URL" != *":6543/"* ]]; then
    return
  fi

  if [[ "$DATABASE_URL" != *"localhost"* && "$DATABASE_URL" != *"127.0.0.1"* ]]; then
    return
  fi

  if probe_db "$DATABASE_URL"; then
    return
  fi

  local candidate="${DATABASE_URL/:6543\//:5432/}"
  if probe_db "$candidate"; then
    echo "⚠️  DATABASE_URL points to :6543 but local DB is reachable on :5432. Using :5432 for this session."
    export DATABASE_URL="$candidate"
    DATABASE_URL_SOURCE="${DATABASE_URL_SOURCE}+fallback_5432"
  fi
}

wait_for_db_ready() {
  local waited=0
  while ! probe_db "$DATABASE_URL"; do
    if [ "$waited" -ge "$DB_READY_TIMEOUT_SECONDS" ]; then
      echo "❌ Database is not reachable after ${DB_READY_TIMEOUT_SECONDS}s"
      echo "   DATABASE_URL source: ${DATABASE_URL_SOURCE:-unknown}"
      echo "   DATABASE_URL: $(mask_database_url "$DATABASE_URL")"
      echo "   Tip: verify Postgres is running and DATABASE_URL is correct."
      return 1
    fi

    if [ "$waited" -eq 0 ]; then
      echo "⏳ Waiting for database to be ready..."
      echo "   DATABASE_URL source: ${DATABASE_URL_SOURCE:-unknown}"
      echo "   DATABASE_URL: $(mask_database_url "$DATABASE_URL")"
    fi

    sleep "$DB_READY_POLL_SECONDS"
    waited=$((waited + DB_READY_POLL_SECONDS))
  done
}

run_providerless_migration() {
  echo "🧩 Applying provider-to-subject migration (idempotent)..."
  PGPASSWORD="${PGPASSWORD:-}" psql "$DATABASE_URL" <<'SQL'
DO $$
BEGIN
  IF to_regclass('public.units') IS NOT NULL
     AND to_regclass('public.content_providers') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'units'
         AND column_name = 'provider_id'
     ) THEN
    UPDATE units AS u
    SET subject_id = cp.subject_id
    FROM content_providers AS cp
    WHERE u.provider_id = cp.id
      AND u.subject_id IS NULL;
  END IF;

  IF to_regclass('public.subjects') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'subjects'
        AND column_name = 'has_providers'
    ) THEN
      ALTER TABLE subjects DROP COLUMN has_providers;
    END IF;
  END IF;

  IF to_regclass('public.units') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'units'
        AND column_name = 'provider_id'
    ) THEN
      ALTER TABLE units DROP COLUMN provider_id;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'units'
        AND column_name = 'subject_id'
    ) THEN
      IF EXISTS (SELECT 1 FROM units WHERE subject_id IS NULL) THEN
        RAISE EXCEPTION 'units.subject_id still contains NULL rows. Fix invalid data before startup.';
      END IF;
      ALTER TABLE units ALTER COLUMN subject_id SET NOT NULL;
    END IF;
  END IF;

  IF to_regclass('public.content_providers') IS NOT NULL THEN
    DROP TABLE content_providers;
  END IF;
END $$;
SQL
}

install_orphan_video_cleanup_trigger() {
  echo "🧹 Installing orphan-video cleanup trigger..."
  PGPASSWORD="${PGPASSWORD:-}" psql "$DATABASE_URL" <<'SQL'
DO $$
BEGIN
  IF to_regclass('public.videos') IS NULL OR to_regclass('public.lessons') IS NULL THEN
    RETURN;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION cleanup_orphan_videos_after_lesson_change()
RETURNS trigger AS $$
BEGIN
  IF OLD.video_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM lessons
    WHERE video_id = OLD.video_id
    LIMIT 1
  ) THEN
    RETURN NULL;
  END IF;

  DELETE FROM videos WHERE id = OLD.video_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cleanup_orphan_videos_after_delete ON lessons;
CREATE TRIGGER trg_cleanup_orphan_videos_after_delete
AFTER DELETE ON lessons
FOR EACH ROW
EXECUTE FUNCTION cleanup_orphan_videos_after_lesson_change();

DROP TRIGGER IF EXISTS trg_cleanup_orphan_videos_after_update ON lessons;
CREATE TRIGGER trg_cleanup_orphan_videos_after_update
AFTER UPDATE OF video_id ON lessons
FOR EACH ROW
WHEN (OLD.video_id IS DISTINCT FROM NEW.video_id)
EXECUTE FUNCTION cleanup_orphan_videos_after_lesson_change();
SQL
}

cleanup_children() {
  local code="${1:-0}"
  if [ -n "${API_PID:-}" ]; then kill "$API_PID" >/dev/null 2>&1 || true; fi
  if [ -n "${FE_PID:-}" ]; then kill "$FE_PID" >/dev/null 2>&1 || true; fi
  exit "$code"
}

wait_for_api_ready() {
  local target="$1"
  local waited=0
  while ! curl -sS -o /dev/null --max-time 2 "$target/api/auth/me"; do
    if ! kill -0 "$API_PID" >/dev/null 2>&1; then
      echo "❌ API process exited before becoming ready."
      return 1
    fi

    if [ "$waited" -ge "$API_READY_TIMEOUT_SECONDS" ]; then
      echo "❌ API is not reachable after ${API_READY_TIMEOUT_SECONDS}s at ${target}/api/auth/me"
      return 1
    fi

    if [ "$waited" -eq 0 ]; then
      echo "⏳ Waiting for API to be ready at ${target}..."
    fi

    sleep "$API_READY_POLL_SECONDS"
    waited=$((waited + API_READY_POLL_SECONDS))
  done
}

stop_or_fail_port_conflict() {
  local port="$1"
  local service_name="$2"
  local pids=""
  pids="$(lsof -t -n -P -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"

  if [ -z "$pids" ]; then
    return 0
  fi

  while IFS= read -r pid; do
    [ -z "$pid" ] && continue

    local cmd
    cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"

    if [[ "$cmd" == *"$ROOT_DIR"* ]]; then
      echo "♻️  Stopping stale $service_name process on port $port (pid $pid)"
      kill "$pid" >/dev/null 2>&1 || true
      continue
    fi

    echo "❌ Port $port is already in use by another process."
    echo "   PID $pid: ${cmd:-unknown}"
    echo "   Stop it first, or change the port for this run."
    return 1
  done <<< "$pids"

  sleep 1

  if lsof -n -P -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "❌ Could not free port $port."
    echo "   Stop the process manually, then run pnpm start:local again."
    return 1
  fi
}

load_env_fallbacks
resolve_database_url

if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ Missing DATABASE_URL."
  echo "   Set one of: DATABASE_URL / POSTGRES_URL / POSTGRES_URL_NON_POOLING / POSTGRES_PRISMA_URL / POSTGRESQL_URL"
  echo "   Checked .env fallback: $ENV_FILE"
  exit 1
fi

maybe_fix_local_6543_url
wait_for_db_ready

run_providerless_migration

echo "🔧 Applying database schema (drizzle push)..."
DATABASE_URL="$DATABASE_URL" pnpm --filter @workspace/db run push

install_orphan_video_cleanup_trigger

echo "🌱 Seeding demo users (idempotent)..."
DATABASE_URL="$DATABASE_URL" pnpm --filter @workspace/scripts run seed:demo

API_PORT="${API_PORT:-$API_PORT_DEFAULT}"
FRONTEND_PORT="${FRONTEND_PORT:-${PORT:-$FRONTEND_PORT_DEFAULT}}"
BASE_PATH="${BASE_PATH:-/}"
API_PROXY_TARGET="${API_PROXY_TARGET:-http://127.0.0.1:${API_PORT}}"

stop_or_fail_port_conflict "$API_PORT" "API"
stop_or_fail_port_conflict "$FRONTEND_PORT" "frontend"

echo ""
echo "🚀 Starting Ofouq Eltafouk"
echo "   API port:      $API_PORT"
echo "   Frontend port: $FRONTEND_PORT"
echo "   BASE_PATH:     $BASE_PATH"
echo "   API target:    $API_PROXY_TARGET"
echo ""

(DATABASE_URL="$DATABASE_URL" PORT="$API_PORT" NODE_ENV="${NODE_ENV:-development}" pnpm --filter @workspace/api-server run dev) &
API_PID=$!

wait_for_api_ready "$API_PROXY_TARGET"

(PORT="$FRONTEND_PORT" BASE_PATH="$BASE_PATH" API_PROXY_TARGET="$API_PROXY_TARGET" pnpm --filter @workspace/ofouq-eltafouk run dev:frontend) &
FE_PID=$!

trap 'cleanup_children 0' INT TERM

EXIT_CODE=0
while true; do
  if ! kill -0 "$API_PID" >/dev/null 2>&1; then
    set +e
    wait "$API_PID"
    EXIT_CODE=$?
    set -e
    break
  fi

  if ! kill -0 "$FE_PID" >/dev/null 2>&1; then
    set +e
    wait "$FE_PID"
    EXIT_CODE=$?
    set -e
    break
  fi

  sleep 1
done

if [ "$EXIT_CODE" -ne 0 ]; then
  echo "❌ One of the services exited with code $EXIT_CODE"
fi
cleanup_children "$EXIT_CODE"
