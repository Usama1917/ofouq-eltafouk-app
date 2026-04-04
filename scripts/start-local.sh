#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/artifacts/api-server/.env"

# Load .env
if [ -f "$ENV_FILE" ]; then
  export $(grep -v '^#' "$ENV_FILE" | xargs)
fi

echo ""
echo "🚀 Starting Ofouq Eltafouk (local)"
echo ""

# Start API server in background
echo "▶️  Starting API server on port ${PORT:-8080}..."
cd "$ROOT_DIR"
(DATABASE_URL="$DATABASE_URL" PORT="${PORT:-8080}" pnpm --filter @workspace/api-server run dev) &
API_PID=$!

sleep 4

# Start frontend
echo "▶️  Starting frontend on port 18936..."
(PORT=18936 BASE_PATH=/ pnpm --filter @workspace/ofouq-eltafouk run dev) &
FE_PID=$!

echo ""
echo "════════════════════════════════════════════"
echo " ✅ Both servers running!"
echo "    API:      http://localhost:8080/api"
echo "    Frontend: http://localhost:18936"
echo ""
echo " Press Ctrl+C to stop both."
echo "════════════════════════════════════════════"

# Trap Ctrl+C to kill both
trap "kill $API_PID $FE_PID 2>/dev/null; exit" INT TERM
wait
