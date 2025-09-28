import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CatMap } from './components/CatMap';
import { ControlPanel } from './components/ControlPanel';
import { websocketService } from './services/websocket';
import { apiService } from './services/api';
import { Location, DeviceStatus } from './types';
import { HistoryBoard } from './components/HistoryBoard';
import './App.css';

function App() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [deviceStatuses, setDeviceStatuses] = useState<DeviceStatus[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fitKey, setFitKey] = useState(0);
  const [historyReloadKey, setHistoryReloadKey] = useState(0);
  const [selectedLocationKey, setSelectedLocationKey] = useState<string | null>(null);
  const [focusedLocations, setFocusedLocations] = useState<Location[] | null>(null);
  const historyAbortRef = useRef<AbortController | null>(null);
  const loadingHistoryRef = useRef(false);

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
    console.log('🔍 API URL from env:', apiUrl);
    const socket = websocketService.connect(apiUrl);

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

      socket.on('initial_locations', (data: Location[]) => {
        console.log('Received initial locations:', data);
        setLocations(data);
        setIsLoading(false);
      });

      socket.on('location_update', (newLocation: Location) => {
        setLocations(prevLocations => {
          const updatedLocations = [...prevLocations, newLocation];
          if (!showHistory) {
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
          const existingIndex = updatedStatuses.findIndex(s => s.deviceId === newLocation.deviceId);
          const newStatus: DeviceStatus = {
            deviceId: newLocation.deviceId,
            lastSeen: newLocation.timestamp,
            latitude: newLocation.latitude,
            longitude: newLocation.longitude,
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

  // When the history toggle changes, avoid overwriting history with latest-only.
  // - If enabling history, trigger a history fetch and re-fit.
  // - If disabling history, refresh latest-only data and re-fit.
  useEffect(() => {
    if (isLoading) return;
    if (showHistory) {
      setHistoryReloadKey(k => k + 1);
      setFitKey(k => k + 1);
    } else {
      loadInitialData();
      setFitKey(k => k + 1);
    }
  }, [showHistory, isLoading, loadInitialData]);

  useEffect(() => {
    if (!showHistory) return;
    if (loadingHistoryRef.current) return;
    loadingHistoryRef.current = true;

    const controller = new AbortController();
    historyAbortRef.current?.abort();
    historyAbortRef.current = controller;

    const fetchHistory = async () => {
      try {
        const history = await apiService.getAllLocationHistory(1000, 30000);
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
  }, [showHistory, historyReloadKey]);

  const handleRefresh = () => {
    if (showHistory) {
      setHistoryReloadKey(k => k + 1);
    } else {
      loadInitialData();
    }
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
          showHistory={showHistory}
          isConnected={isConnected}
          onDeviceSelect={setSelectedDevice}
          onHistoryToggle={setShowHistory}
          onRefresh={handleRefresh}
        />
        <HistoryBoard
          locations={locations}
          selectedDevice={selectedDevice}
          showHistory={showHistory}
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
          showHistory={showHistory}
          fitKey={fitKey}
          fitTargets={focusedLocations ?? undefined}
        />
      </div>
    </div>
  );
}

export default App;
