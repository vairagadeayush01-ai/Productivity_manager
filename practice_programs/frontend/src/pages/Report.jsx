import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { BarChart3, TrendingUp, Award, Calendar } from 'lucide-react';

export default function Report() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadReport() {
      try {
        const data = await api.getWeeklyReport();
        setReport(data);
      } catch (err) {
        setError("Could not load weekly report. Try again later.");
      } finally {
        setLoading(false);
      }
    }
    loadReport();
  }, []);

  if (loading) return <div style={{ textAlign: 'center', marginTop: '4rem' }}>Generating Weekly Report...</div>;
  if (error) return <div style={{ textAlign: 'center', marginTop: '4rem', color: 'var(--text-muted)' }}>{error}</div>;

  return (
    <div className="animate-fade-in" style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '3rem' }}>
        <div style={{ padding: '1rem', background: 'rgba(245, 158, 11, 0.2)', borderRadius: '12px' }}>
          <BarChart3 color="#f59e0b" size={28} />
        </div>
        <div>
          <h1 style={{ fontSize: '2rem' }}>Weekly Progress Report</h1>
          <p style={{ color: 'var(--text-muted)' }}>Your learning analytics and streaks for the past 7 days.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
        
        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '1rem', background: 'rgba(99, 102, 241, 0.2)', borderRadius: '12px' }}>
            <TrendingUp color="var(--primary-glow)" size={24} />
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>New Entries This Week</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 600 }}>{report.new_entries}</div>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '1rem', background: 'rgba(34, 197, 94, 0.2)', borderRadius: '12px' }}>
            <Award color="#22c55e" size={24} />
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Quiz Accuracy</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 600 }}>{report.quiz_accuracy_pct.toFixed(0)}%</div>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '1rem', background: 'rgba(168, 85, 247, 0.2)', borderRadius: '12px' }}>
            <Calendar color="var(--secondary-glow)" size={24} />
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Topics Reviewed</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 600 }}>{report.topics_reviewed}</div>
          </div>
        </div>

      </div>

      <div className="glass-card" style={{ padding: '2.5rem' }}>
        <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', color: 'var(--accent-color)' }}>AI Analysis</h2>
        <p style={{ color: 'var(--text-main)', fontSize: '1.1rem', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
          {report.report}
        </p>
      </div>
    </div>
  );
}
