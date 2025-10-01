#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/deploy-to-server.sh <user@host> [--skip-frontend] [--skip-backend]
# Example: ./scripts/deploy-to-server.sh root@findmycat.goldmansoap.com

REMOTE=${1:-}
SKIP_FRONTEND=false
SKIP_BACKEND=false

if [ -z "$REMOTE" ]; then
  echo "Usage: $0 user@host [--skip-frontend] [--skip-backend]"
  exit 2
fi

shift || true
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --skip-frontend) SKIP_FRONTEND=true; shift ;;
    --skip-backend) SKIP_BACKEND=true; shift ;;
    *) echo "Unknown arg: $1"; exit 2 ;;
  esac
done

LOCAL_OUT=dist-packages
FRONTEND_TAR=$LOCAL_OUT/frontend-build.tar.gz
BACKEND_TAR=$LOCAL_OUT/backend-build.tar.gz

REMOTE_FRONTEND_DIR=/var/www/findmycat/frontend
REMOTE_BACKEND_DIR=/srv/findmycat
REMOTE_TMP=/tmp/findmycat_deploy

echo "Deploying to $REMOTE"

# Upload artifacts
ssh $REMOTE "mkdir -p $REMOTE_TMP"
if [ "$SKIP_FRONTEND" = false ]; then
  echo "Uploading frontend..."
  scp $FRONTEND_TAR $REMOTE:$REMOTE_TMP/
fi
if [ "$SKIP_BACKEND" = false ]; then
  echo "Uploading backend..."
  scp $BACKEND_TAR $REMOTE:$REMOTE_TMP/
fi

# Remote commands
ssh $REMOTE bash -s <<EOF
set -euo pipefail
sudo mkdir -p $REMOTE_FRONTEND_DIR
sudo mkdir -p $REMOTE_BACKEND_DIR
sudo chown -R $(whoami):$(whoami) /var/www/findmycat || true
sudo chown -R $(whoami):$(whoami) /srv/findmycat || true

if [ "$SKIP_FRONTEND" = false ]; then
  echo "Extracting frontend to $REMOTE_FRONTEND_DIR"
  sudo tar -xzf $REMOTE_TMP/$(basename $FRONTEND_TAR) -C $REMOTE_FRONTEND_DIR
  sudo chown -R www-data:www-data $REMOTE_FRONTEND_DIR || true
fi

if [ "$SKIP_BACKEND" = false ]; then
  echo "Extracting backend to $REMOTE_BACKEND_DIR"
  sudo tar -xzf $REMOTE_TMP/$(basename $BACKEND_TAR) -C $REMOTE_BACKEND_DIR
  # Ensure backend dir is present
  if [ -d $REMOTE_BACKEND_DIR/backend ]; then
    echo "Backend extracted to $REMOTE_BACKEND_DIR/backend"
    cd $REMOTE_BACKEND_DIR/backend
  else
    cd $REMOTE_BACKEND_DIR || true
  fi
  echo "Installing production dependencies (npm ci --omit=dev)"
  npm ci --omit=dev
  echo "Starting/Reloading pm2 ecosystem"
  pm2 start ecosystem.config.js --env production || pm2 reload ecosystem.config.js --env production
  pm2 save
fi

# Reload Caddy if present
if command -v caddy >/dev/null 2>&1; then
  echo "Reloading Caddy"
  sudo systemctl reload caddy || caddy reload --config /etc/caddy/Caddyfile || true
fi

rm -rf $REMOTE_TMP
EOF

echo "Deployment complete. Run health checks as described in DEPLOYMENT_NOTES.md"
