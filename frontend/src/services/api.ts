import axios from 'axios';
import { Location, DeviceStatus, Device, DeviceCode } from '../types';
import { tokenService } from './auth';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000, // bump default timeout to 20s for slower endpoints
});

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
  const token = tokenService.getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      // Token expired or invalid
      tokenService.removeToken();
      // Reload to show auth screen
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

export const apiService = {
  // Get health status
  async getHealth() {
    const response = await api.get('/health');
    return response.data;
  },

  // Get all latest locations
  async getLatestLocations(): Promise<Location[]> {
    const response = await api.get('/api/locations/latest');
    return (response.data || []).map((l: any) => ({
      ...l,
      latitude: typeof l.latitude === 'number' ? l.latitude : Number(l.latitude),
      longitude: typeof l.longitude === 'number' ? l.longitude : Number(l.longitude),
    } as Location));
  },

  // Get location history for a specific device
  async getLocationHistory(deviceId: string, limit: number = 100): Promise<Location[]> {
    const response = await api.get(`/api/locations/history/${deviceId}?limit=${limit}`);
    return (response.data || []).map((l: any) => ({
      ...l,
      latitude: typeof l.latitude === 'number' ? l.latitude : Number(l.latitude),
      longitude: typeof l.longitude === 'number' ? l.longitude : Number(l.longitude),
    } as Location));
  },

  // Get all location history
  async getAllLocationHistory(limit: number = 1000, timeoutMs: number = 30000): Promise<Location[]> {
    const response = await api.get(`/api/locations/history?limit=${limit}`, { timeout: timeoutMs });
    return (response.data || []).map((l: any) => ({
      ...l,
      latitude: typeof l.latitude === 'number' ? l.latitude : Number(l.latitude),
      longitude: typeof l.longitude === 'number' ? l.longitude : Number(l.longitude),
    } as Location));
  },

  // Get device status
  async getDeviceStatus(): Promise<DeviceStatus[]> {
    const response = await api.get('/api/devices/status');
    return (response.data || []).map((d: any) => ({
      ...d,
      latitude: typeof d.latitude === 'number' ? d.latitude : Number(d.latitude),
      longitude: typeof d.longitude === 'number' ? d.longitude : Number(d.longitude),
    } as DeviceStatus));
  },

  // Device Management APIs
  async getDevices(): Promise<Device[]> {
    const response = await api.get('/api/devices');
    return response.data;
  },

  async updateDevice(deviceId: string, data: { name?: string; color?: string }): Promise<Device> {
    const response = await api.put(`/api/devices/${deviceId}`, data);
    return response.data;
  },

  async generateDeviceCode(): Promise<DeviceCode> {
    const response = await api.post('/api/pairing/generate-code');
    return response.data;
  },

  async getPairingCode(): Promise<DeviceCode> {
    const response = await api.get('/api/pairing/code');
    return response.data;
  },

  async pairDevice(code: string): Promise<Device> {
    const response = await api.post('/api/pairing/claim', { code });
    return response.data;
  }
};