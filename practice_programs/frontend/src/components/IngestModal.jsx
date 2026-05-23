import React, { useState } from 'react';
import { api } from '../api';
import { X, CheckCircle2, Video, PenLine } from 'lucide-react';

export default function IngestModal({ onClose }) {
  const [type, setType] = useState('youtube');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (type === 'youtube') await api.ingestYoutube(url);
      if (type === 'log') await api.ingestLog(note);
      setSuccess(true);
      setTimeout(onClose, 1800);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Ingest failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="ingest-title">
      <div className="modal glass-card animate-fade-in">
        <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>

        <h2 id="ingest-title" className="page-title" style={{ fontSize: '1.25rem', marginBottom: '1.25rem' }}>
          Add learning entry
        </h2>

        {success ? (
          <div className="empty-state" style={{ padding: '2rem 0' }}>
            <CheckCircle2 size={48} color="var(--success)" style={{ margin: '0 auto 1rem' }} />
            <p style={{ color: 'var(--success)', fontWeight: 600 }}>Saved and summarized!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="modal-tabs">
              <button
                type="button"
                className={type === 'youtube' ? 'btn-primary' : 'btn-secondary'}
                onClick={() => setType('youtube')}
              >
                <Video size={16} /> YouTube
              </button>
              <button
                type="button"
                className={type === 'log' ? 'btn-primary' : 'btn-secondary'}
                onClick={() => setType('log')}
              >
                <PenLine size={16} /> Note
              </button>
            </div>

            {error && <div className="auth-error" style={{ marginBottom: '1rem' }}>{error}</div>}

            {type === 'youtube' && (
              <div className="form-field">
                <label className="form-label" htmlFor="yt-url">YouTube URL</label>
                <input
                  id="yt-url"
                  type="url"
                  required
                  className="glass-input"
                  placeholder="https://youtube.com/watch?v=..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
            )}

            {type === 'log' && (
              <div className="form-field">
                <label className="form-label" htmlFor="note">Your notes</label>
                <textarea
                  id="note"
                  required
                  className="glass-input"
                  rows={5}
                  placeholder="What did you learn today?"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  style={{ resize: 'vertical' }}
                />
              </div>
            )}

            <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Summarizing with AI…' : 'Save to Second Brain'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
