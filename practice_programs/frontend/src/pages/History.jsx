import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Book, ChevronRight, Database } from 'lucide-react';

export default function History() {
  const [diaries, setDiaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function loadDiaries() {
      setLoading(true);
      setError(null);
      try {
        const data = await api.getDiaries();
        setDiaries(data.diaries || []);
      } catch (err) {
        console.error(err);
        setError('Failed to load diary history. Make sure the backend is running.');
      } finally {
        setLoading(false);
      }
    }
    loadDiaries();
  }, []);

  return (
    <div className="animate-fade-in" style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ padding: '1rem', background: 'rgba(99, 102, 241, 0.2)', borderRadius: '12px' }}>
          <Book color="var(--primary-glow)" size={28} />
        </div>
        <div>
          <h1 style={{ fontSize: '2rem' }}>Learning Diary</h1>
          <p style={{ color: 'var(--text-muted)' }}>
            {diaries.length > 0
              ? `Your daily journal of ${diaries.length} days of learning.`
              : "Your daily learning journal."}
          </p>
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '4rem' }}>
          <div style={{
            width: '48px', height: '48px',
            border: '3px solid rgba(99,102,241,0.2)',
            borderTopColor: 'var(--primary-glow)', borderRadius: '50%',
            margin: '0 auto 1rem', animation: 'spin 1s linear infinite'
          }} />
          <p style={{ color: 'var(--text-muted)' }}>Opening diary...</p>
        </div>
      )}

      {error && !loading && (
        <div style={{
          padding: '1.5rem', borderRadius: '12px',
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
          color: '#fca5a5', textAlign: 'center'
        }}>
          {error}
        </div>
      )}

      {!loading && !error && diaries.length === 0 && (
        <div className="glass-card" style={{ padding: '4rem', textAlign: 'center' }}>
          <Database size={52} color="var(--text-muted)" style={{ margin: '0 auto 1.25rem' }} />
          <h2 style={{ marginBottom: '0.75rem', fontSize: '1.4rem' }}>No diary entries yet</h2>
          <p style={{ color: 'var(--text-muted)', maxWidth: '400px', margin: '0 auto' }}>
            Start learning! Your activities will automatically be summarized into a daily diary entry at the end of the day.
          </p>
        </div>
      )}

      {!loading && !error && diaries.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {diaries.map((diary) => {
            const dateObj = new Date(diary.date);
            const dateString = dateObj.toLocaleDateString(undefined, {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });

            return (
              <div 
                key={diary.id} 
                className="glass-card" 
                style={{ 
                  overflow: 'hidden', 
                  transition: 'transform 0.2s, background 0.2s',
                  cursor: 'pointer'
                }}
                onClick={() => navigate(`/diary/${diary.date}`)}
                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{
                  width: '100%',
                  padding: '1.5rem 2rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  color: 'var(--text-main)',
                }}>
                  <div>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 500, color: 'var(--text-main)' }}>
                      {dateString}
                    </h3>
                    <p style={{ color: 'var(--text-muted)', marginTop: '0.25rem', fontSize: '0.9rem' }}>
                      Read Diary Entry
                    </p>
                  </div>
                  <div>
                    <ChevronRight size={24} color="var(--primary-glow)" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
