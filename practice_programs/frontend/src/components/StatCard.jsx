import React from 'react';

export default function StatCard({ icon: Icon, iconColor, iconBg, label, value, highlight, action }) {
  return (
    <div className={`stat-card glass-card ${highlight ? 'stat-card--highlight' : ''}`}>
      {Icon && (
        <div className="stat-card__icon" style={{ background: iconBg }}>
          <Icon size={22} color={iconColor} />
        </div>
      )}
      <div className="stat-card__body">
        <span className="stat-card__label">{label}</span>
        <span className="stat-card__value">{value}</span>
      </div>
      {action && <div className="stat-card__action">{action}</div>}
    </div>
  );
}
