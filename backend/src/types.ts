export interface Location {
  id?: number;
  deviceId: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  isNew?: boolean;
}

export interface LocationUpdate {
  deviceId: string;
  latitude: number;
  longitude: number;
  timestamp: string;
}

export interface DeviceStatus {
  deviceId: string;
  lastSeen: string;
  latitude: number;
  longitude: number;
  isOnline: boolean;
}