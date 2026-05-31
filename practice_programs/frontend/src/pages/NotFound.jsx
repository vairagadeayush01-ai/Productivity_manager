import React from 'react';
import { Link } from 'react-router-dom';
import { Home, AlertTriangle } from 'lucide-react';

export default function NotFound() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100vh', textAlign: 'center',
      gap: '1rem', padding: '2rem'
    }}>
      <div style={{
        background: 'rgba(239,68,68,0.1)', padding: '1.5rem',
        borderRadius: '50%', marginBottom: '0.5rem'
      }}>
        <AlertTriangle size={48} color="#f87171" />
      </div>
      <h1 style={{ fontSize: '4rem', fontWeight: 800, margin: 0, color: 'var(--text-faint)' }}>404</h1>
      <h2 style={{ fontSize: '1.5rem', margin: 0 }}>Page not found</h2>
      <p style={{ color: 'var(--text-muted)', maxWidth: '360px' }}>
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link
        to="/"
        className="btn-primary"
        style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}
      >
        <Home size={16} /> Go back home
      </Link>
    </div>
  );
}
