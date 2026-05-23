import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import SourceBadge from '../components/SourceBadge';
import {
  Search as SearchIcon, BrainCircuit, Zap,
  Youtube, GitBranch, Code2, FileText, BookOpen,
} from 'lucide-react';

const SUGGESTIONS = [
  'What is dynamic programming?',
  'Explain binary search trees',
  'How does React reconciliation work?',
  'Sliding window technique',
  'Graph BFS vs DFS',
];

const SOURCE_FILTERS = [
  { key: null,       label: 'All',      icon: BookOpen },
  { key: 'youtube',  label: 'YouTube',  icon: Youtube  },
  { key: 'github',   label: 'GitHub',   icon: GitBranch },
  { key: 'leetcode', label: 'LeetCode', icon: Code2    },
  { key: 'manual',   label: 'Manual',   icon: FileText },
];

// Simple debounce hook
function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function SemanticSearch() {
  const [query, setQuery]           = useState('');
  const [sourceFilter, setSourceFilter] = useState(null);
  const [results, setResults]       = useState([]);
  const [loading, setLoading]       = useState(false);
  const [searched, setSearched]     = useState(false);
  const [stats, setStats]           = useState(null);
  const abortRef                    = useRef(null);

  // Debounce the query — fires after 600 ms of inactivity
  const debouncedQuery = useDebounce(query, 600);

  useEffect(() => {
    api.getStats().then(setStats).catch(() => {});
  }, []);

  // Auto-search whenever debounced query or source filter changes
  const runSearch = useCallback(async (term, srcFilter) => {
    if (!term.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    // Cancel any in-flight request
    if (abortRef.current) abortRef.current.abort?.();
    setLoading(true);
    setSearched(true);
    try {
      const data = await api.searchBrain(term, 8, srcFilter);
      setResults(data.results || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    runSearch(debouncedQuery, sourceFilter);
  }, [debouncedQuery, sourceFilter, runSearch]);

  const handleSuggestion = (s) => {
    setQuery(s);
    // debouncedQuery will update and trigger search
  };

  return (
    <div className="page page--narrow">
      <div className="search-hero">
        <div className="search-hero__icon">
          <BrainCircuit size={36} color="var(--primary-glow)" />
        </div>
        <h1 className="page-title">Second Brain</h1>
        <p className="page-subtitle" style={{ margin: '0 auto' }}>
          Search by meaning across everything you&apos;ve learned — not just keywords.
        </p>
        {stats && (
          <p style={{ color: 'var(--text-faint)', fontSize: '0.85rem', marginTop: '0.75rem' }}>
            {stats.total_entries} entries indexed
          </p>
        )}
      </div>

      {/* Search bar */}
      <form
        className="search-form"
        onSubmit={(e) => {
          e.preventDefault();
          runSearch(query, sourceFilter);
        }}
      >
        <div className="search-form__input-wrap" style={{ position: 'relative' }}>
          <SearchIcon size={18} className="search-form__icon" aria-hidden />
          <input
            type="search"
            className="glass-input"
            placeholder='Ask anything — e.g. "How does BFS work?"'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search your learning"
          />
          {loading && (
            <span
              className="spinner"
              style={{
                position: 'absolute', right: '1rem', top: '50%',
                transform: 'translateY(-50%)', width: '1rem', height: '1rem', margin: 0,
              }}
            />
          )}
        </div>
        <button
          type="submit"
          className="btn-primary"
          disabled={loading}
          style={{ height: '3.25rem', padding: '0 1.5rem' }}
        >
          <Zap size={16} /> Search
        </button>
      </form>

      {/* Source type filter chips */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {SOURCE_FILTERS.map(({ key, label, icon: Icon }) => (
          <button
            key={String(key)}
            type="button"
            onClick={() => setSourceFilter(key)}
            className={sourceFilter === key ? 'btn-primary' : 'btn-secondary'}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.4rem 0.9rem', fontSize: '0.82rem',
            }}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* Suggestions */}
      {!searched && (
        <div style={{ marginBottom: '2rem' }}>
          <p style={{
            color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase',
            letterSpacing: '0.08em', marginBottom: '0.75rem',
          }}>
            Try asking
          </p>
          <div className="chips-row">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="chip" onClick={() => handleSuggestion(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty result state */}
      {searched && !loading && results.length === 0 && (
        <EmptyState
          icon={BrainCircuit}
          title="No matches found"
          description="Try different wording, a different source filter, or add more content via the Add button in the navbar."
        />
      )}

      {/* Results */}
      <div className="entry-list">
        {results.map((res, idx) => {
          const score = res.relevance_score ?? 0;
          const pct = Math.round(score * 100);
          const fillColor =
            pct >= 70 ? 'var(--success)' : pct >= 40 ? 'var(--warning)' : 'var(--danger)';
          return (
            <article
              key={res.id || idx}
              className="result-card glass-card animate-fade-in"
              style={{ animationDelay: `${idx * 0.05}s` }}
            >
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'flex-start', marginBottom: '0.75rem',
                flexWrap: 'wrap', gap: '0.5rem',
              }}>
                <SourceBadge type={res.source_type} />
                <span style={{ fontSize: '0.8rem', color: fillColor, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span className="match-bar">
                    <span className="match-bar__fill" style={{ width: `${pct}%`, background: fillColor }} />
                  </span>
                  {pct}% match
                </span>
              </div>
              <h3 className="entry-card__title">{res.title}</h3>
              <p className="entry-card__summary">{res.summary}</p>
              <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                {res.date && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }}>
                    {new Date(res.date).toLocaleDateString()}
                  </span>
                )}
                <Link
                  to={`/quiz?topic=${encodeURIComponent(res.title)}`}
                  className="link-btn"
                  style={{ fontSize: '0.85rem' }}
                >
                  Quiz me on this →
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
