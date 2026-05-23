import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';
import SourceBadge from '../components/SourceBadge';
import {
  History as HistoryIcon, BookOpen, Video, GitBranch,
  Code2, FileText, Calendar, Search, ChevronRight, SlidersHorizontal,
} from 'lucide-react';

const SOURCE_TABS = [
  { key: null,       label: 'All',      icon: HistoryIcon },
  { key: 'youtube',  label: 'YouTube',  icon: Video       },
  { key: 'github',   label: 'GitHub',   icon: GitBranch   },
  { key: 'leetcode', label: 'LeetCode', icon: Code2       },
  { key: 'manual',   label: 'Manual',   icon: FileText    },
];

const VIEWS = ['entries', 'diary'];
const PAGE_SIZE = 10;

function youtubeThumb(url) {
  if (!url) return null;
  const m = url.match(/[?&]v=([^&]+)/);
  const id = m ? m[1] : url.split('/').pop();
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
}

export default function History() {
  const navigate = useNavigate();

  /* ── view tabs ── */
  const [view,       setView]       = useState('entries');
  const [sourceTab,  setSourceTab]  = useState(null);
  const [page,       setPage]       = useState(1);
  const [startDate,  setStartDate]  = useState('');
  const [endDate,    setEndDate]    = useState('');
  const [showFilter, setShowFilter] = useState(false);

  /* ── data ── */
  const [entries,   setEntries]   = useState([]);
  const [total,     setTotal]     = useState(0);
  const [diaries,   setDiaries]   = useState([]);
  const [loading,   setLoading]   = useState(true);

  /* ── load entries ── */
  const loadEntries = useCallback(async () => {
    setLoading(true);
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
    } finally { setLoading(false); }
  }, [page, sourceTab, startDate, endDate]);

  /* ── load diaries ── */
  const loadDiaries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getDiaries();
      setDiaries(res.diaries || []);
    } catch (err) {
      console.error(err);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (view === 'entries') loadEntries();
    else loadDiaries();
  }, [view, loadEntries, loadDiaries]);

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

      {/* ── View toggle ── */}
      <div style={{
        display: 'flex', gap: '4px',
        background: 'var(--bg-surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        padding: '4px',
        marginBottom: 'var(--space-lg)',
        width: 'fit-content',
      }}>
        {VIEWS.map(v => (
          <button
            key={v}
            type="button"
            onClick={() => { setView(v); setLoading(true); }}
            style={{
              padding: '6px 16px',
              borderRadius: 'calc(var(--radius-sm) - 2px)',
              border: 'none',
              fontFamily: 'inherit',
              fontSize: '0.8125rem',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s',
              background: view === v ? 'var(--bg-surface)' : 'transparent',
              color: view === v ? 'var(--text-main)' : 'var(--text-muted)',
              boxShadow: view === v ? 'var(--shadow-xs)' : 'none',
            }}
          >
            {v === 'entries' ? 'Entries' : 'Diary'}
          </button>
        ))}
      </div>

      {/* ── ENTRIES VIEW ── */}
      {view === 'entries' && (
        <>
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
                {entries.map(entry => (
                  <article key={entry.id} className="entry-card">
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
                          {new Date(entry.created_at || entry.date).toLocaleDateString()}
                        </span>
                      </div>
                      <h3 className="entry-card__title">{entry.title}</h3>
                      {entry.summary && <p className="entry-card__summary">{entry.summary}</p>}
                      <div className="topic-tags">
                        {(entry.topics || []).map((t, i) => (
                          <span key={i} className="topic-tag">{String(t).trim()}</span>
                        ))}
                      </div>
                    </div>
                  </article>
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
        </>
      )}

      {/* ── DIARY VIEW ── */}
      {view === 'diary' && (
        <>
          {loading ? (
            <div className="loading-block"><div className="spinner" /><p>Loading diary…</p></div>
          ) : diaries.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No diary entries yet"
              description="Your AI-generated daily journal will appear here each evening."
            />
          ) : (
            <div className="entry-list">
              {diaries.map(diary => {
                const label = new Date(diary.date).toLocaleDateString('en-US', {
                  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                });
                return (
                  <button
                    key={diary.id}
                    type="button"
                    className="glass-card diary-row"
                    style={{ width: '100%', border: 'none', textAlign: 'left', color: 'inherit', cursor: 'pointer' }}
                    onClick={() => navigate(`/diary/${diary.date}`)}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--text-main)' }}>{label}</div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '2px' }}>Open journal entry</div>
                    </div>
                    <ChevronRight size={18} color="var(--text-faint)" />
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
