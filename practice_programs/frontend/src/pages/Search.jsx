import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import SourceBadge from '../components/SourceBadge';
import {
  Search as SearchIcon, BrainCircuit, Sparkles,
  Video, GitBranch, Code2, FileText, BookOpen,
} from 'lucide-react';

const SOURCE_FILTERS = [
  { key: null,       label: 'All',      icon: BookOpen  },
  { key: 'youtube',  label: 'YouTube',  icon: Video     },
  { key: 'github',   label: 'GitHub',   icon: GitBranch },
  { key: 'leetcode', label: 'LeetCode', icon: Code2     },
  { key: 'manual',   label: 'Manual',   icon: FileText  },
];


function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function Search() {
  const [query,      setQuery]      = useState('');
  const [source,     setSource]     = useState(null);
  const [results,    setResults]    = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [searched,   setSearched]   = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => {
    api.getStats().then(stats => {
      if (stats.top_topics && stats.top_topics.length > 0) {
        setSuggestions(stats.top_topics.slice(0, 6));
      }
    }).catch(console.error);
  }, []);

  const debouncedQuery = useDebounce(query, 350);

  const runSearch = useCallback(async (q, src) => {
    const trimmed = q.trim();
    if (!trimmed) { setResults([]); setSearched(false); return; }
    setLoading(true);
    setSearched(true);
    try {
      const res = await api.search(trimmed, src);
      setResults(res.results || []);
    } catch (err) {
      console.error(err);
      setResults([]);
    } finally { setLoading(false); }
  }, []);

  // Auto-search on debounced input
  useEffect(() => {
    if (debouncedQuery.trim().length >= 2) {
      runSearch(debouncedQuery, source);
    } else if (!debouncedQuery.trim()) {
      setResults([]);
      setSearched(false);
    }
  }, [debouncedQuery, source, runSearch]);

  const handleSubmit = (e) => {
    e.preventDefault();
    runSearch(query, source);
  };

  return (
    <div className="page animate-fade-in page--narrow">
      {/* ── Hero ── */}
      <div className="search-hero">
        <div className="search-hero__icon">
          <BrainCircuit size={24} />
        </div>
        <h1 className="page-title" style={{ marginBottom: '6px' }}>Search your knowledge</h1>
        <p className="page-subtitle">
          Ask anything you've learned — AI retrieves the most relevant entries.
        </p>
      </div>

      {/* ── Search bar ── */}
      <form className="search-form" onSubmit={handleSubmit}>
        <div className="search-form__input-wrap">
          <SearchIcon size={16} className="search-form__icon" />
          <input
            ref={inputRef}
            type="search"
            className="glass-input"
            placeholder="e.g. how does binary search work?"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
            autoComplete="off"
          />
        </div>
        <button type="submit" className="btn-primary" disabled={!query.trim() || loading}>
          {loading ? '…' : <Sparkles size={15} />}
          Search
        </button>
      </form>

      {/* ── Source filter pills ── */}
      <div className="chips-row" style={{ marginBottom: 'var(--space-xl)' }}>
        {SOURCE_FILTERS.map(({ key, label, icon: Icon }) => (
          <button
            key={String(key)}
            type="button"
            className="chip"
            onClick={() => { setSource(key); if (debouncedQuery.trim()) runSearch(debouncedQuery, key); }}
            style={{
              background: source === key ? 'var(--primary-light)' : undefined,
              borderColor: source === key ? 'rgba(99,102,241,0.3)' : undefined,
              color: source === key ? 'var(--primary)' : undefined,
              display: 'flex', alignItems: 'center', gap: '5px',
            }}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Suggestion pills (before search) ── */}
      {!searched && suggestions.length > 0 && (
        <div>
          <p className="section-label" style={{ marginBottom: '10px' }}>Try searching for</p>
          <div className="chips-row">
            {suggestions.map(s => (
              <button
                key={s}
                type="button"
                className="chip"
                onClick={() => { setQuery(s); runSearch(s, source); }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div className="loading-block">
          <div className="spinner" />
          <p>Searching your knowledge base…</p>
        </div>
      )}

      {/* ── Results ── */}
      {!loading && searched && results.length === 0 && (
        <EmptyState
          icon={SearchIcon}
          title="No results found"
          description={`Nothing matched "${query}". Try different keywords or remove the source filter.`}
        />
      )}

      {!loading && results.length > 0 && (
        <>
          <p className="section-label" style={{ marginBottom: 'var(--space-sm)' }}>
            {results.length} result{results.length !== 1 ? 's' : ''} for "{query}"
          </p>
          <div className="entry-list">
            {results.map((r, i) => {
              const score = Math.round((r.score || 0) * 100);
              return (
                <article key={r.id || i} className="entry-card result-card">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <SourceBadge type={r.source_type} />
                      {score > 0 && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', color: 'var(--text-faint)' }}>
                          <span
                            className="match-bar"
                            title={`${score}% match`}
                          >
                            <span
                              className="match-bar__fill"
                              style={{
                                width: `${score}%`,
                                background: score > 70 ? 'var(--success)' : score > 40 ? 'var(--warning)' : 'var(--text-faint)',
                              }}
                            />
                          </span>
                          {score}% match
                        </span>
                      )}
                    </div>
                    <h3 className="entry-card__title">{r.title}</h3>
                    {r.summary && <p className="entry-card__summary">{r.summary}</p>}
                    <div className="topic-tags">
                      {(r.topics || []).map((t, j) => (
                        <span key={j} className="topic-tag">{String(t).trim()}</span>
                      ))}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
