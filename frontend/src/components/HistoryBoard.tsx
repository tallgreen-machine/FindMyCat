import React, { useMemo } from 'react';
import { Location } from '../types';
import { formatDistanceToNow, parseISO } from 'date-fns';
import './HistoryBoard.css';

export interface HistoryBoardProps {
  locations: Location[];
  selectedDevice: string | null;
  showHistory: boolean;
  selectedLocationKey: string | null;
  onSelect: (loc: Location) => void;
}

const makeKey = (l: Location) => `${l.deviceId}|${l.timestamp}`;

export const HistoryBoard: React.FC<HistoryBoardProps> = ({
  locations,
  selectedDevice,
  showHistory,
  selectedLocationKey,
  onSelect,
}) => {
  // We only show the board when history is enabled
  const filtered = useMemo(() => {
    const base = selectedDevice ? locations.filter(l => l.deviceId === selectedDevice) : locations;
    // Sort newest -> oldest
  const newestFirst = [...base].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    // Numbering: newest is #1, then 2, 3, ... matching map labels
    return newestFirst.slice(0, 200).map((l, idx) => ({
      loc: l,
      number: idx + 1,
    }));
  }, [locations, selectedDevice]);

  if (!showHistory) return null;

  return (
    <div className="history-board">
      <h3>Recent History</h3>
      {filtered.length === 0 ? (
        <p className="empty">No history available</p>
      ) : (
        <ul className="history-list">
          {filtered.map(({ loc, number }) => {
            const isSelected = selectedLocationKey === makeKey(loc);
            const timeAgo = formatDistanceToNow(parseISO(loc.timestamp), { addSuffix: true });
            return (
              <li key={makeKey(loc)} className={`history-item ${isSelected ? 'selected' : ''}`} onClick={() => onSelect(loc)}>
                <span className="badge">{number}</span>
                <div className="meta">
                  <div className="row1">
                    <span className="device">{loc.deviceId}</span>
                    <span className="time">{timeAgo}</span>
                  </div>
                  <div className="row2">
                    📍 {loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
