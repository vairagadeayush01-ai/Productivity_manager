import React, { useState, useEffect } from 'react';
import { Calendar, CheckCircle2, Clock, Send, Sparkles, XCircle, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Link } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

function authHeaders() {
  const t = localStorage.getItem('pm_token');
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}

async function apiFetch(path, options = {}) {
  const resp = await fetch(`${API}${path}`, { headers: authHeaders(), ...options });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.detail || data?.message || `HTTP ${resp.status}`);
  return data;
}

export default function Planner() {
  const { user } = useAuth();
  
  const [intentText, setIntentText] = useState('');
  const [isScheduling, setIsScheduling] = useState(false);
  const [status, setStatus] = useState({ type: '', msg: '' });
  
  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  
  const [calendarConnected, setCalendarConnected] = useState(true);

  const fetchEvents = async () => {
    setLoadingEvents(true);
    try {
      const data = await apiFetch('/calendar/events');
      setEvents(data);
    } catch (e) {
      if (e.message.includes("Google Calendar not connected")) {
        setCalendarConnected(false);
      }
    } finally {
      setLoadingEvents(false);
    }
  };

  useEffect(() => {
    // Check profile first to see if connected
    apiFetch('/profile/').then(p => {
      if (!p.calendar_connected) {
        setCalendarConnected(false);
        setLoadingEvents(false);
      } else {
        fetchEvents();
      }
    }).catch(() => setLoadingEvents(false));
  }, []);

  const handleSchedule = async (e) => {
    e.preventDefault();
    if (!intentText.trim()) return;
    
    setIsScheduling(true);
    setStatus({ type: '', msg: '' });
    
    try {
      const res = await apiFetch('/calendar/schedule', {
        method: 'POST',
        body: JSON.stringify({ text: intentText })
      });
      
      const createdCount = res.created?.length || 0;
      if (createdCount === 0) {
        setStatus({ type: 'error', msg: "Couldn't extract any specific dates or times from that text." });
      } else {
        setStatus({ type: 'success', msg: `Successfully scheduled ${createdCount} event${createdCount > 1 ? 's' : ''}!` });
        setIntentText('');
        fetchEvents();
      }
    } catch (err) {
      setStatus({ type: 'error', msg: err.message });
    } finally {
      setIsScheduling(false);
    }
  };

  if (!calendarConnected) {
    return (
      <div className="page page--narrow animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', paddingTop: '4rem' }}>
        <div style={{ background: 'rgba(219,68,55,0.1)', padding: '1.5rem', borderRadius: '50%', marginBottom: '1.5rem' }}>
          <Calendar size={48} color="#DB4437" />
        </div>
        <h1 style={{ marginBottom: '1rem', fontSize: '1.8rem' }}>AI Study Planner</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', maxWidth: '400px', lineHeight: 1.6 }}>
          Connect your Google Calendar to use the AI Planner. You can type natural language requests like "Schedule a 2 hour block for graph algorithms this weekend" and we'll sync it directly to your calendar.
        </p>
        <Link to="/profile" className="btn-primary" style={{ textDecoration: 'none' }}>
          Go to Profile to Connect
        </Link>
      </div>
    );
  }

  return (
    <div className="page page--narrow animate-fade-in">
      <div className="planner-header" style={{ marginBottom: '2rem' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.8rem', marginBottom: '0.5rem' }}>
          <Calendar color="#DB4437" /> AI Study Planner
        </h1>
        <p style={{ color: 'var(--text-muted)' }}>
          Tell the AI what you want to study, and it will schedule it on your Google Calendar.
        </p>
      </div>

      {/* Input Section */}
      <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <form onSubmit={handleSchedule}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
            <textarea
              className="glass-input"
              style={{ flex: 1, minHeight: '80px', resize: 'vertical' }}
              placeholder="e.g. 'I need to review React Hooks for 2 hours tomorrow morning' or 'Schedule a 30 min LeetCode session every day this week at 5pm'"
              value={intentText}
              onChange={e => setIntentText(e.target.value)}
              disabled={isScheduling}
            />
            <button 
              type="submit" 
              className="btn-primary" 
              disabled={isScheduling || !intentText.trim()}
              style={{ height: '80px', padding: '0 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
            >
              {isScheduling ? <Sparkles className="animate-spin" size={20} /> : <Send size={20} />}
              <span style={{ fontSize: '0.8rem' }}>Schedule</span>
            </button>
          </div>
        </form>
        
        {status.msg && (
          <div style={{ 
            marginTop: '1rem', 
            padding: '0.75rem 1rem', 
            borderRadius: 'var(--radius-sm)', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem',
            background: status.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            color: status.type === 'success' ? '#4ade80' : '#f87171',
            border: `1px solid ${status.type === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`
          }}>
            {status.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span style={{ fontSize: '0.9rem' }}>{status.msg}</span>
          </div>
        )}
      </div>

      {/* Upcoming Events */}
      <div style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Clock size={18} /> Upcoming Scheduled Sessions
        </h2>
        
        {loadingEvents ? (
          <div className="skeleton-pulse" style={{ height: '100px', borderRadius: 'var(--radius-md)' }} />
        ) : events.length === 0 ? (
          <div className="glass-card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-faint)' }}>
            <Calendar size={32} style={{ opacity: 0.3, marginBottom: '1rem' }} />
            <p>No upcoming study sessions scheduled.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {events.map((ev) => {
              const start = new Date(ev.start_time);
              const end = new Date(ev.end_time);
              
              // Formatting
              const isToday = new Date().toDateString() === start.toDateString();
              const dayStr = isToday ? 'Today' : start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
              const timeStr = `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
              
              return (
                <div key={ev.id} className="glass-card" style={{ padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1rem' }}>{ev.title}</h3>
                    {ev.description && <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{ev.description}</p>}
                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: 'var(--text-faint)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: isToday ? 'var(--primary)' : undefined }}>
                        <Calendar size={12} /> {dayStr}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Clock size={12} /> {timeStr}
                      </span>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {ev.status === 'synced' ? (
                      <span style={{ fontSize: '0.75rem', background: 'rgba(34,197,94,0.1)', color: '#4ade80', padding: '2px 8px', borderRadius: '12px', border: '1px solid rgba(34,197,94,0.2)' }}>Synced to Google</span>
                    ) : (
                      <span style={{ fontSize: '0.75rem', background: 'rgba(239,68,68,0.1)', color: '#f87171', padding: '2px 8px', borderRadius: '12px', border: '1px solid rgba(239,68,68,0.2)' }}>Sync Failed</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
