import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CatMap } from './components/CatMap';
import { ControlPanel } from './components/ControlPanel';
import { AuthWrapper } from './components/AuthWrapper';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { websocketService } from './services/websocket';
import { apiService } from './services/api';
import { Location, DeviceStatus } from './types';
import { HistoryBoard } from './components/HistoryBoard';
import './App.css';

function MainApp() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [deviceStatuses, setDeviceStatuses] = useState<DeviceStatus[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fitKey, setFitKey] = useState(0);
  const [historyReloadKey, setHistoryReloadKey] = useState(0);
  const [selectedLocationKey, setSelectedLocationKey] = useState<string | null>(null);
  const [focusedLocations, setFocusedLocations] = useState<Location[] | null>(null);
  const historyAbortRef = useRef<AbortController | null>(null);
  const loadingHistoryRef = useRef(false);
  const showHistoryRef = useRef(true);

  // History is always on
  useEffect(() => {
    showHistoryRef.current = true;
  }, []);

  const loadInitialData = useCallback(async () => {
    setError(null);
    try {
      const [latestLocations, deviceStatusData] = await Promise.all([
        apiService.getLatestLocations(),
        apiService.getDeviceStatus(),
      ]);
      setLocations(latestLocations);
      setDeviceStatuses(deviceStatusData);
    } catch (err) {
      console.error('Error loading initial data:', err);
      setError('Failed to load data from server');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:3001';
    const debug = (() => {
      try {
        const params = new URLSearchParams(window.location.search);
        const byEnv = process.env.NODE_ENV !== 'production';
        const byParam = params.has('debug');
        const byGlobal = (window as any).__FMC_DEBUG__ === true;
        return byEnv || byParam || byGlobal;
      } catch {
        return process.env.NODE_ENV !== 'production';
      }
    })();
    if (debug) console.log('🔍 API URL from env:', apiUrl);
    const socket = websocketService.connect(apiUrl);

    // Helper to normalize incoming location objects (WS payloads may have string decimals)
    const normalizeLocation = (l: any): Location => ({
      ...l,
      latitude: typeof l.latitude === 'number' ? l.latitude : Number(l.latitude),
      longitude: typeof l.longitude === 'number' ? l.longitude : Number(l.longitude),
    });

    if (socket) {
      socket.on('connect', () => {
        setIsConnected(true);
        setError(null);
        setIsLoading(false);
      });

      socket.on('disconnect', () => {
        setIsConnected(false);
      });

      socket.on('connect_error', () => {
        setIsConnected(false);
        setError('Failed to connect to server');
      });

      socket.on('initial_locations', (data: any[]) => {
        if (debug) console.log('Received initial locations:', data);
        const normalized = Array.isArray(data) ? data.map(normalizeLocation) : [];
        setLocations(normalized);
        setIsLoading(false);
      });

      socket.on('location_update', (newLocation: any) => {
        const normalized = normalizeLocation(newLocation);
        setLocations(prevLocations => {
          const updatedLocations = [...prevLocations, normalized];
          if (!showHistoryRef.current) {
            const latestPerDevice = new Map<string, Location>();
            updatedLocations.forEach(loc => {
              const existing = latestPerDevice.get(loc.deviceId);
              if (!existing || new Date(loc.timestamp) > new Date(existing.timestamp)) {
                latestPerDevice.set(loc.deviceId, loc);
              }
            });
            return Array.from(latestPerDevice.values());
          }
          return updatedLocations;
        });

        setDeviceStatuses(prevStatuses => {
          const updatedStatuses = [...prevStatuses];
          const existingIndex = updatedStatuses.findIndex(s => s.deviceId === normalized.deviceId);
          const newStatus: DeviceStatus = {
            deviceId: normalized.deviceId,
            lastSeen: normalized.timestamp,
            latitude: normalized.latitude,
            longitude: normalized.longitude,
            isOnline: true
          };
          if (existingIndex >= 0) {
            updatedStatuses[existingIndex] = newStatus;
          } else {
            updatedStatuses.push(newStatus);
          }
          return updatedStatuses;
        });
      });

      socket.on('error', (errorData: { message: string }) => {
        console.error('WebSocket error:', errorData);
        setError(errorData.message);
      });
    }

    return () => {
      websocketService.disconnect();
    };
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // History is always on: fetch it at startup and on refresh
  useEffect(() => {
    if (isLoading) return;
    setHistoryReloadKey(k => k + 1);
    setFitKey(k => k + 1);
  }, [isLoading]);

  useEffect(() => {
    // Always fetch history
    if (loadingHistoryRef.current) return;
    loadingHistoryRef.current = true;

    const controller = new AbortController();
    historyAbortRef.current?.abort();
    historyAbortRef.current = controller;

    const fetchHistory = async () => {
      try {
        const history = await apiService.getAllLocationHistory(2000, 30000);
        if (!controller.signal.aborted) {
          setLocations(history);
          setError(null);
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          console.warn('History fetch failed; showing latest only:', e);
          setError(prev => prev ?? 'History temporarily unavailable; showing latest only');
        }
      } finally {
        if (!controller.signal.aborted) {
          loadingHistoryRef.current = false;
        }
      }
    };

    fetchHistory();
    return () => {
      controller.abort();
      loadingHistoryRef.current = false;
    };
  }, [historyReloadKey]);

  const handleRefresh = () => {
    setHistoryReloadKey(k => k + 1);
    setFitKey(k => k + 1);
  };

  const showLoading = isLoading && !isConnected && locations.length === 0;

  if (showLoading) {
    return (
      <div className="app-loading">
        <div className="loading-spinner">🐱</div>
        <p>Loading FindMyCat...</p>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="app-sidebar">
        <ControlPanel
          deviceStatuses={deviceStatuses}
          selectedDevice={selectedDevice}
          isConnected={isConnected}
          onDeviceSelect={setSelectedDevice}
          onRefresh={handleRefresh}
          pointsCount={locations.length}
        />
        <HistoryBoard
          locations={locations}
          selectedDevice={selectedDevice}
          selectedLocationKey={selectedLocationKey}
          onSelect={(loc) => {
            const key = `${loc.deviceId}|${loc.timestamp}`;
            setSelectedLocationKey(key);
            // Focus map to just this location once by narrowing the fit to this point
            setFocusedLocations([loc]);
            setFitKey(k => k + 1);
            // After a short moment, release focus so future updates show normally
            setTimeout(() => setFocusedLocations(null), 150);
          }}
        />
      </div>
      
      <div className="app-main">
        {error && (
          <div className="error-banner">
            ⚠️ {error}
            <button onClick={() => setError(null)} className="error-close">×</button>
          </div>
        )}
        
        <CatMap
          locations={locations}
          deviceStatuses={deviceStatuses}
          selectedDevice={selectedDevice}
          showHistory={true}
          fitKey={fitKey}
          fitTargets={focusedLocations ?? undefined}
        />
      </div>
    </div>
  );
}

const AppContent: React.FC = () => {
  const { state } = useAuth();
  
  console.log('🔵 AppContent render - Auth state:', {
    isLoading: state.isLoading,
    isAuthenticated: state.isAuthenticated,
    user: state.user,
    hasToken: !!state.token
  });

  if (state.isLoading) {
    return (
      <div className="auth-loading">
        <div className="loading-spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (!state.isAuthenticated) {
    return <AuthWrapper />;
  }

  return <MainApp />;
};

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
