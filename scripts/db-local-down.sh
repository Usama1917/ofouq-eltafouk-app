#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.local-db.yml"
REMOVE_VOLUMES="${REMOVE_VOLUMES:-false}"

if ! command -v docker >/dev/null 2>&1; then
  echo "❌ Docker غير موجود."
  exit 1
fi

if [ "$REMOVE_VOLUMES" = "true" ]; then
  echo "🧹 إيقاف PostgreSQL المحلي وحذف البيانات (volumes)..."
  docker compose -f "$COMPOSE_FILE" down -v
else
  echo "🛑 إيقاف PostgreSQL المحلي (مع الاحتفاظ بالبيانات)..."
  docker compose -f "$COMPOSE_FILE" down
fi

echo "✅ تمت العملية"
