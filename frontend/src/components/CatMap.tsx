import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Popup, useMap, CircleMarker, Tooltip } from 'react-leaflet';
import { Location, DeviceStatus } from '../types';
import { formatDistanceToNow, parseISO } from 'date-fns';
import 'leaflet/dist/leaflet.css';
import './CatMap.css';

interface CatMapProps {
  locations: Location[];
  deviceStatuses: DeviceStatus[];
  selectedDevice: string | null;
  showHistory: boolean;
  fitKey?: number; // bump to request a one-time auto-fit
  fitTargets?: Location[] | null; // optional: use these points to fit view, without changing rendered markers
}

// Component to auto-fit map bounds
const MapBoundsUpdater: React.FC<{ locations: Location[]; fitKey?: number; lockRef: React.MutableRefObject<boolean>; fitTargets?: Location[] | null }> = ({ locations, fitKey, lockRef, fitTargets }) => {
  const map = useMap();
  const lastBoundsRef = useRef<{ minLat: number; maxLat: number; minLng: number; maxLng: number; count: number } | null>(null);
  const lastFitKeyRef = useRef<number | undefined>(undefined);

  const computeBounds = (locs: Location[]) => {
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const l of locs) {
      if (l.latitude < minLat) minLat = l.latitude;
      if (l.latitude > maxLat) maxLat = l.latitude;
      if (l.longitude < minLng) minLng = l.longitude;
      if (l.longitude > maxLng) maxLng = l.longitude;
    }
    return { minLat, maxLat, minLng, maxLng, count: locs.length };
  };

  const hasMeaningfulChange = (
    a: { minLat: number; maxLat: number; minLng: number; maxLng: number; count: number } | null,
    b: { minLat: number; maxLat: number; minLng: number; maxLng: number; count: number }
  ) => {
    if (!a) return true;
    if (a.count !== b.count) return true;
    const eps = 1e-6; // ~0.1 meter-ish; prevents tiny oscillations
    return (
      Math.abs(a.minLat - b.minLat) > eps ||
      Math.abs(a.maxLat - b.maxLat) > eps ||
      Math.abs(a.minLng - b.minLng) > eps ||
      Math.abs(a.maxLng - b.maxLng) > eps
    );
  };

  useEffect(() => {
    const fitList = (fitTargets && fitTargets.length > 0) ? fitTargets : locations;
    if (fitList.length > 0) {
      if (lockRef.current) return; // user has interacted; don't auto-fit
      const summary = computeBounds(fitList);
      if (!hasMeaningfulChange(lastBoundsRef.current, summary)) return;
      lastBoundsRef.current = summary;
      if (fitList.length === 1) {
        const [lat, lng] = [fitList[0].latitude, fitList[0].longitude];
        const targetZoom = Math.max(map.getZoom(), 19);
        map.setView([lat, lng], Math.min(targetZoom, 22), { animate: false });
      } else {
        const bounds = fitList.map(loc => [loc.latitude, loc.longitude] as [number, number]);
        map.fitBounds(bounds, { padding: [20, 20], animate: false, maxZoom: 21 });
      }
    }
  }, [locations, fitTargets, lockRef, map]);

  // Allow forcing a re-fit via fitKey (e.g., after refresh/toggle)
  useEffect(() => {
    if (fitKey === undefined) return;
    if (fitKey === lastFitKeyRef.current) return;
    lastFitKeyRef.current = fitKey;
    const fitList = (fitTargets && fitTargets.length > 0) ? fitTargets : locations;
    if (fitList.length === 0) return;
    if (fitList.length === 1) {
      const [lat, lng] = [fitList[0].latitude, fitList[0].longitude];
      const targetZoom = Math.max(map.getZoom(), 19);
      map.setView([lat, lng], Math.min(targetZoom, 22), { animate: false });
    } else {
      const bounds = fitList.map(loc => [loc.latitude, loc.longitude] as [number, number]);
      map.fitBounds(bounds, { padding: [20, 20], animate: false, maxZoom: 21 });
    }
  }, [fitKey, locations, fitTargets, map]);

  return null;
};

export const CatMap: React.FC<CatMapProps> = ({ 
  locations, 
  deviceStatuses, 
  selectedDevice, 
  showHistory,
  fitKey,
  fitTargets
}) => {
  const [filteredLocations, setFilteredLocations] = useState<Location[]>([]);
  const autoFitLockedRef = useRef(false);

  // Component to register user interaction locks inside the map context
  const InteractionLock: React.FC = () => {
    const map = useMap();
    useEffect(() => {
      const lock = () => { autoFitLockedRef.current = true; };
      map.on('zoomstart', lock);
      map.on('dragstart', lock);
      return () => {
        map.off('zoomstart', lock);
        map.off('dragstart', lock);
      };
    }, [map]);
    return null;
  };

  useEffect(() => {
    let filtered = locations;
    
    if (selectedDevice) {
      filtered = locations.filter(loc => loc.deviceId === selectedDevice);
    }
    
    if (!showHistory) {
      // Show only latest location per device
      const latestPerDevice = new Map<string, Location>();
      filtered.forEach(loc => {
        const existing = latestPerDevice.get(loc.deviceId);
        if (!existing || new Date(loc.timestamp) > new Date(existing.timestamp)) {
          latestPerDevice.set(loc.deviceId, loc);
        }
      });
      filtered = Array.from(latestPerDevice.values());
    }

    setFilteredLocations(filtered);
  }, [locations, selectedDevice, showHistory]);

  const getMarkerPopupContent = (location: Location) => {
    const deviceStatus = deviceStatuses.find(status => status.deviceId === location.deviceId);
    const timeAgo = formatDistanceToNow(parseISO(location.timestamp), { addSuffix: true });
    
    return (
      <div className="marker-popup">
        <h4>🐱 {location.deviceId}</h4>
        <p><strong>Location:</strong> {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}</p>
        <p><strong>Last seen:</strong> {timeAgo}</p>
        <p><strong>Status:</strong> 
          <span className={`status ${deviceStatus?.isOnline ? 'online' : 'offline'}`}>
            {deviceStatus?.isOnline ? ' 🟢 Online' : ' 🔴 Offline'}
          </span>
        </p>
        <p><strong>Timestamp:</strong> {new Date(location.timestamp).toLocaleString()}</p>
      </div>
    );
  };

  const defaultCenter: [number, number] = [37.7749, -122.4194]; // initial center only; bounds updater will handle view

  // Avoid mutating state by sorting a copy for render
  const sortedLocations = useMemo(() => {
    return [...filteredLocations].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [filteredLocations]);

  // No polyline; we will label markers numerically instead

  return (
    <div className="cat-map-container">
      <MapContainer
        center={defaultCenter}
        zoom={14}
        maxZoom={22}
        zoomSnap={0.25}
        zoomDelta={0.5}
        preferCanvas={true}
        style={{ height: '100%', width: '100%' }}
      >
        <InteractionLock />
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxNativeZoom={19}
          maxZoom={22}
          keepBuffer={4}
          updateWhenZooming={true}
          updateWhenIdle={false}
          crossOrigin="anonymous"
        />
        
  <MapBoundsUpdater locations={filteredLocations} fitKey={fitKey} lockRef={autoFitLockedRef} fitTargets={fitTargets} />
        
        {/* Draw points as circles; latest is larger and greener */}
        {sortedLocations.map((location, index) => {
          const total = sortedLocations.length;
          const isLatest = index === total - 1;
          const recency = (index + 1) / total; // 0..1
          const radius = isLatest ? 9 : Math.max(3, Math.floor(6 * recency));
          const fillOpacity = isLatest ? 0.9 : 0.15 + 0.6 * recency; // fade older points
          const fillColor = isLatest ? '#22c55e' : '#3b82f6'; // green latest, blue history
          const color = isLatest ? '#14532d' : '#1e40af'; // darker stroke
          return (
            <CircleMarker
              key={`${location.deviceId}-${location.timestamp}-${index}`}
              center={[location.latitude, location.longitude]}
              pathOptions={{ color, fillColor, fillOpacity, weight: isLatest ? 3 : 1 }}
              radius={radius}
            >
              {showHistory && (
                <Tooltip permanent direction="center" className="marker-label">
                  {total - index}
                </Tooltip>
              )}
              <Popup>
                {getMarkerPopupContent(location)}
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
};