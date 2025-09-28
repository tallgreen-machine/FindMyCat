# 🚀 FindMyCat Server Deployment Guide

## 📋 Prerequisites on Your Linux Server

1. **Node.js 16+** (will be installed by script if missing)
2. **PM2 or systemd** (systemd service will be created)
3. **Caddy** (already configured)
4. **Root access** for initial setup

## 📁 File Upload Steps

### 1. Upload Backend Files
```bash
# On your server, create the directory
sudo mkdir -p /var/www/findmycat/backend
sudo chown $USER:$USER /var/www/findmycat

# Upload these files/folders to /var/www/findmycat/backend/:
- backend/src/
- backend/package.json
- backend/tsconfig.json
- backend/.env (with production settings)
```

### 2. Upload Frontend Build Files
```bash
# Upload the entire frontend/build/ directory to /var/www/findmycat/
# So you have: /var/www/findmycat/index.html, /var/www/findmycat/static/, etc.

# Copy frontend build files
cp -r frontend/build/* /var/www/findmycat/
```

### 3. Upload Deployment Scripts
```bash
# Upload to your server:
- deploy-server.sh
- setup-backend.sh
```

### 4. Upload Mac Client
```bash
# Upload to your Mac:
- mac-client/findmycat_client.py (with production URL)
- mac-client/requirements.txt
```

## 🛠️ Server Setup Commands

### Step 1: Run Initial Setup
```bash
sudo ./deploy-server.sh
```

### Step 2: Setup Backend Service
```bash
sudo ./setup-backend.sh
```

### Step 3: Update Caddyfile
Your current Caddyfile looks good! Just make sure it's:

```caddy
findmycat.goldmansoap.com {
    handle /track/* {
        reverse_proxy localhost:3001
    }

    root * /var/www/findmycat
    file_server
}
```

### Step 4: Restart Caddy
```bash
sudo systemctl reload caddy
# or
sudo caddy reload
```

## 🔍 Verification Steps

### 1. Check Backend Service
```bash
sudo systemctl status findmycat
curl http://localhost:3001/health
```

### 2. Check Frontend
```bash
curl -I https://findmycat.goldmansoap.com
```

### 3. Check API Proxy
```bash
curl https://findmycat.goldmansoap.com/track/health
```

### 4. Test Mac Client
```bash
# On your Mac:
python3 findmycat_client.py --test
```

## 📝 Configuration Summary

### Backend API:
- **URL**: `http://localhost:3001`
- **Health**: `http://localhost:3001/health`
- **Database**: `/var/www/findmycat/data/findmycat.db`
- **Service**: `systemd` (findmycat.service)

### Frontend:
- **URL**: `https://findmycat.goldmansoap.com`
- **Files**: `/var/www/findmycat/`
- **API Calls**: Proxied to `/track/*` → `localhost:3001`

### Mac Client:
- **Server**: `https://findmycat.goldmansoap.com/track`
- **Endpoints**: All API calls go through Caddy proxy

## 🐛 Troubleshooting

### Backend Issues:
```bash
# Check logs
sudo journalctl -u findmycat -f

# Restart service
sudo systemctl restart findmycat
```

### Frontend Issues:
```bash
# Check Caddy logs
sudo journalctl -u caddy -f

# Test static files
curl -I https://findmycat.goldmansoap.com/static/css/main.css
```

### Connection Issues:
```bash
# Test from Mac
curl -v https://findmycat.goldmansoap.com/track/health

# Check firewall
sudo ufw status
```

## 🔄 Update Process

### Update Backend:
```bash
cd /var/www/findmycat/backend
git pull  # or upload new files
npm install
npm run build
sudo systemctl restart findmycat
```

### Update Frontend:
```bash
npm run build  # on dev machine
# Upload build/* to /var/www/findmycat/
```

## 🎯 Final Test Checklist

- [ ] Backend service running (`systemctl status findmycat`)
- [ ] Frontend accessible (`https://findmycat.goldmansoap.com`)
- [ ] API health check works (`/track/health`)
- [ ] Mac client test passes (`--test`)
- [ ] WebSocket connection works (check browser console)
- [ ] Map loads correctly
- [ ] Location updates work end-to-end

Ready to deploy! 🚀