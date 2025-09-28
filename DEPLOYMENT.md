# 🚀 FindMyCat Deployment Guide

## Development Setup (Local)

### Quick Start
```bash
./quick-start.sh
```

### Manual Setup
1. **Install Dependencies**:
   ```bash
   # Backend
   cd backend && npm install
   
   # Frontend  
   cd frontend && npm install
   
   # Mac Client
   cd mac-client && pip3 install -r requirements.txt
   ```

2. **Start Services**:
   ```bash
   # Terminal 1 - Backend
   cd backend && npm run dev
   
   # Terminal 2 - Frontend
   cd frontend && npm start
   
   # Terminal 3 - Mac Client (on your Mac)
   cd mac-client && python3 findmycat_client.py
   ```

3. **Access Web App**: http://localhost:3000

## Production Deployment

### Backend (Node.js/Express)

1. **Build and Deploy**:
   ```bash
   cd backend
   npm run build
   npm start
   ```

2. **Environment Variables** (`.env`):
   ```env
   NODE_ENV=production
   PORT=3001
   DATABASE_URL=/path/to/production/database.db
   CORS_ORIGIN=https://your-domain.com
   ```

3. **Process Management** (PM2):
   ```bash
   npm install -g pm2
   pm2 start dist/server.js --name findmycat-backend
   pm2 save
   pm2 startup
   ```

### Frontend (React)

1. **Build**:
   ```bash
   cd frontend
   REACT_APP_API_URL=https://your-api-domain.com npm run build
   ```

2. **Deploy** (serve `build/` directory):
   - **Nginx**:
     ```nginx
     server {
         listen 80;
         server_name your-domain.com;
         root /path/to/findmycat/frontend/build;
         index index.html;
         
         location / {
             try_files $uri $uri/ /index.html;
         }
         
         location /api {
             proxy_pass http://localhost:3001;
             proxy_http_version 1.1;
             proxy_set_header Upgrade $http_upgrade;
             proxy_set_header Connection 'upgrade';
             proxy_set_header Host $host;
             proxy_cache_bypass $http_upgrade;
         }
     }
     ```
   
   - **Apache**:
     ```apache
     <VirtualHost *:80>
         ServerName your-domain.com
         DocumentRoot /path/to/findmycat/frontend/build
         
         ProxyPreserveHost On
         ProxyPass /api http://localhost:3001/api
         ProxyPassReverse /api http://localhost:3001/api
         
         <Directory /path/to/findmycat/frontend/build>
             Options Indexes FollowSymLinks
             AllowOverride All
             Require all granted
         </Directory>
     </VirtualHost>
     ```

### Mac Client

1. **Deploy on Mac**:
   ```bash
   cd mac-client
   python3 findmycat_client.py --server https://your-api-domain.com
   ```

2. **Run as Service** (launchd on macOS):
   
   Create `/Library/LaunchDaemons/com.findmycat.client.plist`:
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" 
       "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
   <plist version="1.0">
   <dict>
       <key>Label</key>
       <string>com.findmycat.client</string>
       <key>ProgramArguments</key>
       <array>
           <string>/usr/bin/python3</string>
           <string>/path/to/findmycat/mac-client/findmycat_client.py</string>
           <string>--server</string>
           <string>https://your-api-domain.com</string>
       </array>
       <key>RunAtLoad</key>
       <true/>
       <key>KeepAlive</key>
       <true/>
       <key>WorkingDirectory</key>
       <string>/path/to/findmycat/mac-client</string>
   </dict>
   </plist>
   ```
   
   Then:
   ```bash
   sudo launchctl load /Library/LaunchDaemons/com.findmycat.client.plist
   ```

## Docker Deployment (Optional)

### Backend Dockerfile
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["npm", "start"]
```

### Frontend Dockerfile
```dockerfile
FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### Docker Compose
```yaml
version: '3.8'
services:
  backend:
    build: ./backend
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=/app/data/database.db
    volumes:
      - ./data:/app/data
    
  frontend:
    build: ./frontend
    ports:
      - "80:80"
    depends_on:
      - backend
```

## SSL/HTTPS Setup

### Let's Encrypt (Certbot)
```bash
# Install certbot
sudo apt-get install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

## Monitoring & Logging

### Backend Logs
```bash
# PM2 logs
pm2 logs findmycat-backend

# Or direct file logging in production
tail -f /var/log/findmycat/backend.log
```

### Health Monitoring
```bash
# Simple health check
curl https://your-api-domain.com/health

# Advanced monitoring with uptime services
# - UptimeRobot
# - Pingdom  
# - New Relic
```

## Security Checklist

- [ ] Use HTTPS in production
- [ ] Set proper CORS origins
- [ ] Enable rate limiting
- [ ] Secure database file permissions
- [ ] Use environment variables for secrets
- [ ] Keep dependencies updated
- [ ] Monitor server logs
- [ ] Backup database regularly

## Troubleshooting

### Common Issues

1. **CORS Errors**: Update `CORS_ORIGIN` in backend `.env`
2. **Connection Failed**: Check firewall, ports, and server status
3. **Database Issues**: Verify write permissions and disk space
4. **Mac Client Not Finding Cache**: Ensure Find My is enabled and user is logged into iCloud

### Debug Commands
```bash
# Check backend health
curl http://localhost:3001/health

# Check database
sqlite3 backend/data/findmycat.db ".tables"

# Test Mac client
python3 findmycat_client.py --test --verbose
```