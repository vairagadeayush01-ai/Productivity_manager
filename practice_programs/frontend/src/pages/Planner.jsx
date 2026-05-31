import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, Clock, Send, Sparkles, AlertTriangle, CheckCircle2, Trash2, ExternalLink, BookOpen, X, Check } from 'lucide-react';
import { Link } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

function authHeaders() {
  const t = localStorage.getItem('pm_token');
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}

async function apiFetch(path, options = {}) {
  const resp = await fetch(`${API}${path}`, { headers: authHeaders(), ...options });
  if (resp.status === 204) return null;
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.detail || data?.message || `HTTP ${resp.status}`);
  return data;
}

function groupEventsByDate(events) {
  const groups = {};
  const now = new Date();
  const todayStr = now.toDateString();
  const tomorrowStr = new Date(now.getTime() + 86400000).toDateString();
  events.forEach(ev => {
    const start = new Date(ev.start_time);
    const dateStr = start.toDateString();
    let label;
    if (dateStr === todayStr) label = 'Today';
    else if (dateStr === tomorrowStr) label = 'Tomorrow';
    else label = start.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    if (!groups[label]) groups[label] = [];
    groups[label].push(ev);
  });
  return groups;
}

/** Render text with clickable links */
function TextWithLinks({ text }) {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return (
    <>
      {parts.map((part, i) =>
        urlRegex.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer"
            style={{ color: 'var(--primary)', textDecoration: 'underline', wordBreak: 'break-all' }}>
            {part}
          </a>
        ) : part
      )}
    </>
  );
}

export default function Planner() {
  const [intentText, setIntentText]   = useState('');
  const [isScheduling, setIsScheduling] = useState(false);
  const [status, setStatus]           = useState({ type: '', msg: '' });
  const [events, setEvents]           = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [deletingId, setDeletingId]   = useState(null);
  const [calendarConnected, setCalendarConnected] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState(null);
  // local completion tracking (not persisted)
  const [completedIds, setCompletedIds] = useState(new Set());

  const toggleComplete = (e, id) => {
    e.stopPropagation();
    setCompletedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const fetchEvents = useCallback(async () => {
    setLoadingEvents(true);
    try {
      const data = await apiFetch('/calendar/events');
      setEvents(data || []);
    } catch (e) {
      if (e.message.includes('Google Calendar not connected')) setCalendarConnected(false);
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  useEffect(() => {
    apiFetch('/profile/').then(p => {
      if (!p.calendar_connected) { setCalendarConnected(false); setLoadingEvents(false); }
      else fetchEvents();
    }).catch(() => setLoadingEvents(false));
  }, [fetchEvents]);

  const handleSchedule = async (e) => {
    e.preventDefault();
    if (!intentText.trim()) return;
    setIsScheduling(true);
    setStatus({ type: '', msg: '' });
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const localTime = new Date().toISOString();
      const res = await apiFetch('/calendar/schedule', {
        method: 'POST',
        body: JSON.stringify({ text: intentText, timezone: tz, local_time: localTime })
      });
      const createdCount = res.created?.length || 0;
      if (createdCount === 0) {
        setStatus({ type: 'error', msg: "Couldn't extract any specific dates or times from that text." });
      } else {
        setStatus({ type: 'success', msg: `Scheduled ${createdCount} event${createdCount > 1 ? 's' : ''} successfully!` });
        setIntentText('');
        fetchEvents();
      }
    } catch (err) {
      setStatus({ type: 'error', msg: err.message });
    } finally {
      setIsScheduling(false);
    }
  };

  const handleDelete = async (eventId) => {
    setDeletingId(eventId);
    try {
      await apiFetch(`/calendar/events/${eventId}`, { method: 'DELETE' });
      setEvents(prev => prev.filter(e => e.id !== eventId));
      if (selectedEvent?.id === eventId) setSelectedEvent(null);
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  if (!calendarConnected) {
    return (
      <div className="page page--narrow animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', paddingTop: '4rem' }}>
        <div style={{ background: 'rgba(219,68,55,0.1)', padding: '1.5rem', borderRadius: '50%', marginBottom: '1.5rem' }}>
          <Calendar size={48} color="#DB4437" />
        </div>
        <h1 style={{ marginBottom: '1rem', fontSize: '1.8rem' }}>Planner</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', maxWidth: '400px', lineHeight: 1.6 }}>
          Connect your Google Calendar to use the Planner. Type requests like "Schedule graph algorithms for 2 hours this weekend" and we'll sync it directly to your calendar.
        </p>
        <Link to="/profile" className="btn-primary" style={{ textDecoration: 'none' }}>
          Go to Profile to Connect
        </Link>
      </div>
    );
  }

  const now = new Date();
  const upcomingEvents = events.filter(ev => new Date(ev.end_time) >= now);
  const pastEvents     = events.filter(ev => new Date(ev.end_time) <  now);
  const upcomingGroups = groupEventsByDate(upcomingEvents);
  const pastGroups     = groupEventsByDate(pastEvents);

  const renderEventCard = (ev, isPast = false) => {
    const start    = new Date(ev.start_time);
    const end      = new Date(ev.end_time);
    const timeStr  = `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const dateStr  = start.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const done     = completedIds.has(ev.id);

    return (
      <button
        key={ev.id}
        className="glass-card"
        onClick={() => setSelectedEvent(ev)}
        style={{
          width: '100%', textAlign: 'left', cursor: 'pointer',
          padding: '0.85rem 1rem', border: done ? '1px solid var(--success)' : undefined,
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          transition: 'transform 0.15s, box-shadow 0.15s',
          opacity: isPast && !done ? 0.45 : 1,
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
      >
        {/* Checkbox */}
        <div
          role="checkbox"
          aria-checked={done}
          tabIndex={0}
          onClick={(e) => toggleComplete(e, ev.id)}
          onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') toggleComplete(e, ev.id); }}
          style={{
            flexShrink: 0,
            width: '20px', height: '20px',
            borderRadius: '6px',
            border: done ? '2px solid var(--success)' : '2px solid var(--border)',
            background: done ? 'var(--success)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
            cursor: 'pointer',
          }}
        >
          {done && <Check size={12} color="#fff" strokeWidth={3} />}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{
            margin: '0 0 0.2rem 0', fontSize: '0.95rem', fontWeight: 600,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            textDecoration: done ? 'line-through' : 'none',
            color: done ? 'var(--text-muted)' : 'var(--text-main)',
          }}>
            {ev.title}
          </h3>
          {ev.description && (
            <p style={{ margin: '0 0 0.25rem 0', fontSize: '0.8rem', color: 'var(--text-muted)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {ev.description}
            </p>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem', color: 'var(--text-faint)', flexWrap: 'wrap' }}>
            <Clock size={11} /> {timeStr}
            <span style={{ opacity: 0.5 }}>·</span>
            <Calendar size={11} /> {dateStr}
          </span>
        </div>
      </button>
    );
  };

  // Build Google Calendar day-view link
  const buildGcLink = (ev) => {
    const start = new Date(ev.start_time);
    const y = start.getFullYear();
    const m = String(start.getMonth() + 1).padStart(2, '0');
    const d = String(start.getDate()).padStart(2, '0');
    return `https://calendar.google.com/calendar/r/day/${y}/${m}/${d}`;
  };

  return (
    <div className="page page--narrow animate-fade-in">
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.8rem', marginBottom: '0.5rem' }}>
          <BookOpen color="var(--primary)" /> Planner
        </h1>
        <p style={{ color: 'var(--text-muted)' }}>
          Tell the AI what you want to schedule, and it will add it to your Google Calendar.
        </p>
      </div>

      {/* Input */}
      <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
        <form onSubmit={handleSchedule}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
            <textarea
              className="glass-input"
              style={{ flex: 1, minHeight: '80px', resize: 'vertical' }}
              placeholder="e.g. 'Review React Hooks for 2 hours tomorrow at 10am' or 'LeetCode at 7pm today'"
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
              <span style={{ fontSize: '0.8rem' }}>{isScheduling ? 'Scheduling…' : 'Schedule'}</span>
            </button>
          </div>
        </form>

        {status.msg && (
          <div style={{
            marginTop: '1rem', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)',
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            background: status.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            color: status.type === 'success' ? '#4ade80' : '#f87171',
            border: `1px solid ${status.type === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`
          }}>
            {status.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span style={{ fontSize: '0.9rem' }}>{status.msg}</span>
          </div>
        )}
      </div>

      {/* Events */}
      <div>
        <h2 style={{ fontSize: '1.1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Clock size={18} /> Scheduled Sessions
        </h2>

        {loadingEvents ? (
          <div className="skeleton-pulse" style={{ height: '120px', borderRadius: 'var(--radius-md)' }} />
        ) : events.length === 0 ? (
          <div className="glass-card" style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-faint)' }}>
            <Calendar size={36} style={{ opacity: 0.3, marginBottom: '1rem' }} />
            <p style={{ margin: 0 }}>No sessions scheduled yet. Use the input above to get started!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

            {/* Upcoming grouped by date */}
            {Object.keys(upcomingGroups).length > 0 && (
              <div>
                {Object.entries(upcomingGroups).map(([dateLabel, dayEvents]) => (
                  <div key={dateLabel} style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                      <span style={{
                        fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.07em',
                        textTransform: 'uppercase', whiteSpace: 'nowrap',
                        color: dateLabel === 'Today' ? 'var(--primary)' : 'var(--text-muted)'
                      }}>
                        {dateLabel === 'Today' ? '📅 Today' : dateLabel === 'Tomorrow' ? '🗓 Tomorrow' : `📆 ${dateLabel}`}
                      </span>
                      <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      {dayEvents.map(ev => renderEventCard(ev, false))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Past events */}
            {Object.keys(pastGroups).length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
                    Past Sessions
                  </span>
                  <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {Object.values(pastGroups).flat().map(ev => renderEventCard(ev, true))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── MODAL ── */}
      {selectedEvent && createPortal(
        <div
          className="modal-overlay"
          onClick={() => setSelectedEvent(null)}
        >
          <div
            className="modal-dialog"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  fontSize: '0.75rem', fontWeight: 600, padding: '2px 10px',
                  borderRadius: '12px', background: 'rgba(66,133,244,0.15)', color: '#4285f4',
                  border: '1px solid rgba(66,133,244,0.25)'
                }}>
                  📅 Planner
                </span>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-faint)' }}>
                  {(() => {
                    const start = new Date(selectedEvent.start_time);
                    const end   = new Date(selectedEvent.end_time);
                    const dateLabel = start.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
                    const time = `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                    return `${dateLabel} · ${time}`;
                  })()}
                </span>
              </div>
              <button onClick={() => setSelectedEvent(null)} className="btn-icon">
                <X size={18} />
              </button>
            </div>

            {/* Title */}
            <h2 style={{ fontSize: '1.25rem', marginBottom: '12px' }}>{selectedEvent.title}</h2>

            {/* Description with clickable links */}
            {selectedEvent.description && (
              <div style={{
                fontSize: '0.9375rem', lineHeight: 1.7, color: 'var(--text-main)',
                marginBottom: '20px', padding: '12px 16px',
                background: 'var(--bg-surface-2)', borderRadius: '8px',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                <TextWithLinks text={selectedEvent.description} />
              </div>
            )}

            {/* Completion status */}
            <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={(e) => toggleComplete(e, selectedEvent.id)}
                className="btn-secondary btn-secondary--sm"
                style={completedIds.has(selectedEvent.id) ? { color: 'var(--success)', borderColor: 'var(--success)' } : {}}
              >
                {completedIds.has(selectedEvent.id)
                  ? <><CheckCircle2 size={14} style={{ marginRight: '5px' }} />Completed</>
                  : <><Check size={14} style={{ marginRight: '5px' }} />Mark as done</>
                }
              </button>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', borderTop: '1px solid var(--border)', paddingTop: '16px', flexWrap: 'wrap' }}>
              <a
                href={buildGcLink(selectedEvent)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary btn-secondary--sm"
              >
                <ExternalLink size={14} style={{ marginRight: '6px' }} />
                View in Google Calendar ↗
              </a>
              <button
                type="button"
                className="btn-secondary btn-secondary--sm"
                disabled={deletingId === selectedEvent.id}
                onClick={() => handleDelete(selectedEvent.id)}
                style={{ color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.2)', marginLeft: 'auto' }}
              >
                {deletingId === selectedEvent.id
                  ? <><Sparkles size={14} className="animate-spin" style={{ marginRight: '6px' }} />Deleting…</>
                  : <><Trash2 size={14} style={{ marginRight: '6px' }} />Delete event</>
                }
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
