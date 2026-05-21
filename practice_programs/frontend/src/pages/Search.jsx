import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Search as SearchIcon, BrainCircuit, Zap, BookOpen, Code2, Video } from 'lucide-react';

const SOURCE_ICONS = {
  youtube: { icon: <Video size={14} />, color: '#ef4444', label: 'YouTube' },
  leetcode: { icon: <Code2 size={14} />, color: '#f59e0b', label: 'LeetCode' },
  github: { icon: <Code2 size={14} />, color: '#10b981', label: 'GitHub' },
  manual: { icon: <BookOpen size={14} />, color: '#6366f1', label: 'Note' },
  paste: { icon: <BookOpen size={14} />, color: '#6366f1', label: 'Note' },
};

export default function SemanticSearch() {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [searched, setSearched] = useState(false);
  const [stats, setStats]       = useState(null);

  // Load stats on mount so we can show topic suggestions
  useEffect(() => {
    api.getStats().then(setStats).catch(() => {});
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const data = await api.searchBrain(query, 8);
      setResults(data.results || []);
    } catch (err) {
      console.error('Search error:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const quickSearch = (term) => {
    setQuery(term);
    setLoading(true);
    setSearched(true);
    api.searchBrain(term, 8)
      .then(data => setResults(data.results || []))
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  };

  const suggestions = [
    "What is dynamic programming?",
    "Explain binary search tree",
    "How does React reconciliation work?",
    "Sliding window technique",
    "Graph BFS vs DFS",
    "Time complexity analysis"
  ];

  return (
    <div className="animate-fade-in" style={{ maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '2.5rem', marginTop: '1rem' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: '72px', height: '72px', borderRadius: '20px',
          background: 'linear-gradient(135deg, rgba(99,102,241,0.3), rgba(168,85,247,0.3))',
          marginBottom: '1.25rem', border: '1px solid rgba(99,102,241,0.3)'
        }}>
          <BrainCircuit size={36} color="var(--primary-glow)" />
        </div>
        <h1 style={{ fontSize: '2.2rem', marginBottom: '0.5rem' }}>Second Brain</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>
          Search everything you've ever learned - by meaning, not keywords.
        </p>
        {stats && (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
            <span style={{ color: 'var(--primary-glow)', fontWeight: 600 }}>{stats.total_entries}</span> entries across{' '}
            <span style={{ color: '#22c55e', fontWeight: 600 }}>{stats.youtube}</span> videos,{' '}
            <span style={{ color: '#f59e0b', fontWeight: 600 }}>{stats.leetcode}</span> LeetCode,{' '}
            <span style={{ color: '#10b981', fontWeight: 600 }}>{stats.github}</span> GitHub commits
          </p>
        )}
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <SearchIcon size={18} color="var(--text-muted)" style={{
            position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)'
          }} />
          <input
            type="text"
            className="glass-input"
            placeholder='Ask anything you learned... e.g. "How does binary search work?"'
            style={{ paddingLeft: '48px', paddingRight: '16px', height: '52px', fontSize: '1rem' }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>
        <button
          type="submit"
          className="btn-primary"
          style={{ height: '52px', padding: '0 28px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          disabled={loading}
        >
          {loading ? (
            <>
              <span className="animate-spin" style={{ display: 'inline-block', width: '16px', height: '16px',
                border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%' }} />
              Searching...
            </>
          ) : (
            <><Zap size={16} /> Search</>
          )}
        </button>
      </form>

      {/* Quick suggestions (shown before first search) */}
      {!searched && (
        <div style={{ marginBottom: '2.5rem' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Try asking...
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => quickSearch(s)}
                style={{
                  background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
                  borderRadius: '20px', padding: '6px 14px', color: '#c7d2fe',
                  fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s'
                }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(99,102,241,0.18)'}
                onMouseOut={e => e.currentTarget.style.background = 'rgba(99,102,241,0.08)'}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      <div>
        {searched && !loading && results.length === 0 && (
          <div style={{
            textAlign: 'center', color: 'var(--text-muted)', padding: '3rem',
            background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.1)'
          }}>
            <BrainCircuit size={40} color="var(--text-muted)" style={{ margin: '0 auto 1rem' }} />
            <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No relevant notes found.</p>
            <p style={{ fontSize: '0.9rem' }}>
              Try adding more content - watch educational videos, solve LeetCode problems, or{' '}
              <button onClick={() => {}} style={{ background: 'none', border: 'none', color: 'var(--primary-glow)', cursor: 'pointer', textDecoration: 'underline' }}>
                add a manual note
              </button>.
            </p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {results.map((res, idx) => {
            const src   = SOURCE_ICONS[res.source_type] || SOURCE_ICONS.manual;
            const score = res.relevance_score ?? res.score ?? 0;
            return (
              <div
                key={idx}
                className="glass-card animate-fade-in"
                style={{ padding: '1.5rem', animationDelay: `${idx * 0.06}s` }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                      fontSize: '0.75rem', padding: '3px 10px', borderRadius: '20px',
                      background: `${src.color}22`, color: src.color, fontWeight: 500, textTransform: 'uppercase'
                    }}>
                      {src.icon}{src.label}
                    </span>
                    {res.topics && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {String(res.topics).split(',').slice(0, 2).map(t => `#${t.trim()}`).join(' ')}
                      </span>
                    )}
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    fontSize: '0.8rem', color: score >= 0.7 ? '#22c55e' : score >= 0.4 ? '#f59e0b' : 'var(--text-muted)'
                  }}>
                    <span style={{ width: '48px', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.1)', display: 'inline-block', overflow: 'hidden' }}>
                      <span style={{ display: 'block', height: '100%', width: `${Math.round(score * 100)}%`, background: score >= 0.7 ? '#22c55e' : score >= 0.4 ? '#f59e0b' : '#ef4444', borderRadius: '2px' }} />
                    </span>
                    {Math.round(score * 100)}% match
                  </div>
                </div>

                <h3 style={{ marginBottom: '0.75rem', fontSize: '1.1rem', fontWeight: 600 }}>{res.title}</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.92rem', lineHeight: 1.65 }}>
                  {res.summary || res.document}
                </p>

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                  {res.date && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      ? {new Date(res.date).toLocaleDateString()}
                    </span>
                  )}
                  <Link
                    to={`/quiz?topic=${encodeURIComponent(res.title)}`}
                    style={{ fontSize: '0.78rem', color: 'var(--primary-glow)', textDecoration: 'none', fontWeight: 500 }}
                  >
                    Quiz me on this &rarr;
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
