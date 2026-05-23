import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import SourceBadge from '../components/SourceBadge';
import {
  BookOpen, Github, Code2, Youtube, FileText, ChevronRight,
  Calendar, Search, SlidersHorizontal
} from 'lucide-react';

const SOURCE_TABS = [
  { key: null,       label: 'All',      icon: BookOpen },
  { key: 'youtube',  label: 'YouTube',  icon: Youtube  },
  { key: 'github',   label: 'GitHub',   icon: Github   },
  { key: 'leetcode', label: 'LeetCode', icon: Code2    },
  { key: 'manual',   label: 'Manual',   icon: FileText },
];

function formatDate(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

function EntryCard({ entry, onClick }) {
  const topics = Array.isArray(entry.topics)
    ? entry.topics.slice(0, 3)
    : (entry.topics || '').split(', ').filter(Boolean).slice(0, 3);

  return (
    <button
      type="button"
      className="glass-card entry-card"
      onClick={onClick}
      style={{
        width: '100%', border: 'none', textAlign: 'left',
        color: 'inherit', cursor: 'pointer', padding: '1.25rem 1.5rem',
        display: 'flex', alignItems: 'flex-start', gap: '1rem',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
          <SourceBadge type={entry.source_type} />
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <Calendar size={11} /> {formatDate(entry.created_at)}
          </span>
        </div>
        <h3 style={{
          fontSize: '0.97rem', fontWeight: 600, margin: '0 0 0.35rem',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {entry.title || 'Untitled'}
        </h3>
        {entry.summary && (
          <p style={{
            fontSize: '0.83rem', color: 'var(--text-muted)', margin: 0,
            display: '-webkit-box', WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.55,
          }}>
            {entry.summary}
          </p>
        )}
        {topics.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.6rem' }}>
            {topics.map((t, i) => (
              <span key={i} style={{
                fontSize: '0.7rem', padding: '2px 8px', borderRadius: '20px',
                background: 'rgba(99,102,241,0.12)', color: '#c7d2fe',
                border: '1px solid rgba(99,102,241,0.2)',
              }}>
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
      <ChevronRight size={18} color="var(--primary-glow)" style={{ flexShrink: 0, marginTop: '2px' }} aria-hidden />
    </button>
  );
}

export default function History() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab]     = useState(null);   // null = All
  const [startDate, setStartDate]     = useState('');
  const [endDate, setEndDate]         = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [entries, setEntries] = useState([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const LIMIT = 20;

  const load = useCallback(
    async (tab, start, end, pageNum) => {
      setLoading(true);
      setError(null);
      try {
        const data = await api.getAllHistory({
          skip:        pageNum * LIMIT,
          limit:       LIMIT,
          source_type: tab || null,
          start_date:  start || null,
          end_date:    end   || null,
        });
        setEntries(data.entries || []);
        setTotal(data.total || 0);
      } catch {
        setError('Failed to load history. Is the backend running?');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    setPage(0);
    load(activeTab, startDate, endDate, 0);
  }, [activeTab, startDate, endDate, load]);

  const handlePageChange = (newPage) => {
    setPage(newPage);
    load(activeTab, startDate, endDate, newPage);
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="page page--narrow">
      <PageHeader
        icon={BookOpen}
        title="Learning history"
        subtitle={total ? `${total} entr${total === 1 ? 'y' : 'ies'} logged` : 'All your learning entries'}
      />

      {/* Source tabs */}
      <div style={{
        display: 'flex', gap: '0.5rem', flexWrap: 'wrap',
        marginBottom: '1rem', alignItems: 'center',
      }}>
        {SOURCE_TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={String(key)}
            type="button"
            onClick={() => setActiveTab(key)}
            className={activeTab === key ? 'btn-primary' : 'btn-secondary'}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.45rem 1rem', fontSize: '0.85rem',
            }}
          >
            <Icon size={14} /> {label}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setShowFilters(f => !f)}
          className={showFilters ? 'btn-primary' : 'btn-secondary'}
          style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center',
            gap: '0.4rem', padding: '0.45rem 1rem', fontSize: '0.85rem',
          }}
          aria-label="Toggle date filters"
        >
          <SlidersHorizontal size={14} /> Filters
        </button>
      </div>

      {/* Date range filters */}
      {showFilters && (
        <div className="glass-card animate-fade-in" style={{
          padding: '1rem 1.25rem', marginBottom: '1rem',
          display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end',
        }}>
          <div style={{ flex: 1, minWidth: '140px' }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>
              From
            </label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              style={{
                width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px', padding: '0.45rem 0.75rem', color: 'var(--text-main)', fontSize: '0.88rem',
              }}
            />
          </div>
          <div style={{ flex: 1, minWidth: '140px' }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.3rem' }}>
              To
            </label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              style={{
                width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px', padding: '0.45rem 0.75rem', color: 'var(--text-main)', fontSize: '0.88rem',
              }}
            />
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => { setStartDate(''); setEndDate(''); }}
            style={{ fontSize: '0.82rem', padding: '0.45rem 1rem' }}
          >
            Clear
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="loading-block">
          <div className="spinner" />
          <p style={{ color: 'var(--text-muted)' }}>Loading entries…</p>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="auth-error" style={{ textAlign: 'center' }}>{error}</div>
      )}

      {/* Empty state */}
      {!loading && !error && entries.length === 0 && (
        <EmptyState
          icon={Search}
          title="No entries found"
          description={
            activeTab
              ? `No ${activeTab} entries match your filters. Try a different source or date range.`
              : 'Start learning — add YouTube videos, LeetCode problems, or manual notes.'
          }
        />
      )}

      {/* Entry list */}
      {!loading && !error && entries.length > 0 && (
        <>
          <div className="entry-list" style={{ gap: '0.6rem' }}>
            {entries.map(entry => (
              <EntryCard
                key={entry.id}
                entry={entry}
                onClick={() => {
                  if (entry.source_url) window.open(entry.source_url, '_blank', 'noopener');
                }}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{
              display: 'flex', justifyContent: 'center', alignItems: 'center',
              gap: '0.75rem', marginTop: '1.5rem',
            }}>
              <button
                className="btn-secondary"
                disabled={page === 0}
                onClick={() => handlePageChange(page - 1)}
                style={{ opacity: page === 0 ? 0.4 : 1, fontSize: '0.85rem', padding: '0.5rem 1.1rem' }}
              >
                ← Prev
              </button>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {page + 1} / {totalPages}
              </span>
              <button
                className="btn-secondary"
                disabled={page >= totalPages - 1}
                onClick={() => handlePageChange(page + 1)}
                style={{ opacity: page >= totalPages - 1 ? 0.4 : 1, fontSize: '0.85rem', padding: '0.5rem 1.1rem' }}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
