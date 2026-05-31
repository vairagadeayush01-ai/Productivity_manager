import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { DashboardSkeleton } from '../components/Skeleton';
import StatCard from '../components/StatCard';
import EmptyState from '../components/EmptyState';
import SourceBadge from '../components/SourceBadge';
import {
  BookOpen, AlertCircle, Video,
  Flame, Sparkles, X, Trash2,
} from 'lucide-react';

const DEV_QUOTES = [
  { text: "Programs must be written for people to read, and only incidentally for machines to execute.", author: "Harold Abelson" },
  { text: "The best error message is the one that never shows up.", author: "Thomas Fuchs" },
  { text: "First, solve the problem. Then, write the code.", author: "John Johnson" },
  { text: "Code is like humor. When you have to explain it, it's bad.", author: "Cory House" },
  { text: "Make it work, make it right, make it fast.", author: "Kent Beck" },
  { text: "Any fool can write code that a computer can understand. Good programmers write code that humans can understand.", author: "Martin Fowler" },
  { text: "Simplicity is the soul of efficiency.", author: "Austin Freeman" },
  { text: "Before software can be reusable it first has to be usable.", author: "Ralph Johnson" },
  { text: "Experience is the name everyone gives to their mistakes.", author: "Oscar Wilde" },
  { text: "Debugging is twice as hard as writing the code in the first place.", author: "Brian Kernighan" },
];

function youtubeThumb(url) {
  if (!url) return null;
  const m = url.match(/[?&]v=([^&]+)/);
  const id = m ? m[1] : url.split('/').pop();
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDate() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  }).toUpperCase();
}

export default function Dashboard() {
  const [data, setData]             = useState(null);
  const [stats, setStats]           = useState(null);
  const [dueTopics, setDueTopics]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [syncing, setSyncing]       = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [selectedEntry, setSelectedEntry] = useState(null);

  // Pick a deterministic quote for the day
  const quote = DEV_QUOTES[new Date().getDate() % DEV_QUOTES.length];

  const refreshToday = async () => {
    const [todayRes, statsRes] = await Promise.all([
      api.searchToday(),
      api.getStats().catch(() => null),
    ]);
    setData(todayRes);
    setStats(statsRes);
  };

  useEffect(() => {
    async function init() {
      try {
        const [todayRes, dueRes, statsRes, meRes, profileRes] = await Promise.all([
          api.searchToday(),
          api.getDueTopics().catch(() => ({ topics: [] })),
          api.getStats().catch(() => null),
          api.me().catch(() => null),
          fetch(`${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/profile/`, {
            headers: {
              Authorization: `Bearer ${localStorage.getItem('pm_token')}`,
            },
          }).then(r => r.ok ? r.json() : null).catch(() => null),
        ]);
        setData(todayRes);
        setDueTopics(dueRes.topics || []);
        setStats(statsRes);

        // Prefer display_name → username → email prefix
        const name =
          profileRes?.display_name?.trim() ||
          profileRes?.username?.trim() ||
          meRes?.email?.split('@')[0] ||
          'there';
        setDisplayName(name);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }

      // Background sync
      try {
        const result = await api.fetchAllToday();
        const anyNew = Object.values(result.results || {}).some(r => r.status === 'ok');
        if (anyNew) {
          await refreshToday();
          setSyncMessage('Auto-synced GitHub & LeetCode activity');
          setTimeout(() => setSyncMessage(''), 5000);
        }
      } catch { /* integrations optional */ }
    }
    init();
  }, []);

  const syncAll = async () => {
    setSyncing(true);
    setSyncMessage('Syncing…');
    try {
      const [ghRes, lcRes] = await Promise.all([
        api.syncGitHub().catch(e => ({ message: e.response?.data?.detail || e.message })),
        api.syncLeetCode().catch(e => ({ message: e.response?.data?.detail || e.message })),
      ]);
      setSyncMessage(`GitHub: ${ghRes.message || 'OK'} · LeetCode: ${lcRes.message || 'OK'}`);
      await refreshToday();
    } catch { setSyncMessage('Sync failed. Check backend.'); }
    finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(''), 8000);
    }
  };

  const reindexSearch = async () => {
    setSyncing(true);
    setSyncMessage('Rebuilding search index…');
    try {
      const res = await api.reindexEntries();
      setSyncMessage(`Done: ${res.message}`);
      await refreshToday();
    } catch (e) {
      setSyncMessage('Reindex failed. ' + (e.response?.data?.detail || e.message));
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(''), 8000);
    }
  };

  const handleDeleteEntry = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('Delete this entry forever?')) return;
    try {
      await api.deleteEntry(id);
      setData(prev => ({
        ...prev,
        entries: (prev?.entries || []).filter(en => en.id !== id),
        count: (prev?.count ?? 1) - 1,
      }));
      setSelectedEntry(null);
    } catch {
      alert('Failed to delete entry.');
    }
  };

  if (loading) return <DashboardSkeleton />;

  const dueList = dueTopics.map(t => (typeof t === 'string' ? t : t.topic)).filter(Boolean);
  const streak = stats?.streak ?? 0;

  return (
    <div className="page animate-fade-in">

      {/* ── Hero Greeting ── */}
      <div style={{ position: 'relative', marginBottom: 'var(--space-xl)', padding: 'var(--space-xl) 0 var(--space-lg)', overflow: 'hidden' }}>
        {/* Decorative gradient blobs */}
        <div style={{
          position: 'absolute', top: '-80px', right: '-60px',
          width: '320px', height: '320px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(124,58,237,0.18) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: '-60px', left: '30%',
          width: '240px', height: '240px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <p style={{
          fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: '8px',
        }}>
          {formatDate()}
        </p>
        <h1 style={{
          fontSize: 'clamp(1.75rem, 3vw, 2.4rem)', fontWeight: 800,
          letterSpacing: '-0.03em', marginBottom: '8px', lineHeight: 1.1,
          background: 'linear-gradient(100deg, var(--text-main) 50%, #7c3aed)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          {greeting()}, {displayName} 👋
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9375rem' }}>
          Here's what you've learned and what's coming up today.
        </p>
      </div>

      {/* ── Sync notification ── */}
      {syncMessage && (
        <div className="banner" style={{ marginBottom: 'var(--space-lg)' }}>
          <span className="status-dot status-dot--on" />
          {syncMessage}
        </div>
      )}

      {/* ── Stats ── */}
      <div className="stat-grid" style={{ marginBottom: 'var(--space-xl)' }}>
        <StatCard
          icon={BookOpen}
          iconBg="var(--primary-light)"
          iconColor="var(--primary)"
          label="Logged today"
          value={data?.count ?? 0}
        />
        <StatCard
          icon={Flame}
          iconBg="var(--warning-light)"
          iconColor="var(--warning)"
          label="Streak"
          value={streak}
        />
        <StatCard
          icon={dueList.length ? AlertCircle : Flame}
          iconBg={dueList.length ? 'var(--danger-light)' : 'var(--warning-light)'}
          iconColor={dueList.length ? 'var(--danger)' : 'var(--warning)'}
          label="Topics due"
          value={dueList.length || 0}
          highlight={dueList.length > 0}
          action={
            dueList.length > 0 && (
              <Link
                to={`/quiz?topic=${encodeURIComponent(dueList[0])}`}
                className="btn-primary btn-primary--sm"
                style={{ textDecoration: 'none', marginTop: '6px' }}
              >
                Review now
              </Link>
            )
          }
        />
        <StatCard
          icon={Sparkles}
          iconBg="#F5F3FF"
          iconColor="#7C3AED"
          label="Total entries"
          value={stats?.total_entries ?? '—'}
        />
      </div>

      {/* ── Spaced Repetition Queue ── */}
      {dueList.length > 0 && (
        <div className="glass-card" style={{ padding: '1rem 1.25rem', marginBottom: 'var(--space-xl)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Spaced Repetition Queue
            </span>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#f87171', background: 'rgba(239,68,68,0.12)', padding: '2px 8px', borderRadius: '10px' }}>
              {dueList.length} due
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '0.75rem' }}>
            {dueList.slice(0, 8).map(t => (
              <Link key={t} to={`/quiz?topic=${encodeURIComponent(t)}`} className="review-chip">
                <AlertCircle size={11} />
                {t}
              </Link>
            ))}
            {dueList.length > 8 && (
              <Link to="/quiz" className="review-chip">+{dueList.length - 8} more</Link>
            )}
          </div>
          {/* Maintenance buttons */}
          <div style={{ display: 'flex', gap: '8px', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
            <button onClick={syncAll} disabled={syncing} className="btn-secondary" style={{ fontSize: '0.8rem', opacity: syncing ? 0.6 : 1 }}>
              {syncing ? 'Syncing…' : 'Sync GitHub & LeetCode'}
            </button>
            <button onClick={reindexSearch} disabled={syncing} className="btn-secondary" style={{ fontSize: '0.8rem', opacity: syncing ? 0.6 : 1 }}>
              {syncing ? 'Reindexing…' : 'Rebuild Search Index'}
            </button>
          </div>
        </div>
      )}

      {/* ── Motivational Quote ── */}
      <div className="glass-card" style={{
        padding: '1.25rem 1.5rem', marginBottom: 'var(--space-xl)',
        borderLeft: '3px solid var(--primary)', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: '-10px', right: '12px',
          fontSize: '5rem', opacity: 0.05, lineHeight: 1,
          fontFamily: 'Georgia, serif', userSelect: 'none', color: 'var(--primary)',
        }}>"</div>
        <p style={{ fontSize: '0.9rem', fontStyle: 'italic', color: 'var(--text-main)', lineHeight: 1.75, margin: '0 0 0.5rem 0' }}>
          "{quote.text}"
        </p>
        <p style={{ fontSize: '0.78rem', color: 'var(--primary)', fontWeight: 600, margin: 0 }}>
          — {quote.author}
        </p>
      </div>

      {/* ── Today's Learning ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-md)' }}>
        <p className="section-label" style={{ margin: 0 }}>Today's learning</p>
        <Link to="/history" style={{ fontSize: '0.8125rem', color: 'var(--primary)', textDecoration: 'none', fontWeight: 500 }}>
          View all →
        </Link>
      </div>

      <div className="entry-list" style={{ marginBottom: 'var(--space-2xl)' }}>
        {!data?.entries?.length ? (
          <EmptyState
            icon={BookOpen}
            title="Nothing logged yet today"
            description='Tap "Add" above to log a YouTube video, quick note, or LeetCode solution. GitHub & LeetCode sync automatically each night.'
          />
        ) : (
          data.entries.map(entry => (
            <article
              key={entry.id}
              className="entry-card"
              onClick={() => setSelectedEntry(entry)}
              style={{ cursor: 'pointer', position: 'relative' }}
            >
              {entry.source_type === 'youtube' && (
                <div className="entry-card__thumb">
                  {youtubeThumb(entry.source_url)
                    ? <img src={youtubeThumb(entry.source_url)} alt="" loading="lazy" />
                    : <Video color="var(--text-faint)" size={28} style={{ margin: 'auto', display: 'block', paddingTop: '30%' }} />
                  }
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <SourceBadge type={entry.source_type} />
                <h3 className="entry-card__title">{entry.title}</h3>
                <p className="entry-card__summary">{entry.summary}</p>
                <div className="topic-tags">
                  {(entry.topics || []).map((t, i) => (
                    <span key={i} className="topic-tag">{String(t).trim()}</span>
                  ))}
                </div>
              </div>
              {/* Delete button — bottom right */}
              <button
                type="button"
                onClick={(e) => handleDeleteEntry(e, entry.id)}
                title="Delete entry"
                style={{
                  position: 'absolute', bottom: '10px', right: '12px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-faint)', padding: '4px',
                  borderRadius: '6px', lineHeight: 1,
                  transition: 'color 0.15s, background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'var(--danger-light)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-faint)'; e.currentTarget.style.background = 'none'; }}
              >
                <Trash2 size={14} />
              </button>
            </article>
          ))
        )}
      </div>

      {/* ── Entry detail modal ── */}
      {selectedEntry && createPortal(
        <div className="modal-overlay" onClick={() => setSelectedEntry(null)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <SourceBadge type={selectedEntry.source_type} />
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-faint)' }}>
                  {new Date(selectedEntry.created_at || selectedEntry.date).toLocaleDateString()}
                </span>
              </div>
              <button onClick={() => setSelectedEntry(null)} className="btn-icon">
                <X size={18} />
              </button>
            </div>

            <h2 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>{selectedEntry.title}</h2>

            {/* Summary */}
            <div style={{
              fontSize: '0.9375rem', lineHeight: 1.6, color: 'var(--text-main)',
              whiteSpace: 'pre-wrap', marginBottom: '24px', padding: '16px',
              background: 'var(--bg-surface-2)', borderRadius: '8px',
              maxHeight: '300px', overflowY: 'auto', overscrollBehavior: 'contain',
            }}>
              {selectedEntry.summary || 'No summary available.'}
            </div>

            {/* Topics */}
            <div className="topic-tags" style={{ marginBottom: '24px' }}>
              {(selectedEntry.topics || []).map((t, i) => (
                <span key={i} className="topic-tag">{String(t).trim()}</span>
              ))}
            </div>

            {/* Footer actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '16px', flexWrap: 'wrap', gap: '8px' }}>
              {selectedEntry.source_url ? (
                <a
                  href={selectedEntry.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary btn-secondary--sm"
                >
                  View source ↗
                </a>
              ) : <span />}
              <button
                type="button"
                className="btn-secondary btn-secondary--sm"
                onClick={(e) => handleDeleteEntry(e, selectedEntry.id)}
                style={{ color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.2)', marginLeft: 'auto' }}
              >
                <Trash2 size={14} style={{ marginRight: '5px' }} />
                Delete entry
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
