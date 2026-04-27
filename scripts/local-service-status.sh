#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/.runtime"
PID_FILE="$RUNTIME_DIR/local-service.pid"
LOG_FILE="$RUNTIME_DIR/local-service.log"

if [ ! -f "$PID_FILE" ]; then
  echo "status=stopped"
  echo "message=PID file not found"
  exit 0
fi

PID="$(cat "$PID_FILE" 2>/dev/null || true)"
if [ -z "$PID" ]; then
  echo "status=stopped"
  echo "message=PID file empty"
  exit 0
fi

if kill -0 "$PID" >/dev/null 2>&1; then
  echo "status=running"
  echo "pid=$PID"
  echo "log=$LOG_FILE"
  exit 0
fi

if curl -sS --max-time 2 http://127.0.0.1:8080/api/healthz >/dev/null 2>&1; then
  echo "status=running"
  echo "pid=unknown"
  echo "log=$LOG_FILE"
  echo "message=service is reachable but PID file is stale"
  exit 0
fi

echo "status=stopped"
echo "message=stale PID file"
exit 0
