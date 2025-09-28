import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { Database } from './database';
import { Location, LocationUpdate, DeviceStatus } from './types';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
// Configure CORS origins - support multiple origins for dev/prod
const getAllowedOrigins = () => {
  const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:3000";
  if (corsOrigin.includes(',')) {
    return corsOrigin.split(',').map(origin => origin.trim());
  }
  return corsOrigin;
};

const allowedOrigins = getAllowedOrigins();

// Build a robust CORS origin checker that supports:
// - Exact production domain from env
// - localhost (http/https, any port)
// - GitHub Codespaces/VSC *.app.github.dev (any subdomain)
const prodOrigin = (process.env.CORS_ORIGIN || "").split(",").map(o => o.trim()).filter(Boolean);
const allowedRegexes: RegExp[] = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https:\/\/[a-z0-9-]+-\d+\.app\.github\.dev$/,
];

const isOriginAllowed = (origin?: string | undefined) => {
  if (!origin) return true; // allow non-browser clients
  if (prodOrigin.includes(origin)) return true;
  return allowedRegexes.some(r => r.test(origin));
};

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin || undefined)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST"],
  }
});

const PORT = process.env.PORT || 3001;
const db = new Database(process.env.DATABASE_URL);

// Middleware
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (isOriginAllowed(origin || undefined)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  },
}));
app.use(express.json());

// Store connected clients
const connectedClients = new Set();

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  connectedClients.add(socket.id);

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    connectedClients.delete(socket.id);
  });

  // Send initial data to newly connected client
  socket.on('request_initial_data', async () => {
    try {
      const latestLocations = await db.getAllLatestLocations();
      socket.emit('initial_locations', latestLocations);
    } catch (error) {
      console.error('Error sending initial data:', error);
      socket.emit('error', { message: 'Failed to load initial data' });
    }
  });
});

// API Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    connectedClients: connectedClients.size
  });
});

// Get all latest locations
app.get('/api/locations/latest', async (req, res) => {
  try {
    const locations = await db.getAllLatestLocations();
    res.json(locations);
  } catch (error) {
    console.error('Error fetching latest locations:', error);
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

// Get location history for a specific device
app.get('/api/locations/history/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;
    const history = await db.getLocationHistory(deviceId, limit);
    res.json(history);
  } catch (error) {
    console.error('Error fetching location history:', error);
    res.status(500).json({ error: 'Failed to fetch location history' });
  }
});

// Get all location history
app.get('/api/locations/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 1000;
    const history = await db.getAllLocationHistory(limit);
    res.json(history);
  } catch (error) {
    console.error('Error fetching all location history:', error);
    res.status(500).json({ error: 'Failed to fetch location history' });
  }
});

// Update location (from Mac client)
app.post('/api/locations/update', async (req, res) => {
  try {
    const locationUpdate: LocationUpdate = req.body;
    
    // Validate required fields
    if (!locationUpdate.deviceId || 
        typeof locationUpdate.latitude !== 'number' || 
        typeof locationUpdate.longitude !== 'number' || 
        !locationUpdate.timestamp) {
      return res.status(400).json({ 
        error: 'Missing required fields: deviceId, latitude, longitude, timestamp' 
      });
    }

    // Check if this is a new location (not already in database)
    const existingLocation = await db.getLatestLocation(locationUpdate.deviceId);
    const isNewLocation = !existingLocation || 
                         existingLocation.timestamp !== locationUpdate.timestamp;

    if (isNewLocation) {
      // Save to database
      const savedLocation = await db.addLocation(locationUpdate);
      
      // Broadcast to all connected clients
      io.emit('location_update', savedLocation);
      
      console.log(`[NEW] ${locationUpdate.deviceId} @ ${locationUpdate.latitude},${locationUpdate.longitude} ${locationUpdate.timestamp}`);
      
      res.json({ 
        success: true, 
        location: savedLocation,
        isNew: true
      });
    } else {
      console.log(`[OLD] ${locationUpdate.deviceId} - no change`);
      res.json({ 
        success: true, 
        location: existingLocation,
        isNew: false
      });
    }
  } catch (error) {
    console.error('Error updating location:', error);
    res.status(500).json({ error: 'Failed to update location' });
  }
});

// Batch update locations (from Mac client)
app.post('/api/locations/batch-update', async (req, res) => {
  try {
    const locationUpdates: LocationUpdate[] = req.body;
    
    if (!Array.isArray(locationUpdates)) {
      return res.status(400).json({ error: 'Expected array of location updates' });
    }

    const results = [];
    
    for (const update of locationUpdates) {
      try {
        // Validate required fields
        if (!update.deviceId || 
            typeof update.latitude !== 'number' || 
            typeof update.longitude !== 'number' || 
            !update.timestamp) {
          continue;
        }

        // Check if this is a new location
        const existingLocation = await db.getLatestLocation(update.deviceId);
        const isNewLocation = !existingLocation || 
                             existingLocation.timestamp !== update.timestamp;

        if (isNewLocation) {
          const savedLocation = await db.addLocation(update);
          io.emit('location_update', savedLocation);
          results.push({ ...savedLocation, isNew: true });
          
          console.log(`[NEW] ${update.deviceId} @ ${update.latitude},${update.longitude} ${update.timestamp}`);
        } else {
          results.push({ ...existingLocation, isNew: false });
        }
      } catch (error) {
        console.error('Error processing location update:', update, error);
      }
    }

    res.json({ 
      success: true, 
      processed: results.length,
      newLocations: results.filter(r => r.isNew).length
    });
  } catch (error) {
    console.error('Error batch updating locations:', error);
    res.status(500).json({ error: 'Failed to batch update locations' });
  }
});

// Get device status
app.get('/api/devices/status', async (req, res) => {
  try {
    const latestLocations = await db.getAllLatestLocations();
    const now = new Date();
    
    const deviceStatuses: DeviceStatus[] = latestLocations.map(location => {
      const lastSeen = new Date(location.timestamp);
      const timeDiff = now.getTime() - lastSeen.getTime();
      const isOnline = timeDiff < 5 * 60 * 1000; // Consider online if last seen within 5 minutes
      
      return {
        deviceId: location.deviceId,
        lastSeen: location.timestamp,
        latitude: location.latitude,
        longitude: location.longitude,
        isOnline
      };
    });

    res.json(deviceStatuses);
  } catch (error) {
    console.error('Error fetching device status:', error);
    res.status(500).json({ error: 'Failed to fetch device status' });
  }
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
server.listen(PORT, () => {
  console.log(`🐱 FindMyCat Backend running on port ${PORT}`);
  console.log(`📡 WebSocket server ready for real-time updates`);
  console.log(`🗄️  Database: ${process.env.DATABASE_URL || './data/findmycat.db'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down gracefully...');
  db.close();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 Shutting down gracefully...');
  db.close();
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});