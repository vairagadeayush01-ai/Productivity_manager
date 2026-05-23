import React from 'react';

/**
 * StatCard — clean light-theme metric card with an accent left border.
 * Props: label, value, icon (lucide), iconColor, iconBg, highlight, action
 */
export default function StatCard({ label, value, icon: Icon, iconColor, iconBg, highlight, action }) {
  return (
    <div className={`stat-card${highlight ? ' stat-card--highlight' : ''}`}>
      {Icon && (
        <div
          className="stat-card__icon"
          style={{ background: iconBg || 'var(--primary-light)', color: iconColor || 'var(--primary)' }}
        >
          <Icon size={18} />
        </div>
      )}
      <div className="stat-card__value">{value}</div>
      <div className="stat-card__label">{label}</div>
      {action && <div className="stat-card__action">{action}</div>}
    </div>
  );
}
