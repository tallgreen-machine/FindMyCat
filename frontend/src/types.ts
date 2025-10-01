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

// Authentication types
export interface User {
  id: string;
  email: string;
  display_name?: string;
  is_active: boolean;
  created_at: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  displayName?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// Device management types
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

export interface DeviceCode {
  code: string;
  // Backend currently returns { code, expiresIn: '24 hours' }
  // Keep both to be flexible across environments
  expires_at?: string;
  expiresIn?: string;
}