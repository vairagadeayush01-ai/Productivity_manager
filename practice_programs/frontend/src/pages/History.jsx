import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import SourceBadge from '../components/SourceBadge';
import {
  History as HistoryIcon, BookOpen, Video, GitBranch,
  Code2, FileText, Calendar, Search, ChevronRight, SlidersHorizontal, X
} from 'lucide-react';

const SOURCE_TABS = [
  { key: null,       label: 'All',      icon: HistoryIcon },
  { key: 'youtube',  label: 'YouTube',  icon: Video       },
  { key: 'github',   label: 'GitHub',   icon: GitBranch   },
  { key: 'leetcode', label: 'LeetCode', icon: Code2       },
  { key: 'manual',   label: 'Manual',   icon: FileText    },
];

const PAGE_SIZE = 10;

function youtubeThumb(url) {
  if (!url) return null;
  const m = url.match(/[?&]v=([^&]+)/);
  const id = m ? m[1] : url.split('/').pop();
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
}

export default function History() {
  const navigate = useNavigate();

  const [page,       setPage]       = useState(1);
  const [startDate,  setStartDate]  = useState('');
  const [endDate,    setEndDate]    = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [sourceTab,  setSourceTab]  = useState(null);

  /* ── data ── */
  const [entries,   setEntries]   = useState([]);
  const [total,     setTotal]     = useState(0);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [selectedEntry, setSelectedEntry] = useState(null);

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm("Delete this entry forever?")) return;
    try {
      await api.deleteEntry(id);
      setEntries(entries.filter(en => en.id !== id));
      setTotal(t => t - 1);
      setSelectedEntry(null);
    } catch (err) {
      alert("Failed to delete entry.");
    }
  };

  /* ── load entries ── */
  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page, limit: PAGE_SIZE,
        source_type: sourceTab || undefined,
        start_date: startDate || undefined,
        end_date:   endDate   || undefined,
      };
      const res = await api.getHistory(params);
      setEntries(res.entries || res.results || []);
      setTotal(res.total || 0);
    } catch (err) {
      console.error(err);
      setError('Failed to load entries. Check your connection and try again.');
    } finally { setLoading(false); }
  }, [page, sourceTab, startDate, endDate]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadEntries();
  }, [loadEntries]);

  const resetFilters = () => {
    setSourceTab(null);
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="page animate-fade-in">
      <PageHeader
        icon={HistoryIcon}
        title="History"
        subtitle="Browse every entry you've logged and your daily journal."
      />

      {/* Error banner */}
      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', marginBottom: 'var(--space-md)',
          background: 'var(--danger-light)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '0.875rem',
          gap: '8px',
        }}>
          <span>⚠ {error}</span>
          <button
            type="button"
            className="btn-secondary btn-secondary--sm"
            onClick={loadEntries}
          >Retry</button>
        </div>
      )}


          {/* Source tabs + filter toggle */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {SOURCE_TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={String(key)}
                  type="button"
                  onClick={() => { setSourceTab(key); setPage(1); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    padding: '5px 12px',
                    borderRadius: 'var(--radius-full)',
                    border: `1px solid ${sourceTab === key ? 'var(--primary)' : 'var(--border)'}`,
                    background: sourceTab === key ? 'var(--primary-light)' : 'var(--bg-surface)',
                    color: sourceTab === key ? 'var(--primary)' : 'var(--text-muted)',
                    fontFamily: 'inherit', fontSize: '0.8125rem', fontWeight: 500,
                    cursor: 'pointer', transition: 'all 0.12s',
                  }}
                >
                  <Icon size={13} />
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn-icon"
              onClick={() => setShowFilter(f => !f)}
              title="Date filter"
              style={{ border: showFilter ? '1px solid var(--primary)' : undefined }}
            >
              <SlidersHorizontal size={15} color={showFilter ? 'var(--primary)' : undefined} />
            </button>
          </div>

          {/* Date filter row */}
          {showFilter && (
            <div style={{
              display: 'flex', gap: '8px', alignItems: 'center',
              padding: '12px 16px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: 'var(--space-md)',
              flexWrap: 'wrap',
            }}>
              <Calendar size={14} color="var(--text-faint)" />
              <input
                type="date"
                className="glass-input"
                value={startDate}
                onChange={e => { setStartDate(e.target.value); setPage(1); }}
                style={{ width: 'auto', fontSize: '0.8125rem' }}
              />
              <span style={{ color: 'var(--text-faint)', fontSize: '0.8125rem' }}>to</span>
              <input
                type="date"
                className="glass-input"
                value={endDate}
                onChange={e => { setEndDate(e.target.value); setPage(1); }}
                style={{ width: 'auto', fontSize: '0.8125rem' }}
              />
              {(startDate || endDate) && (
                <button type="button" className="link-btn" onClick={resetFilters}>Clear</button>
              )}
            </div>
          )}

          {loading ? (
            <div className="loading-block"><div className="spinner" /><p>Loading entries…</p></div>
          ) : entries.length === 0 ? (
            <EmptyState
              icon={HistoryIcon}
              title="No entries found"
              description="Try a different source filter or date range."
            />
          ) : (
            <>
              <p className="section-label" style={{ marginBottom: 'var(--space-sm)' }}>
                {total} {total === 1 ? 'entry' : 'entries'}
              </p>
              <div className="entry-list">
                {Object.entries(
                  entries.reduce((acc, entry) => {
                    const d = new Date(entry.created_at || entry.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                    if (!acc[d]) acc[d] = [];
                    acc[d].push(entry);
                    return acc;
                  }, {})
                ).map(([dateLabel, groupEntries]) => (
                  <div key={dateLabel} style={{ marginBottom: '32px' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '16px', paddingBottom: '8px', borderBottom: '1px solid var(--border)' }}>
                      {dateLabel}
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      {groupEntries.map(entry => (
                        <article 
                          key={entry.id} 
                          className="entry-card" 
                          onClick={() => setSelectedEntry(entry)}
                          style={{ cursor: 'pointer' }}
                        >
                          {entry.source_type === 'youtube' && (
                            <div className="entry-card__thumb">
                              {youtubeThumb(entry.source_url)
                                ? <img src={youtubeThumb(entry.source_url)} alt="" loading="lazy" />
                                : <Video size={24} style={{ margin: 'auto', display: 'block', paddingTop: '30%', color: 'var(--text-faint)' }} />
                              }
                            </div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                              <SourceBadge type={entry.source_type} />
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }}>
                                {new Date(entry.created_at || entry.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <h3 className="entry-card__title">{entry.title}</h3>
                            
                            {entry.summary && (
                              <p className="entry-card__summary" style={{ 
                                display: '-webkit-box',
                                WebkitLineClamp: '2',
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden'
                              }}>
                                {entry.summary}
                              </p>
                            )}

                            <div className="topic-tags" style={{ marginTop: '12px' }}>
                              {(entry.topics || []).map((t, i) => (
                                <span key={i} className="topic-tag">{String(t).trim()}</span>
                              ))}
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: 'var(--space-xl)' }}>
                  <button
                    type="button" className="btn-secondary btn-secondary--sm"
                    disabled={page === 1}
                    onClick={() => setPage(p => p - 1)}
                  >← Prev</button>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    Page {page} of {totalPages}
                  </span>
                  <button
                    type="button" className="btn-secondary btn-secondary--sm"
                    disabled={page === totalPages}
                    onClick={() => setPage(p => p + 1)}
                  >Next →</button>
                </div>
              )}
            </>
          )}

    {/* ── MODAL — rendered via Portal into document.body to escape animation stacking context ── */}
    {selectedEntry && createPortal(
      <div
        className="modal-overlay"
        onClick={() => setSelectedEntry(null)}
      >
        <div
          className="modal-dialog"
          onClick={e => e.stopPropagation()}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <SourceBadge type={selectedEntry.source_type} />
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-faint)' }}>
                {new Date(selectedEntry.created_at || selectedEntry.date).toLocaleDateString()}
              </span>
            </div>
            <button onClick={() => setSelectedEntry(null)} className="btn-icon">
              <X size={18} />
            </button>
          </div>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '16px' }}>{selectedEntry.title}</h2>
          
          <div style={{ 
            fontSize: '0.9375rem', lineHeight: 1.6, color: 'var(--text-main)', 
            whiteSpace: 'pre-wrap', marginBottom: '24px', padding: '16px',
            background: 'var(--bg-surface-2)', borderRadius: '8px',
            maxHeight: '300px', overflowY: 'auto', overscrollBehavior: 'contain',
          }}>
            {selectedEntry.summary || 'No summary available.'}
          </div>

          <div className="topic-tags" style={{ marginBottom: '24px' }}>
            {(selectedEntry.topics || []).map((t, i) => (
              <span key={i} className="topic-tag">{String(t).trim()}</span>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '16px', flexWrap: 'wrap', gap: '8px' }}>
            {selectedEntry.source_url ? (
              <a 
                href={selectedEntry.source_url} 
                target="_blank" 
                rel="noreferrer"
                className="btn-secondary btn-secondary--sm"
              >
                View source ↗
              </a>
            ) : <span />}
            <button 
              type="button" 
              className="btn-secondary btn-secondary--sm" 
              onClick={e => handleDelete(e, selectedEntry.id)}
              style={{ color: 'var(--danger)', borderColor: 'rgba(239,68,68,0.2)', marginLeft: 'auto' }}
            >
              <X size={14} style={{ marginRight: '5px' }} />
              Delete entry
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}
    </div>
  );
}
