# 🐱 FindMyCat - Live AirTag Tracking Web App

A real-time web application for tracking your cat's location using Apple AirTags. Convert your Python script into a live, interactive web experience!

## 🏗️ Architecture

```
┌─────────────────┐    HTTP API     ┌──────────────────┐    WebSocket    ┌─────────────────┐
│   Mac Client    │ ─────────────→  │   Backend API    │ ─────────────→  │   Frontend      │
│                 │                 │                  │                 │                 │
│ - Python script │                 │ - Node.js/TS     │                 │ - React/TS      │
│ - Reads Find My │                 │ - Express server │                 │ - Interactive   │
│ - Sends updates │                 │ - SQLite DB      │                 │   map display   │
└─────────────────┘                 │ - Socket.io      │                 │ - Real-time     │
                                    └──────────────────┘                 │   updates       │
                                                                         └─────────────────┘
```

## 🚀 Features

- **Real-time tracking**: Live location updates via WebSocket
- **Interactive map**: Leaflet.js map with custom cat icons
- **Device management**: Track multiple AirTags/devices
- **Location history**: View tracking history with timeline
- **Status monitoring**: Online/offline device status
- **Responsive design**: Works on desktop and mobile
- **Secure**: Data stays on your servers

## 📁 Project Structure

```
FindMyCat/
├── backend/           # Node.js/TypeScript API server
│   ├── src/
│   │   ├── server.ts     # Main server file
│   │   ├── database.ts   # SQLite database layer
│   │   └── types.ts      # TypeScript interfaces
│   ├── package.json
│   └── tsconfig.json
├── frontend/          # React/TypeScript web app
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── services/     # API & WebSocket services
│   │   ├── App.tsx       # Main app component
│   │   └── types.ts      # TypeScript interfaces
│   ├── package.json
│   └── public/
├── mac-client/        # Python client for Mac
│   ├── findmycat_client.py  # Main client script
│   ├── requirements.txt
│   └── README.md
└── airtag_script.py   # Original Python script (reference)
```

## 🛠️ Setup Instructions

### 1. Backend Setup

```bash
cd backend
npm install
npm run dev
```

The backend will start on `http://localhost:3001`

### 2. Frontend Setup

```bash
cd frontend
npm install
npm start
```

The frontend will start on `http://localhost:3000`

### 3. Mac Client Setup

```bash
cd mac-client
pip install -r requirements.txt
python3 findmycat_client.py --test  # Test connection
python3 findmycat_client.py         # Start monitoring
```

## 🖥️ Usage

### Starting the System

1. **Start Backend**: 
   ```bash
   cd backend && npm run dev
   ```

2. **Start Frontend**:
   ```bash
   cd frontend && npm start
   ```

3. **Start Mac Client** (on your Mac):
   ```bash
   cd mac-client && python3 findmycat_client.py
   ```

4. **Open Web App**: Navigate to `http://localhost:3000`

### Mac Client Options

```bash
# Basic usage
python3 findmycat_client.py

# Custom server
python3 findmycat_client.py --server http://your-server.com:3001

# Test mode
python3 findmycat_client.py --test

# Custom interval
python3 findmycat_client.py --interval 5

# Verbose logging
python3 findmycat_client.py --verbose
```

## 🌐 Web Interface

### Features:
- **Interactive Map**: Real-time cat location with custom icons
- **Device List**: All tracked devices with status
- **History Toggle**: Switch between latest locations and full history  
- **Device Filtering**: Focus on specific cat/device
- **Status Indicators**: Online/offline status with timestamps
- **Automatic Updates**: Real-time location updates without refresh

### Map Icons:
- 🐱 **Cat Head (Large)**: Latest/current location
- 🐾 **Paw Print (Medium)**: Recent locations (last 10)
- 🐾 **Small Paw**: Older location history

## 🔧 Configuration

### Backend Environment Variables (.env):
```env
PORT=3001
NODE_ENV=development
DATABASE_URL=./data/findmycat.db
CORS_ORIGIN=http://localhost:3000
```

### Frontend Environment Variables (.env):
```env
REACT_APP_API_URL=http://localhost:3001
```

## 📊 API Endpoints

### Health Check
- `GET /health` - Server status and connected clients

### Locations  
- `GET /api/locations/latest` - Latest location per device
- `GET /api/locations/history/:deviceId` - Device location history
- `GET /api/locations/history` - All location history
- `POST /api/locations/update` - Update single location
- `POST /api/locations/batch-update` - Batch location updates

### Devices
- `GET /api/devices/status` - Device status and online state

## 🔌 WebSocket Events

### Client → Server:
- `request_initial_data` - Request initial location data

### Server → Client:
- `initial_locations` - Initial location data on connect
- `location_update` - Real-time location update
- `error` - Error message

## 🗄️ Database Schema

```sql
CREATE TABLE locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deviceId TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  timestamp TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## 🚀 Deployment

### Production Backend:
```bash
cd backend
npm run build
npm start
```

### Production Frontend:
```bash
cd frontend
npm run build
# Serve build/ directory with your web server
```

### Environment Setup:
- Update `.env` files with production URLs
- Use HTTPS for production
- Configure proper CORS origins
- Set up reverse proxy (nginx/Apache)

## 🔒 Security Considerations

- **Local Data**: Find My cache data never leaves your Mac
- **Your Servers**: All data stays on your infrastructure  
- **HTTPS**: Use HTTPS in production
- **Authentication**: Consider adding auth for multi-user access
- **Firewall**: Secure your server ports appropriately

## 🐛 Troubleshooting

### "Find My cache file not found"
- Enable Find My in System Preferences
- Log into iCloud
- Ensure AirTags are set up and reporting

### "Cannot connect to server"  
- Check server is running (`npm run dev`)
- Verify URL in client (`--server` option)
- Check firewall/network settings

### No location updates
- Check AirTag battery
- Ensure AirTag has reported recently
- Verify client is finding new locations (`--verbose`)

### WebSocket not connecting
- Check CORS settings in backend
- Verify frontend API URL configuration
- Check browser console for errors

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Original Python script inspiration
- Apple Find My ecosystem
- React-Leaflet for mapping
- Socket.io for real-time communication