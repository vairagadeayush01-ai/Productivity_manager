import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { DashboardSkeleton } from '../components/Skeleton';
import StatCard from '../components/StatCard';
import EmptyState from '../components/EmptyState';
import SourceBadge from '../components/SourceBadge';
import {
  BookOpen, Code2, AlertCircle, Video,
  RefreshCw, Flame, ChevronRight, Sparkles,
} from 'lucide-react';

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
  });
}

export default function Dashboard() {
  const [data, setData]                   = useState(null);
  const [stats, setStats]                 = useState(null);
  const [dueTopics, setDueTopics]         = useState([]);
  const [loading, setLoading]             = useState(true);
  const [integrationStatus, setIntegration] = useState(null);
  const [syncing, setSyncing]             = useState(false);
  const [syncMessage, setSyncMessage]     = useState('');
  const [userEmail, setUserEmail]         = useState('');

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
        const [todayRes, dueRes, statsRes, statusRes, meRes] = await Promise.all([
          api.searchToday(),
          api.getDueTopics().catch(() => ({ topics: [] })),
          api.getStats().catch(() => null),
          api.getIntegrationStatus().catch(() => null),
          api.me().catch(() => null),
        ]);
        setData(todayRes);
        setDueTopics(dueRes.topics || []);
        setStats(statsRes);
        setIntegration(statusRes);
        if (meRes?.email) setUserEmail(meRes.email);
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

  if (loading) return <DashboardSkeleton />;

  const dueList = dueTopics.map(t => (typeof t === 'string' ? t : t.topic)).filter(Boolean);
  const firstName = userEmail.split('@')[0] || 'there';

  return (
    <div className="page animate-fade-in">

      {/* ── Greeting ── */}
      <div className="dashboard-greeting">
        <div className="dashboard-greeting__date">{formatDate()}</div>
        <h1 className="dashboard-greeting__name">
          {greeting()}, {firstName} 👋
        </h1>
        <p className="dashboard-greeting__sub">
          Here's what you've learned and what's coming up today.
        </p>
      </div>

      {/* ── Key Metrics ── */}
      <div className="stat-grid">
        <StatCard
          icon={BookOpen}
          iconBg="var(--primary-light)"
          iconColor="var(--primary)"
          label="Logged today"
          value={data?.count ?? 0}
        />
        <StatCard
          icon={Code2}
          iconBg="var(--warning-light)"
          iconColor="var(--warning)"
          label="LeetCode (total)"
          value={stats?.leetcode ?? '—'}
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

      {/* ── Review Queue ── */}
      {dueList.length > 0 && (
        <div style={{ marginBottom: 'var(--space-xl)' }}>
          <p className="section-label">Spaced repetition queue</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {dueList.slice(0, 8).map(t => (
              <Link key={t} to={`/quiz?topic=${encodeURIComponent(t)}`} className="review-chip">
                <AlertCircle size={13} />
                {t}
              </Link>
            ))}
            {dueList.length > 8 && (
              <Link to="/quiz" className="review-chip">
                +{dueList.length - 8} more
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ── Sync notification ── */}
      {syncMessage && (
        <div className="banner" style={{ marginBottom: 'var(--space-lg)' }}>
          <span className="status-dot status-dot--on" />
          {syncMessage}
        </div>
      )}

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
            <article key={entry.id} className="entry-card">
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
            </article>
          ))
        )}
      </div>

      {/* ── Integrations (bottom, collapsible look) ── */}
      <div className="panel" style={{ marginBottom: 0 }}>
        <div className="panel__header">
          <div>
            <h2 className="panel__title">
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
              Integrations
            </h2>
            <p className="panel__desc">Auto-sync runs nightly. Pull today's activity anytime.</p>
          </div>
          <button
            type="button"
            className="btn-secondary btn-secondary--sm"
            disabled={syncing}
            onClick={syncAll}
            style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
            Sync now
          </button>
        </div>

        <div className="integration-grid">
          <IntegrationTile
            name="GitHub"
            configured={integrationStatus?.github_configured}
          />
          <IntegrationTile
            name="LeetCode"
            configured={integrationStatus?.leetcode_configured}
          />
        </div>
      </div>
    </div>
  );
}

function IntegrationTile({ name, configured }) {
  return (
    <div className="integration-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: 32, height: 32, borderRadius: 'var(--radius-sm)',
          background: configured ? 'var(--success-light)' : 'var(--bg-surface)',
          border: `1px solid ${configured ? 'rgba(16,185,129,0.2)' : 'var(--border)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span className={`status-dot status-dot--${configured ? 'on' : 'off'}`} />
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: 'var(--text-main)' }}>{name}</div>
          <div style={{ fontSize: '0.75rem', color: configured ? 'var(--success)' : 'var(--danger)', marginTop: '1px' }}>
            {configured ? 'Connected' : 'Not configured'}
          </div>
        </div>
      </div>
      <ChevronRight size={16} color="var(--text-faint)" />
    </div>
  );
}
