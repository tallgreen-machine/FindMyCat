import React, { useState } from 'react';
import { DeviceStatus } from '../types';
import { formatDistanceToNow, parseISO } from 'date-fns';
import './ControlPanel.css';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/api';

interface ControlPanelProps {
  deviceStatuses: DeviceStatus[];
  selectedDevice: string | null;
  isConnected: boolean;
  onDeviceSelect: (deviceId: string | null) => void;
  onRefresh: () => void;
  pointsCount?: number;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  deviceStatuses,
  selectedDevice,
  isConnected,
  onDeviceSelect,
  onRefresh,
  pointsCount
}) => {
  const { logout, state } = useAuth();
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [pairError, setPairError] = useState<string | null>(null);
  const [isLoadingCode, setIsLoadingCode] = useState(false);

  React.useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!state.isAuthenticated) return;
      setIsLoadingCode(true);
      try {
        const res = await apiService.getPairingCode();
        if (mounted) {
          setPairCode(res.code);
          setPairError(null);
        }
      } catch (e1: any) {
        if (mounted) setPairError(e1?.response?.data?.error || 'No active pairing code');
      } finally {
        if (mounted) setIsLoadingCode(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [state.isAuthenticated]);

  const retryFetchCode = async () => {
    setIsLoadingCode(true);
    setPairError(null);
    try {
      const res = await apiService.getPairingCode();
      setPairCode(res.code);
    } catch (e1: any) {
      setPairError(e1?.response?.data?.error || 'No active pairing code');
    } finally {
      setIsLoadingCode(false);
    }
  };

  const copyCode = async () => {
    if (!pairCode) return;
    try {
      await navigator.clipboard.writeText(pairCode);
    } catch {
      // ignore
    }
  };
  return (
    <div className="control-panel">
      <div className="panel-header">
        <h2>🐱 FindMyCat</h2>
        <div className="connection-status">
          <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '🟢' : '🔴'}
          </span>
          <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
        {state.isAuthenticated && (
          <button className="refresh-button" onClick={logout} title="Sign out" style={{marginLeft: 8}}>
            🚪 Logout
          </button>
        )}
      </div>

      <div className="control-group" style={{marginTop: 8}}>
        <div style={{fontSize: 12, color: '#555'}}>
          <strong>History:</strong> ON • <strong>Points:</strong> {pointsCount ?? '–'} • <strong>Devices:</strong> {deviceStatuses.length}
        </div>
      </div>

      {state.isAuthenticated && (
        <div className="pairing-box">
          <h4>🔗 Pair your Mac client</h4>
          <p className="pairing-help">Use your account's pairing code with the Mac client to link updates to your account.</p>
          {isLoadingCode && (
            <div style={{ fontSize: 13, color: '#666' }}>Fetching pairing code…</div>
          )}
          {pairError && (
            <div className="error-message" style={{marginTop: 8}}>
              {pairError} <button className="link-button" onClick={retryFetchCode} disabled={isLoadingCode}>Try again</button>
            </div>
          )}
          {pairCode && !pairError && (
            <div className="pairing-result">
              <div className="pairing-code" onClick={copyCode} title="Click to copy">
                {pairCode}
              </div>
              <div className="pairing-instructions">
                On your Mac:
                <pre style={{whiteSpace: 'pre-wrap'}}>python3 findmycat_client.py --pair-code {pairCode}</pre>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="controls">
        <div className="control-group">
          <label htmlFor="device-select">Select Device:</label>
          <select
            id="device-select"
            value={selectedDevice || ''}
            onChange={(e) => onDeviceSelect(e.target.value || null)}
            className="device-select"
          >
            <option value="">All Devices</option>
            {deviceStatuses.map(device => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.deviceId} {device.isOnline ? '🟢' : '🔴'}
              </option>
            ))}
          </select>
        </div>

        <button onClick={onRefresh} className="refresh-button">
          🔄 Refresh Data
        </button>
      </div>

      <div className="device-list">
        <h3>Devices ({deviceStatuses.length})</h3>
        {deviceStatuses.length === 0 ? (
          <p className="no-devices">No devices found</p>
        ) : (
          <ul>
            {deviceStatuses.map(device => (
              <li 
                key={device.deviceId}
                className={`device-item ${selectedDevice === device.deviceId ? 'selected' : ''}`}
                onClick={() => onDeviceSelect(device.deviceId === selectedDevice ? null : device.deviceId)}
              >
                <div className="device-info">
                  <div className="device-name">
                    <span className={`status-dot ${device.isOnline ? 'online' : 'offline'}`}></span>
                    {device.deviceId}
                  </div>
                  <div className="device-details">
                    <div className="last-seen">
                      Last seen: {formatDistanceToNow(parseISO(device.lastSeen), { addSuffix: true })}
                    </div>
                    <div className="coordinates">
                      {Number.isFinite(Number(device.latitude)) && Number.isFinite(Number(device.longitude)) ? (
                        <>📍 {Number(device.latitude).toFixed(4)}, {Number(device.longitude).toFixed(4)}</>
                      ) : (
                        <>📍 Unknown</>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};