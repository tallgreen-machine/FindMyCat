import { io, Socket } from 'socket.io-client';

const WS_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

class WebSocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  connect(url: string = WS_URL) {
    if (this.socket?.connected) {
      return this.socket;
    }

    console.log('🔌 Connecting to WebSocket:', url);
    
    // Extract domain and path for Socket.IO configuration
    const urlObj = new URL(url);
    const serverUrl = `${urlObj.protocol}//${urlObj.host}`;
    const path = urlObj.pathname === '/' ? '/socket.io/' : `${urlObj.pathname}/socket.io/`;
    
    console.log('🔌 Server URL:', serverUrl);
    console.log('🔌 Socket.IO path:', path);
    
    this.socket = io(serverUrl, {
      path: path,
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      console.log('🔌 Connected to FindMyCat backend');
      this.reconnectAttempts = 0;
      // Request initial data when connected
      this.socket?.emit('request_initial_data');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('🔌 Disconnected from backend:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('🔌 Connection error:', error);
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