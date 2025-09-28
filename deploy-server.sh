#!/bin/bash

# FindMyCat Server Deployment Script
set -e

echo "🚀 FindMyCat Server Deployment"
echo "=============================="

# Configuration
DOMAIN="findmycat.goldmansoap.com"
DEPLOY_DIR="/var/www/findmycat"
BACKEND_DIR="$DEPLOY_DIR/backend"
DATA_DIR="$DEPLOY_DIR/data"
SERVICE_NAME="findmycat"

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Please run as root (use sudo)"
    exit 1
fi

# Create directories
echo "📁 Creating directories..."
mkdir -p $DEPLOY_DIR
mkdir -p $BACKEND_DIR
mkdir -p $DATA_DIR
chown -R www-data:www-data $DEPLOY_DIR

# Install Node.js if not present
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
fi

# Install PM2 globally if not present
if ! command -v pm2 &> /dev/null; then
    echo "📦 Installing PM2..."
    npm install -g pm2
fi

echo "✅ Prerequisites installed"
echo ""
echo "Next steps:"
echo "1. Copy the backend files to: $BACKEND_DIR"
echo "2. Copy the frontend build files to: $DEPLOY_DIR"
echo "3. Run the backend setup script"
echo "4. Update your Caddyfile"
echo "5. Restart Caddy"