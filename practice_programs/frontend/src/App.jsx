import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import ErrorBoundary from './components/ErrorBoundary';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import Dashboard from './pages/Dashboard';
import Quiz from './pages/Quiz';
import SemanticSearch from './pages/Search';
import HistoryFeed from './pages/History';
import Report from './pages/Report';
import DiaryReader from './pages/DiaryReader';
import Profile from './pages/Profile';
import Planner from './pages/Planner';
import Chat from './pages/Chat';
import Login from './pages/Login';
import './index.css';

function AppRoutes() {
  const location = useLocation();
  const isDiary = location.pathname.startsWith('/diary/');
  const isLogin = location.pathname === '/login';

  return (
    <div className="app-shell">
      {!isDiary && !isLogin && <Navbar />}
      <main className={isDiary || isLogin ? 'app-main app-main--flush' : 'app-main'}>
        <Routes>
          <Route path="/login"       element={<Login />} />
          <Route path="/"            element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/search"      element={<ProtectedRoute><SemanticSearch /></ProtectedRoute>} />
          <Route path="/quiz"        element={<ProtectedRoute><Quiz /></ProtectedRoute>} />
          <Route path="/history"     element={<ProtectedRoute><HistoryFeed /></ProtectedRoute>} />
          <Route path="/diary/:date" element={<ProtectedRoute><DiaryReader /></ProtectedRoute>} />
          <Route path="/report"      element={<ProtectedRoute><Report /></ProtectedRoute>} />
          <Route path="/profile"     element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/planner"     element={<ProtectedRoute><Planner /></ProtectedRoute>} />
          <Route path="/chat"        element={<ProtectedRoute><Chat /></ProtectedRoute>} />
          <Route path="*"            element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <ErrorBoundary>
            <AppRoutes />
          </ErrorBoundary>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
