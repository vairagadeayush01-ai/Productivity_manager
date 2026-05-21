import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Search as SearchIcon, BrainCircuit, BookOpen, Zap } from 'lucide-react';

export default function SemanticSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [allTopics, setAllTopics] = useState([]);
  const [viewMode, setViewMode] = useState('search'); // 'search' or 'topics'

  // Load all topics on mount
  useEffect(() => {
    async function loadTopics() {
      try {
        const stats = await api.getStats();
        if (stats && stats.all_topics) {
          setAllTopics(stats.all_topics);
        }
      } catch (err) {
        console.warn('Could not load topics');
      }
    }
    loadTopics();
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    setLoading(true);
    setSearched(true);
    setViewMode('search');
    try {
      const data = await api.searchHistory(query);
      setResults(data.results || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const topicGroups = allTopics && allTopics.length > 0 
    ? Object.values(allTopics.reduce((acc, topic) => {
        const firstLetter = topic.charAt(0).toUpperCase();
        if (!acc[firstLetter]) acc[firstLetter] = [];
        acc[firstLetter].push(topic);
        return acc;
      }, {}))
    : [];

  return (
    <div className="animate-fade-in" style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '3rem', marginTop: '2rem' }}>
        <BrainCircuit size={48} color="var(--primary-glow)" style={{ margin: '0 auto 1rem' }} />
        <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>Query your Second Brain</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Search by meaning, not just keywords. E.g. "How does a hash map work under the hood?"</p>
        
        {/* View Mode Toggle */}
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <button
            onClick={() => setViewMode('search')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: viewMode === 'search' ? '2px solid var(--primary-glow)' : '1px solid rgba(255,255,255,0.1)',
              background: viewMode === 'search' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
              color: 'var(--text-main)',
              cursor: 'pointer',
              fontWeight: 500
            }}
          >
            <SearchIcon size={16} style={{ display: 'inline', marginRight: '6px' }} />
            Search
          </button>
          <button
            onClick={() => setViewMode('topics')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: viewMode === 'topics' ? '2px solid var(--primary-glow)' : '1px solid rgba(255,255,255,0.1)',
              background: viewMode === 'topics' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
              color: 'var(--text-main)',
              cursor: 'pointer',
              fontWeight: 500
            }}
          >
            <Zap size={16} style={{ display: 'inline', marginRight: '6px' }} />
            Topics ({allTopics.length})
          </button>
        </div>
      </div>

      {/* Search Mode */}
      {viewMode === 'search' && (
        <>
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
                No relevant notes found. Try a different search.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {results.map((res, idx) => (
                <div key={idx} className="glass-card animate-fade-in" style={{ padding: '1.5rem', animationDelay: `${idx * 0.1}s` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', alignItems: 'start' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--accent-color)', textTransform: 'uppercase', fontWeight: 600 }}>
                      {res.source_type}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', background: 'rgba(99,102,241,0.1)', padding: '4px 12px', borderRadius: '12px' }}>
                      {(res.score * 100).toFixed(0)}% match
                    </span>
                  </div>
                  <h3 style={{ marginBottom: '1rem', fontSize: '1.2rem' }}>{res.title}</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1.6 }}>
                    {res.document}
                  </p>
                  {res.url && (
                    <a href={res.url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: '1rem', color: 'var(--primary-glow)', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 500 }}>
                      View Original ➔
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Topics Mode */}
      {viewMode === 'topics' && (
        <div style={{ marginTop: '2rem' }}>
          <h2 style={{ marginBottom: '2rem', fontSize: '1.5rem' }}>Knowledge Network</h2>
          {allTopics.length === 0 ? (
            <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <BookOpen size={48} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
              <p>Start learning to build your knowledge network!</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1.5rem' }}>
              {allTopics.map((topic, idx) => (
                <div key={idx} className="glass-card" style={{ padding: '1.5rem', cursor: 'pointer', transition: 'all 0.3s', border: '1px solid rgba(99,102,241,0.2)' }} onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(99,102,241,0.1)';
                  e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)';
                }} onMouseLeave={(e) => {
                  e.currentTarget.style.background = '';
                  e.currentTarget.style.borderColor = 'rgba(99,102,241,0.2)';
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Zap size={18} color="var(--primary-glow)" />
                    <h3 style={{ fontSize: '1rem', margin: 0 }}>{topic}</h3>
                  </div>
                  <button 
                    onClick={() => {
                      setQuery(topic);
                      setViewMode('search');
                    }}
                    style={{
                      marginTop: '1rem',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      background: 'rgba(99,102,241,0.15)',
                      border: 'none',
                      color: 'var(--primary-glow)',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: 500
                    }}
                  >
                    Search Related
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
