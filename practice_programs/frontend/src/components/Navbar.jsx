import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Brain,
  LayoutDashboard,
  Search,
  Gamepad2,
  PlusCircle,
  History,
  BarChart3,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import IngestModal from './IngestModal';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/search', label: 'Brain', icon: Search },
  { path: '/quiz', label: 'Quiz', icon: Gamepad2 },
  { path: '/history', label: 'History', icon: History },
  { path: '/report', label: 'Report', icon: BarChart3 },
];

export default function Navbar() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMobile = () => setMobileOpen(false);

  return (
    <>
      <header className="navbar glass-card">
        <div className="navbar__inner">
          <Link to="/" className="brand" onClick={closeMobile}>
            <Brain color="var(--primary-glow)" size={26} />
            <span>Productivity Manager</span>
          </Link>

          <nav className={`navbar__nav ${mobileOpen ? 'navbar__nav--open' : ''}`} aria-label="Main">
            {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                className={`nav-link ${location.pathname === path ? 'nav-link--active' : ''}`}
                onClick={closeMobile}
              >
                <Icon size={18} aria-hidden />
                <span>{label}</span>
              </Link>
            ))}
          </nav>

          <div className="navbar__actions">
            <button
              type="button"
              className="btn-primary btn-primary--sm navbar__add"
              onClick={() => setModalOpen(true)}
            >
              <PlusCircle size={16} aria-hidden />
              <span className="navbar__add-label">Add</span>
            </button>
            <span className="navbar__email" title={user?.email}>
              {user?.email?.split('@')[0]}
            </span>
            <button
              type="button"
              className="btn-secondary btn-secondary--sm"
              onClick={logout}
              aria-label="Sign out"
            >
              <LogOut size={16} />
            </button>
            <button
              type="button"
              className="navbar__burger"
              onClick={() => setMobileOpen((o) => !o)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </header>

      {mobileOpen && <div className="navbar__backdrop" onClick={closeMobile} aria-hidden />}

      {modalOpen && <IngestModal onClose={() => setModalOpen(false)} />}
    </>
  );
}
