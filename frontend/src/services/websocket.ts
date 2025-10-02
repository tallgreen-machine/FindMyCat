import { io, Socket } from 'socket.io-client';

// Allow overriding the WS endpoint separately (useful behind reverse proxies)
// Default to same-origin. In dev, CRA proxy will forward to the backend.
const API_URL = process.env.REACT_APP_API_URL || '/';
const WS_URL_OVERRIDE = process.env.REACT_APP_WS_URL; // optional

// Runtime debug toggle: enabled in development, or with ?debug=1, or window.__FMC_DEBUG = true
const isDebug = (() => {
  try {
    const params = new URLSearchParams(window.location.search);
    // NODE_ENV is baked at build time; 'development' means CRA dev server
    const byEnv = process.env.NODE_ENV !== 'production';
    const byParam = params.has('debug');
    const byGlobal = (window as any).__FMC_DEBUG__ === true;
    return byEnv || byParam || byGlobal;
  } catch {
    return process.env.NODE_ENV !== 'production';
  }
})();

class WebSocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  connect(url: string = (WS_URL_OVERRIDE || API_URL)) {
    if (this.socket?.connected) {
      return this.socket;
    }

    if (isDebug) console.log('🔌 Connecting to WebSocket:', url);
    
    // Extract domain and path for Socket.IO configuration
    const urlObj = new URL(url);
  const serverUrl = urlObj.host ? `${urlObj.protocol}//${urlObj.host}` : window.location.origin;
    // If the override already points to a socket.io path, keep it; otherwise append
    const endsWithSocketIo = /\/socket\.io\/?$/.test(urlObj.pathname);
    const basePath = urlObj.pathname ? urlObj.pathname.replace(/\/$/, '') : '';
    const path = endsWithSocketIo
      ? basePath.replace(/\/$/, '') // ensure no trailing slash
      : (basePath === '' ? '/socket.io' : `${basePath}/socket.io`);
    
    if (isDebug) {
      console.log('🔌 Server URL:', serverUrl);
      console.log('🔌 Socket.IO path:', path);
    }
    
    this.socket = io(serverUrl, {
      path: path,
      // Allow polling fallback; engine will upgrade to websocket when available
      transports: ['polling', 'websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      if (isDebug) console.log('🔌 Connected to FindMyCat backend');
      this.reconnectAttempts = 0;
      // Request initial data when connected
      this.socket?.emit('request_initial_data');
    });

    this.socket.on('disconnect', (reason) => {
      if (isDebug) console.log('🔌 Disconnected from backend:', reason);
    });

    this.socket.on('connect_error', (error) => {
      // Keep a concise error in production; detailed logs only in debug
      console.error('🔌 Connection error:', (error as any)?.message || error);
      if (isDebug) console.debug('🔌 WS debug -> url:', serverUrl, 'path:', path, 'details:', error);
      this.reconnectAttempts++;
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  getSocket() {
    return this.socket;
  }

  isConnected() {
    return this.socket?.connected || false;
  }
}

export const websocketService = new WebSocketService();