# FindMyCat Multi-User Setup Guide

## 🚀 **What's New: Multi-User PostgreSQL Backend**

This version adds:
- **User accounts** with login/registration
- **Device pairing codes** for linking your Mac to your account  
- **PostgreSQL database** for better performance and multi-user support
- **JWT authentication** for secure API access
- **Isolated user data** - each user only sees their own devices

## 📋 **Prerequisites**

### On Your Server:
1. **PostgreSQL 12+** installed and running
2. **Node.js 18+** and **npm**
3. **pm2** (for process management)

### On Your Mac:
1. **Python 3.8+**
2. **Apple Find My** enabled with your devices

## 🛠️ **Server Setup Steps**

### 1. Create PostgreSQL Database
```bash
# Connect to PostgreSQL as superuser
sudo -u postgres psql

# Create database and user
CREATE DATABASE findmycat;
CREATE USER findmycat WITH PASSWORD 'your_secure_password_here';
GRANT ALL PRIVILEGES ON DATABASE findmycat TO findmycat;
\q
```

### 2. Setup Database Schema
```bash
# Extract the backend build
cd /srv/findmycat
tar -xzf backend-postgres-build.tar.gz

# Setup the database schema
PGPASSWORD=your_secure_password_here psql -h localhost -U findmycat -d findmycat -f schema.sql
```

### 3. Configure Environment
Create `/srv/findmycat/.env`:
```bash
# Backend Environment Variables - PostgreSQL Multi-User  
PORT=3001
NODE_ENV=production

# PostgreSQL Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=findmycat
DB_USER=findmycat
DB_PASSWORD="your_secure_password_here"

# CORS Settings
CORS_ORIGIN=https://findmycat.goldmansoap.com

# JWT Configuration (CHANGE THESE IN PRODUCTION!)
JWT_SECRET=your-super-secret-jwt-key-min-32-chars-long
JWT_EXPIRES_IN=24h

# Optional: Path prefix for reverse proxy (leave empty for root)
# PATH_PREFIX=findmy
```

### 4. Install Dependencies & Start
```bash
cd /srv/findmycat
npm install

# Start with pm2 (loads .env automatically)
pm2 start dist/server-postgres.js --name findmycat-multi
pm2 save

# If you get password errors, try restarting:
pm2 restart findmycat-multi
```

### 5. Verify Installation
```bash
# Check health
curl https://findmycat.goldmansoap.com/health

# Check database info
curl https://findmycat.goldmansoap.com/api/admin/db-info
```

## 📱 **User Setup Flow**

### 1. Create Account (Web)
1. Visit: `https://findmycat.goldmansoap.com`
2. Click **"Register"** 
3. Enter email and password
4. You'll be logged in automatically

### 2. Generate Device Pairing Code (Web)
1. In the web app, click **"Add Device"**
2. Copy the pairing code (e.g., `FIND-ABC-123`)
3. Code expires in 24 hours

### 3. Pair Your Mac (Terminal)
```bash
# On your Mac, run the client with your pairing code
python3 findmycat_client.py --pair-code FIND-ABC-123

# The client will authenticate and start syncing
# Future runs don't need the code - it remembers your account
python3 findmycat_client.py
```

## 🔄 **Migration from SQLite**

If you have existing data, the system will:
1. **Keep your old data** in a "Demo User" account
2. **Allow anonymous access** to see the demo data
3. **Let new users** create their own isolated accounts

To migrate existing data to a real user account:
1. Export your SQLite data using the admin API
2. Create a new user account  
3. Use the batch import API to transfer data

## 🎮 **New API Endpoints**

### Authentication
- `POST /api/auth/register` - Create new account
- `POST /api/auth/login` - Login existing user
- `GET /api/auth/me` - Get current user info

### Device Management  
- `POST /api/devices/generate-code` - Generate pairing code
- `POST /api/devices/pair` - Use pairing code (for Mac client)
- `GET /api/devices` - List your devices
- `PUT /api/devices/:deviceId` - Update device (name, color)

### Locations (Now User-Scoped)
- `GET /api/locations/latest` - Your latest locations
- `GET /api/locations/history` - Your location history
- `POST /api/locations/update` - Add location (requires auth)

## 🔧 **Troubleshooting**

### Database Connection Issues
```bash
# Test PostgreSQL connection
psql -h localhost -U findmycat -d findmycat -c "SELECT version();"

# Check logs
pm2 logs findmycat-multi

# If you see "client password must be a string" error:
# 1. Ensure password in .env has no unescaped special characters
# 2. Try quoting the password: DB_PASSWORD="CAT123!"
# 3. Restart the service: pm2 restart findmycat-multi
# 4. Check environment loading: pm2 show findmycat-multi
# 5. Test manual connection: PGPASSWORD="CAT123!" psql -h localhost -U findmycat -d findmycat -c "SELECT 1;"
# 6. If still failing, try a simpler password without special characters
```

### Authentication Problems
```bash
# Verify JWT secret is set
grep JWT_SECRET /srv/findmycat/.env

# Check token generation
curl -X POST https://findmycat.goldmansoap.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'
```

### Mac Client Issues
```bash
# Test with verbose logging
python3 findmycat_client.py --test --verbose

# Check saved config
cat ~/.findmycat/config.json
```

## 🎯 **Next Steps**

Once this is working:
1. **Update the web frontend** to add login/registration UI
2. **Enhanced device management** with names and colors
3. **Socket.IO authentication** for real-time user-specific updates
4. **Native macOS app** development

## 💡 **Production Security Notes**

1. **Change JWT_SECRET** to a strong 32+ character key
2. **Use strong PostgreSQL passwords**
3. **Enable SSL** for PostgreSQL connections in production
4. **Set up database backups**
5. **Configure fail2ban** for brute force protection
6. **Use environment variables** instead of .env files in production