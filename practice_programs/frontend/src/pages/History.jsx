import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import { Book, ChevronRight } from 'lucide-react';

export default function History() {
  const [diaries, setDiaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .getDiaries()
      .then((data) => setDiaries(data.diaries || []))
      .catch(() => setError('Failed to load diary history. Is the backend running?'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page page--narrow">
      <PageHeader
        icon={Book}
        title="Learning diary"
        subtitle={
          diaries.length
            ? `${diaries.length} day${diaries.length === 1 ? '' : 's'} of journal entries`
            : 'Daily AI summaries of everything you learned'
        }
      />

      {loading && (
        <div className="loading-block">
          <div className="spinner" />
          <p style={{ color: 'var(--text-muted)' }}>Opening your diary…</p>
        </div>
      )}

      {error && !loading && (
        <div className="auth-error" style={{ textAlign: 'center' }}>{error}</div>
      )}

      {!loading && !error && diaries.length === 0 && (
        <EmptyState
          icon={Book}
          title="No diary entries yet"
          description="Learn something today — your end-of-day journal is generated automatically from your activity."
        />
      )}

      {!loading && !error && diaries.length > 0 && (
        <div className="entry-list">
          {diaries.map((diary) => {
            const dateObj = new Date(diary.date);
            const label = dateObj.toLocaleDateString(undefined, {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            });
            return (
              <button
                key={diary.id}
                type="button"
                className="glass-card diary-row"
                style={{ width: '100%', border: 'none', textAlign: 'left', color: 'inherit' }}
                onClick={() => navigate(`/diary/${diary.date}`)}
              >
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>{label}</h3>
                  <p style={{ color: 'var(--text-muted)', marginTop: '0.25rem', fontSize: '0.88rem' }}>Read entry</p>
                </div>
                <ChevronRight size={22} color="var(--primary-glow)" aria-hidden />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
