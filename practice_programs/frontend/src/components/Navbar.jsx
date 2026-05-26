import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Brain,
  LayoutDashboard,
  Search,
  Gamepad2,
  Plus,
  History,
  BarChart3,
  LogOut,
  Menu,
  X,
  User,
  Cpu,
  Calendar,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import IngestModal from './IngestModal';

const NAV_ITEMS = [
  { path: '/',        label: 'Dashboard', icon: LayoutDashboard },
  { path: '/search',  label: 'Search',    icon: Search          },
  { path: '/quiz',    label: 'Quiz',      icon: Gamepad2        },
  { path: '/chat',    label: 'AI',        icon: Cpu             },
  { path: '/planner', label: 'Planner',   icon: Calendar        },
  { path: '/history', label: 'History',   icon: History         },
  { path: '/report',  label: 'Report',    icon: BarChart3       },
];

export default function Navbar() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMobile = () => setMobileOpen(false);
  const initial = user?.email?.[0]?.toUpperCase() || '?';

  return (
    <>
      <header className="navbar">
        <div className="navbar__inner">
          {/* Brand */}
          <Link to="/" className="brand" onClick={closeMobile}>
            <Brain color="var(--primary)" size={20} />
            <span>Productivity Manager</span>
          </Link>

          {/* Nav links */}
          <nav className={`navbar__nav${mobileOpen ? ' navbar__nav--open' : ''}`} aria-label="Main">
            {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                className={`nav-link${location.pathname === path ? ' nav-link--active' : ''}`}
                onClick={closeMobile}
              >
                <Icon size={15} aria-hidden />
                <span>{label}</span>
              </Link>
            ))}
          </nav>

          {/* Right actions */}
          <div className="navbar__actions">
            {/* Add button */}
            <button
              type="button"
              className="btn-primary btn-primary--sm"
              onClick={() => setModalOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <Plus size={14} aria-hidden />
              <span className="navbar__add-label">Add</span>
            </button>

            {/* User avatar — links to /profile */}
            <Link
              to="/profile"
              className={`navbar__avatar${location.pathname === '/profile' ? ' navbar__avatar--active' : ''}`}
              title={`Profile: ${user?.email}`}
              aria-label="Your profile"
            >
              {initial}
            </Link>

            {/* Logout */}
            <button
              type="button"
              className="btn-icon"
              onClick={logout}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={15} />
            </button>

            {/* Mobile burger */}
            <button
              type="button"
              className="navbar__burger"
              onClick={() => setMobileOpen(o => !o)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </header>

      {mobileOpen && <div className="navbar__backdrop" onClick={closeMobile} aria-hidden />}
      <IngestModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
