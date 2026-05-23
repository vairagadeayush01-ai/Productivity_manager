import React, { useEffect, useState } from 'react';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import EmptyState from '../components/EmptyState';
import { BarChart3, TrendingUp, Award, Calendar, BookOpen } from 'lucide-react';

export default function Report() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .getWeeklyReport()
      .then(setData)
      .catch(() => setError('Could not load weekly report. Try again later.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="page page--centered">
        <div className="loading-block">
          <div className="spinner" />
          <p style={{ color: 'var(--text-muted)' }}>Generating your weekly report…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page page--narrow">
        <EmptyState icon={BarChart3} title="Report unavailable" description={error} />
      </div>
    );
  }

  const stats = data?.stats || {};
  const report = data?.report || {};
  const hasActivity = (stats.total_entries || 0) > 0;

  if (!hasActivity) {
    return (
      <div className="page page--narrow">
        <PageHeader icon={BarChart3} iconColor="#fbbf24" iconBg="rgba(245,158,11,0.15)" title="Weekly report" subtitle={data?.message || 'No activity this week yet.'} />
        <EmptyState
          icon={BookOpen}
          title="No data this week"
          description="Log learning entries, solve problems, or sync GitHub — your report card will appear here next Sunday."
        />
      </div>
    );
  }

  return (
    <div className="page page--narrow">
      <PageHeader
        icon={BarChart3}
        iconColor="#fbbf24"
        iconBg="rgba(245,158,11,0.15)"
        title="Weekly progress"
        subtitle={`Report for week ending ${data?.date || 'today'}`}
      />

      <div className="stat-grid">
        <StatCard
          icon={TrendingUp}
          iconColor="var(--primary-glow)"
          iconBg="rgba(99,102,241,0.2)"
          label="Entries this week"
          value={stats.total_entries ?? 0}
        />
        <StatCard
          icon={Award}
          iconColor="var(--success)"
          iconBg="rgba(52,211,153,0.15)"
          label="Quiz accuracy"
          value={`${stats.quiz_accuracy ?? 0}%`}
        />
        <StatCard
          icon={Calendar}
          iconColor="var(--secondary-glow)"
          iconBg="rgba(192,132,252,0.15)"
          label="Active days"
          value={`${stats.active_days ?? 0} / 7`}
        />
      </div>

      <div className="report-grid">
        {report.overall && (
          <section className="report-section glass-card">
            <h3>Overview</h3>
            <p>{report.overall}</p>
          </section>
        )}
        {report.strong_areas && (
          <section className="report-section glass-card">
            <h3>Strong areas</h3>
            <p>{report.strong_areas}</p>
          </section>
        )}
        {report.needs_attention && (
          <section className="report-section glass-card">
            <h3>Needs attention</h3>
            <p>{report.needs_attention}</p>
          </section>
        )}
        {report.next_week && (
          <section className="report-section glass-card">
            <h3>Next week</h3>
            <p>{report.next_week}</p>
          </section>
        )}
      </div>

      {stats.top_topics?.length > 0 && (
        <div className="glass-card" style={{ padding: '1.25rem', marginTop: '1.5rem' }}>
          <h3 className="section-title" style={{ marginBottom: '0.75rem', fontSize: '1rem' }}>Top topics</h3>
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
