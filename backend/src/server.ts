import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { PostgresDatabase, generateToken, verifyToken, JWTPayload } from './postgres';
import { Location, LocationUpdate, DeviceStatus } from './types';

// Load environment variables from multiple possible locations to be robust to CWD
const envLoadedFrom: string[] = [];
const tryLoadEnv = (envPath: string) => {
  try {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      envLoadedFrom.push(envPath);
    }
  } catch (_) { /* ignore */ }
};

// 1) Default: current working directory
tryLoadEnv(path.resolve(process.cwd(), '.env'));
// 2) Parent of compiled dist (e.g., /srv/findmycat/.env)
tryLoadEnv(path.resolve(__dirname, '../.env'));
// 3) As a fallback, also try project root two levels up if present
tryLoadEnv(path.resolve(__dirname, '../../.env'));

if (envLoadedFrom.length > 0) {
  console.log('🔎 Loaded .env from:', envLoadedFrom.join(', '));
} else {
  console.log('ℹ️  No .env file found alongside CWD or dist; relying on process env');
}

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

// Allow hosting under a prefixed base path (e.g., '/findmy')
const rawPrefix = process.env.PATH_PREFIX || '';
const PATH_PREFIX = rawPrefix
  ? ('/' + rawPrefix.replace(/^\/+|\/+$|\s+/g, '').trim())
  : '';
const SOCKET_IO_PATH = `${PATH_PREFIX}/socket.io`;

const io = new Server(server, {
  path: SOCKET_IO_PATH,
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin || undefined)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST"],
  }
});

const PORT = process.env.PORT || 3001;
// Robust default DB path: resolve relative to compiled dist (../data/findmycat.db)
const defaultDbPath = path.resolve(__dirname, '../data/findmycat.db');
const rawDbEnv = (process.env.DATABASE_URL || '').trim();
const configuredDbPath = rawDbEnv.length > 0 ? rawDbEnv : defaultDbPath;
// Initialize PostgreSQL database
const db = new PostgresDatabase();

// Middleware
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (isOriginAllowed(origin || undefined)) return callback(null, true);
    return callback(new Error("Not allowed by CORS"));
  },
}));
app.use(express.json());

// Authentication middleware
const authenticateToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const payload = verifyToken(token);
    (req as any).user = payload;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Optional auth middleware (allows both authenticated and anonymous access)
const optionalAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const payload = verifyToken(token);
      (req as any).user = payload;
    } catch (error) {
      // Invalid token, but continue as anonymous
    }
  }
  next();
};

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
// Admin: Inspect database info (path, counts)
app.get('/api/admin/db-info', async (req, res) => {
  try {
    const total = await db.getTotalCount();
    const perDevice = await db.getDeviceCounts();
    res.json({
      path: db.getPath(),
      exists: fs.existsSync(db.getPath()),
      sizeBytes: fs.existsSync(db.getPath()) ? fs.statSync(db.getPath()).size : 0,
      totalRows: total,
      perDevice,
      cwd: process.cwd(),
      envDatabaseUrl: process.env.DATABASE_URL || null,
    });
  } catch (error) {
    console.error('Error in /api/admin/db-info:', error);
    res.status(500).json({ error: 'Failed to retrieve DB info' });
  }
});

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
  console.log(`🗄️  Database: ${finalDbPath}`);
  console.log(`🛣️  PATH_PREFIX: '${PATH_PREFIX || '/'}' (set PATH_PREFIX env to change)`);
  console.log(`🧩 Socket.IO path: ${SOCKET_IO_PATH}`);
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