"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const postgres_1 = require("./postgres");
// Load environment variables from multiple possible locations to be robust to CWD
const envLoadedFrom = [];
const tryLoadEnv = (envPath) => {
    try {
        if (fs_1.default.existsSync(envPath)) {
            dotenv_1.default.config({ path: envPath });
            envLoadedFrom.push(envPath);
        }
    }
    catch (_) { /* ignore */ }
};
// 1) Default: current working directory
tryLoadEnv(path_1.default.resolve(process.cwd(), '.env'));
// 2) Parent of compiled dist (e.g., /srv/findmycat/.env)
tryLoadEnv(path_1.default.resolve(__dirname, '../.env'));
// 3) As a fallback, also try project root two levels up if present
tryLoadEnv(path_1.default.resolve(__dirname, '../../.env'));
if (envLoadedFrom.length > 0) {
    console.log('🔎 Loaded .env from:', envLoadedFrom.join(', '));
}
else {
    console.log('ℹ️  No .env file found alongside CWD or dist; relying on process env');
}
const app = (0, express_1.default)();
const server = (0, http_1.createServer)(app);
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
const allowedRegexes = [
    /^https?:\/\/localhost(:\d+)?$/,
    /^https:\/\/[a-z0-9-]+-\d+\.app\.github\.dev$/,
];
const isOriginAllowed = (origin) => {
    if (!origin)
        return true; // allow non-browser clients
    if (prodOrigin.includes(origin))
        return true;
    return allowedRegexes.some(r => r.test(origin));
};
// Allow hosting under a prefixed base path (e.g., '/findmy')
const rawPrefix = process.env.PATH_PREFIX || '';
const PATH_PREFIX = rawPrefix
    ? ('/' + rawPrefix.replace(/^\/+|\/+$|\s+/g, '').trim())
    : '';
const SOCKET_IO_PATH = `${PATH_PREFIX}/socket.io`;
const io = new socket_io_1.Server(server, {
    path: SOCKET_IO_PATH,
    cors: {
        origin: (origin, callback) => {
            if (isOriginAllowed(origin || undefined))
                return callback(null, true);
            return callback(new Error("Not allowed by CORS"));
        },
        methods: ["GET", "POST"],
    }
});
const PORT = process.env.PORT || 3001;
// Initialize PostgreSQL database
const db = new postgres_1.PostgresDatabase();
// Middleware
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (isOriginAllowed(origin || undefined))
            return callback(null, true);
        return callback(new Error("Not allowed by CORS"));
    },
}));
app.use(express_1.default.json());
// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }
    try {
        const payload = (0, postgres_1.verifyToken)(token);
        req.user = payload;
        next();
    }
    catch (error) {
        return res.status(403).json({ error: 'Invalid or expired token' });
    }
};
// Optional auth middleware (allows both authenticated and anonymous access)
const optionalAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    const deviceToken = req.headers['x-client-token'] || req.headers['x-device-token'];
    if (token) {
        try {
            const payload = (0, postgres_1.verifyToken)(token);
            req.user = payload;
        }
        catch (error) {
            // Invalid token, but continue as anonymous
        }
    }
    // Client token auth (long-lived, header only)
    (async () => {
        if (deviceToken && !req.user) {
            try {
                const result = await db.verifyDeviceToken(deviceToken);
                if (result) {
                    req.user = { userId: result.user_id, email: 'device@client' };
                }
            }
            catch {
                // ignore
            }
        }
        next();
    })();
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
            // For now, send demo user data if no auth
            // TODO: Implement socket authentication
            const demoUserId = '00000000-0000-0000-0000-000000000000';
            const latestLocations = await db.getLatestLocations(demoUserId);
            socket.emit('initial_locations', latestLocations);
        }
        catch (error) {
            console.error('Error sending initial data:', error);
            socket.emit('error', { message: 'Failed to load initial data' });
        }
    });
});
// API Routes
// Authentication endpoints
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, displayName } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }
        const user = await db.createUser(email, password, displayName);
        // Create a pairing code at account creation so UI can fetch-only
        try {
            await db.getOrCreateDeviceCode(user.id);
        }
        catch (e) {
            console.warn('Pairing code creation failed at registration (non-blocking):', e);
        }
        const token = (0, postgres_1.generateToken)({ userId: user.id, email: user.email });
        res.json({
            user: { id: user.id, email: user.email, display_name: user.display_name },
            token
        });
    }
    catch (error) {
        console.error('Registration error:', error);
        if (error.code === '23505') { // Unique constraint violation
            return res.status(409).json({ error: 'Email already registered' });
        }
        res.status(500).json({ error: 'Registration failed' });
    }
});
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        const user = await db.authenticateUser(email, password);
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }
        const token = (0, postgres_1.generateToken)({ userId: user.id, email: user.email });
        res.json({
            user: { id: user.id, email: user.email, display_name: user.display_name },
            token
        });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});
app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        const payload = req.user;
        const user = await db.getUserById(payload.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ user: { id: user.id, email: user.email, display_name: user.display_name } });
    }
    catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user info' });
    }
});
// Pairing endpoints
app.post('/api/pairing/generate-code', authenticateToken, async (req, res) => {
    try {
        const payload = req.user;
        const code = await db.generateDeviceCode(payload.userId);
        const created = await db.getOrCreateDeviceCode(payload.userId);
        res.json({ code: created.code });
    }
    catch (error) {
        console.error('Generate code error:', error);
        res.status(500).json({ error: 'Failed to generate pairing code' });
    }
});
// Get current pairing code (fetch-only, persistent) for the authenticated user
app.get('/api/pairing/code', authenticateToken, async (req, res) => {
    try {
        const payload = req.user;
        const result = await db.getActiveDeviceCode(payload.userId);
        if (!result)
            return res.status(404).json({ error: 'No active pairing code' });
        res.json({ code: result.code });
    }
    catch (error) {
        console.error('Get pairing code error:', error);
        res.status(500).json({ error: 'Failed to get pairing code' });
    }
});
app.post('/api/pairing/claim', async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) {
            return res.status(400).json({ error: 'Pairing code is required' });
        }
        const result = await db.useDeviceCode(code);
        if (!result) {
            return res.status(400).json({ error: 'Invalid or expired pairing code' });
        }
        // Generate token for device authentication
        const user = await db.getUserById(result.user_id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        const token = (0, postgres_1.generateToken)({
            userId: user.id,
            email: user.email,
            deviceCode: code
        });
        // Create a long-lived device token for the Mac client
        const deviceToken = await db.createDeviceToken(user.id, 'Mac Client');
        res.json({
            token, // short-lived JWT (optional)
            clientToken: deviceToken.token, // long-lived token to store client-side
            user: { id: user.id, email: user.email, display_name: user.display_name }
        });
    }
    catch (error) {
        console.error('Device pairing error:', error);
        res.status(500).json({ error: 'Device pairing failed' });
    }
});
app.get('/api/devices', authenticateToken, async (req, res) => {
    try {
        const payload = req.user;
        const devices = await db.getUserDevices(payload.userId);
        res.json(devices);
    }
    catch (error) {
        console.error('Get devices error:', error);
        res.status(500).json({ error: 'Failed to get devices' });
    }
});
app.put('/api/devices/:deviceId', authenticateToken, async (req, res) => {
    try {
        const payload = req.user;
        const { deviceId } = req.params;
        const updates = req.body;
        const device = await db.updateDevice(payload.userId, deviceId, updates);
        if (!device) {
            return res.status(404).json({ error: 'Device not found' });
        }
        res.json(device);
    }
    catch (error) {
        console.error('Update device error:', error);
        res.status(500).json({ error: 'Failed to update device' });
    }
});
// Admin: Inspect database info (enhanced for PostgreSQL)
app.get('/api/admin/db-info', optionalAuth, async (req, res) => {
    try {
        const health = await db.getHealth();
        res.json({
            type: 'PostgreSQL',
            connected: health.connected,
            users: health.users,
            devices: health.devices,
            totalRows: health.locations,
            cwd: process.cwd(),
            envDatabaseUrl: process.env.DATABASE_URL || null,
        });
    }
    catch (error) {
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
// Get all latest locations (multi-user)
app.get('/api/locations/latest', optionalAuth, async (req, res) => {
    try {
        const payload = req.user;
        const userId = payload?.userId || '00000000-0000-0000-0000-000000000000'; // Demo user fallback
        const locations = await db.getLatestLocations(userId);
        res.json(locations);
    }
    catch (error) {
        console.error('Error fetching latest locations:', error);
        res.status(500).json({ error: 'Failed to fetch locations' });
    }
});
// Get location history for a specific device
app.get('/api/locations/history/:deviceId', optionalAuth, async (req, res) => {
    try {
        const payload = req.user;
        const userId = payload?.userId || '00000000-0000-0000-0000-000000000000'; // Demo user fallback
        const { deviceId } = req.params;
        const limit = parseInt(req.query.limit) || 100;
        const history = await db.getLocationHistory(userId, deviceId, limit);
        res.json(history);
    }
    catch (error) {
        console.error('Error fetching location history:', error);
        res.status(500).json({ error: 'Failed to fetch location history' });
    }
});
// Get all location history
app.get('/api/locations/history', optionalAuth, async (req, res) => {
    try {
        const payload = req.user;
        const userId = payload?.userId || '00000000-0000-0000-0000-000000000000'; // Demo user fallback
        const limit = parseInt(req.query.limit) || 1000;
        const history = await db.getLocationHistory(userId, undefined, limit);
        res.json(history);
    }
    catch (error) {
        console.error('Error fetching all location history:', error);
        res.status(500).json({ error: 'Failed to fetch location history' });
    }
});
// Update location (from Mac client or authenticated API)
app.post('/api/locations/update', optionalAuth, async (req, res) => {
    try {
        const payload = req.user;
        const userId = payload?.userId || '00000000-0000-0000-0000-000000000000'; // Demo user fallback
        const locationUpdate = req.body;
        // Validate required fields
        if (!locationUpdate.deviceId ||
            typeof locationUpdate.latitude !== 'number' ||
            typeof locationUpdate.longitude !== 'number' ||
            !locationUpdate.timestamp) {
            return res.status(400).json({
                error: 'Missing required fields: deviceId, latitude, longitude, timestamp'
            });
        }
        // Register device if it doesn't exist
        await db.registerDevice(userId, locationUpdate.deviceId, locationUpdate.deviceName);
        // Check if this is a new location
        const existingLocations = await db.getLatestLocations(userId, locationUpdate.deviceId);
        const existingLocation = existingLocations.length > 0 ? existingLocations[0] : null;
        const isNewLocation = !existingLocation ||
            existingLocation.timestamp !== locationUpdate.timestamp;
        if (isNewLocation) {
            // Save to database
            const savedLocation = await db.addLocation(userId, locationUpdate.deviceId, {
                latitude: locationUpdate.latitude,
                longitude: locationUpdate.longitude,
                accuracy: locationUpdate.accuracy,
                timestamp: locationUpdate.timestamp
            });
            // Broadcast to all connected clients (TODO: filter by user)
            io.emit('location_update', savedLocation);
            console.log(`[NEW] ${locationUpdate.deviceId} @ ${locationUpdate.latitude},${locationUpdate.longitude} ${locationUpdate.timestamp}`);
            res.json({
                success: true,
                location: savedLocation,
                isNew: true
            });
        }
        else {
            console.log(`[OLD] ${locationUpdate.deviceId} - no change`);
            res.json({
                success: true,
                location: existingLocation,
                isNew: false
            });
        }
    }
    catch (error) {
        console.error('Error updating location:', error);
        res.status(500).json({ error: 'Failed to update location' });
    }
});
// Batch update locations (from Mac client)
app.post('/api/locations/batch-update', optionalAuth, async (req, res) => {
    try {
        const payload = req.user;
        const userId = payload?.userId || '00000000-0000-0000-0000-000000000000'; // Demo user fallback
        const locationUpdates = req.body;
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
                // Register device if needed
                await db.registerDevice(userId, update.deviceId, update.deviceName);
                // Check if this is a new location
                const existingLocations = await db.getLatestLocations(userId, update.deviceId);
                const existingLocation = existingLocations.length > 0 ? existingLocations[0] : null;
                const isNewLocation = !existingLocation ||
                    existingLocation.timestamp !== update.timestamp;
                if (isNewLocation) {
                    const savedLocation = await db.addLocation(userId, update.deviceId, {
                        latitude: update.latitude,
                        longitude: update.longitude,
                        accuracy: update.accuracy,
                        timestamp: update.timestamp
                    });
                    io.emit('location_update', savedLocation);
                    results.push({ ...savedLocation, isNew: true });
                    console.log(`[NEW] ${update.deviceId} @ ${update.latitude},${update.longitude} ${update.timestamp}`);
                }
                else {
                    results.push({ ...existingLocation, isNew: false });
                }
            }
            catch (error) {
                console.error('Error processing location update:', update, error);
            }
        }
        res.json({
            success: true,
            processed: results.length,
            newLocations: results.filter(r => r.isNew).length
        });
    }
    catch (error) {
        console.error('Error batch updating locations:', error);
        res.status(500).json({ error: 'Failed to batch update locations' });
    }
});
// Get device status (multi-user)
app.get('/api/devices/status', optionalAuth, async (req, res) => {
    try {
        const payload = req.user;
        const userId = payload?.userId || '00000000-0000-0000-0000-000000000000'; // Demo user fallback
        const latestLocations = await db.getLatestLocations(userId);
        const devices = await db.getUserDevices(userId);
        const now = new Date();
        const deviceStatuses = devices.map(device => {
            const location = latestLocations.find(loc => loc.device_id === device.device_id);
            const lastSeen = location ? new Date(location.timestamp) : new Date(device.last_seen);
            const timeDiff = now.getTime() - lastSeen.getTime();
            const isOnline = timeDiff < 5 * 60 * 1000; // Consider online if last seen within 5 minutes
            return {
                deviceId: device.device_id,
                name: device.name,
                color: device.color,
                lastSeen: lastSeen.toISOString(),
                latitude: location?.latitude,
                longitude: location?.longitude,
                isOnline
            };
        });
        res.json(deviceStatuses);
    }
    catch (error) {
        console.error('Error fetching device status:', error);
        res.status(500).json({ error: 'Failed to fetch device status' });
    }
});
// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});
// Start server
server.listen(PORT, () => {
    console.log(`🐱 FindMyCat Backend running on port ${PORT}`);
    console.log(`📡 WebSocket server ready for real-time updates`);
    console.log(`🗄️  Database: PostgreSQL`);
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
//# sourceMappingURL=server-postgres.js.map