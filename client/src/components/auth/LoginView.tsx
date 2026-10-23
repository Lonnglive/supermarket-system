import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { ShoppingCart, Lock, User, Eye, EyeOff, AlertCircle, ShieldCheck, ArrowRight, Smartphone, KeyRound } from 'lucide-react';

export const LoginView: React.FC = () => {
  const { login, loginWithOtp } = useAuth();
  const [loginMode, setLoginMode] = useState<'PASSWORD' | 'OTP'>('PASSWORD');

  // Password Login State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // OTP Login State
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpSuccessMsg, setOtpSuccessMsg] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('bharathi_remembered_username') || localStorage.getItem('aeropos_remembered_username');
    if (saved) {
      setUsername(saved);
      setRememberMe(true);
    }
  }, []);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMessage('Please enter both username and password.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      await login({ usernameOrEmail: username.trim(), password });
      if (rememberMe) {
        localStorage.setItem('bharathi_remembered_username', username.trim());
      } else {
        localStorage.removeItem('bharathi_remembered_username');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async () => {
    if (!phone.trim()) {
      setErrorMessage('Please enter your registered mobile number.');
      return;
    }

    setOtpLoading(true);
    setErrorMessage(null);
    setOtpSuccessMsg(null);

    try {
      const res = await api.auth.sendOtp(phone.trim());
      setOtpSent(true);
      setDevOtp(res.devOtp || null);
      if (res.devOtp) setOtp(res.devOtp); // prefill for quick zero-friction local testing
      setOtpSuccessMsg(`OTP sent to ${phone.trim()}`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to send OTP.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim() || !otp.trim()) {
      setErrorMessage('Please enter both mobile number and 6-digit OTP.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      await loginWithOtp({ phone: phone.trim(), otp: otp.trim() });
    } catch (err: any) {
      setErrorMessage(err.message || 'OTP verification failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(circle at top right, #132238 0%, #080d16 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20
    }}>
      <div style={{
        maxWidth: 440,
        width: '100%',
        background: 'var(--bg-surface)',
        border: '1px solid #2d3748',
        borderRadius: 16,
        boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
        overflow: 'hidden'
      }}>
        {/* Top Banner */}
        <div style={{
          background: 'linear-gradient(135deg, #059669, #10b981)',
          padding: '30px 24px',
          textAlign: 'center',
          color: 'white'
        }}>
          <div style={{
            width: 54,
            height: 54,
            background: 'rgba(255, 255, 255, 0.2)',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px',
            backdropFilter: 'blur(4px)'
          }}>
            <ShoppingCart size={30} color="#ffffff" />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5 }}>Bharathi Homelings</h1>
          <p style={{ fontSize: 13, opacity: 0.9, marginTop: 4 }}>Supermarket & Home Needs System</p>
        </div>

        {/* Tab Switcher: Password vs OTP */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          borderBottom: '1px solid #1f2937',
          background: 'var(--bg-input)'
        }}>
          <button
            type="button"
            onClick={() => { setLoginMode('PASSWORD'); setErrorMessage(null); }}
            style={{
              padding: '12px',
              border: 'none',
              background: loginMode === 'PASSWORD' ? 'var(--bg-surface)' : 'transparent',
              color: loginMode === 'PASSWORD' ? '#10b981' : 'var(--text-muted)',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              borderBottom: loginMode === 'PASSWORD' ? '2px solid #10b981' : 'none'
            }}
          >
            <Lock size={15} />
            <span>Password</span>
          </button>

          <button
            type="button"
            onClick={() => { setLoginMode('OTP'); setErrorMessage(null); }}
            style={{
              padding: '12px',
              border: 'none',
              background: loginMode === 'OTP' ? 'var(--bg-surface)' : 'transparent',
              color: loginMode === 'OTP' ? '#10b981' : 'var(--text-muted)',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              borderBottom: loginMode === 'OTP' ? '2px solid #10b981' : 'none'
            }}
          >
            <Smartphone size={15} />
            <span>Mobile OTP</span>
          </button>
        </div>

        {/* Form Body */}
        <div style={{ padding: 28 }}>
          {errorMessage && (
            <div style={{
              background: '#450a0a',
              border: '1px solid #ef4444',
              color: '#fca5a5',
              padding: '12px 14px',
              borderRadius: 8,
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 16
            }}>
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{errorMessage}</span>
            </div>
          )}

          {otpSuccessMsg && (
            <div style={{
              background: '#064e3b',
              border: '1px solid #10b981',
              color: '#a7f3d0',
              padding: '10px 14px',
              borderRadius: 8,
              fontSize: 12,
              marginBottom: 16
            }}>
              ✓ {otpSuccessMsg}
            </div>
          )}

          {/* MODE 1: PASSWORD LOGIN */}
          {loginMode === 'PASSWORD' && (
            <form
              onSubmit={handlePasswordSubmit}
              autoComplete="off"
              style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            >
              {/* Username / Phone / Email */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Username, Phone, or Email
                </label>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'var(--bg-input)',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  padding: '10px 14px',
                  gap: 10
                }}>
                  <User size={18} color="#64748b" />
                  <input
                    id="login-input-username"
                    type="text"
                    name="login-fake-username"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="admin or cashier"
                    autoComplete="off"
                    spellCheck={false}
                    autoFocus
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      color: 'white',
                      fontSize: 15,
                      outline: 'none'
                    }}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Password
                </label>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'var(--bg-input)',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  padding: '10px 14px',
                  gap: 10
                }}>
                  <Lock size={18} color="#64748b" />
                  <input
                    id="login-input-password"
                    type={showPassword ? 'text' : 'password'}
                    name="login-fake-password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="new-password"
                    spellCheck={false}
                    style={{
                      flex: 1,
                      background: 'transparent',
                      border: 'none',
                      color: 'white',
                      fontSize: 15,
                      outline: 'none'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* Remember Me */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={e => setRememberMe(e.target.checked)}
                    style={{ accentColor: '#10b981', cursor: 'pointer' }}
                  />
                  Remember user
                </label>
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>RBAC Protected</span>
              </div>

              {/* Submit Button */}
              <button
                id="login-btn-submit"
                type="submit"
                disabled={loading}
                style={{
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: '#062417',
                  border: 'none',
                  padding: 13,
                  borderRadius: 8,
                  fontSize: 15,
                  fontWeight: 800,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  marginTop: 4,
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                }}
              >
                {loading ? 'Authenticating...' : 'Sign In with Password'}
                {!loading && <ArrowRight size={17} />}
              </button>
            </form>
          )}

          {/* MODE 2: MOBILE OTP LOGIN */}
          {loginMode === 'OTP' && (
            <form
              onSubmit={handleVerifyOtpSubmit}
              autoComplete="off"
              style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            >
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Registered Mobile Number
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    background: 'var(--bg-input)',
                    border: '1px solid #334155',
                    borderRadius: 8,
                    padding: '10px 14px',
                    gap: 10
                  }}>
                    <Smartphone size={18} color="#10b981" />
                    <input
                      id="login-input-phone"
                      type="text"
                      name="login-fake-phone"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="+1 555-0100 or registered number"
                      autoComplete="off"
                      spellCheck={false}
                      autoFocus
                      style={{
                        flex: 1,
                        background: 'transparent',
                        border: 'none',
                        color: 'white',
                        fontSize: 14,
                        outline: 'none'
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    disabled={otpLoading || !phone.trim()}
                    style={{
                      background: 'var(--bg-card)',
                      border: '1px solid #334155',
                      color: '#38bdf8',
                      fontWeight: 700,
                      fontSize: 13,
                      padding: '0 14px',
                      borderRadius: 8,
                      cursor: otpLoading || !phone.trim() ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {otpLoading ? 'Sending...' : otpSent ? 'Resend' : 'Get OTP'}
                  </button>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                  Default registered phones: admin (+1 555-0100), cashier (+1 555-0101)
                </span>
              </div>

              {otpSent && (
                <div>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    Enter 6-Digit OTP Code
                  </label>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: 'var(--bg-input)',
                    border: '2px solid #10b981',
                    borderRadius: 8,
                    padding: '10px 14px',
                    gap: 10
                  }}>
                    <KeyRound size={18} color="#10b981" />
                    <input
                      id="login-input-otp"
                      type="text"
                      name="login-fake-otp"
                      maxLength={6}
                      value={otp}
                      onChange={e => setOtp(e.target.value)}
                      placeholder="123456"
                      autoComplete="one-time-code"
                      spellCheck={false}
                      style={{
                        flex: 1,
                        background: 'transparent',
                        border: 'none',
                        color: 'white',
                        fontSize: 18,
                        fontFamily: 'JetBrains Mono',
                        fontWeight: 700,
                        letterSpacing: 4,
                        outline: 'none'
                      }}
                    />
                  </div>
                  {devOtp && (
                    <span style={{ fontSize: 12, color: '#34d399', marginTop: 6, display: 'block' }}>
                      ⚡ Demo OTP received: <strong>{devOtp}</strong>
                    </span>
                  )}
                </div>
              )}

              <button
                id="login-btn-otp-verify"
                type="submit"
                disabled={loading || !otpSent || !otp.trim()}
                style={{
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: '#062417',
                  border: 'none',
                  padding: 13,
                  borderRadius: 8,
                  fontSize: 15,
                  fontWeight: 800,
                  cursor: loading || !otpSent || !otp.trim() ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  marginTop: 4,
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
                }}
              >
                {loading ? 'Verifying OTP...' : 'Verify OTP & Sign In'}
                {!loading && <ArrowRight size={17} />}
              </button>
            </form>
          )}

          {/* Store Branch & Terminal Info */}
          <div style={{
            marginTop: 20,
            paddingTop: 16,
            borderTop: '1px solid #1f2937',
            display: 'flex',
            flexDirection: 'column',
            gap: 8
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'var(--text-secondary)' }}>
              <span>Store:</span>
              <span style={{ color: '#10b981', fontWeight: 700 }}>Bharathi Homelings</span>
            </div>
            <div style={{
              background: '#0d131f',
              border: '1px solid #1e293b',
              borderRadius: 6,
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 11,
              color: 'var(--text-muted)'
            }}>
              <ShieldCheck size={14} color="#10b981" />
              <span>Secure RBAC system with multi-factor OTP & password authentication.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
