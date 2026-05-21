import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api';
import { Gamepad2, CheckCircle2, XCircle } from 'lucide-react';

export default function Quiz() {
  const [quizData, setQuizData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedOpt, setSelectedOpt] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [score, setScore] = useState(0);
  
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const topicParam = queryParams.get('topic');

  useEffect(() => {
    loadQuiz();
  }, [topicParam]);

  async function loadQuiz() {
    setLoading(true);
    setError(null);
    try {
      const data = topicParam 
        ? await api.getTopicReviewQuiz(topicParam)
        : await api.getTodayQuiz();
      setQuizData(data);
    } catch (err) {
      if (err.response?.status === 404) {
        setError(topicParam 
          ? `Could not find enough notes to generate a quiz for "${topicParam}".` 
          : "You haven't learned anything today yet! Check back after the 7:00 PM batch.");
      } else {
        setError("Failed to generate quiz. " + (err.response?.data?.detail || ""));
      }
    } finally {
      setLoading(false);
    }
  }

  const handleAnswer = async () => {
    if (!selectedOpt) return;
    const q = quizData.questions[currentIdx];
    try {
      const res = await api.submitAnswer({
        question: q.question,
        topic: q.topic,
        user_answer: selectedOpt,
        correct_answer: q.answer
      });
      setFeedback(res.is_correct ? 'correct' : 'incorrect');
      if (res.is_correct) setScore(s => s + 1);
    } catch (err) {
      console.error(err);
    }
  };

  const handleNext = () => {
    setFeedback(null);
    setSelectedOpt('');
    setCurrentIdx(i => i + 1);
  };

  if (loading) return <div style={{ textAlign: 'center', marginTop: '4rem' }}>Generating your custom AI quiz...</div>;
  if (error) return (
    <div className="glass-card" style={{ padding: '3rem', textAlign: 'center' }}>
      <Gamepad2 size={48} color="var(--text-muted)" style={{ margin: '0 auto 1rem' }} />
      <h2 style={{ marginBottom: '1rem' }}>No Quiz Available</h2>
      <p style={{ color: 'var(--text-muted)' }}>{error}</p>
    </div>
  );

  const isComplete = currentIdx >= quizData.questions.length;

  if (isComplete) {
    return (
      <div className="glass-card animate-fade-in" style={{ padding: '4rem 2rem', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
        <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Quiz Complete!</h2>
        <div style={{ fontSize: '4rem', fontWeight: 700, color: 'var(--primary-glow)', marginBottom: '1rem' }}>
          {score} / {quizData.total}
        </div>
        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
          Your spaced repetition intervals have been automatically updated based on these results.
        </p>
        <button className="btn-primary" onClick={() => window.location.href='/'}>Back to Dashboard</button>
      </div>
    );
  }

  const q = quizData.questions[currentIdx];

  return (
    <div className="animate-fade-in" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem' }}>{topicParam ? `Review: ${topicParam}` : 'Daily Review'}</h1>
        <div style={{ background: 'rgba(255,255,255,0.1)', padding: '6px 16px', borderRadius: '20px' }}>
          Question {currentIdx + 1} of {quizData.total}
        </div>
      </div>

      <div className="glass-card" style={{ padding: '2.5rem' }}>
        <div style={{ marginBottom: '1rem', color: 'var(--accent-color)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
          Topic: {q.topic}
        </div>
        <h2 style={{ fontSize: '1.4rem', marginBottom: '2rem', lineHeight: 1.5 }}>
          {q.question}
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {q.options.map((opt, idx) => {
            const isSelected = selectedOpt === opt;
            const showCorrect = feedback && opt === q.answer;
            const showIncorrect = feedback === 'incorrect' && isSelected;
            
            let bg = 'rgba(0,0,0,0.2)';
            let border = '1px solid var(--border-subtle)';
            
            if (isSelected) {
              bg = 'rgba(99, 102, 241, 0.15)';
              border = '1px solid var(--primary-glow)';
            }
            if (showCorrect) {
              bg = 'rgba(34, 197, 94, 0.2)';
              border = '1px solid #22c55e';
            }
            if (showIncorrect) {
              bg = 'rgba(239, 68, 68, 0.2)';
              border = '1px solid #ef4444';
            }

            return (
              <button 
                key={idx}
                disabled={feedback !== null}
                onClick={() => setSelectedOpt(opt)}
                style={{
                  background: bg, border, padding: '1.2rem 1.5rem', borderRadius: '12px',
                  color: 'var(--text-main)', textAlign: 'left', fontSize: '1rem',
                  cursor: feedback ? 'default' : 'pointer', transition: 'all 0.2s',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}
              >
                {opt}
                {showCorrect && <CheckCircle2 color="#22c55e" />}
                {showIncorrect && <XCircle color="#ef4444" />}
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: '2.5rem', display: 'flex', justifyContent: 'flex-end' }}>
          {!feedback ? (
            <button className="btn-primary" onClick={handleAnswer} disabled={!selectedOpt}>
              Submit Answer
            </button>
          ) : (
            <button className="btn-primary" onClick={handleNext}>
              Next Question ➔
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
