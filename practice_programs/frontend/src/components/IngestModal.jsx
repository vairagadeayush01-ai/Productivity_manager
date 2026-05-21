import React, { useState } from 'react';
import { api } from '../api';
import { X } from 'lucide-react';

export default function IngestModal({ onClose }) {
  const [type, setType] = useState('youtube');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (type === 'youtube') await api.ingestYoutube(url);
      if (type === 'log') await api.ingestLog(note);
      setSuccess(true);
      setTimeout(onClose, 2000);
    } catch (err) {
      alert("Error: " + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
    }}>
      <div className="glass-card animate-fade-in" style={{ width: '100%', maxWidth: '500px', padding: '2rem', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
          <X size={24} />
        </button>
        
        <h2 style={{ marginBottom: '1.5rem' }}>Add New Learning Entry</h2>

        {success ? (
          <div style={{ textAlign: 'center', padding: '2rem 0', color: '#22c55e' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✓</div>
            Successfully ingested and summarized!
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <button type="button" className={type === 'youtube' ? 'btn-primary' : 'btn-secondary'} onClick={() => setType('youtube')} style={{ flex: 1 }}>YouTube</button>
              <button type="button" className={type === 'log' ? 'btn-primary' : 'btn-secondary'} onClick={() => setType('log')} style={{ flex: 1 }}>Manual Note</button>
            </div>

            {type === 'youtube' && (
              <div style={{ marginBottom: '2rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>YouTube URL</label>
                <input type="url" required className="glass-input" placeholder="https://youtube.com/watch?v=..." value={url} onChange={e => setUrl(e.target.value)} />
              </div>
            )}

            {type === 'log' && (
              <div style={{ marginBottom: '2rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Your Notes</label>
                <textarea required className="glass-input" rows={5} placeholder="What did you learn today?" value={note} onChange={e => setNote(e.target.value)} style={{ resize: 'vertical' }} />
              </div>
            )}

            <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? 'Processing AI Summary...' : 'Ingest to Second Brain'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
