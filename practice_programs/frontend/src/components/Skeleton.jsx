import React from 'react';

export function Skeleton({ width = '100%', height = '1rem', style = {} }) {
  return (
    <div
      className="skeleton-pulse"
      style={{
        width,
        height,
        borderRadius: '8px',
        background: 'rgba(255,255,255,0.06)',
        ...style,
      }}
      aria-hidden="true"
    />
  );
}

export function DashboardSkeleton() {
  return (
    <div className="animate-fade-in" aria-busy="true" aria-label="Loading dashboard">
      <Skeleton width="240px" height="2rem" style={{ marginBottom: '2rem' }} />
      <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <Skeleton width="60%" height="1.2rem" style={{ marginBottom: '1rem' }} />
        <Skeleton height="3rem" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-card" style={{ padding: '1.25rem' }}>
            <Skeleton width="40%" height="0.9rem" style={{ marginBottom: '0.75rem' }} />
            <Skeleton width="30%" height="1.8rem" />
          </div>
        ))}
      </div>
      <div className="glass-card" style={{ padding: '1.5rem' }}>
        <Skeleton width="50%" height="1.2rem" style={{ marginBottom: '1rem' }} />
        <Skeleton height="4rem" style={{ marginBottom: '0.75rem' }} />
        <Skeleton height="4rem" />
      </div>
    </div>
  );
}
