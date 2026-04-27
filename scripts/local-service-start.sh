#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/.runtime"
PID_FILE="$RUNTIME_DIR/local-service.pid"
LOG_FILE="$RUNTIME_DIR/local-service.log"

mkdir -p "$RUNTIME_DIR"

if [ -f "$PID_FILE" ]; then
  OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" >/dev/null 2>&1; then
    echo "ℹ️ الخدمة شغالة بالفعل (PID: $OLD_PID)"
    echo "📄 Logs: $LOG_FILE"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

echo "[$(date +"%Y-%m-%d %H:%M:%S")] starting pnpm start:local" >> "$LOG_FILE"
nohup bash -lc 'cd "'$ROOT_DIR'" && pnpm start:local' >> "$LOG_FILE" 2>&1 < /dev/null &

NEW_PID=$!
disown "$NEW_PID" 2>/dev/null || true
echo "$NEW_PID" > "$PID_FILE"

# Give it a moment, then basic status output
sleep 1
if kill -0 "$NEW_PID" >/dev/null 2>&1; then
  echo "✅ Local service started in background"
  echo "   PID: $NEW_PID"
  echo "   Logs: $LOG_FILE"
  echo "   Frontend (when ready): http://localhost:18936"
else
  echo "❌ فشل تشغيل الخدمة. راجع اللوج: $LOG_FILE"
  rm -f "$PID_FILE"
  exit 1
fi
