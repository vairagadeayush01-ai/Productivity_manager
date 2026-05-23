import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Brain, LogIn, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login, register, isAuthenticated, loading: authLoading } = useAuth();
  const [mode, setMode]       = useState('login');
  const [email, setEmail]     = useState('');
  const [password, setPass]   = useState('');
  const [error, setError]     = useState('');
  const [submitting, setSub]  = useState(false);

  if (!authLoading && isAuthenticated) return <Navigate to="/" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSub(true);
    try {
      if (mode === 'login') {
        await login(email.trim(), password);
      } else {
        if (password.length < 8) {
          setError('Password must be at least 8 characters.');
          setSub(false);
          return;
        }
        await register(email.trim(), password);
      }
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(
        typeof detail === 'string' ? detail
        : Array.isArray(detail) ? detail[0]?.msg
        : err.message || 'Request failed'
      );
    } finally { setSub(false); }
  };

  return (
    <div className="auth-page">
      <div className="auth-card animate-fade-in">

        {/* Brand */}
        <div className="auth-card__brand">
          <div style={{
            width: 40, height: 40, borderRadius: 'var(--radius-md)',
            background: 'var(--primary-light)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Brain color="var(--primary)" size={22} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text-main)', letterSpacing: '-0.01em' }}>
              Productivity Manager
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {mode === 'login' ? 'Sign in to your account' : 'Create your account'}
            </div>
          </div>
        </div>

        {error && <div className="auth-error" role="alert">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label className="form-label" htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              type="email"
              required
              className="glass-input"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              required
              minLength={mode === 'register' ? 8 : 1}
              className="glass-input"
              placeholder={mode === 'register' ? 'Min 8 characters' : '••••••••'}
              value={password}
              onChange={e => setPass(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            style={{ width: '100%', justifyContent: 'center', marginTop: '4px' }}
            disabled={submitting}
          >
            {mode === 'login' ? <LogIn size={15} /> : <UserPlus size={15} />}
            {submitting ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <div style={{ marginTop: '1.25rem', textAlign: 'center', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          {mode === 'login' ? (
            <>No account?{' '}<button type="button" className="link-btn" onClick={() => setMode('register')}>Register</button></>
          ) : (
            <>Have an account?{' '}<button type="button" className="link-btn" onClick={() => setMode('login')}>Sign in</button></>
          )}
        </div>
      </div>
    </div>
  );
}
