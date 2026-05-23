import React from 'react';
import { AlertTriangle } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="page page--centered">
          <div className="empty-state glass-card">
            <div className="empty-state__icon empty-state__icon--error">
              <AlertTriangle size={40} />
            </div>
            <h3 className="empty-state__title">Something went wrong</h3>
            <p className="empty-state__desc">
              This page hit an unexpected error. Try refreshing, or go back to the dashboard.
            </p>
            <button type="button" className="btn-primary" onClick={() => window.location.href = '/'}>
              Back to Dashboard
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
