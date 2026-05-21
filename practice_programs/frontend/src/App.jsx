import React from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Brain, LayoutDashboard, Search, Gamepad2, PlusCircle, History, BarChart3 } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Quiz from './pages/Quiz';
import SemanticSearch from './pages/Search';
import HistoryFeed from './pages/History';
import Report from './pages/Report';
import IngestModal from './components/IngestModal';
import './index.css';

function Navbar() {
  const location = useLocation();
  const [modalOpen, setModalOpen] = React.useState(false);
  
  const navItems = [
    { path: '/', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { path: '/search', label: 'Second Brain', icon: <Search size={20} /> },
    { path: '/quiz', label: 'Daily Quiz', icon: <Gamepad2 size={20} /> },
    { path: '/history', label: 'History', icon: <History size={20} /> },
    { path: '/report', label: 'Weekly Report', icon: <BarChart3 size={20} /> },
  ];

  return (
    <>
      <header className="header glass-card" style={{ padding: '0 2rem', marginBottom: '2rem', borderRadius: 0, borderTop: 0, borderLeft: 0, borderRight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', height: '70px', width: '100%', maxWidth: '1200px', margin: '0 auto', justifyContent: 'space-between' }}>
          
          <div className="brand">
            <Brain color="var(--primary-glow)" size={28} />
            <span>Productivity Manager</span>
          </div>
          
          <nav style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
            {navItems.map(item => (
              <Link 
                key={item.path}
                to={item.path} 
                style={{ 
                  color: location.pathname === item.path ? '#fff' : 'var(--text-muted)',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontWeight: 500,
                  transition: 'color 0.2s',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: location.pathname === item.path ? 'rgba(255,255,255,0.05)' : 'transparent'
                }}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
            
            <button 
              className="btn-primary" 
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              onClick={() => setModalOpen(true)}
            >
              <PlusCircle size={18} /> Add Entry
            </button>
          </nav>

        </div>
      </header>

      {modalOpen && <IngestModal onClose={() => setModalOpen(false)} />}
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Navbar />
        <main className="app-container" style={{ flex: 1, padding: '0 2rem 4rem' }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/search" element={<SemanticSearch />} />
            <Route path="/quiz" element={<Quiz />} />
            <Route path="/history" element={<HistoryFeed />} />
            <Route path="/report" element={<Report />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
