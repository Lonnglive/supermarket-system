import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from '../types';
import { api, setAuthToken } from '../api/client';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  needsSetup: boolean;
  hasDefaultPassword: boolean;
  login: (credentials: { usernameOrEmail: string; password: string }) => Promise<void>;
  loginWithOtp: (credentials: { identifier: string; channel: 'EMAIL' | 'PHONE'; otp: string }) => Promise<void>;
  register: (data: { fullName: string; username: string; password: string; identifier: string; channel: 'EMAIL' | 'PHONE'; otp: string }) => Promise<void>;
  logout: () => void;
  hasPermission: (permissionId: string) => boolean;
  isSuperAdmin: boolean;
  isSystemAdmin: boolean;
  refreshSetupStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [hasDefaultPassword, setHasDefaultPassword] = useState(false);

  const checkSetupStatus = useCallback(async () => {
    try {
      const status = await api.setup.getStatus();
      setNeedsSetup(!status.isSetupComplete || status.hasDefaultPassword);
      setHasDefaultPassword(status.hasDefaultPassword);
    } catch {
      // If endpoint fails (e.g. DB not yet migrated), don't block the app
      setNeedsSetup(false);
    }
  }, []);

  useEffect(() => {
    async function loadUser() {
      const token = localStorage.getItem('aeropos_token');
      if (token) {
        try {
          const res = await api.auth.getMe();
          setUser(res.user);
          // Check setup status once the session is restored
          await checkSetupStatus();
        } catch (err) {
          console.error('Session restore failed:', err);
          setAuthToken(null);
          setUser(null);
        }
      }
      setLoading(false);
    }

    loadUser();

    const handleUnauthorized = () => {
      setUser(null);
      setNeedsSetup(false);
    };

    window.addEventListener('aeropos_unauthorized', handleUnauthorized);
    return () => window.removeEventListener('aeropos_unauthorized', handleUnauthorized);
  }, [checkSetupStatus]);

  const login = async (credentials: { usernameOrEmail: string; password: string }) => {
    const res = await api.auth.login(credentials);
    setAuthToken(res.token);
    setUser(res.user);
    // After login, check if setup wizard needs to run
    await checkSetupStatus();
  };

  const loginWithOtp = async (credentials: { identifier: string; channel: 'EMAIL' | 'PHONE'; otp: string }) => {
    const res = await api.auth.verifyOtp(credentials);
    setAuthToken(res.token);
    setUser(res.user);
    await checkSetupStatus();
  };

  const register = async (data: { fullName: string; username: string; password: string; identifier: string; channel: 'EMAIL' | 'PHONE'; otp: string }) => {
    const res = await api.auth.register(data);
    setAuthToken(res.token);
    setUser(res.user);
    await checkSetupStatus();
  };

  const logout = () => {
    api.auth.logout().catch(() => {});
    setAuthToken(null);
    setUser(null);
    setNeedsSetup(false);
    setHasDefaultPassword(false);
  };

  const refreshSetupStatus = async () => {
    await checkSetupStatus();
  };

  const isSuperAdmin = Boolean(user?.roles.includes('SUPER_ADMIN'));
  const isSystemAdmin = Boolean(user?.roles.includes('SYSTEM_ADMIN'));

  const hasPermission = (permissionId: string): boolean => {
    if (!user) return false;
    if (isSuperAdmin) return true;
    return user.permissions.includes(permissionId);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        needsSetup,
        hasDefaultPassword,
        login,
        loginWithOtp,
        register,
        logout,
        hasPermission,
        isSuperAdmin,
        isSystemAdmin,
        refreshSetupStatus
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
