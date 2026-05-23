import React from 'react';

export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="empty-state glass-card">
      {Icon && (
        <div className="empty-state__icon">
          <Icon size={40} strokeWidth={1.5} />
        </div>
      )}
      <h3 className="empty-state__title">{title}</h3>
      {description && <p className="empty-state__desc">{description}</p>}
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  );
}
