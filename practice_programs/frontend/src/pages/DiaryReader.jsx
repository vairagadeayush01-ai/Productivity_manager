import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api';
import { ArrowLeft, BookOpen, Clock, Brain, Activity, Calendar, Quote, Tag, Terminal, PlayCircle } from 'lucide-react';

export default function DiaryReader() {
  const { date } = useParams();
  const [diary, setDiary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadDiary() {
      try {
        setLoading(true);
        const data = await api.getDiary(date);
        setDiary(data);
      } catch (err) {
        console.error(err);
        setError('Failed to load diary entry.');
      } finally {
        setLoading(false);
      }
    }
    loadDiary();
  }, [date]);

  const formattedDate = date ? new Date(date).toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  }) : '';

  if (loading) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{
          width: '48px', height: '48px',
          border: '3px solid rgba(99,102,241,0.2)',
          borderTopColor: 'var(--primary-glow)', borderRadius: '50%',
          margin: '0 auto 1rem', animation: 'spin 1s linear infinite'
        }} />
        Opening diary...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', color: '#fca5a5' }}>
        <p>{error}</p>
        <Link to="/history" style={{ color: 'var(--accent-color)', marginTop: '1rem', display: 'inline-block' }}>
          &larr; Back to History
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-in diary-container">
      
      {/* Elegant Back Button */}
      <Link to="/history" className="elegant-back-btn">
        <ArrowLeft size={16} /> Back to History
      </Link>

      <div className="diary-layout-grid">
        
        {/* LEFT PANEL */}
        <aside className="side-panel left-panel">
          <div className="panel-section">
            <h3 className="panel-title">Daily Overview</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'rgba(255,255,255,0.6)' }}><Clock size={16} /> Study Hours</span>
                <span style={{ fontWeight: 600 }}>4.5 hrs</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'rgba(255,255,255,0.6)' }}><Brain size={16} /> Focus Score</span>
                <span style={{ fontWeight: 600, color: '#a855f7' }}>88%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'rgba(255,255,255,0.6)' }}><Activity size={16} /> Mood</span>
                <span style={{ fontWeight: 600, color: '#38bdf8' }}>Productive</span>
              </div>
            </div>
          </div>
          
          <div className="panel-section">
            <h3 className="panel-title">Timeline</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', fontSize: '0.9rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.8rem' }}>
                <Terminal size={14} style={{ marginTop: '3px', color: 'rgba(255,255,255,0.4)' }} />
                <div>
                  <div style={{ color: 'rgba(255,255,255,0.8)' }}>Solved 6 LeetCode Problems</div>
                  <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>Morning Session</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.8rem' }}>
                <PlayCircle size={14} style={{ marginTop: '3px', color: 'rgba(255,255,255,0.4)' }} />
                <div>
                  <div style={{ color: 'rgba(255,255,255,0.8)' }}>System Design Video</div>
                  <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>Afternoon Session</div>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* CENTER PANEL - NOTEBOOK */}
        <div className="premium-paper">
          <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
            <h1 className="premium-date">
              {formattedDate}
            </h1>
            <div className="decorative-divider"></div>
          </div>

          <div className="diary-content">
            {diary?.summary ? (
              diary.summary.split('\n').map((paragraph, index) => {
                if (!paragraph.trim()) return null;
                
                let formattedText = paragraph;
                const keywordsToHighlight = ['LeetCode', 'GitHub', 'YouTube', 'algorithms', 'dynamic programming', 'hash tables', 'two-pointer', 'sliding window', 'Python', 'FreeCodeCamp'];
                keywordsToHighlight.forEach(kw => {
                  const regex = new RegExp(`(${kw})`, 'gi');
                  formattedText = formattedText.replace(regex, '<strong>$1</strong>');
                });

                return (
                  <p 
                    key={index}
                    dangerouslySetInnerHTML={{ __html: formattedText }}
                  />
                );
              })
            ) : (
              <p style={{ textAlign: 'center', fontStyle: 'italic' }}>No learning activities were logged for this date. The ink runs dry today.</p>
            )}
          </div>
        </div>

        {/* RIGHT PANEL */}
        <aside className="side-panel right-panel">
          <div className="panel-section">
            <h3 className="panel-title">Quote of the Day</h3>
            <div style={{ position: 'relative', paddingLeft: '1.5rem', fontStyle: 'italic', color: 'rgba(255,255,255,0.7)', fontSize: '0.95rem', lineHeight: 1.6 }}>
              <Quote size={16} style={{ position: 'absolute', left: 0, top: '-2px', color: 'rgba(255,255,255,0.2)' }} />
              "The capacity to learn is a gift; the ability to learn is a skill; the willingness to learn is a choice."
              <div style={{ marginTop: '0.8rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', fontStyle: 'normal' }}>— Brian Herbert</div>
            </div>
          </div>

          <div className="panel-section">
            <h3 className="panel-title">Topics Covered</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {['Dynamic Programming', 'Hash Tables', 'Two Pointers', 'Python', 'Sliding Window'].map(tag => (
                <span key={tag} style={{ 
                  display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                  fontSize: '0.75rem', padding: '0.3rem 0.6rem', 
                  background: 'rgba(255,255,255,0.05)', borderRadius: '20px',
                  color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.05)'
                }}>
                  <Tag size={10} /> {tag}
                </span>
              ))}
            </div>
          </div>
        </aside>

      </div>
    </div>
  );
}
