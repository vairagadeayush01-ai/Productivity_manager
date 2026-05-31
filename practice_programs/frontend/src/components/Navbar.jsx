import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Search,
  Gamepad2,
  Plus,
  History,
  BarChart3,
  Menu,
  X,
  Cpu,
  Calendar,
  Sun,
  Moon,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
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
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [modalOpen, setModalOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const closeMobile = () => setMobileOpen(false);
  const initial = user?.email?.[0]?.toUpperCase() || '?';

  return (
    <>
      <header className="navbar">
        <div className="navbar__inner">

          {/* ── Brand (left) ── */}
          <Link to="/" className="brand" onClick={closeMobile}>
            <svg width="22" height="22" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="navgrad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#7c3aed"/>
                  <stop offset="100%" stopColor="#3b82f6"/>
                </linearGradient>
              </defs>
              <rect width="48" height="48" rx="12" fill="#0f1117"/>
              <path d="M12 10 L12 38 L22 38 C31 38 36 32 36 24 C36 16 31 10 22 10 Z" stroke="url(#navgrad)" strokeWidth="2.5" fill="none"/>
              <polyline points="10,30 20,22 28,26 38,14" stroke="url(#navgrad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <polyline points="33,12 38,14 36,19" stroke="url(#navgrad)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
            <span>DevTrack</span>
          </Link>

          {/* ── Nav links (center) ── */}
          <nav className={`navbar__nav${mobileOpen ? ' navbar__nav--open' : ''}`} aria-label="Main">
            {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
              const isActive = path === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(path);
              return (
                <Link
                  key={path}
                  to={path}
                  className={`nav-link${isActive ? ' nav-link--active' : ''}`}
                  onClick={closeMobile}
                >
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>

          {/* ── Right actions ── */}
          <div className="navbar__actions">

            {/* + Add button */}
            <button
              type="button"
              className="btn-primary btn-primary--sm"
              onClick={() => setModalOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <Plus size={14} aria-hidden />
              <span className="navbar__add-label">Add</span>
            </button>

            {/* Theme toggle */}
            <button
              type="button"
              className="theme-toggle-btn theme-toggle-btn--round"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>

            {/* User avatar */}
            <Link
              to="/profile"
              className={`navbar__avatar${location.pathname === '/profile' ? ' navbar__avatar--active' : ''}`}
              title={`Profile: ${user?.email}`}
              aria-label="Your profile"
            >
              {initial}
            </Link>

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
