import { Pool, PoolClient } from 'pg';
declare const pool: Pool;
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
export declare class PostgresDatabase {
    private pool;
    constructor();
    connect(): Promise<PoolClient>;
    close(): Promise<void>;
    getHealth(): Promise<{
        connected: boolean;
        users: number;
        devices: number;
        locations: number;
    }>;
    createUser(email: string, password: string, displayName?: string): Promise<User>;
    authenticateUser(email: string, password: string): Promise<User | null>;
    getUserById(userId: string): Promise<User | null>;
    private generateCodeString;
    getOrCreateDeviceCode(userId: string): Promise<{
        code: string;
    }>;
    getActiveDeviceCode(userId: string): Promise<{
        code: string;
    } | null>;
    generateDeviceCode(userId: string): Promise<string>;
    useDeviceCode(code: string): Promise<{
        user_id: string;
    } | null>;
    registerDevice(userId: string, deviceId: string, name?: string): Promise<Device>;
    getUserDevices(userId: string): Promise<Device[]>;
    updateDevice(userId: string, deviceId: string, updates: Partial<Device>): Promise<Device | null>;
    addLocation(userId: string, deviceId: string, location: {
        latitude: number;
        longitude: number;
        accuracy?: number;
        altitude?: number;
        speed?: number;
        heading?: number;
        timestamp: string;
    }): Promise<LocationRecord>;
    getLatestLocations(userId: string, deviceId?: string): Promise<LocationRecord[]>;
    getLocationHistory(userId: string, deviceId?: string, limit?: number): Promise<LocationRecord[]>;
    cleanupExpiredCodes(): Promise<number>;
    private hashToken;
    generateRawDeviceToken(): string;
    createDeviceToken(userId: string, name?: string): Promise<{
        token: string;
        record: DeviceTokenRecord;
    }>;
    verifyDeviceToken(rawToken: string): Promise<{
        user_id: string;
    } | null>;
    migrateFromSQLite(sqliteLocations: any[]): Promise<void>;
}
export interface JWTPayload {
    userId: string;
    email: string;
    deviceCode?: string;
}
export declare function generateToken(payload: JWTPayload): string;
export declare function verifyToken(token: string): JWTPayload;
export { pool };
//# sourceMappingURL=postgres.d.ts.map