#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/.runtime"
PID_FILE="$RUNTIME_DIR/local-service.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "ℹ️ PID file غير موجود، سيتم تنفيذ إيقاف عبر البورتات."
else
  PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -z "$PID" ]; then
    rm -f "$PID_FILE"
    echo "ℹ️ PID file فارغ وتم تنظيفه."
  elif kill -0 "$PID" >/dev/null 2>&1; then
    kill "$PID" >/dev/null 2>&1 || true
    sleep 1
    if kill -0 "$PID" >/dev/null 2>&1; then
      kill -9 "$PID" >/dev/null 2>&1 || true
    fi
    echo "🛑 تم إيقاف الخدمة (PID: $PID)"
  else
    echo "ℹ️ الخدمة كانت متوقفة بالفعل."
  fi
fi

# Fallback: stop listeners on expected local app ports.
for port in 8080 18936; do
  pids="$(lsof -t -n -P -iTCP:$port -sTCP:LISTEN 2>/dev/null || true)"
  if [ -z "$pids" ]; then
    continue
  fi

  while IFS= read -r p; do
    [ -z "$p" ] && continue
    kill "$p" >/dev/null 2>&1 || true
  done <<< "$pids"
done

rm -f "$PID_FILE"
