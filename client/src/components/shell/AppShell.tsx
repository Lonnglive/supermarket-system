import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { StoreSettings } from '../../types';
import {
  ShoppingCart, Boxes, BarChart3, Settings,
  LogOut, Clock, Sun, Moon, AlertCircle
} from 'lucide-react';

interface AppShellProps {
  activeModule: 'billing' | 'stock' | 'reports' | 'settings';
  setActiveModule: (module: 'billing' | 'stock' | 'reports' | 'settings') => void;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  activeModule,
  setActiveModule,
  children
}) => {
  const { user, logout, hasPermission, isSuperAdmin } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [deniedMessage, setDeniedMessage] = useState<string | null>(null);
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);

  // Theme: 'dark' | 'light'
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') {
      return 'dark';
    }

    return (localStorage.getItem('bharathi_theme') as 'dark' | 'light') || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.classList.toggle('light-theme', theme === 'light');
    localStorage.setItem('bharathi_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    loadStore();
    return () => clearInterval(timer);
  }, []);

  const loadStore = async () => {
    try {
      const res = await api.settings.getStore();
      setStoreSettings(res.store);
    } catch {
      // ignore
    }
  };

  const handleModuleSwitch = (target: 'billing' | 'stock' | 'reports' | 'settings') => {
    if (target === 'billing') {
      if (!hasPermission('billing.view')) {
        showPermissionDenied('You do not have permission to access Billing.');
        return;
      }
      setActiveModule('billing');
      return;
    }

    if (target === 'stock') {
      if (!hasPermission('stock.view')) {
        showPermissionDenied('You do not have permission to access Stock / Inventory Management.');
        return;
      }
      setActiveModule('stock');
      return;
    }

    if (target === 'reports') {
      if (!hasPermission('reports.view')) {
        showPermissionDenied('You do not have permission to view Business Reports.');
        return;
      }
      setActiveModule('reports');
      return;
    }

    if (target === 'settings') {
      if (!hasPermission('settings.view') && !isSuperAdmin) {
        showPermissionDenied('Settings access is restricted to Super Administrators.');
        return;
      }
      setActiveModule('settings');
      return;
    }
  };

  const showPermissionDenied = (msg: string) => {
    setDeniedMessage(msg);
    setTimeout(() => setDeniedMessage(null), 4500);
  };

  return (
    <div className="app-shell">
      {/* Toast / Notification Banner for Access Denials */}
      {deniedMessage && (
        <div style={{
          position: 'fixed',
          top: 72,
          right: 24,
          zIndex: 9999,
          background: '#881337',
          border: '1px solid #f43f5e',
          color: '#ffffff',
          padding: '12px 18px',
          borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontWeight: 600,
          fontSize: 14,
          animation: 'modalPop 0.2s ease-out'
        }}>
          <AlertCircle size={20} color="#fca5a5" />
          <span>{deniedMessage}</span>
        </div>
      )}

      {/* Top Header */}
      <header className="top-header">
        {/* Brand */}
        <div className="brand-section">
          <div className="brand-logo">
            {storeSettings?.logo_url ? (
              <img
                src={storeSettings.logo_url}
                alt="Shop Logo"
                className="brand-shop-logo-img"
              />
            ) : (
              <ShoppingCart size={22} />
            )}
          </div>
          <div>
            <div className="brand-title">Bharathi Homelings</div>
            <div className="brand-subtitle">
              {storeSettings?.store_name || 'Supermarket & Home Needs'}
            </div>
          </div>
        </div>

        {/* Module Switcher */}
        <nav className="module-switcher">
          <button
            id="nav-btn-billing"
            className={`module-btn ${activeModule === 'billing' ? 'active-billing' : ''}`}
            onClick={() => handleModuleSwitch('billing')}
          >
            <ShoppingCart size={17} />
            <span>BILLING</span>
          </button>

          <button
            id="nav-btn-stock"
            className={`module-btn ${activeModule === 'stock' ? 'active-stock' : ''}`}
            onClick={() => handleModuleSwitch('stock')}
          >
            <Boxes size={17} />
            <span>STOCK / INVENTORY</span>
          </button>

          <button
            id="nav-btn-reports"
            className={`module-btn ${activeModule === 'reports' ? 'active-tab' : ''}`}
            onClick={() => handleModuleSwitch('reports')}
          >
            <BarChart3 size={17} />
            <span>REPORTS</span>
          </button>

          {(isSuperAdmin || hasPermission('settings.view')) && (
            <button
              id="nav-btn-settings"
              className={`module-btn ${activeModule === 'settings' ? 'active-tab' : ''}`}
              onClick={() => handleModuleSwitch('settings')}
            >
              <Settings size={17} />
              <span>SETTINGS</span>
            </button>
          )}
        </nav>

        {/* Header Right: Theme Toggle, Clock, User, Role, Logout */}
        <div className="header-right">
          {/* Light / Dark Mode Toggle */}
          <button
            id="btn-toggle-theme"
            className="theme-toggle-btn"
            onClick={toggleTheme}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            {theme === 'dark' ? <Sun size={18} color="#f59e0b" /> : <Moon size={18} color="#6366f1" />}
          </button>

          <div className="live-clock">
            <Clock size={15} color="#10b981" />
            <span>
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>

          <div className="user-chip">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="DP" className="user-avatar-img" />
            ) : (
              <div className="user-avatar">
                {user?.fullName?.charAt(0) || user?.username?.charAt(0) || 'U'}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>
                {user?.fullName || user?.username}
              </span>
              <span className={`role-badge ${isSuperAdmin ? 'super' : 'admin'}`}>
                {isSuperAdmin ? 'Super Admin' : 'System Admin'}
              </span>
            </div>
          </div>

          <button
            id="header-btn-logout"
            className="btn-icon"
            onClick={logout}
            title="Sign out of Bharathi Homelings"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {children}
      </main>
    </div>
  );
};
