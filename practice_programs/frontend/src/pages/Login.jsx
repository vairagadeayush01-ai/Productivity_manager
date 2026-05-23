import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Brain, LogIn, UserPlus, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login, register, isAuthenticated, loading: authLoading } = useAuth();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!authLoading && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email.trim(), password);
      } else {
        if (password.length < 8) {
          setError('Password must be at least 8 characters.');
          setSubmitting(false);
          return;
        }
        await register(email.trim(), password);
      }
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(
        typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
            ? detail[0]?.msg
            : err.message || 'Request failed'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page page">
      <div className="auth-card glass-card">
        <div className="auth-card__brand">
          <Brain color="var(--primary-glow)" size={36} />
          <div>
            <h1 className="page-title" style={{ fontSize: '1.35rem' }}>
              Productivity Manager
            </h1>
            <p className="page-subtitle" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Sparkles size={14} />
              {mode === 'login' ? 'Your AI learning diary' : 'Start your learning journey'}
            </p>
          </div>
        </div>

        {error && <div className="auth-error" role="alert">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label className="form-label" htmlFor="email">Email</label>
            <input id="email" type="email" required className="glass-input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              minLength={mode === 'register' ? 8 : 1}
              className="glass-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={submitting}>
            {mode === 'login' ? <LogIn size={18} /> : <UserPlus size={18} />}
            {submitting ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          {mode === 'login' ? (
            <>
              No account?{' '}
              <button type="button" className="link-btn" onClick={() => setMode('register')}>
                Register
              </button>
            </>
          ) : (
            <>
              Have an account?{' '}
              <button type="button" className="link-btn" onClick={() => setMode('login')}>
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
