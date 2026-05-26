import React, { createContext, useContext, useEffect, useState } from 'react';
import { api, clearAuthToken, getStoredUser, setAuthToken } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getStoredUser);
  const [loading, setLoading] = useState(!!localStorage.getItem('pm_token'));

  useEffect(() => {
    const token = localStorage.getItem('pm_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then((data) => {
        setUser(data);
        localStorage.setItem('pm_user', JSON.stringify(data));
      })
      .catch(() => {
        clearAuthToken();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('pm_token');
    if (token) {
      document.documentElement.setAttribute('data-pm-token', token);
    } else {
      document.documentElement.removeAttribute('data-pm-token');
    }
  }, [user]);

  const login = async (email, password) => {
    const data = await api.login(email, password);
    setAuthToken(data.access_token, data.user);
    setUser(data.user);
    return data;
  };

  const register = async (email, password) => {
    const data = await api.register(email, password);
    setAuthToken(data.access_token, data.user);
    setUser(data.user);
    return data;
  };

  const logout = () => {
    clearAuthToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
