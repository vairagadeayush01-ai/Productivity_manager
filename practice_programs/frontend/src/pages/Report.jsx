import React from 'react';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import StreamRenderer from '../components/StreamRenderer';
import { useReportStream } from '../hooks/useReportStream';
import { BarChart3, TrendingUp, Award, Calendar } from 'lucide-react';

export default function Report() {
  const { stats, sections, status, error, date, retry } = useReportStream();

  const isLoading  = status === 'idle' || status === 'loading';
  const hasStats   = Boolean(stats && Object.keys(stats).length > 0);
  const noActivity = hasStats && (stats.total_entries || 0) === 0;

  return (
    <div className="page page--narrow animate-fade-in">
      <PageHeader
        icon={BarChart3}
        iconColor="#fbbf24"
        iconBg="rgba(245,158,11,0.15)"
        title="Weekly progress"
        subtitle={
          date
            ? `Report for week ending ${date}`
            : status === 'streaming' || status === 'loading'
              ? 'Analyzing your week…'
              : 'Your AI-generated weekly report card'
        }
      />

      {/* ── Stats row — appears immediately when DB query completes ── */}
      {hasStats && !noActivity && (
        <div className="stat-grid" style={{ marginBottom: 'var(--space-xl)' }}>
          <StatCard
            icon={TrendingUp}
            iconColor="var(--primary)"
            iconBg="rgba(99,102,241,0.12)"
            label="Entries this week"
            value={stats.total_entries ?? 0}
          />
          <StatCard
            icon={Award}
            iconColor="var(--success)"
            iconBg="rgba(16,185,129,0.12)"
            label="Quiz accuracy"
            value={`${stats.quiz_accuracy ?? 0}%`}
          />
          <StatCard
            icon={Calendar}
            iconColor="#8B5CF6"
            iconBg="rgba(139,92,246,0.12)"
            label="Active days"
            value={`${stats.active_days ?? 0} / 7`}
          />
        </div>
      )}

      {/* ── Loading skeleton before stats arrive ── */}
      {isLoading && !hasStats && (
        <div className="stat-grid" style={{ marginBottom: 'var(--space-xl)' }}>
          {[0, 1, 2].map(i => (
            <div key={i} className="stat-card skeleton-pulse" style={{ minHeight: 88 }} />
          ))}
        </div>
      )}

      {/* ── No activity state ── */}
      {noActivity && status === 'done' && (
        <div className="report-empty">
          <div className="report-empty__icon">📊</div>
          <h3 className="report-empty__title">No activity this week yet</h3>
          <p className="report-empty__desc">
            Log learning entries, solve LeetCode problems, or sync GitHub —
            your report card will appear here once you have some activity.
          </p>
        </div>
      )}

      {/* ── AI stream renderer — handles all states internally ── */}
      {!noActivity && (
        <StreamRenderer
          sections={sections}
          status={status}
          error={error}
          stats={stats}
          date={date}
          retry={retry}
        />
      )}

      {/* ── Top topics row (populated from stats event) ── */}
      {hasStats && (stats.top_topics?.length > 0) && (
        <div className="glass-card report-topics">
          <h3 className="section-title" style={{ marginBottom: '0.75rem', fontSize: '0.9375rem' }}>
            Top topics
          </h3>
          <div className="topic-tags">
            {stats.top_topics.map((t) => (
              <span key={t} className="topic-tag">{t}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
