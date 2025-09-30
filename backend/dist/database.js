"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Database = void 0;
const sqlite3_1 = __importDefault(require("sqlite3"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
class Database {
    constructor(dbPath = './data/findmycat.db') {
        this.dbPath = dbPath;
        // Ensure data directory exists
        const dataDir = path_1.default.dirname(dbPath);
        if (!fs_1.default.existsSync(dataDir)) {
            fs_1.default.mkdirSync(dataDir, { recursive: true });
        }
        this.db = new sqlite3_1.default.Database(dbPath);
        this.initTables();
    }
    initTables() {
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
    async addLocation(location) {
        return new Promise((resolve, reject) => {
            const { deviceId, latitude, longitude, timestamp } = location;
            this.db.run('INSERT INTO locations (deviceId, latitude, longitude, timestamp) VALUES (?, ?, ?, ?)', [deviceId, latitude, longitude, timestamp], function (err) {
                if (err) {
                    reject(err);
                }
                else {
                    resolve({
                        id: this.lastID,
                        deviceId,
                        latitude,
                        longitude,
                        timestamp,
                        isNew: true
                    });
                }
            });
        });
    }
    async getLatestLocation(deviceId) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM locations WHERE deviceId = ? ORDER BY timestamp DESC LIMIT 1', [deviceId], (err, row) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(row || null);
                }
            });
        });
    }
    async getAllLatestLocations() {
        return new Promise((resolve, reject) => {
            this.db.all(`
        SELECT l1.* FROM locations l1
        INNER JOIN (
          SELECT deviceId, MAX(timestamp) as max_timestamp
          FROM locations
          GROUP BY deviceId
        ) l2 ON l1.deviceId = l2.deviceId AND l1.timestamp = l2.max_timestamp
        ORDER BY l1.timestamp DESC
      `, (err, rows) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(rows);
                }
            });
        });
    }
    async getLocationHistory(deviceId, limit = 100) {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM locations WHERE deviceId = ? ORDER BY timestamp DESC LIMIT ?', [deviceId, limit], (err, rows) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(rows);
                }
            });
        });
    }
    async getAllLocationHistory(limit = 1000) {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM locations ORDER BY timestamp DESC LIMIT ?', [limit], (err, rows) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(rows);
                }
            });
        });
    }
    getPath() {
        return this.dbPath;
    }
    async getTotalCount() {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT COUNT(*) as count FROM locations', (err, row) => {
                if (err)
                    return reject(err);
                resolve(row?.count ?? 0);
            });
        });
    }
    async getDeviceCounts() {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT deviceId, COUNT(*) as count FROM locations GROUP BY deviceId ORDER BY count DESC', (err, rows) => {
                if (err)
                    return reject(err);
                resolve(rows);
            });
        });
    }
    close() {
        this.db.close();
    }
}
exports.Database = Database;
//# sourceMappingURL=database.js.map