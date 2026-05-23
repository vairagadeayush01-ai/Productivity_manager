import React from 'react';

export default function PageHeader({ icon: Icon, iconColor, iconBg, title, subtitle, children }) {
  return (
    <header className="page-header">
      {Icon && (
        <div className="page-header__icon" style={{ background: iconBg || 'rgba(99,102,241,0.15)' }}>
          <Icon size={28} color={iconColor || 'var(--primary-glow)'} />
        </div>
      )}
      <div className="page-header__text">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {children && <div className="page-header__actions">{children}</div>}
    </header>
  );
}
