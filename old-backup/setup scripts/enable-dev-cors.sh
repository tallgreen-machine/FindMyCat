#!/bin/bash

# Script to enable development CORS on FindMyCat backend
# Run this on your server to allow frontend development

echo "🔧 Enabling development CORS for FindMyCat backend..."

# Stop the service
sudo systemctl stop findmycat

# Backup current .env
sudo cp /var/www/findmycat/backend/.env /var/www/findmycat/backend/.env.backup

# Update CORS to allow any origin for development
sudo sed -i 's/CORS_ORIGIN=.*/CORS_ORIGIN=*/' /var/www/findmycat/backend/.env

echo "📝 Updated CORS settings:"
sudo grep CORS_ORIGIN /var/www/findmycat/backend/.env

# Restart service
sudo systemctl start findmycat

echo "✅ Development CORS enabled!"
echo "🌐 You can now run 'npm start' in your frontend and connect from any dev server"
echo ""
echo "⚠️  Remember to restore production CORS when done:"
echo "   sudo cp /var/www/findmycat/backend/.env.backup /var/www/findmycat/backend/.env"
echo "   sudo systemctl restart findmycat"