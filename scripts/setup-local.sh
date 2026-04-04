#!/usr/bin/env bash
set -e

# ─────────────────────────────────────────────
# 🚀 Setup local environment for Ofouq Eltafouk
# ─────────────────────────────────────────────

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/artifacts/api-server/.env"
DB_NAME="ofouq_eltafouk"
DB_USER="$(whoami)"
DB_URL="postgresql://$DB_USER@localhost:5432/$DB_NAME"

echo ""
echo "════════════════════════════════════════════"
echo " Ofouq Eltafouk — Local Setup Script"
echo "════════════════════════════════════════════"
echo ""

# ── Step 1: Check for Homebrew ──────────────────
if ! command -v brew &>/dev/null; then
  echo "⚠️  Homebrew not found. Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Add brew to path for Apple Silicon
  if [ -f /opt/homebrew/bin/brew ]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  fi
else
  echo "✅ Homebrew found: $(brew --version | head -1)"
fi

# ── Step 2: Install PostgreSQL if needed ────────
if ! command -v psql &>/dev/null; then
  echo "📦 Installing PostgreSQL via Homebrew..."
  brew install postgresql@16
  brew link postgresql@16 --force
  export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
else
  echo "✅ PostgreSQL found: $(psql --version)"
fi

# ── Step 3: Start PostgreSQL ────────────────────
echo ""
echo "🔄 Starting PostgreSQL..."
if brew services list 2>/dev/null | grep -q "postgresql"; then
  brew services start postgresql@16 2>/dev/null || brew services restart postgresql@16 2>/dev/null || true
else
  pg_ctl -D /opt/homebrew/var/postgresql@16 start 2>/dev/null || true
fi
sleep 2

# ── Step 4: Create database ─────────────────────
echo "🗄️  Creating database: $DB_NAME"
createdb "$DB_NAME" 2>/dev/null && echo "   ✅ Database created" || echo "   ℹ️  Database already exists"

# ── Step 5: Write .env file ─────────────────────
echo ""
echo "📝 Writing .env file..."
cat > "$ENV_FILE" << EOF
PORT=8080
NODE_ENV=development
DATABASE_URL=$DB_URL
EOF
echo "   ✅ Written to: $ENV_FILE"
echo "   DATABASE_URL=$DB_URL"

# ── Step 6: Run migrations ──────────────────────
echo ""
echo "🔧 Running database migrations (drizzle-kit push)..."
cd "$ROOT_DIR"
DATABASE_URL="$DB_URL" pnpm --filter @workspace/db run push
echo "   ✅ Migrations complete"

# ── Step 7: Build API server ────────────────────
echo ""
echo "🏗️  Building API server..."
cd "$ROOT_DIR"
pnpm --filter @workspace/api-server run build
echo "   ✅ API server built"

# ── Step 8: Seed demo accounts ──────────────────
echo ""
echo "🌱 Seeding demo accounts..."
API_PID=""
if curl -sf http://localhost:8080/api/healthz >/dev/null 2>&1; then
  echo "   ℹ️  API already running on port 8080, using existing server for seed..."
else
  PORT=8080 DATABASE_URL="$DB_URL" node --enable-source-maps "$ROOT_DIR/artifacts/api-server/dist/index.mjs" &
  API_PID=$!
  sleep 3
fi
curl -s -X POST http://localhost:8080/api/auth/seed-demo \
  -H "Content-Type: application/json" | grep -o '"message":"[^"]*"' || echo "   ⚠️  Could not seed (check if API started)"
if [ -n "$API_PID" ]; then
  kill $API_PID 2>/dev/null || true
  wait $API_PID 2>/dev/null || true
fi

echo ""
echo "════════════════════════════════════════════"
echo " ✅ Setup complete!"
echo "════════════════════════════════════════════"
echo ""
echo " 🔑 Demo Credentials:"
echo "    admin@demo.com   / admin123   → /admin-login"
echo "    owner@demo.com   / owner123   → /owner-login"
echo "    student@demo.com / demo123    → /login"
echo ""
echo " 🚀 To run the full stack:"
echo "    Terminal 1 (API):      PORT=8080 pnpm --filter @workspace/api-server run dev"
echo "    Terminal 2 (Frontend): PORT=18936 BASE_PATH=/ pnpm --filter @workspace/ofouq-eltafouk run dev"
echo ""
echo " Or use: bash scripts/start-local.sh"
echo ""
