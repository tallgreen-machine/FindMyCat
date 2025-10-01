#!/usr/bin/env bash
set -euo pipefail

# Packages frontend and backend artifacts for deployment.
# - Builds frontend with PUBLIC_URL path prefix and API/WS URLs
# - Builds backend TypeScript
# - Produces tarballs under ./dist-packages

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_DIR="$ROOT_DIR/backend"
OUT_DIR="$ROOT_DIR/dist-packages"

# Configurable via env
PUBLIC_URL_PREFIX=${PUBLIC_URL_PREFIX:-/findmy}
API_BASE_URL=${API_BASE_URL:-https://example.com${PUBLIC_URL_PREFIX}}
WS_BASE_URL=${WS_BASE_URL:-$API_BASE_URL}

echo "🏗️  Packaging FindMyCat for deployment"
echo "   PUBLIC_URL_PREFIX=$PUBLIC_URL_PREFIX"
echo "   API_BASE_URL=$API_BASE_URL"
echo "   WS_BASE_URL=$WS_BASE_URL"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

echo "📦 Building frontend..."
pushd "$FRONTEND_DIR" >/dev/null
  # React-scripts respects PUBLIC_URL at build time
  export PUBLIC_URL="$PUBLIC_URL_PREFIX"
  export REACT_APP_API_URL="$API_BASE_URL"
  export REACT_APP_WS_URL="$WS_BASE_URL"
  npm ci
  npm run build
  tar -C build -czf "$OUT_DIR/frontend-build.tar.gz" .
popd >/dev/null

echo "📦 Building backend..."
pushd "$BACKEND_DIR" >/dev/null
  npm ci
  npm run build
  # include dist, package.json, ecosystem, and .env.example if present
  TAR_TMP_DIR="$(mktemp -d)"
  mkdir -p "$TAR_TMP_DIR/backend/dist"
  cp -r dist "$TAR_TMP_DIR/backend/"
  cp package.json "$TAR_TMP_DIR/backend/"
  # Include lockfile for deterministic installs with `npm ci`
  cp package-lock.json "$TAR_TMP_DIR/backend/" || true
  # Do NOT include node_modules to keep the archive portable; install on server with `npm ci --omit=dev`
  cp tsconfig.json "$TAR_TMP_DIR/backend/" || true
  cp ecosystem.config.js "$TAR_TMP_DIR/backend/" || true
  # Useful docs/configs
  cp "$ROOT_DIR/Caddyfile.template" "$TAR_TMP_DIR/" || true
  tar -C "$TAR_TMP_DIR" -czf "$OUT_DIR/backend-build.tar.gz" .
  rm -rf "$TAR_TMP_DIR"
popd >/dev/null

echo "✅ Artifacts created in $OUT_DIR:"
ls -lh "$OUT_DIR"

cat << EOF

Next steps:
- Copy frontend-build.tar.gz to your server, extract into /var/www/findmycat/frontend
- Copy backend-build.tar.gz to your server, extract into /var/www/findmycat
- On the server, install Node 18+ and PM2, then:
    cd /var/www/findmycat/backend
    npm ci --omit=dev  # if node_modules not shipped; otherwise skip
    pm2 start ecosystem.config.js --env production
    pm2 save
- Update your Caddyfile using Caddyfile.template and reload Caddy.

EOF
