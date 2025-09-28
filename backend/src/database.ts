import sqlite3 from 'sqlite3';
import { Location, LocationUpdate } from './types';
import path from 'path';
import fs from 'fs';

export class Database {
  private db: sqlite3.Database;
  private dbPath: string;

  constructor(dbPath: string = './data/findmycat.db') {
    this.dbPath = dbPath;
    
    // Ensure data directory exists
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.db = new sqlite3.Database(dbPath);
    this.initTables();
  }

  private initTables(): void {
    this.db.serialize(() => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS locations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          deviceId TEXT NOT NULL,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          timestamp TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_device_timestamp 
        ON locations(deviceId, timestamp)
      `);
    });
  }

  async addLocation(location: LocationUpdate): Promise<Location> {
    return new Promise((resolve, reject) => {
      const { deviceId, latitude, longitude, timestamp } = location;
      
      this.db.run(
        'INSERT INTO locations (deviceId, latitude, longitude, timestamp) VALUES (?, ?, ?, ?)',
        [deviceId, latitude, longitude, timestamp],
        function(this: sqlite3.RunResult, err: Error | null) {
          if (err) {
            reject(err);
          } else {
            resolve({
              id: this.lastID,
              deviceId,
              latitude,
              longitude,
              timestamp,
              isNew: true
            });
          }
        }
      );
    });
  }

  async getLatestLocation(deviceId: string): Promise<Location | null> {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM locations WHERE deviceId = ? ORDER BY timestamp DESC LIMIT 1',
        [deviceId],
        (err: Error | null, row: any) => {
          if (err) {
            reject(err);
          } else {
            resolve(row || null);
          }
        }
      );
    });
  }

  async getAllLatestLocations(): Promise<Location[]> {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT l1.* FROM locations l1
        INNER JOIN (
          SELECT deviceId, MAX(timestamp) as max_timestamp
          FROM locations
          GROUP BY deviceId
        ) l2 ON l1.deviceId = l2.deviceId AND l1.timestamp = l2.max_timestamp
        ORDER BY l1.timestamp DESC
      `, (err: Error | null, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async getLocationHistory(deviceId: string, limit: number = 100): Promise<Location[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM locations WHERE deviceId = ? ORDER BY timestamp DESC LIMIT ?',
        [deviceId, limit],
        (err: Error | null, rows: any[]) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  }

  async getAllLocationHistory(limit: number = 1000): Promise<Location[]> {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM locations ORDER BY timestamp DESC LIMIT ?',
        [limit],
        (err: Error | null, rows: any[]) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  }

  close(): void {
    this.db.close();
  }
}