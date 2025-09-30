import { Pool, PoolClient } from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'findmycat',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export interface User {
  id: string;
  email: string;
  display_name?: string;
  is_active: boolean;
  created_at: string;
}

export interface Device {
  id: string;
  device_id: string;
  user_id: string;
  name?: string;
  color: string;
  is_active: boolean;
  metadata: any;
  first_seen: string;
  last_seen: string;
}

export interface LocationRecord {
  id: string;
  device_id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
  speed?: number;
  heading?: number;
  timestamp: string;
  created_at: string;
}

export interface DeviceCode {
  id: string;
  code: string;
  user_id: string;
}

export interface DeviceTokenRecord {
  id: string;
  user_id: string;
  name?: string;
  token_hash: string;
  created_at: string;
  last_used?: string;
  revoked_at?: string;
}

export class PostgresDatabase {
  private pool: Pool;

  constructor() {
    this.pool = pool;
  }

  // Connection management
  async connect(): Promise<PoolClient> {
    return this.pool.connect();
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async getHealth(): Promise<{ connected: boolean; users: number; devices: number; locations: number }> {
    const client = await this.connect();
    try {
      await client.query('SELECT 1');
      
      const userCount = await client.query('SELECT COUNT(*) as count FROM users WHERE is_active = true');
      const deviceCount = await client.query('SELECT COUNT(*) as count FROM devices WHERE is_active = true');
      const locationCount = await client.query('SELECT COUNT(*) as count FROM locations');

      return {
        connected: true,
        users: parseInt(userCount.rows[0].count),
        devices: parseInt(deviceCount.rows[0].count),
        locations: parseInt(locationCount.rows[0].count)
      };
    } finally {
      client.release();
    }
  }

  // User management
  async createUser(email: string, password: string, displayName?: string): Promise<User> {
    const client = await this.connect();
    try {
      const passwordHash = await bcrypt.hash(password, 12);
      
      const result = await client.query(
        `INSERT INTO users (email, password_hash, display_name)
         VALUES ($1, $2, $3)
         RETURNING id, email, display_name, is_active, created_at`,
        [email.toLowerCase().trim(), passwordHash, displayName?.trim()]
      );

      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async authenticateUser(email: string, password: string): Promise<User | null> {
    const client = await this.connect();
    try {
      const result = await client.query(
        `SELECT id, email, password_hash, display_name, is_active, created_at
         FROM users 
         WHERE email = $1 AND is_active = true`,
        [email.toLowerCase().trim()]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const user = result.rows[0];
      const isValid = await bcrypt.compare(password, user.password_hash);
      
      if (!isValid) {
        return null;
      }

      // Return user without password hash
      const { password_hash, ...userWithoutPassword } = user;
      return userWithoutPassword;
    } finally {
      client.release();
    }
  }

  async getUserById(userId: string): Promise<User | null> {
    const client = await this.connect();
    try {
      const result = await client.query(
        `SELECT id, email, display_name, is_active, created_at
         FROM users 
         WHERE id = $1 AND is_active = true`,
        [userId]
      );

      return result.rows.length > 0 ? result.rows[0] : null;
    } finally {
      client.release();
    }
  }

  // Device pairing codes
  private generateCodeString(): string {
    // Format like FIND-ABC-123 similar to SQL function
    const letters = () => Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
    const numbers = () => String(Math.floor(Math.random() * 1000)).padStart(3, '0');
    return `FIND-${letters()}-${numbers()}`;
  }

  async getOrCreateDeviceCode(userId: string): Promise<{ code: string }> {
    const client = await this.connect();
    try {
      // Try to find an existing pairing code for this user
      const existing = await client.query(
        `SELECT code FROM pairing_codes
         WHERE user_id = $1
         LIMIT 1`,
        [userId]
      );
      if (existing.rows.length > 0) return { code: existing.rows[0].code };

      // Generate a new unique code (retry if collision)
      let code = this.generateCodeString();
      for (let i = 0; i < 5; i++) {
        const check = await client.query(`SELECT 1 FROM pairing_codes WHERE code = $1`, [code]);
        if (check.rows.length === 0) break;
        code = this.generateCodeString();
      }

      const result = await client.query(
        `INSERT INTO pairing_codes (code, user_id)
         VALUES ($1, $2)
         RETURNING code`,
        [code, userId]
      );

      return { code: result.rows[0].code };
    } finally {
      client.release();
    }
  }

  async getActiveDeviceCode(userId: string): Promise<{ code: string } | null> {
    const client = await this.connect();
    try {
      const existing = await client.query(
        `SELECT code FROM pairing_codes WHERE user_id = $1 LIMIT 1`,
        [userId]
      );
      return existing.rows.length > 0 ? { code: existing.rows[0].code } : null;
    } finally {
      client.release();
    }
  }

  async generateDeviceCode(userId: string): Promise<string> {
    const client = await this.connect();
    try {
      // Always use our generator for persistent per-user code
      const created = await this.getOrCreateDeviceCode(userId);
      return created.code;
    } finally {
      client.release();
    }
  }

  async useDeviceCode(code: string): Promise<{ user_id: string } | null> {
    const client = await this.connect();
    try {
      const codeResult = await client.query(
        `SELECT user_id FROM pairing_codes 
         WHERE code = $1`,
        [code.toUpperCase().trim()]
      );
      if (codeResult.rows.length === 0) return null;
      return { user_id: codeResult.rows[0].user_id };
    } finally {
      client.release();
    }
  }

  // Device management
  async registerDevice(userId: string, deviceId: string, name?: string): Promise<Device> {
    const client = await this.connect();
    try {
      const result = await client.query(
        `INSERT INTO devices (device_id, user_id, name, last_seen)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (device_id, user_id) 
         DO UPDATE SET 
           name = COALESCE($3, devices.name),
           last_seen = CURRENT_TIMESTAMP,
           is_active = true
         RETURNING *`,
        [deviceId, userId, name]
      );

      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async getUserDevices(userId: string): Promise<Device[]> {
    const client = await this.connect();
    try {
      const result = await client.query(
        `SELECT * FROM devices 
         WHERE user_id = $1 AND is_active = true 
         ORDER BY last_seen DESC`,
        [userId]
      );

      return result.rows;
    } finally {
      client.release();
    }
  }

  async updateDevice(userId: string, deviceId: string, updates: Partial<Device>): Promise<Device | null> {
    const client = await this.connect();
    try {
      const setClauses: string[] = [];
      const values: any[] = [userId, deviceId];
      let paramIndex = 3;

      if (updates.name !== undefined) {
        setClauses.push(`name = $${paramIndex++}`);
        values.push(updates.name);
      }
      if (updates.color !== undefined) {
        setClauses.push(`color = $${paramIndex++}`);
        values.push(updates.color);
      }
      if (updates.is_active !== undefined) {
        setClauses.push(`is_active = $${paramIndex++}`);
        values.push(updates.is_active);
      }
      if (updates.metadata !== undefined) {
        setClauses.push(`metadata = $${paramIndex++}`);
        values.push(JSON.stringify(updates.metadata));
      }

      if (setClauses.length === 0) {
        return null;
      }

      const result = await client.query(
        `UPDATE devices 
         SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND device_id = $2
         RETURNING *`,
        values
      );

      return result.rows.length > 0 ? result.rows[0] : null;
    } finally {
      client.release();
    }
  }

  // Location management
  async addLocation(userId: string, deviceId: string, location: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    altitude?: number;
    speed?: number;
    heading?: number;
    timestamp: string;
  }): Promise<LocationRecord> {
    const client = await this.connect();
    try {
      await client.query('BEGIN');

      // Update device last_seen
      await client.query(
        `UPDATE devices 
         SET last_seen = GREATEST(last_seen, $3)
         WHERE user_id = $1 AND device_id = $2`,
        [userId, deviceId, location.timestamp]
      );

      // Insert location
      const result = await client.query(
        `INSERT INTO locations (device_id, user_id, latitude, longitude, accuracy, altitude, speed, heading, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (device_id, user_id, timestamp) DO UPDATE SET
           latitude = EXCLUDED.latitude,
           longitude = EXCLUDED.longitude,
           accuracy = EXCLUDED.accuracy,
           altitude = EXCLUDED.altitude,
           speed = EXCLUDED.speed,
           heading = EXCLUDED.heading
         RETURNING *`,
        [
          deviceId,
          userId,
          location.latitude,
          location.longitude,
          location.accuracy,
          location.altitude,
          location.speed,
          location.heading,
          location.timestamp
        ]
      );

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getLatestLocations(userId: string, deviceId?: string): Promise<LocationRecord[]> {
    const client = await this.connect();
    try {
      if (deviceId) {
        const result = await client.query(
          `SELECT * FROM locations 
           WHERE user_id = $1 AND device_id = $2
           ORDER BY timestamp DESC
           LIMIT 1`,
          [userId, deviceId]
        );
        return result.rows;
      } else {
        const result = await client.query(
          `SELECT DISTINCT ON (device_id) *
           FROM locations 
           WHERE user_id = $1
           ORDER BY device_id, timestamp DESC`,
          [userId]
        );
        return result.rows;
      }
    } finally {
      client.release();
    }
  }

  async getLocationHistory(userId: string, deviceId?: string, limit: number = 1000): Promise<LocationRecord[]> {
    const client = await this.connect();
    try {
      if (deviceId) {
        const result = await client.query(
          `SELECT * FROM locations 
           WHERE user_id = $1 AND device_id = $2
           ORDER BY timestamp DESC
           LIMIT $3`,
          [userId, deviceId, limit]
        );
        return result.rows;
      } else {
        const result = await client.query(
          `SELECT * FROM locations 
           WHERE user_id = $1
           ORDER BY timestamp DESC
           LIMIT $2`,
          [userId, limit]
        );
        return result.rows;
      }
    } finally {
      client.release();
    }
  }

  // Utility functions
  async cleanupExpiredCodes(): Promise<number> {
    const client = await this.connect();
    try {
      const result = await client.query('SELECT cleanup_expired_codes() as deleted_count');
      return result.rows[0].deleted_count;
    } finally {
      client.release();
    }
  }

  // Device tokens (long-lived auth for Mac clients)
  private hashToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  generateRawDeviceToken(): string {
    // 32 bytes random -> 64 hex chars
    return crypto.randomBytes(32).toString('hex');
  }

  async createDeviceToken(userId: string, name?: string): Promise<{ token: string; record: DeviceTokenRecord }> {
    const client = await this.connect();
    try {
      const raw = this.generateRawDeviceToken();
      const tokenHash = this.hashToken(raw);
      const result = await client.query(
        `INSERT INTO client_tokens (user_id, name, token_hash)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [userId, name || null, tokenHash]
      );
      return { token: raw, record: result.rows[0] };
    } finally {
      client.release();
    }
  }

  async verifyDeviceToken(rawToken: string): Promise<{ user_id: string } | null> {
    const client = await this.connect();
    try {
      const tokenHash = this.hashToken(rawToken);
      const result = await client.query(
        `SELECT user_id FROM client_tokens
         WHERE token_hash = $1 AND revoked_at IS NULL`,
        [tokenHash]
      );
      if (result.rows.length === 0) return null;
      await client.query(`UPDATE client_tokens SET last_used = CURRENT_TIMESTAMP WHERE token_hash = $1`, [tokenHash]);
      return { user_id: result.rows[0].user_id };
    } finally {
      client.release();
    }
  }

  // Migration helpers
  async migrateFromSQLite(sqliteLocations: any[]): Promise<void> {
    const client = await this.connect();
    const demoUserId = '00000000-0000-0000-0000-000000000000';
    
    try {
      await client.query('BEGIN');

      for (const loc of sqliteLocations) {
        // Register device for demo user
        await this.registerDevice(demoUserId, loc.deviceId, `Device ${loc.deviceId.substring(0, 8)}`);
        
        // Add location
        await client.query(
          `INSERT INTO locations (device_id, user_id, latitude, longitude, timestamp)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (device_id, user_id, timestamp) DO NOTHING`,
          [loc.deviceId, demoUserId, loc.latitude, loc.longitude, loc.timestamp]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

// JWT utilities
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

export interface JWTPayload {
  userId: string;
  email: string;
  deviceCode?: string; // For python client auth
}

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, JWT_SECRET) as JWTPayload;
}

export { pool };