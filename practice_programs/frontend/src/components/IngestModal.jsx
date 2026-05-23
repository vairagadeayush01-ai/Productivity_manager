import React, { useState } from 'react';
import { api } from '../api';
import { X, CheckCircle2, Video, PenLine, Link as LinkIcon, Upload, FileText } from 'lucide-react';

const TABS = [
  { id: 'youtube',  label: 'YouTube',  icon: Video    },
  { id: 'note',     label: 'Note',     icon: PenLine  },
  { id: 'webpage',  label: 'Article',  icon: LinkIcon },
  { id: 'paste',    label: 'Paste',    icon: FileText },
];

export default function IngestModal({ onClose }) {
  const [activeTab, setActiveTab] = useState('youtube');
  const [value, setValue]         = useState('');
  const [extra, setExtra]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [success, setSuccess]     = useState('');
  const [error, setError]         = useState('');

  const reset = () => { setValue(''); setExtra(''); setSuccess(''); setError(''); };

  const switchTab = (id) => { setActiveTab(id); reset(); };

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      let res;
      if (activeTab === 'youtube') {
        res = await api.ingestYoutube(value);
        setSuccess(`Saved: ${res.title || 'YouTube video'}`);
      } else if (activeTab === 'note') {
        res = await api.ingestLog(value);
        setSuccess('Note saved!');
      } else if (activeTab === 'webpage') {
        res = await api.ingestWebpage?.(value) || await api.ingestLog(`Read article: ${value}`);
        setSuccess('Article saved!');
      } else if (activeTab === 'paste') {
        res = await api.ingestPaste?.(value, extra) || await api.ingestLog(value);
        setSuccess('Text saved!');
      }
      setValue('');
      setExtra('');
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed — check backend logs.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Add learning entry">
        {/* Header */}
        <div style={{ marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>
            Add to your brain
          </h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            Log what you learned today
          </p>
        </div>

        <button className="modal__close" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>

        {/* Tabs */}
        <div className="modal-tabs">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={activeTab === id ? 'btn-primary btn-primary--sm' : 'btn-secondary btn-secondary--sm'}
              onClick={() => switchTab(id)}
              style={{ flex: 1 }}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {/* Success */}
        {success && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 14px', borderRadius: 'var(--radius-sm)',
            background: 'var(--success-light)',
            border: '1px solid rgba(16,185,129,0.2)',
            color: '#065F46', fontSize: '0.8125rem', marginBottom: '1rem',
          }}>
            <CheckCircle2 size={16} />
            {success}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="auth-error">{error}</div>
        )}

        {/* Form */}
        <form onSubmit={submit}>
          {activeTab === 'youtube' && (
            <div className="form-field">
              <label className="form-label">YouTube URL</label>
              <input
                type="url" required
                className="glass-input"
                placeholder="https://youtube.com/watch?v=..."
                value={value}
                onChange={e => setValue(e.target.value)}
                autoFocus
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-faint)', marginTop: '5px' }}>
                The transcript will be summarized by AI
              </p>
            </div>
          )}

          {activeTab === 'note' && (
            <div className="form-field">
              <label className="form-label">What did you learn?</label>
              <textarea
                required
                rows={4}
                className="glass-input"
                placeholder="Today I learned about binary trees and how..."
                value={value}
                onChange={e => setValue(e.target.value)}
                autoFocus
                style={{ resize: 'vertical' }}
              />
            </div>
          )}

          {activeTab === 'webpage' && (
            <div className="form-field">
              <label className="form-label">Article / Page URL</label>
              <input
                type="url" required
                className="glass-input"
                placeholder="https://..."
                value={value}
                onChange={e => setValue(e.target.value)}
                autoFocus
              />
            </div>
          )}

          {activeTab === 'paste' && (
            <>
              <div className="form-field">
                <label className="form-label">Title (optional)</label>
                <input
                  type="text"
                  className="glass-input"
                  placeholder="e.g. Notes on Dynamic Programming"
                  value={extra}
                  onChange={e => setExtra(e.target.value)}
                />
              </div>
              <div className="form-field">
                <label className="form-label">Text content</label>
                <textarea
                  required
                  rows={6}
                  className="glass-input"
                  placeholder="Paste your notes, articles, or any text..."
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  autoFocus
                  style={{ resize: 'vertical' }}
                />
              </div>
            </>
          )}

          <button
            type="submit"
            className="btn-primary"
            disabled={loading || !value.trim()}
            style={{ width: '100%', justifyContent: 'center', marginTop: '4px' }}
          >
            {loading ? 'Saving…' : 'Save'}
          </button>
        </form>
      </div>
    </div>
  );
}
