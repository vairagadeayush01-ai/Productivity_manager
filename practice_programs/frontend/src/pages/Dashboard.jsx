import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { DashboardSkeleton } from '../components/Skeleton';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import EmptyState from '../components/EmptyState';
import SourceBadge from '../components/SourceBadge';
import {
  Activity,
  BookOpen,
  Clock,
  AlertCircle,
  Database,
  Video,
  PenTool,
  RefreshCw,
  Code2,
  Sparkles,
} from 'lucide-react';

function youtubeThumb(url) {
  if (!url) return null;
  const m = url.match(/[?&]v=([^&]+)/);
  const id = m ? m[1] : url.split('/').pop();
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [stats, setStats] = useState(null);
  const [dueTopics, setDueTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [integrationStatus, setIntegrationStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

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
        const [todayRes, dueRes, statsRes, statusRes] = await Promise.all([
          api.searchToday(),
          api.getDueTopics().catch(() => ({ topics: [] })),
          api.getStats().catch(() => null),
          api.getIntegrationStatus().catch(() => null),
        ]);
        setData(todayRes);
        setDueTopics(dueRes.topics || []);
        setStats(statsRes);
        setIntegrationStatus(statusRes);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }

      try {
        const result = await api.fetchAllToday();
        const anyNew = Object.values(result.results || {}).some((r) => r.status === 'ok');
        if (anyNew) {
          await refreshToday();
          setSyncMessage('Auto-synced today\'s GitHub & LeetCode activity');
          setTimeout(() => setSyncMessage(''), 5000);
        }
      } catch {
        /* integrations optional */
      }
    }
    init();
  }, []);

  const syncAll = async () => {
    setSyncing(true);
    setSyncMessage('Syncing integrations…');
    try {
      const [ghRes, lcRes] = await Promise.all([
        api.syncGitHub().catch((e) => ({ message: e.response?.data?.detail || e.message })),
        api.syncLeetCode().catch((e) => ({ message: e.response?.data?.detail || e.message })),
      ]);
      setSyncMessage(`Done — GitHub: ${ghRes.message || 'OK'} · LeetCode: ${lcRes.message || 'OK'}`);
      await refreshToday();
    } catch {
      setSyncMessage('Sync failed. Check backend logs.');
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(''), 8000);
    }
  };

  const syncOne = async (type) => {
    setSyncing(true);
    try {
      const res = type === 'github' ? await api.syncGitHub() : await api.syncLeetCode();
      setSyncMessage(res.message || 'Sync complete');
      await refreshToday();
    } catch (err) {
      setSyncMessage(err.response?.data?.detail || 'Sync failed');
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(''), 6000);
    }
  };

  if (loading) return <DashboardSkeleton />;

  const dueList = dueTopics.map((t) => (typeof t === 'string' ? t : t.topic)).filter(Boolean);

  return (
    <div className="page">
      <PageHeader
        icon={Sparkles}
        title="Welcome back"
        subtitle="Your learning command center — track, review, and grow."
      />

      <section className="panel glass-card">
        <div className="panel__header">
          <div>
            <h2 className="panel__title">
              <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
              Integrations
            </h2>
            <p className="panel__desc">
              Auto-sync runs nightly. Pull today&apos;s GitHub & LeetCode activity anytime.
            </p>
          </div>
          <button type="button" className="btn-primary btn-primary--sm" disabled={syncing} onClick={syncAll}>
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
            Sync all
          </button>
        </div>

        <div className="integration-grid">
          <IntegrationTile
            name="GitHub"
            icon={Code2}
            iconColor="var(--text-main)"
            configured={integrationStatus?.github_configured}
            syncing={syncing}
            onSync={() => syncOne('github')}
          />
          <IntegrationTile
            name="LeetCode"
            icon={Code2}
            iconColor="var(--warning)"
            configured={integrationStatus?.leetcode_configured}
            syncing={syncing}
            onSync={() => syncOne('leetcode')}
          />
        </div>

        {syncMessage && (
          <div className="banner" role="status">
            <span className="status-dot status-dot--on" />
            {syncMessage}
          </div>
        )}
      </section>

      <div className="stat-grid">
        <StatCard icon={BookOpen} iconColor="var(--primary-glow)" iconBg="rgba(99,102,241,0.2)" label="Learned today" value={`${data?.count || 0} entries`} />
        <StatCard icon={Activity} iconColor="var(--accent-color)" iconBg="rgba(56,189,248,0.15)" label="Streak" value="Active" />
        <StatCard
          icon={dueList.length ? AlertCircle : Clock}
          iconColor={dueList.length ? 'var(--danger)' : 'var(--secondary-glow)'}
          iconBg={dueList.length ? 'rgba(248,113,113,0.15)' : 'rgba(192,132,252,0.15)'}
          label="Due for review"
          value={`${dueList.length} topics`}
          highlight={dueList.length > 0}
          action={
            dueList.length > 0 && (
              <Link to={`/quiz?topic=${encodeURIComponent(dueList[0])}`} className="btn-primary btn-primary--sm" style={{ textDecoration: 'none' }}>
                Review
              </Link>
            )
          }
        />
      </div>

      {stats && (
        <div className="stat-grid stat-grid--compact">
          <div className="stat-mini glass-card">
            <Database size={18} color="var(--primary-glow)" style={{ margin: '0 auto 0.35rem' }} />
            <span className="stat-mini__value">{stats.total_entries}</span>
            <span className="stat-mini__label">Total</span>
          </div>
          <div className="stat-mini glass-card">
            <Video size={18} color="var(--danger)" style={{ margin: '0 auto 0.35rem' }} />
            <span className="stat-mini__value">{stats.youtube}</span>
            <span className="stat-mini__label">Videos</span>
          </div>
          <div className="stat-mini glass-card">
            <Code2 size={18} color="var(--warning)" style={{ margin: '0 auto 0.35rem' }} />
            <span className="stat-mini__value">{stats.leetcode}</span>
            <span className="stat-mini__label">LeetCode</span>
          </div>
          <div className="stat-mini glass-card">
            <PenTool size={18} color="var(--accent-color)" style={{ margin: '0 auto 0.35rem' }} />
            <span className="stat-mini__value">{stats.manual}</span>
            <span className="stat-mini__label">Notes</span>
          </div>
        </div>
      )}

      <h2 className="section-title">Today&apos;s summaries</h2>
      <div className="entry-list">
        {!data?.entries?.length ? (
          <EmptyState
            icon={BookOpen}
            title="Nothing logged yet today"
            description="Add a YouTube video, write a quick note, or sync GitHub/LeetCode. YouTube batch summaries run around 7 PM."
            action={
              <p style={{ color: 'var(--text-faint)', fontSize: '0.85rem' }}>
                Use <strong style={{ color: 'var(--primary-glow)' }}>Add</strong> in the navbar to get started.
              </p>
            }
          />
        ) : (
          data.entries.map((entry) => (
            <article key={entry.id} className="entry-card glass-card">
              {entry.source_type === 'youtube' && (
                <div className="entry-card__thumb">
                  {youtubeThumb(entry.source_url) ? (
                    <img src={youtubeThumb(entry.source_url)} alt="" />
                  ) : (
                    <Video color="var(--text-faint)" size={32} style={{ margin: 'auto' }} />
                  )}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <SourceBadge type={entry.source_type} />
                <h3 className="entry-card__title">{entry.title}</h3>
                <p className="entry-card__summary">{entry.summary}</p>
                <div className="topic-tags">
                  {(entry.topics || []).map((t, i) => (
                    <span key={i} className="topic-tag">#{String(t).trim()}</span>
                  ))}
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

function IntegrationTile({ name, icon: Icon, iconColor, configured, syncing, onSync }) {
  return (
    <div className="integration-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
          <Icon size={20} color={iconColor} />
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '2px', fontSize: '0.75rem' }}>
            <span className={`status-dot ${configured ? 'status-dot--on' : 'status-dot--off'}`} />
            <span style={{ color: configured ? 'var(--success)' : 'var(--danger)' }}>
              {configured ? 'Connected' : 'Not configured'}
            </span>
          </div>
        </div>
      </div>
      {configured && (
        <button type="button" className="btn-secondary btn-secondary--sm" disabled={syncing} onClick={onSync}>
          Sync
        </button>
      )}
    </div>
  );
}
