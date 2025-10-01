#!/bin/bash

# FindMyCat Backend Setup Script (run this on your server)
set -e

BACKEND_DIR="/var/www/findmycat/backend"
DATA_DIR="/var/www/findmycat/data"

echo "🔧 Setting up FindMyCat Backend..."

# Navigate to backend directory
cd $BACKEND_DIR

# Install dependencies (including dev dependencies for build)
echo "📦 Installing backend dependencies..."
npm install

# Build TypeScript
echo "🏗️  Building TypeScript..."
npm run build

# Remove dev dependencies after build
echo "🧹 Cleaning up dev dependencies..."
npm prune --production

# Create systemd service
echo "⚙️  Creating systemd service..."
cat > /etc/systemd/system/findmycat.service << EOF
[Unit]
Description=FindMyCat Backend Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=$BACKEND_DIR
Environment=NODE_ENV=production
Environment=PORT=3001
Environment=DATABASE_URL=$DATA_DIR/findmycat.db
Environment=CORS_ORIGIN=https://findmycat.goldmansoap.com
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=findmycat

[Install]
WantedBy=multi-user.target
EOF

# Set permissions
chown -R www-data:www-data $BACKEND_DIR
chown -R www-data:www-data $DATA_DIR
chmod +x $BACKEND_DIR/dist/server.js

# Enable and start service
systemctl daemon-reload
systemctl enable findmycat
systemctl start findmycat

echo "✅ Backend service started!"
echo "📊 Service status:"
systemctl status findmycat --no-pager -l

echo ""
echo "🔍 Useful commands:"
echo "  Check logs: journalctl -u findmycat -f"
echo "  Restart:    sudo systemctl restart findmycat"
echo "  Stop:       sudo systemctl stop findmycat"