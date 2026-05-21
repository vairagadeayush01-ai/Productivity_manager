import React, { useState } from 'react';
import { api } from '../api';
import { Search as SearchIcon, BrainCircuit } from 'lucide-react';

export default function SemanticSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    setLoading(true);
    setSearched(true);
    try {
      const data = await api.searchHistory(query);
      setResults(data.results || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '3rem', marginTop: '2rem' }}>
        <BrainCircuit size={48} color="var(--primary-glow)" style={{ margin: '0 auto 1rem' }} />
        <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>Query your Second Brain</h1>
        <p style={{ color: 'var(--text-muted)' }}>Search by meaning, not just keywords. E.g. "How does a hash map work under the hood?"</p>
      </div>

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '1rem', marginBottom: '3rem' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <SearchIcon size={20} color="var(--text-muted)" style={{ position: 'absolute', left: '16px', top: '14px' }} />
          <input 
            type="text" 
            className="glass-input" 
            placeholder="Ask anything you've learned..."
            style={{ paddingLeft: '48px', paddingRight: '16px', height: '48px', fontSize: '1.1rem' }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary" style={{ height: '48px', padding: '0 32px' }} disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      <div>
        {searched && !loading && results.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
            No relevant notes found.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {results.map((res, idx) => (
            <div key={idx} className="glass-card animate-fade-in" style={{ padding: '1.5rem', animationDelay: `${idx * 0.1}s` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--accent-color)', textTransform: 'uppercase' }}>
                  {res.source_type}
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Match: {(res.score * 100).toFixed(0)}%
                </span>
              </div>
              <h3 style={{ marginBottom: '1rem', fontSize: '1.2rem' }}>{res.title}</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1.6 }}>
                {res.document}
              </p>
              {res.url && (
                <a href={res.url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: '1rem', color: 'var(--primary-glow)', textDecoration: 'none', fontSize: '0.9rem' }}>
                  View Original Source ➔
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
