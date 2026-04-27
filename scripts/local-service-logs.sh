#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_FILE="$ROOT_DIR/.runtime/local-service.log"

if [ ! -f "$LOG_FILE" ]; then
  echo "ℹ️ لا يوجد logs حتى الآن."
  exit 0
fi

tail -n 120 "$LOG_FILE"
