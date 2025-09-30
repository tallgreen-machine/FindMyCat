import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LoginCredentials } from '../types';
import './AuthForms.css';

interface LoginFormProps {
  onSwitchToRegister: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onSwitchToRegister }) => {
  const { login, state } = useAuth();
  const [formData, setFormData] = useState<LoginCredentials>({
    email: '',
    password: ''
  });
  const [error, setError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    // Prevent the browser from submitting/reloading immediately
    e.preventDefault();
    try {
      console.log('🔴 Form submitted!', e.type);
      
      if (isSubmitting) {
        console.log('🔴 Already submitting, ignoring');
        return;
      }
      
      setIsSubmitting(true);
      console.log('🔴 After preventDefault, form data:', formData);
      setError('');

      if (!formData.email || !formData.password) {
        console.log('🔴 Missing fields');
        setError('Please fill in all fields');
        setIsSubmitting(false);
        return;
      }

      console.log('🔴 Calling login function...');
      await login(formData);
      console.log('🔴 Login function completed successfully');
    } catch (err: any) {
      console.error('🔴 Login error:', err);
      console.error('🔴 Error response:', err.response);
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  // Removed debug testClick

  return (
    <div className="auth-form">
      <h2>🐱 Welcome Back to FindMyCat</h2>
      {/* Debug test button removed */}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleInputChange}
            required
            placeholder="your@email.com"
            disabled={state.isLoading}
          />
        </div>

        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            name="password"
            value={formData.password}
            onChange={handleInputChange}
            required
            placeholder="Your password"
            disabled={state.isLoading}
          />
        </div>

        {error && <div className="error-message">{error}</div>}

        <button 
          type="submit" 
          className="auth-button"
          disabled={state.isLoading || isSubmitting}
        >
          {(state.isLoading || isSubmitting) ? 'Signing In...' : 'Sign In'}
        </button>
      </form>

      <div className="auth-switch">
        <p>
          Don't have an account?{' '}
          <button
            type="button"
            className="link-button"
            onClick={onSwitchToRegister}
            disabled={state.isLoading}
          >
            Create Account
          </button>
        </p>
      </div>
    </div>
  );
};