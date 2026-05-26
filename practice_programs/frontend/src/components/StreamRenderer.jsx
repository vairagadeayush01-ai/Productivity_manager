/**
 * StreamRenderer.jsx — Progressive section-by-section report renderer.
 *
 * Renders the four report sections as they arrive from the SSE stream.
 * Each section animates in independently as its data becomes available.
 *
 * Props:
 *   sections   { overall, strong_areas, needs_attention, next_week }
 *   status     "idle"|"loading"|"streaming"|"done"|"error"
 *   error      string|null
 *   stats      object|null (activity counts)
 *   date       string (report date)
 *   retry      fn — callback to re-trigger the stream
 *
 * Features:
 *   - Each section card animates in (slideUp) the moment content arrives
 *   - Section cards show a pulsing skeleton while their section is still pending
 *   - Overall section shows a typewriter-cursor effect while streaming
 *   - Partial content is shown if the stream errors mid-way
 *   - Retry button on error states
 */
import React from 'react';
import {
  Sparkles, TrendingUp, AlertTriangle,
  ArrowRight, RefreshCw, Zap,
} from 'lucide-react';

// ─── Section config ───────────────────────────────────────────────────────────
const SECTIONS = [
  {
    key: 'overall',
    label: 'This week',
    icon: Sparkles,
    iconColor: '#6366F1',
    iconBg: 'rgba(99,102,241,0.12)',
    accentColor: '#6366F1',
  },
  {
    key: 'strong_areas',
    label: 'Strong areas',
    icon: TrendingUp,
    iconColor: '#10B981',
    iconBg: 'rgba(16,185,129,0.12)',
    accentColor: '#10B981',
  },
  {
    key: 'needs_attention',
    label: 'Needs attention',
    icon: AlertTriangle,
    iconColor: '#F59E0B',
    iconBg: 'rgba(245,158,11,0.12)',
    accentColor: '#F59E0B',
  },
  {
    key: 'next_week',
    label: 'Next week',
    icon: ArrowRight,
    iconColor: '#8B5CF6',
    iconBg: 'rgba(139,92,246,0.12)',
    accentColor: '#8B5CF6',
  },
];

// ─── Individual section card ──────────────────────────────────────────────────
function SectionCard({ config, content, isStreaming, isLast }) {
  const { label, icon: Icon, iconColor, iconBg, accentColor } = config;
  const hasContent = Boolean(content);

  return (
    <section
      className={`stream-section${hasContent ? ' stream-section--visible' : ''}`}
      style={{ '--section-accent': accentColor }}
      aria-busy={!hasContent}
      aria-label={label}
    >
      <div className="stream-section__header">
        <div className="stream-section__icon" style={{ background: iconBg, color: iconColor }}>
          <Icon size={16} aria-hidden />
        </div>
        <h3 className="stream-section__label">{label}</h3>

        {/* Streaming indicator — pulsing dot while this section is being written */}
        {isStreaming && !hasContent && (
          <span className="stream-section__pending" aria-label="Generating…">
            <span className="stream-dot" />
            <span className="stream-dot" />
            <span className="stream-dot" />
          </span>
        )}
      </div>

      {hasContent ? (
        <p className="stream-section__content">
          {content}
          {/* Cursor blink at end of currently-streaming section */}
          {isStreaming && isLast && <span className="stream-cursor" aria-hidden />}
        </p>
      ) : (
        /* Skeleton placeholder while waiting */
        <div className="stream-section__skeleton" aria-hidden>
          <div className="skeleton-line skeleton-line--long" />
          <div className="skeleton-line skeleton-line--medium" />
          <div className="skeleton-line skeleton-line--short" />
        </div>
      )}
    </section>
  );
}

// ─── Main renderer ────────────────────────────────────────────────────────────
export default function StreamRenderer({ sections, status, error, stats, date, retry }) {
  const isStreaming = status === 'loading' || status === 'streaming';
  const isDone      = status === 'done';
  const isError     = status === 'error';

  // Which section is currently "last with content" — gets the cursor
  const populatedSections = SECTIONS.filter(s => sections[s.key]);
  const lastPopulated = populatedSections[populatedSections.length - 1]?.key;

  return (
    <div className="stream-renderer" aria-live="polite" aria-label="AI weekly report">

      {/* ── Status header ─────────────────────────────────────────────────── */}
      <div className="stream-status-bar">
        {isStreaming && (
          <div className="stream-status-bar__generating">
            <Zap size={14} className="stream-status-bar__zap" aria-hidden />
            <span>Generating your report…</span>
            {stats && (
              <span className="stream-status-bar__hint">
                {stats.total_entries} entries · {stats.active_days}/7 days active
              </span>
            )}
          </div>
        )}

        {isDone && date && (
          <div className="stream-status-bar__done">
            <span className="stream-status-bar__check">✓</span>
            <span>Report for week ending <strong>{date}</strong></span>
          </div>
        )}

        {/* Recoverable error — show inline, don't block content */}
        {error && !isError && (
          <div className="stream-status-bar__warn" role="alert">
            ⚠ {error}
          </div>
        )}
      </div>

      {/* ── Fatal error state ──────────────────────────────────────────────── */}
      {isError && (
        <div className="stream-error-state" role="alert">
          <div className="stream-error-state__icon">⚡</div>
          <h3 className="stream-error-state__title">Couldn't generate your report</h3>
          <p className="stream-error-state__msg">{error || 'An unexpected error occurred.'}</p>
          <button
            type="button"
            className="btn-primary"
            onClick={retry}
          >
            <RefreshCw size={14} aria-hidden />
            Try again
          </button>
        </div>
      )}

      {/* ── Section cards ──────────────────────────────────────────────────── */}
      {!isError && (
        <div className="stream-sections" role="list">
          {SECTIONS.map((config) => (
            <SectionCard
              key={config.key}
              config={config}
              content={sections[config.key]}
              isStreaming={isStreaming}
              isLast={config.key === lastPopulated && isStreaming}
            />
          ))}
        </div>
      )}

      {/* ── Retry button (done state — for manual refresh) ────────────────── */}
      {isDone && (
        <div className="stream-renderer__footer">
          <button
            type="button"
            className="btn-secondary btn-secondary--sm"
            onClick={retry}
          >
            <RefreshCw size={13} aria-hidden />
            Regenerate report
          </button>
        </div>
      )}
    </div>
  );
}
