import { Location, LocationUpdate } from './types';
export declare class Database {
    private db;
    private dbPath;
    constructor(dbPath?: string);
    private initTables;
    addLocation(location: LocationUpdate): Promise<Location>;
    getLatestLocation(deviceId: string): Promise<Location | null>;
    getAllLatestLocations(): Promise<Location[]>;
    getLocationHistory(deviceId: string, limit?: number): Promise<Location[]>;
    getAllLocationHistory(limit?: number): Promise<Location[]>;
    close(): void;
}
//# sourceMappingURL=database.d.ts.map