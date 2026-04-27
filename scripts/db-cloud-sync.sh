#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/artifacts/api-server/.env"
TMP_DIR="$ROOT_DIR/.tmp"
SYNC_MODE="${SYNC_MODE:-schema-and-data}"

mkdir -p "$TMP_DIR"

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "❌ pg_dump غير موجود. ثبّت PostgreSQL client tools أولًا."
  exit 1
fi

if ! command -v pg_restore >/dev/null 2>&1; then
  echo "❌ pg_restore غير موجود. ثبّت PostgreSQL client tools أولًا."
  exit 1
fi

read_database_url_from_env_file() {
  if [ ! -f "$ENV_FILE" ]; then
    return
  fi

  awk -F'=' '/^DATABASE_URL=/{print substr($0, index($0,$2)); exit}' "$ENV_FILE"
}

LOCAL_DATABASE_URL="${LOCAL_DATABASE_URL:-${DATABASE_URL:-}}"
if [ -z "$LOCAL_DATABASE_URL" ]; then
  LOCAL_DATABASE_URL="$(read_database_url_from_env_file || true)"
fi

CLOUD_DATABASE_URL="${CLOUD_DATABASE_URL:-}"

if [ -z "$LOCAL_DATABASE_URL" ]; then
  echo "❌ LOCAL_DATABASE_URL غير موجود."
  echo "   مرره كمتغير بيئة أو ضعه في $ENV_FILE"
  exit 1
fi

if [ -z "$CLOUD_DATABASE_URL" ]; then
  echo "❌ CLOUD_DATABASE_URL غير موجود."
  echo "   مثال: CLOUD_DATABASE_URL='postgresql://...sslmode=require' pnpm db:cloud:sync"
  exit 1
fi

DUMP_FILE="$TMP_DIR/ofouq-sync-$(date +%Y%m%d-%H%M%S).dump"

echo "📦 إنشاء dump من القاعدة المحلية..."
if [ "$SYNC_MODE" = "data-only" ]; then
  pg_dump \
    --format=custom \
    --no-owner \
    --no-privileges \
    --data-only \
    --dbname "$LOCAL_DATABASE_URL" \
    --file "$DUMP_FILE"
else
  pg_dump \
    --format=custom \
    --no-owner \
    --no-privileges \
    --dbname "$LOCAL_DATABASE_URL" \
    --file "$DUMP_FILE"
fi

echo "☁️ رفع البيانات إلى قاعدة السحابة..."
if [ "$SYNC_MODE" = "data-only" ]; then
  pg_restore \
    --no-owner \
    --no-privileges \
    --data-only \
    --disable-triggers \
    --dbname "$CLOUD_DATABASE_URL" \
    "$DUMP_FILE"
else
  pg_restore \
    --no-owner \
    --no-privileges \
    --clean \
    --if-exists \
    --dbname "$CLOUD_DATABASE_URL" \
    "$DUMP_FILE"
fi

echo "✅ تمت المزامنة إلى السحابة بنجاح"
echo "   Mode: $SYNC_MODE"
echo "   Dump: $DUMP_FILE"
echo ""
echo "ملاحظة: في وضع schema-and-data يتم استبدال الجداول الموجودة في Cloud."
