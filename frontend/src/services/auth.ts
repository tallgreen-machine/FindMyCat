import axios from 'axios';
import { User, LoginCredentials, RegisterData, AuthResponse } from '../types';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

const auth = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

// Token management
const TOKEN_KEY = 'findmycat_token';
const USER_KEY = 'findmycat_user';

export const tokenService = {
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },

  setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  },

  removeToken(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },

  getUser(): User | null {
    const userData = localStorage.getItem(USER_KEY);
    return userData ? JSON.parse(userData) : null;
  },

  setUser(user: User): void {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
};

// Request interceptor to add auth token
auth.interceptors.request.use((config) => {
  const token = tokenService.getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor to handle auth errors
auth.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 || error.response?.status === 403) {
      // Token expired or invalid
      tokenService.removeToken();
      // Do not reload here; allow UI to handle and show errors without page refresh
    }
    return Promise.reject(error);
  }
);

export const authService = {
  // Register new user
  async register(data: RegisterData): Promise<AuthResponse> {
    console.log('Attempting registration with:', { email: data.email, displayName: data.displayName });
    console.log('API Base URL:', API_BASE_URL);
    
    const response = await auth.post('/api/auth/register', data);
    console.log('Registration response:', response.data);
    
    const authData: AuthResponse = response.data;
    
    // Store token and user
    tokenService.setToken(authData.token);
    tokenService.setUser(authData.user);
    
    console.log('Registration successful, token stored');
    return authData;
  },

  // Login existing user
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    console.log('Attempting login with:', { email: credentials.email });
    console.log('API Base URL:', API_BASE_URL);
    
    const response = await auth.post('/api/auth/login', credentials);
    console.log('Login response:', response.data);
    
    const authData: AuthResponse = response.data;
    
    // Store token and user
    tokenService.setToken(authData.token);
    tokenService.setUser(authData.user);
    
    console.log('Login successful, token stored');
    return authData;
  },

  // Logout user
  async logout(): Promise<void> {
    tokenService.removeToken();
    // Could call logout endpoint here if needed
  },

  // Get current user info
  async getCurrentUser(): Promise<User> {
    const response = await auth.get('/api/auth/me');
    const user: User = response.data?.user || response.data;
    tokenService.setUser(user);
    return user;
  },

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return !!tokenService.getToken();
  },

  // Get stored user data
  getStoredUser(): User | null {
    return tokenService.getUser();
  }
};