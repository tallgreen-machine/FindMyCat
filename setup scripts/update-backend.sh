#!/bin/bash

# Update backend with proper CORS support for development and production
echo "🔄 Updating FindMyCat backend with improved CORS..."

# Upload new backend files
scp -r /workspaces/FindMyCat/backend/dist/* root@findmycat.goldmansoap.com:/var/www/findmycat/backend/dist/

# Update CORS to support both production and common dev URLs
ssh root@findmycat.goldmansoap.com "
  sudo systemctl stop findmycat
  sudo sed -i 's/CORS_ORIGIN=.*/CORS_ORIGIN=https:\/\/findmycat.goldmansoap.com,http:\/\/localhost:3000,https:\/\/localhost:3000/' /var/www/findmycat/backend/.env
  echo '📝 Updated CORS settings:'
  sudo grep CORS_ORIGIN /var/www/findmycat/backend/.env
  sudo systemctl start findmycat
  echo '✅ Backend updated and restarted!'
"