import React, { useState } from 'react';
import { LoginForm } from './LoginForm';
import { RegisterForm } from './RegisterForm';
import { useAuth } from '../contexts/AuthContext';
import './AuthForms.css';

export const AuthWrapper: React.FC = () => {
  const { state } = useAuth();
  const [isLoginMode, setIsLoginMode] = useState(true);

  if (state.isLoading) {
    return (
      <div className="auth-loading">
        <div className="loading-spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-container">
        {isLoginMode ? (
          <LoginForm onSwitchToRegister={() => setIsLoginMode(false)} />
        ) : (
          <RegisterForm onSwitchToLogin={() => setIsLoginMode(true)} />
        )}
      </div>
      
      <div className="auth-background">
        <div className="demo-info">
          <h3>🌟 New Multi-User Features</h3>
          <ul>
            <li>🔐 Secure user accounts</li>
            <li>📱 Device pairing with codes</li>
            <li>🎨 Customizable device names & colors</li>
            <li>📊 Personal device tracking</li>
            <li>🔄 Real-time synchronization</li>
          </ul>
        </div>
      </div>
    </div>
  );
};