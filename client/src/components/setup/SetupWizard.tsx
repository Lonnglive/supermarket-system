import React, { useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  CheckCircle2, ChevronRight, Store, Users, Key, Sparkles, Eye, EyeOff, ArrowRight, ShieldCheck
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface WizardStep {
  id: number;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}

const STEPS: WizardStep[] = [
  { id: 1, title: 'Welcome', subtitle: 'Before you begin', icon: <Sparkles size={20} /> },
  { id: 2, title: 'Secure Account', subtitle: 'Change default password', icon: <Key size={20} /> },
  { id: 3, title: 'Store Profile', subtitle: 'Your store details', icon: <Store size={20} /> },
  { id: 4, title: 'Add Staff', subtitle: 'Create first cashier', icon: <Users size={20} /> },
  { id: 5, title: 'All Done!', subtitle: 'Setup complete', icon: <CheckCircle2 size={20} /> },
];

// ─── Shared input style ───────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#0f172a',
  border: '1px solid #334155',
  borderRadius: 8,
  color: 'white',
  padding: '11px 14px',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  marginBottom: 6,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
};

const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2 };

// ─── Password Input ───────────────────────────────────────────────────────────
const PasswordInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  id?: string;
}> = ({ value, onChange, placeholder = '', id }) => {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...inputStyle, paddingRight: 42 }}
        autoComplete="new-password"
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        style={{
          position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
          background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
          display: 'flex', alignItems: 'center'
        }}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
};

// ─── Step Progress Bar ────────────────────────────────────────────────────────
const StepProgress: React.FC<{ step: number }> = ({ step }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 36 }}>
    {STEPS.map((s, i) => {
      const isCompleted = step > s.id;
      const isActive = step === s.id;
      return (
        <React.Fragment key={s.id}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: isCompleted ? '#10b981' : isActive ? 'linear-gradient(135deg, #3b82f6, #6366f1)' : 'var(--bg-card)',
              border: isCompleted ? '2px solid #10b981' : isActive ? '2px solid #6366f1' : '2px solid #334155',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: isCompleted || isActive ? 'white' : '#475569',
              fontSize: 13, fontWeight: 700,
              transition: 'all 0.3s',
              boxShadow: isActive ? '0 0 16px rgba(99,102,241,0.4)' : 'none'
            }}>
              {isCompleted ? <CheckCircle2 size={16} /> : s.id}
            </div>
            <div style={{ fontSize: 10, color: isActive ? '#818cf8' : isCompleted ? '#34d399' : '#475569', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {s.title}
            </div>
          </div>
          {i < STEPS.length - 1 && (
            <div style={{
              flex: 1, height: 2,
              background: step > s.id ? '#10b981' : 'var(--bg-card)',
              marginBottom: 22, transition: 'background 0.3s'
            }} />
          )}
        </React.Fragment>
      );
    })}
  </div>
);

// ─── Main Wizard ──────────────────────────────────────────────────────────────
export const SetupWizard: React.FC = () => {
  const { user, refreshSetupStatus } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Step 2: Password Change
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');

  // Step 3: Store Profile
  const [storeName, setStoreName] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [storePhone, setStorePhone] = useState('');
  const [storeEmail, setStoreEmail] = useState('');
  const [currency, setCurrency] = useState('₹');

  // Step 4: First Cashier
  const [cashierName, setCashierName] = useState('');
  const [cashierUsername, setCashierUsername] = useState('');
  const [cashierEmail, setCashierEmail] = useState('');
  const [cashierPass, setCashierPass] = useState('');
  const [cashierPhone, setCashierPhone] = useState('');
  const [cashierRole, setCashierRole] = useState('SYSTEM_ADMIN');
  const [skipCashier, setSkipCashier] = useState(false);

  const clearMessages = () => { setError(''); setSuccess(''); };

  // ── Step 2: Change Password ────────────────────────────────────────────────
  const handleChangePassword = async () => {
    clearMessages();
    if (!currentPass) { setError('Please enter your current password.'); return; }
    if (newPass.length < 6) { setError('New password must be at least 6 characters.'); return; }
    if (newPass !== confirmPass) { setError('New passwords do not match.'); return; }
    if (currentPass === newPass) { setError('New password must be different from the current password.'); return; }

    setLoading(true);
    try {
      await api.settings.changePassword(user!.id, currentPass, newPass);
      setSuccess('Password changed successfully!');
      setTimeout(() => { clearMessages(); setStep(3); }, 900);
    } catch (e: any) {
      setError(e.message || 'Failed to change password.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3: Store Profile ──────────────────────────────────────────────────
  const handleSaveStore = async () => {
    clearMessages();
    if (!storeName.trim()) { setError('Store name is required.'); return; }
    setLoading(true);
    try {
      await api.settings.updateStore({
        store_name: storeName.trim(),
        address: storeAddress.trim(),
        phone: storePhone.trim(),
        email: storeEmail.trim(),
        currency_symbol: currency.trim() || '₹',
      });
      setSuccess('Store profile saved!');
      setTimeout(() => { clearMessages(); setStep(4); }, 900);
    } catch (e: any) {
      setError(e.message || 'Failed to save store profile.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 4: Create Cashier ─────────────────────────────────────────────────
  const handleCreateCashier = async () => {
    if (skipCashier) { setStep(5); return; }
    clearMessages();
    if (!cashierName.trim() || !cashierUsername.trim() || !cashierEmail.trim()) {
      setError('Full name, username, and email are required.');
      return;
    }
    if (cashierPass.length < 6) { setError('Cashier password must be at least 6 characters.'); return; }

    setLoading(true);
    try {
      await api.settings.createUser({
        fullName: cashierName.trim(),
        username: cashierUsername.trim().toLowerCase(),
        email: cashierEmail.trim().toLowerCase(),
        password: cashierPass,
        phone: cashierPhone.trim(),
        roleId: cashierRole,
      });
      setSuccess('Staff account created!');
      setTimeout(() => { clearMessages(); setStep(5); }, 900);
    } catch (e: any) {
      setError(e.message || 'Failed to create cashier account.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 5: Complete Setup ─────────────────────────────────────────────────
  const handleComplete = async () => {
    setLoading(true);
    try {
      await api.setup.markComplete();
      await refreshSetupStatus(); // Tells App to leave wizard and load main app
    } catch (e: any) {
      setError(e.message || 'Could not complete setup.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Layout ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #020817 0%, #0a1628 40%, #020817 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      fontFamily: "'Outfit', sans-serif",
    }}>
      {/* Background decoration */}
      <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: '-20%', left: '-10%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 70%)' }} />
        <div style={{ position: 'absolute', bottom: '-20%', right: '-10%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(16,185,129,0.05) 0%, transparent 70%)' }} />
      </div>

      <div style={{
        background: 'rgba(15, 23, 42, 0.95)',
        border: '1px solid rgba(51, 65, 85, 0.6)',
        borderRadius: 20,
        padding: '40px 48px',
        width: '100%',
        maxWidth: 620,
        boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
        backdropFilter: 'blur(20px)',
        position: 'relative',
      }}>
        {/* Logo / Brand */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px',
            boxShadow: '0 8px 24px rgba(99,102,241,0.35)'
          }}>
            <ShieldCheck size={28} color="white" />
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 4 }}>
            AeroPOS Supermarket System
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'white' }}>
            First-Time Setup
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            Complete these steps to configure your store and secure your account
          </div>
        </div>

        {/* Step Progress */}
        <StepProgress step={step} />

        {/* Error / Success Banner */}
        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 8, padding: '10px 14px', marginBottom: 20,
            color: '#fca5a5', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8
          }}>
            ⚠ {error}
          </div>
        )}
        {success && (
          <div style={{
            background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
            borderRadius: 8, padding: '10px 14px', marginBottom: 20,
            color: '#34d399', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8
          }}>
            ✓ {success}
          </div>
        )}

        {/* ── STEP 1: Welcome ───────────────────────────────────────────────── */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{
              background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)',
              borderRadius: 12, padding: 20
            }}>
              <div style={{ fontWeight: 700, color: '#34d399', fontSize: 15, marginBottom: 8 }}>
                👋 Welcome, {user?.fullName || 'Administrator'}!
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.7 }}>
                This is your first time launching <strong style={{ color: 'white' }}>AeroPOS</strong>.
                The following quick setup wizard will help you:
              </div>
            </div>

            {[
              { icon: '🔑', title: 'Secure your admin account', desc: 'Change the default password to something only you know' },
              { icon: '🏪', title: 'Configure your store profile', desc: 'Set your store name, address, currency, and receipt details' },
              { icon: '👤', title: 'Create your first staff user', desc: 'Add a cashier or manager who will operate the system daily' },
            ].map(item => (
              <div key={item.title} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, flexShrink: 0
                }}>
                  {item.icon}
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: 'white', fontSize: 14 }}>{item.title}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>{item.desc}</div>
                </div>
              </div>
            ))}

            <div style={{
              background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
              borderRadius: 8, padding: '10px 14px', color: '#fbbf24', fontSize: 12
            }}>
              ⚠ You are currently logged in with the <strong>default factory credentials</strong>.
              Do not use these in production until you complete this wizard.
            </div>

            <button
              id="setup-btn-start"
              onClick={() => setStep(2)}
              style={{
                background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                color: 'white', border: 'none',
                padding: '14px 24px', borderRadius: 10,
                fontWeight: 800, fontSize: 15, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: '0 4px 20px rgba(99,102,241,0.35)',
                transition: 'transform 0.15s, box-shadow 0.15s',
              }}
            >
              Begin Setup <ArrowRight size={18} />
            </button>
          </div>
        )}

        {/* ── STEP 2: Change Password ───────────────────────────────────────── */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <div style={{ fontWeight: 800, color: 'white', fontSize: 18 }}>Change Your Password</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
                The default password is <code style={{ background: 'var(--bg-card)', padding: '1px 6px', borderRadius: 4, color: '#f87171' }}>Admin@123</code>.
                Create a strong, private password now.
              </div>
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="setup-current-pass">Current Password</label>
              <PasswordInput id="setup-current-pass" value={currentPass} onChange={setCurrentPass} placeholder="Admin@123 (the default)" />
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="setup-new-pass">New Password</label>
              <PasswordInput id="setup-new-pass" value={newPass} onChange={setNewPass} placeholder="Minimum 6 characters" />
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle} htmlFor="setup-confirm-pass">Confirm New Password</label>
              <PasswordInput id="setup-confirm-pass" value={confirmPass} onChange={setConfirmPass} placeholder="Re-enter new password" />
            </div>

            {newPass.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { ok: newPass.length >= 8, label: '8+ chars' },
                  { ok: /[A-Z]/.test(newPass), label: 'Uppercase' },
                  { ok: /[0-9]/.test(newPass), label: 'Number' },
                  { ok: /[^a-zA-Z0-9]/.test(newPass), label: 'Symbol' },
                ].map(({ ok, label }) => (
                  <span key={label} style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 4,
                    background: ok ? 'rgba(16,185,129,0.15)' : 'rgba(51,65,85,0.5)',
                    color: ok ? '#34d399' : '#475569', fontWeight: 600
                  }}>{ok ? '✓' : '○'} {label}</span>
                ))}
              </div>
            )}

            <button
              id="setup-btn-change-password"
              onClick={handleChangePassword}
              disabled={loading}
              style={{
                background: loading ? 'var(--bg-card)' : 'linear-gradient(135deg, #3b82f6, #6366f1)',
                color: 'white', border: 'none',
                padding: '13px 24px', borderRadius: 10,
                fontWeight: 800, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                marginTop: 4,
              }}
            >
              {loading ? 'Changing Password...' : <>Set New Password <ChevronRight size={18} /></>}
            </button>
          </div>
        )}

        {/* ── STEP 3: Store Profile ─────────────────────────────────────────── */}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ fontWeight: 800, color: 'white', fontSize: 18 }}>Configure Your Store</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
                This information appears on every printed receipt and in reports.
              </div>
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Store / Business Name *</label>
              <input
                style={inputStyle}
                value={storeName}
                onChange={e => setStoreName(e.target.value)}
                placeholder="e.g. FreshMart Supermarket"
                id="setup-store-name"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={fieldStyle}>
                <label style={labelStyle}>Phone Number</label>
                <input style={inputStyle} value={storePhone} onChange={e => setStorePhone(e.target.value)} placeholder="+91 98765 43210" />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Email</label>
                <input style={inputStyle} type="email" value={storeEmail} onChange={e => setStoreEmail(e.target.value)} placeholder="store@example.com" />
              </div>
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Store Address</label>
              <textarea
                style={{ ...inputStyle, resize: 'vertical', minHeight: 64 }}
                value={storeAddress}
                onChange={e => setStoreAddress(e.target.value)}
                placeholder="123 Main Street, City, State — 600001"
              />
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>Currency Symbol</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['₹', '$', '€', '£', '¥', '₦'].map(sym => (
                  <button
                    key={sym}
                    type="button"
                    onClick={() => setCurrency(sym)}
                    style={{
                      padding: '8px 16px', borderRadius: 8, fontWeight: 700, fontSize: 16,
                      border: currency === sym ? '2px solid #6366f1' : '1px solid #334155',
                      background: currency === sym ? 'rgba(99,102,241,0.2)' : 'var(--bg-card)',
                      color: currency === sym ? '#818cf8' : 'var(--text-secondary)',
                      cursor: 'pointer', transition: 'all 0.15s'
                    }}
                  >
                    {sym}
                  </button>
                ))}
                <input
                  style={{ ...inputStyle, width: 80, padding: '8px 12px' }}
                  value={['₹', '$', '€', '£', '¥', '₦'].includes(currency) ? '' : currency}
                  onChange={e => setCurrency(e.target.value || '₹')}
                  placeholder="Other"
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setStep(2)}
                style={{
                  background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid #334155',
                  padding: '12px 20px', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer'
                }}
              >← Back</button>
              <button
                id="setup-btn-save-store"
                onClick={handleSaveStore}
                disabled={loading}
                style={{
                  flex: 1,
                  background: loading ? 'var(--bg-card)' : 'linear-gradient(135deg, #3b82f6, #6366f1)',
                  color: 'white', border: 'none',
                  padding: '13px 24px', borderRadius: 10,
                  fontWeight: 800, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                }}
              >
                {loading ? 'Saving...' : <>Save Store Profile <ChevronRight size={18} /></>}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 4: Create Cashier ────────────────────────────────────────── */}
        {step === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ fontWeight: 800, color: 'white', fontSize: 18 }}>Add Your First Staff Member</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
                Create an account for your cashier or store manager. You can always add more users later in Settings.
              </div>
            </div>

            {/* Skip option */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 14px', borderRadius: 8, border: `1px solid ${skipCashier ? '#6366f1' : 'var(--bg-card)'}`, background: skipCashier ? 'rgba(99,102,241,0.07)' : 'transparent', transition: 'all 0.15s' }}>
              <input
                type="checkbox"
                checked={skipCashier}
                onChange={e => setSkipCashier(e.target.checked)}
                style={{ accentColor: '#6366f1', width: 16, height: 16 }}
              />
              <div>
                <div style={{ fontWeight: 700, color: skipCashier ? '#818cf8' : 'var(--text-secondary)', fontSize: 13 }}>Skip this step</div>
                <div style={{ fontSize: 11, color: '#475569' }}>I'll add staff users later from the Settings module</div>
              </div>
            </label>

            {!skipCashier && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Full Name *</label>
                    <input style={inputStyle} value={cashierName} onChange={e => setCashierName(e.target.value)} placeholder="e.g. Priya Sharma" id="setup-cashier-name" />
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Username *</label>
                    <input style={inputStyle} value={cashierUsername} onChange={e => setCashierUsername(e.target.value)} placeholder="e.g. cashier1" id="setup-cashier-username" />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Email Address *</label>
                    <input style={inputStyle} type="email" value={cashierEmail} onChange={e => setCashierEmail(e.target.value)} placeholder="cashier@store.com" />
                  </div>
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Phone</label>
                    <input style={inputStyle} value={cashierPhone} onChange={e => setCashierPhone(e.target.value)} placeholder="+91 9876543210" />
                  </div>
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>Password *</label>
                  <PasswordInput value={cashierPass} onChange={setCashierPass} placeholder="Min. 6 characters" id="setup-cashier-pass" />
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>Role</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[
                      { id: 'SYSTEM_ADMIN', label: 'System Admin', desc: 'Billing & Stock access' },
                      { id: 'SUPER_ADMIN', label: 'Super Admin', desc: 'Full unrestricted access' },
                    ].map(role => (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => setCashierRole(role.id)}
                        style={{
                          flex: 1, padding: '10px 12px', borderRadius: 8, textAlign: 'left', cursor: 'pointer',
                          border: cashierRole === role.id ? '2px solid #6366f1' : '1px solid #334155',
                          background: cashierRole === role.id ? 'rgba(99,102,241,0.12)' : 'var(--bg-card)',
                          transition: 'all 0.15s'
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 13, color: cashierRole === role.id ? '#818cf8' : 'white' }}>{role.label}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{role.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setStep(3)}
                style={{
                  background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid #334155',
                  padding: '12px 20px', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer'
                }}
              >← Back</button>
              <button
                id="setup-btn-create-cashier"
                onClick={handleCreateCashier}
                disabled={loading}
                style={{
                  flex: 1,
                  background: loading ? 'var(--bg-card)' : 'linear-gradient(135deg, #3b82f6, #6366f1)',
                  color: 'white', border: 'none',
                  padding: '13px 24px', borderRadius: 10,
                  fontWeight: 800, fontSize: 14, cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                }}
              >
                {loading ? 'Creating Account...' : (skipCashier ? <>Skip & Continue <ChevronRight size={18} /></> : <>Create Account <ChevronRight size={18} /></>)}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 5: Complete ─────────────────────────────────────────────── */}
        {step === 5 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 24 }}>
            {/* Animated success check */}
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(16,185,129,0.05))',
              border: '2px solid rgba(16,185,129,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 40px rgba(16,185,129,0.25)'
            }}>
              <CheckCircle2 size={40} color="#10b981" />
            </div>

            <div>
              <div style={{ fontWeight: 800, color: 'white', fontSize: 24, marginBottom: 8 }}>
                🎉 Setup Complete!
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.7, maxWidth: 380 }}>
                Your AeroPOS system is now fully configured and secured.
                You're ready to start processing sales and managing your inventory.
              </div>
            </div>

            <div style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid #1e293b', borderRadius: 12, padding: 20, textAlign: 'left' }}>
              <div style={{ fontWeight: 700, color: '#34d399', marginBottom: 14, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                ✓ What was set up
              </div>
              {[
                '✅ Admin password secured',
                `✅ Store profile saved${storeName ? ` — "${storeName}"` : ''}`,
                skipCashier ? '⏭ Staff user creation skipped' : `✅ Staff account created${cashierName ? ` — "${cashierName}"` : ''}`,
              ].map(item => (
                <div key={item} style={{ color: 'var(--text-soft)', fontSize: 13, padding: '5px 0', borderBottom: '1px solid #0f172a' }}>
                  {item}
                </div>
              ))}
            </div>

            <div style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 10, padding: 16, fontSize: 13, color: 'var(--text-secondary)', textAlign: 'left', width: '100%' }}>
              <strong style={{ color: '#818cf8' }}>💡 Quick Tips:</strong>
              <ul style={{ marginTop: 8, paddingLeft: 18, lineHeight: 1.9 }}>
                <li>Use the <strong style={{ color: 'white' }}>Billing</strong> module for POS — press <kbd style={{ background: 'var(--bg-card)', padding: '1px 5px', borderRadius: 3, border: '1px solid #334155' }}>F2</kbd> to focus the barcode scanner</li>
                <li>The <strong style={{ color: 'white' }}>Stock</strong> module handles products, purchases, and adjustments</li>
                <li>Configure SMTP in <strong style={{ color: 'white' }}>Settings → Email</strong> for automated daily sales reports</li>
              </ul>
            </div>

            <button
              id="setup-btn-launch"
              onClick={handleComplete}
              disabled={loading}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: '#062417', border: 'none',
                padding: '16px 24px', borderRadius: 12,
                fontWeight: 900, fontSize: 16, cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                boxShadow: '0 4px 24px rgba(16,185,129,0.35)',
                letterSpacing: '0.02em',
              }}
            >
              {loading ? 'Launching...' : <><Sparkles size={20} /> Launch AeroPOS</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SetupWizard;
