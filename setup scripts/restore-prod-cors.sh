#!/bin/bash

# Script to restore production CORS on FindMyCat backend
# Run this on your server when you're done with development

echo "🔧 Restoring production CORS for FindMyCat backend..."

# Stop the service
sudo systemctl stop findmycat

# Restore from backup
if [ -f /var/www/findmycat/backend/.env.backup ]; then
    sudo cp /var/www/findmycat/backend/.env.backup /var/www/findmycat/backend/.env
    echo "📝 Restored CORS settings:"
    sudo grep CORS_ORIGIN /var/www/findmycat/backend/.env
else
    echo "❌ No backup found, manually setting production CORS..."
    sudo sed -i 's/CORS_ORIGIN=.*/CORS_ORIGIN=https:\/\/findmycat.goldmansoap.com/' /var/www/findmycat/backend/.env
fi

# Restart service
sudo systemctl start findmycat

echo "✅ Production CORS restored!"
echo "🚀 Backend is now secure for production use"