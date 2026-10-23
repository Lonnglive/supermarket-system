import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { POSProvider } from './context/POSContext';
import { LoginView } from './components/auth/LoginView';
import { AppShell } from './components/shell/AppShell';
import { BillingModule } from './components/billing/BillingModule';
import { StockModule } from './components/stock/StockModule';
import { ReportsModule } from './components/reports/ReportsModule';
import { SettingsModule } from './components/settings/SettingsModule';
import { SetupWizard } from './components/setup/SetupWizard';
import './styles/pos.css';

const MainApplication: React.FC = () => {
  const { user, loading, needsSetup, isSuperAdmin, hasPermission } = useAuth();
  const [activeModule, setActiveModule] = useState<'billing' | 'stock' | 'reports' | 'settings'>('billing');

  // ── Loading Spinner ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{
        height: '100vh',
        background: '#090d16',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#10b981',
        fontFamily: 'Outfit, sans-serif',
        fontSize: 20,
        fontWeight: 700,
        gap: 12
      }}>
        <div style={{
          width: 24,
          height: 24,
          border: '3px solid #1e293b',
          borderTopColor: '#10b981',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite'
        }} />
        <span>Loading AeroPOS...</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Not Logged In → Login Screen ─────────────────────────────────────────
  if (!user) {
    return <LoginView />;
  }

  // ── First-Time Setup or Default Password Still Set ────────────────────────
  // Only Super Admins go through setup; regular cashiers get sent straight to billing
  if (needsSetup && isSuperAdmin) {
    return <SetupWizard />;
  }

  // ── Main Application Shell ────────────────────────────────────────────────
  return (
    <AppShell activeModule={activeModule} setActiveModule={setActiveModule}>
      {activeModule === 'billing' && <BillingModule />}
      {activeModule === 'stock' && hasPermission('stock.view') && <StockModule />}
      {activeModule === 'reports' && hasPermission('reports.view') && <ReportsModule />}
      {activeModule === 'settings' && (isSuperAdmin || hasPermission('settings.view')) && <SettingsModule />}
    </AppShell>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <POSProvider>
        <MainApplication />
      </POSProvider>
    </AuthProvider>
  );
};

export default App;
