import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { History as HistoryIcon, ChevronRight, ChevronLeft } from 'lucide-react';

export default function History() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const limit = 20;

  useEffect(() => {
    async function loadHistory() {
      setLoading(true);
      try {
        const data = await api.getAllHistory(page * limit, limit);
        setEntries(data.entries);
        setTotal(data.total);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadHistory();
  }, [page]);

  return (
    <div className="animate-fade-in" style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ padding: '1rem', background: 'rgba(99, 102, 241, 0.2)', borderRadius: '12px' }}>
          <HistoryIcon color="var(--primary-glow)" size={28} />
        </div>
        <div>
          <h1 style={{ fontSize: '2rem' }}>All-Time History</h1>
          <p style={{ color: 'var(--text-muted)' }}>Chronological feed of everything you've learned.</p>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>Loading history...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {entries.map((entry, idx) => (
            <div key={entry.id || idx} className="glass-card" style={{ padding: '1.5rem', display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', textTransform: 'uppercase' }}>
                    {entry.source_type}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {new Date(entry.created_at).toLocaleDateString()}
                  </span>
                </div>
                <h3 style={{ marginBottom: '0.5rem', fontSize: '1.2rem' }}>{entry.title}</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '1rem', lineHeight: 1.6 }}>
                  {entry.summary || "Pending Summary..."}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {(entry.topics || []).map((t, i) => (
                    <span key={i} style={{ fontSize: '0.8rem', padding: '4px 10px', borderRadius: '12px', background: 'rgba(99, 102, 241, 0.15)', color: '#c7d2fe' }}>
                      #{String(t).trim()}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}

          {/* Pagination */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2rem' }}>
            <button 
              className="btn-secondary" 
              disabled={page === 0} 
              onClick={() => setPage(p => p - 1)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <ChevronLeft size={16} /> Previous
            </button>
            <span style={{ color: 'var(--text-muted)' }}>
              Page {page + 1} of {Math.ceil(total / limit)}
            </span>
            <button 
              className="btn-secondary" 
              disabled={(page + 1) * limit >= total} 
              onClick={() => setPage(p => p + 1)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
