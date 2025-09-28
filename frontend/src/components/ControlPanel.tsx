import React from 'react';
import { DeviceStatus } from '../types';
import { formatDistanceToNow, parseISO } from 'date-fns';
import './ControlPanel.css';

interface ControlPanelProps {
  deviceStatuses: DeviceStatus[];
  selectedDevice: string | null;
  showHistory: boolean;
  isConnected: boolean;
  onDeviceSelect: (deviceId: string | null) => void;
  onHistoryToggle: (show: boolean) => void;
  onRefresh: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  deviceStatuses,
  selectedDevice,
  showHistory,
  isConnected,
  onDeviceSelect,
  onHistoryToggle,
  onRefresh
}) => {
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
      </div>

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

        <div className="control-group">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={showHistory}
              onChange={(e) => onHistoryToggle(e.target.checked)}
            />
            Show Location History
          </label>
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
                      📍 {device.latitude.toFixed(4)}, {device.longitude.toFixed(4)}
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