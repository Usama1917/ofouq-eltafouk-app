#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.local-db.yml"
ENV_FILE="$ROOT_DIR/artifacts/api-server/.env"

LOCAL_DB_HOST="${LOCAL_DB_HOST:-localhost}"
LOCAL_DB_PORT="${LOCAL_DB_PORT:-5432}"
LOCAL_DB_NAME="${LOCAL_DB_NAME:-ofouq_eltafouk}"
LOCAL_DB_USER="${LOCAL_DB_USER:-postgres}"
LOCAL_DB_PASSWORD="${LOCAL_DB_PASSWORD:-postgres}"
API_PORT="${API_PORT:-8080}"

if ! command -v docker >/dev/null 2>&1; then
  echo "❌ Docker غير موجود. ثبّت Docker Desktop ثم أعد المحاولة."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "❌ docker compose غير متاح. تأكد من تثبيت Docker Compose v2."
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "❌ pnpm غير موجود. ثبّته أولًا."
  exit 1
fi

upsert_env_var() {
  local file="$1"
  local key="$2"
  local value="$3"

  mkdir -p "$(dirname "$file")"

  if [ ! -f "$file" ]; then
    printf "%s=%s\n" "$key" "$value" > "$file"
    return
  fi

  awk -v k="$key" -v v="$value" '
    BEGIN { updated = 0 }
    $0 ~ ("^" k "=") {
      print k "=" v
      updated = 1
      next
    }
    { print }
    END {
      if (!updated) {
        print k "=" v
      }
    }
  ' "$file" > "$file.tmp"

  mv "$file.tmp" "$file"
}

wait_for_postgres() {
  local waited=0
  local timeout_seconds=60

  while true; do
    if docker compose -f "$COMPOSE_FILE" exec -T postgres \
      pg_isready -U "$LOCAL_DB_USER" -d "$LOCAL_DB_NAME" >/dev/null 2>&1; then
      return
    fi

    if [ "$waited" -ge "$timeout_seconds" ]; then
      echo "❌ PostgreSQL لم يصبح جاهزًا خلال ${timeout_seconds} ثانية."
      exit 1
    fi

    if [ "$waited" -eq 0 ]; then
      echo "⏳ في انتظار PostgreSQL ليصبح جاهزًا..."
    fi

    sleep 2
    waited=$((waited + 2))
  done
}

export LOCAL_DB_PORT LOCAL_DB_NAME LOCAL_DB_USER LOCAL_DB_PASSWORD

echo "🐘 تشغيل PostgreSQL المحلي عبر Docker..."
docker compose -f "$COMPOSE_FILE" up -d

wait_for_postgres

DATABASE_URL="postgresql://${LOCAL_DB_USER}:${LOCAL_DB_PASSWORD}@${LOCAL_DB_HOST}:${LOCAL_DB_PORT}/${LOCAL_DB_NAME}"

upsert_env_var "$ENV_FILE" "PORT" "$API_PORT"
upsert_env_var "$ENV_FILE" "NODE_ENV" "development"
upsert_env_var "$ENV_FILE" "DATABASE_URL" "$DATABASE_URL"

echo "🧩 تطبيق Drizzle schema على قاعدة البيانات المحلية..."
DATABASE_URL="$DATABASE_URL" pnpm --filter @workspace/db run push

echo "🌱 Seed demo users (idempotent)..."
DATABASE_URL="$DATABASE_URL" pnpm --filter @workspace/scripts run seed:demo

echo ""
echo "✅ Local DB جاهزة"
echo "   DATABASE_URL=$DATABASE_URL"
echo "   ENV file: $ENV_FILE"
echo ""
echo "لتشغيل التطبيق:"
echo "  pnpm start:local"
