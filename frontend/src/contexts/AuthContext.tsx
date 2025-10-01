import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { User, AuthState, LoginCredentials, RegisterData } from '../types';
import { authService } from '../services/auth';

// Auth Actions
type AuthAction =
  | { type: 'AUTH_START' }
  | { type: 'AUTH_SUCCESS'; payload: { user: User; token: string } }
  | { type: 'AUTH_FAILURE'; payload: string }
  | { type: 'AUTH_LOGOUT' }
  | { type: 'AUTH_INIT'; payload: { user: User; token: string } | null };

// Auth Context
interface AuthContextType {
  state: AuthState;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Auth Reducer
const authReducer = (state: AuthState, action: AuthAction): AuthState => {
  console.log('🔄 AuthReducer:', action.type, action);
  switch (action.type) {
    case 'AUTH_START':
      return {
        ...state,
        isLoading: true
      };
    case 'AUTH_SUCCESS':
      return {
        user: action.payload.user,
        token: action.payload.token,
        isAuthenticated: true,
        isLoading: false
      };
    case 'AUTH_FAILURE':
      return {
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false
      };
    case 'AUTH_LOGOUT':
      return {
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false
      };
    case 'AUTH_INIT':
      if (action.payload) {
        return {
          user: action.payload.user,
          token: action.payload.token,
          isAuthenticated: true,
          isLoading: false
        };
      }
      return {
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false
      };
    default:
      return state;
  }
};

// Initial state
const initialState: AuthState = {
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true
};

// Auth Provider Props
interface AuthProviderProps {
  children: ReactNode;
}

// Auth Provider Component
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Initialize auth state from localStorage
  useEffect(() => {
    const token = authService.isAuthenticated();
    const user = authService.getStoredUser();
    
    if (token && user) {
      dispatch({
        type: 'AUTH_INIT',
        payload: { user, token: token.toString() }
      });
    } else {
      dispatch({ type: 'AUTH_INIT', payload: null });
    }
  }, []);

  // Login function
  const login = async (credentials: LoginCredentials): Promise<void> => {
    try {
      console.log('🔐 AuthContext: Starting login...');
      dispatch({ type: 'AUTH_START' });
      const authData = await authService.login(credentials);
      console.log('✅ AuthContext: Login successful, dispatching AUTH_SUCCESS');
      dispatch({
        type: 'AUTH_SUCCESS',
        payload: {
          user: authData.user,
          token: authData.token
        }
      });
      console.log('✅ AuthContext: AUTH_SUCCESS dispatched');
    } catch (error) {
      console.error('❌ AuthContext: Login failed:', error);
      dispatch({ type: 'AUTH_FAILURE', payload: 'Login failed' });
      throw error;
    }
  };  // Register function
  const register = async (data: RegisterData): Promise<void> => {
    try {
      dispatch({ type: 'AUTH_START' });
      const authData = await authService.register(data);
      dispatch({
        type: 'AUTH_SUCCESS',
        payload: {
          user: authData.user,
          token: authData.token
        }
      });
    } catch (error) {
      dispatch({ type: 'AUTH_FAILURE', payload: 'Registration failed' });
      throw error;
    }
  };

  // Logout function
  const logout = (): void => {
    authService.logout();
    dispatch({ type: 'AUTH_LOGOUT' });
  };

  // Refresh user data
  const refreshUser = async (): Promise<void> => {
    try {
      const user = await authService.getCurrentUser();
      dispatch({
        type: 'AUTH_SUCCESS',
        payload: {
          user,
          token: state.token || ''
        }
      });
    } catch (error) {
      console.error('Failed to refresh user:', error);
      logout();
    }
  };

  const value: AuthContextType = {
    state,
    login,
    register,
    logout,
    refreshUser
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use auth context
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};