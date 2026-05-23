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

      <div className="diary-layout-grid" style={{ display: 'flex', justifyContent: 'center' }}>
        
        {/* CENTER PANEL - NOTEBOOK */}
        <div className="premium-paper" style={{ maxWidth: '800px', width: '100%' }}>
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

      </div>
    </div>
  );
}
