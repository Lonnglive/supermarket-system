import React, { useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, AtSign, Eye, EyeOff, KeyRound, Lock, ShieldCheck, ShoppingCart, Smartphone, User, UserPlus } from 'lucide-react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

type Mode = 'PASSWORD' | 'OTP' | 'REGISTER';
type Channel = 'EMAIL' | 'PHONE';
type Persona = 'SYSTEM_ADMIN' | 'STORE_MANAGER' | 'SUPER_ADMIN';

const fieldStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 8, color: 'white', fontSize: 14, outline: 'none', padding: '11px 13px' };
const buttonStyle: React.CSSProperties = { border: 'none', borderRadius: 8, padding: 13, fontWeight: 800, fontSize: 14, cursor: 'pointer' };

const ContactMethod: React.FC<{
  channel: Channel;
  identifier: string;
  onChannelChange: (channel: Channel) => void;
  onIdentifierChange: (identifier: string) => void;
}> = ({ channel, identifier, onChannelChange, onIdentifierChange }) => {
  const contactLabel = channel === 'EMAIL' ? 'Gmail or email address' : 'Mobile number';
  const contactPlaceholder = channel === 'EMAIL' ? 'you@gmail.com' : '+917863475690';
  return <>
    <div style={{ display: 'flex', gap: 8 }}>
      {(['EMAIL', 'PHONE'] as Channel[]).map(value => <button key={value} type="button" onClick={() => onChannelChange(value)} style={{ ...buttonStyle, flex: 1, padding: 9, background: channel === value ? '#065f46' : 'var(--bg-input)', border: `1px solid ${channel === value ? '#10b981' : '#334155'}`, color: channel === value ? '#a7f3d0' : 'var(--text-muted)' }}>
        {value === 'EMAIL' ? <AtSign size={15} style={{ verticalAlign: 'middle', marginRight: 5 }} /> : <Smartphone size={15} style={{ verticalAlign: 'middle', marginRight: 5 }} />}{value === 'EMAIL' ? 'Gmail / Email' : 'Mobile'}
      </button>)}
    </div>
    <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{contactLabel}</label>
    <input type={channel === 'EMAIL' ? 'email' : 'tel'} value={identifier} onChange={e => onIdentifierChange(e.target.value)} placeholder={contactPlaceholder} autoComplete={channel === 'EMAIL' ? 'email' : 'tel'} style={fieldStyle} />
  </>;
};

export const LoginView: React.FC = () => {
  const { login, loginWithOtp, register } = useAuth();
  const [mode, setMode] = useState<Mode>('PASSWORD');
  const [channel, setChannel] = useState<Channel>('EMAIL');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [fullName, setFullName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [persona, setPersona] = useState<Persona>('SYSTEM_ADMIN');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('bharathi_remembered_username');
    if (saved) { setUsername(saved); setRememberMe(true); }
  }, []);

  const changeMode = (next: Mode) => { setMode(next); setError(null); setMessage(null); setOtp(''); setOtpSent(false); };
  const contactLabel = channel === 'EMAIL' ? 'Gmail or email address' : 'Mobile number';
  const contactPlaceholder = channel === 'EMAIL' ? 'you@gmail.com' : '+91 98765 43210';

  const requestOtp = async (forRegistration = false) => {
    if (!identifier.trim()) { setError(`Enter your ${contactLabel.toLowerCase()}.`); return; }
    setLoading(true); setError(null); setMessage(null);
    try {
      const result = forRegistration
        ? await api.auth.requestRegistrationOtp(identifier.trim(), channel)
        : await api.auth.sendOtp(identifier.trim(), channel);
      setOtpSent(true); setMessage(result.message);
    } catch (err: any) { setError(err.message || 'Could not send the verification code.'); }
    finally { setLoading(false); }
  };

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      await login({ usernameOrEmail: username.trim(), password });
      if (rememberMe) localStorage.setItem('bharathi_remembered_username', username.trim());
      else localStorage.removeItem('bharathi_remembered_username');
    } catch (err: any) { setError(err.message || 'Unable to sign in.'); }
    finally { setLoading(false); }
  };

  const submitOtpLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try { await loginWithOtp({ identifier: identifier.trim(), channel, otp: otp.trim() }); }
    catch (err: any) { setError(err.message || 'The verification code could not be confirmed.'); }
    finally { setLoading(false); }
  };

  const submitRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const result = await register({ fullName, username: newUsername, password: newPassword, identifier: identifier.trim(), channel, otp: otp.trim(), persona });
      setMessage(result);
      setOtpSent(false);
      setOtp('');
    }
    catch (err: any) { setError(err.message || 'Account creation failed.'); }
    finally { setLoading(false); }
  };

  const contactMethodProps = { channel, identifier, onIdentifierChange: setIdentifier, onChannelChange: (nextChannel: Channel) => { setChannel(nextChannel); setOtpSent(false); setOtp(''); } };

  return <div style={{ minHeight: '100vh', background: 'radial-gradient(circle at top right, #132238 0%, #080d16 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
    <div style={{ maxWidth: 455, width: '100%', background: 'var(--bg-surface)', border: '1px solid #2d3748', borderRadius: 16, boxShadow: '0 20px 50px rgba(0,0,0,.8)', overflow: 'hidden' }}>
      <div style={{ background: 'linear-gradient(135deg, #059669, #10b981)', padding: '28px 24px', textAlign: 'center', color: 'white' }}>
        <ShoppingCart size={30} style={{ marginBottom: 8 }} /><h1 style={{ fontSize: 24, margin: 0 }}>Bharathi Homelings</h1><p style={{ fontSize: 13, opacity: .9, margin: '5px 0 0' }}>Supermarket & Home Needs System</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', background: 'var(--bg-input)', borderBottom: '1px solid #1f2937' }}>
        {[['PASSWORD', 'Password'], ['OTP', 'OTP sign in'], ['REGISTER', 'Create account']].map(([value, label]) => <button key={value} type="button" onClick={() => changeMode(value as Mode)} style={{ border: 'none', background: mode === value ? 'var(--bg-surface)' : 'transparent', borderBottom: mode === value ? '2px solid #10b981' : '2px solid transparent', padding: '12px 5px', color: mode === value ? '#34d399' : 'var(--text-muted)', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>{label}</button>)}
      </div>
      <div style={{ padding: 28 }}>
        {error && <div style={{ background: '#450a0a', border: '1px solid #ef4444', color: '#fecaca', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13, display: 'flex', gap: 8 }}><AlertCircle size={17} />{error}</div>}
        {message && <div style={{ background: '#064e3b', border: '1px solid #10b981', color: '#a7f3d0', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{message}</div>}
        {mode === 'PASSWORD' && <form onSubmit={submitPassword} style={{ display: 'grid', gap: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Username, mobile, or email</label><input value={username} onChange={e => setUsername(e.target.value)} placeholder="Your username or email" autoFocus style={fieldStyle} />
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Password</label><div style={{ position: 'relative' }}><input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" style={{ ...fieldStyle, paddingRight: 45 }} /><button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 9, top: 10, color: '#94a3b8', background: 'none', border: 'none' }}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
          <label style={{ color: 'var(--text-secondary)', fontSize: 13 }}><input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} /> Remember username</label>
          <button disabled={loading} style={{ ...buttonStyle, background: 'linear-gradient(135deg,#10b981,#059669)', color: '#062417' }}>{loading ? 'Signing in…' : <>Sign in <ArrowRight size={16} style={{ verticalAlign: 'middle' }} /></>}</button>
        </form>}
        {mode === 'OTP' && <form onSubmit={submitOtpLogin} style={{ display: 'grid', gap: 12 }}><ContactMethod {...contactMethodProps} />
          <button type="button" disabled={loading} onClick={() => requestOtp(false)} style={{ ...buttonStyle, background: 'var(--bg-card)', border: '1px solid #10b981', color: '#6ee7b7' }}>{loading ? 'Sending…' : otpSent ? 'Resend verification code' : 'Send verification code'}</button>
          {otpSent && <><label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>6-digit verification code</label><input value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" maxLength={6} autoComplete="one-time-code" placeholder="123456" style={{ ...fieldStyle, letterSpacing: 5, fontWeight: 700 }} /><button disabled={loading || otp.length !== 6} style={{ ...buttonStyle, background: 'linear-gradient(135deg,#10b981,#059669)', color: '#062417' }}>{loading ? 'Verifying…' : 'Verify & sign in'}</button></>}
        </form>}
        {mode === 'REGISTER' && <form onSubmit={submitRegistration} style={{ display: 'grid', gap: 12 }}>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: 13 }}>Choose the access level you need. Every new account requires administrator approval before it can sign in.</p>
          <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Full name" autoComplete="name" style={fieldStyle} />
          <input value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="Username (3+ characters)" autoComplete="username" style={fieldStyle} />
          <div style={{ position: 'relative' }}><input type={showPassword ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Password (10+ characters)" autoComplete="new-password" style={{ ...fieldStyle, paddingRight: 45 }} /><button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 9, top: 10, color: '#94a3b8', background: 'none', border: 'none' }}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
          <div style={{ display: 'grid', gap: 7 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Requested persona</label>
            {([
              ['SYSTEM_ADMIN', 'System Admin', 'POS billing, customers, and day-to-day operations'],
              ['STORE_MANAGER', 'Store Manager', 'Inventory, products, and reports'],
              ['SUPER_ADMIN', 'Super Admin', 'Requests full access; approval is always required']
            ] as [Persona, string, string][]).map(([value, title, description]) => <label key={value} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', padding: 10, cursor: 'pointer', background: persona === value ? '#064e3b' : 'var(--bg-input)', border: `1px solid ${persona === value ? '#10b981' : '#334155'}`, borderRadius: 8 }}>
              <input type="radio" name="persona" checked={persona === value} onChange={() => setPersona(value)} style={{ marginTop: 3, accentColor: '#10b981' }} />
              <span><strong style={{ color: persona === value ? '#a7f3d0' : 'white', fontSize: 13 }}>{title}</strong><small style={{ display: 'block', color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>{description}</small></span>
            </label>)}
          </div>
          <ContactMethod {...contactMethodProps} />
          <button type="button" disabled={loading} onClick={() => requestOtp(true)} style={{ ...buttonStyle, background: 'var(--bg-card)', border: '1px solid #10b981', color: '#6ee7b7' }}>{loading ? 'Sending…' : otpSent ? 'Resend verification code' : 'Verify contact'}</button>
          {otpSent && <><input value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" maxLength={6} autoComplete="one-time-code" placeholder="6-digit verification code" style={{ ...fieldStyle, letterSpacing: 4 }} /><button disabled={loading || otp.length !== 6} style={{ ...buttonStyle, background: 'linear-gradient(135deg,#10b981,#059669)', color: '#062417' }}>{loading ? 'Creating account…' : <><UserPlus size={16} style={{ verticalAlign: 'middle' }} /> Create verified account</>}</button></>}
        </form>}
        <div style={{ marginTop: 20, paddingTop: 15, borderTop: '1px solid #1f2937', color: 'var(--text-muted)', fontSize: 11, display: 'flex', gap: 8 }}><ShieldCheck size={15} color="#10b981" /> Codes are single-use, expire quickly, and are never displayed in this app.</div>
      </div>
    </div>
  </div>;
};
