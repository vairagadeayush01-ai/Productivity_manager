import React, { useState } from 'react';
import Modal from './ui/Modal';
import { api } from '../api';
import { CheckCircle2, Video, PenLine, Link as LinkIcon, FileText } from 'lucide-react';

const TABS = [
  { id: 'youtube',  label: 'YouTube',  icon: Video    },
  { id: 'note',     label: 'Note',     icon: PenLine  },
  { id: 'webpage',  label: 'Article',  icon: LinkIcon },
  { id: 'paste',    label: 'Paste',    icon: FileText },
];

export default function IngestModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('youtube');
  const [value, setValue]         = useState('');
  const [extra, setExtra]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [success, setSuccess]     = useState('');
  const [error, setError]         = useState('');

  const reset = () => { setValue(''); setExtra(''); setSuccess(''); setError(''); };
  const switchTab = (id) => { setActiveTab(id); reset(); };

  const handleClose = () => {
    reset();
    onClose();
  };

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
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      maxWidth="28rem"
    >
      {/* Header */}
      <div className="ingest-modal__header">
        <h2 className="ingest-modal__title">Add to your brain</h2>
        <p className="ingest-modal__subtitle">Log what you learned today</p>
      </div>

      {/* Tabs */}
      <div className="modal-tabs" role="tablist" aria-label="Content type">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={activeTab === id}
            aria-controls={`panel-${id}`}
            className={activeTab === id ? 'btn-primary btn-primary--sm' : 'btn-secondary btn-secondary--sm'}
            onClick={() => switchTab(id)}
            style={{ flex: 1 }}
          >
            <Icon size={13} aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {/* Success banner */}
      {success && (
        <div className="ingest-modal__success" role="status" aria-live="polite">
          <CheckCircle2 size={16} aria-hidden />
          {success}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="auth-error" role="alert" aria-live="assertive">
          {error}
        </div>
      )}

      {/* Form */}
      <form
        onSubmit={submit}
        role="tabpanel"
        id={`panel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
      >
        {activeTab === 'youtube' && (
          <div className="form-field">
            <label className="form-label" htmlFor="ingest-youtube-url">YouTube URL</label>
            <input
              id="ingest-youtube-url"
              type="url"
              required
              className="glass-input"
              placeholder="https://youtube.com/watch?v=..."
              value={value}
              onChange={e => setValue(e.target.value)}
              autoFocus
            />
            <p className="ingest-modal__hint">The transcript will be summarized by AI</p>
          </div>
        )}

        {activeTab === 'note' && (
          <div className="form-field">
            <label className="form-label" htmlFor="ingest-note-text">What did you learn?</label>
            <textarea
              id="ingest-note-text"
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
            <label className="form-label" htmlFor="ingest-article-url">Article / Page URL</label>
            <input
              id="ingest-article-url"
              type="url"
              required
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
              <label className="form-label" htmlFor="ingest-paste-title">Title (optional)</label>
              <input
                id="ingest-paste-title"
                type="text"
                className="glass-input"
                placeholder="e.g. Notes on Dynamic Programming"
                value={extra}
                onChange={e => setExtra(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="ingest-paste-text">Text content</label>
              <textarea
                id="ingest-paste-text"
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
          id="ingest-modal-submit"
          className="btn-primary"
          disabled={loading || !value.trim()}
          style={{ width: '100%', justifyContent: 'center', marginTop: '4px' }}
        >
          {loading ? 'Saving…' : 'Save'}
        </button>
      </form>
    </Modal>
  );
}
