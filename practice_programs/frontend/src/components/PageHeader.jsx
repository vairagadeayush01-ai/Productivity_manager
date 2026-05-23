import React from 'react';

export default function PageHeader({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="page-header">
      {Icon && (
        <div className="page-header__icon">
          <Icon size={22} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {action && <div className="page-header__actions">{action}</div>}
    </div>
  );
}
