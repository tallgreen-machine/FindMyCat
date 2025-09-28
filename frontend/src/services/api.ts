import axios from 'axios';
import { Location, DeviceStatus } from '../types';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000, // bump default timeout to 20s for slower endpoints
});

export const apiService = {
  // Get health status
  async getHealth() {
    const response = await api.get('/health');
    return response.data;
  },

  // Get all latest locations
  async getLatestLocations(): Promise<Location[]> {
    const response = await api.get('/api/locations/latest');
    return response.data;
  },

  // Get location history for a specific device
  async getLocationHistory(deviceId: string, limit: number = 100): Promise<Location[]> {
    const response = await api.get(`/api/locations/history/${deviceId}?limit=${limit}`);
    return response.data;
  },

  // Get all location history
  async getAllLocationHistory(limit: number = 1000, timeoutMs: number = 30000): Promise<Location[]> {
    const response = await api.get(`/api/locations/history?limit=${limit}`, { timeout: timeoutMs });
    return response.data;
  },

  // Get device status
  async getDeviceStatus(): Promise<DeviceStatus[]> {
    const response = await api.get('/api/devices/status');
    return response.data;
  }
};