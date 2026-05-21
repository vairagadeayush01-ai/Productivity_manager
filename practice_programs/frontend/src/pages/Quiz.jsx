import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api';
import {
  Gamepad2, CheckCircle2, XCircle, Zap, BarChart3,
  ChevronRight, Trophy, Target, AlertTriangle
} from 'lucide-react';

const DIFFICULTY_CONFIG = {
  easy:   { label: 'Easy',   color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.3)' },
  medium: { label: 'Medium', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)' },
  hard:   { label: 'Hard',   color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)' },
};

const LEVEL_ICON = { strong: <Trophy size={16} color="#22c55e" />, intermediate: <Target size={16} color="#f59e0b" />, weak: <AlertTriangle size={16} color="#ef4444" /> };
const LEVEL_COLOR = { strong: '#22c55e', intermediate: '#f59e0b', weak: '#ef4444' };

export default function Quiz() {
  const location  = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const topicParam  = queryParams.get('topic');

  // -- Controls ----------------------------------------------
  const [difficulty, setDifficulty] = useState('medium');
  const [numQuestions, setNumQuestions] = useState(20);

  // -- Quiz state --------------------------------------------
  const [quizData, setQuizData]     = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [generated, setGenerated]   = useState(false);

  // -- Answering state ---------------------------------------
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedOpt, setSelectedOpt] = useState('');
  const [feedback, setFeedback]     = useState(null);   // null | 'correct' | 'incorrect'
  const [score, setScore]           = useState(0);
  const [answers, setAnswers]       = useState([]);     // track all answers for results

  // -- Performance tab ---------------------------------------
  const [showPerf, setShowPerf]     = useState(false);
  const [perf, setPerf]             = useState(null);

  // Auto-load performance stats on mount (without generating quiz)
  useEffect(() => {
    api.getQuizPerformance().then(setPerf).catch(() => {});
  }, []);

  // If a topic is passed via URL, auto-generate
  useEffect(() => {
    if (topicParam) generateQuiz();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicParam]);

  async function generateQuiz() {
    setLoading(true);
    setError(null);
    setGenerated(false);
    setQuizData(null);
    setCurrentIdx(0);
    setSelectedOpt('');
    setFeedback(null);
    setScore(0);
    setAnswers([]);
    try {
      const data = topicParam
        ? await api.getTopicReviewQuiz(topicParam, difficulty, numQuestions)
        : await api.getTodayQuiz(difficulty, numQuestions);
      setQuizData(data);
      setGenerated(true);
    } catch (err) {
      if (err.response?.status === 404) {
        setError(topicParam
          ? `No notes found for "${topicParam}". Try adding more content.`
          : "No entries logged today! Sync your GitHub/LeetCode or add a note first.");
      } else {
        setError("Failed to generate quiz: " + (err.response?.data?.detail || err.message));
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
      const isCorrect = res.is_correct;
      setFeedback(isCorrect ? 'correct' : 'incorrect');
      if (isCorrect) setScore(s => s + 1);
      setAnswers(prev => [...prev, { q, selected: selectedOpt, correct: isCorrect }]);
    } catch (err) {
      console.error(err);
      // Fallback local check
      const isCorrect = selectedOpt.trim().toLowerCase() === q.answer.trim().toLowerCase();
      setFeedback(isCorrect ? 'correct' : 'incorrect');
      if (isCorrect) setScore(s => s + 1);
      setAnswers(prev => [...prev, { q, selected: selectedOpt, correct: isCorrect }]);
    }
  };

  const handleNext = () => {
    setFeedback(null);
    setSelectedOpt('');
    setCurrentIdx(i => i + 1);
  };

  // -- Render: Setup screen (before quiz generated) ----------
  if (!generated && !loading) {
    return (
      <div className="animate-fade-in" style={{ maxWidth: '700px', margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
          <button
            className={!showPerf ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setShowPerf(false)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Gamepad2 size={18} /> Generate Quiz
          </button>
          <button
            className={showPerf ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setShowPerf(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <BarChart3 size={18} /> Performance
          </button>
        </div>

        {showPerf ? (
          <PerformanceView perf={perf} />
        ) : (
          <div className="glass-card" style={{ padding: '2.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
              <div style={{ padding: '1rem', background: 'rgba(99,102,241,0.2)', borderRadius: '12px' }}>
                <Gamepad2 color="var(--primary-glow)" size={28} />
              </div>
              <div>
                <h1 style={{ fontSize: '1.7rem' }}>
                  {topicParam ? `Review: ${topicParam}` : "Today's Quiz"}
                </h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  {topicParam ? 'Topic-focused spaced repetition' : 'Generated from everything you learned today'}
                </p>
              </div>
            </div>

            {error && (
              <div style={{
                padding: '1rem', borderRadius: '12px', background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5',
                fontSize: '0.92rem', marginBottom: '1.5rem'
              }}>
                {error}
              </div>
            )}

            {/* Difficulty */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.75rem' }}>
                Difficulty
              </label>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                {Object.entries(DIFFICULTY_CONFIG).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => setDifficulty(key)}
                    style={{
                      flex: 1, padding: '0.75rem', borderRadius: '12px', cursor: 'pointer',
                      border: `1.5px solid ${difficulty === key ? cfg.color : 'rgba(255,255,255,0.08)'}`,
                      background: difficulty === key ? cfg.bg : 'rgba(255,255,255,0.03)',
                      color: difficulty === key ? cfg.color : 'var(--text-muted)',
                      fontWeight: difficulty === key ? 600 : 400, transition: 'all 0.2s',
                      fontSize: '0.9rem'
                    }}
                  >
                    {cfg.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Number of questions */}
            <div style={{ marginBottom: '2rem' }}>
              <label style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.75rem' }}>
                Questions: <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{numQuestions}</span>
              </label>
              <input
                type="range"
                min={5}
                max={40}
                step={5}
                value={numQuestions}
                onChange={e => setNumQuestions(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--primary-glow)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                <span>5</span><span>10</span><span>15</span><span>20</span><span>25</span><span>30</span><span>35</span><span>40</span>
              </div>
            </div>

            <button
              className="btn-primary"
              onClick={generateQuiz}
              style={{ width: '100%', padding: '1rem', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem' }}
            >
              <Zap size={18} /> Generate Quiz Now
            </button>
          </div>
        )}
      </div>
    );
  }

  // -- Render: Loading ---------------------------------------
  if (loading) {
    return (
      <div className="animate-fade-in" style={{ textAlign: 'center', marginTop: '5rem' }}>
        <div style={{
          width: '60px', height: '60px', border: '3px solid rgba(99,102,241,0.2)',
          borderTopColor: 'var(--primary-glow)', borderRadius: '50%',
          margin: '0 auto 1.5rem', animation: 'spin 1s linear infinite'
        }} />
        <h2 style={{ marginBottom: '0.5rem' }}>Generating your quiz...</h2>
        <p style={{ color: 'var(--text-muted)' }}>AI is crafting {numQuestions} {difficulty} questions...</p>
      </div>
    );
  }

  // -- Render: Complete --------------------------------------
  const isComplete = generated && quizData && currentIdx >= quizData.questions.length;
  if (isComplete) {
    const pct = Math.round((score / quizData.total) * 100);
    const grade = pct >= 80 ? { label: 'Excellent!', color: '#22c55e' }
                : pct >= 60 ? { label: 'Good job!', color: '#f59e0b' }
                : { label: 'Keep practicing!', color: '#ef4444' };
    return (
      <div className="glass-card animate-fade-in" style={{ padding: '3rem 2rem', textAlign: 'center', maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
          {pct >= 80 ? '?' : pct >= 60 ? '?' : '?'}
        </div>
        <h2 style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>Quiz Complete!</h2>
        <p style={{ color: grade.color, fontSize: '1.1rem', fontWeight: 600, marginBottom: '1.5rem' }}>{grade.label}</p>
        <div style={{
          fontSize: '4rem', fontWeight: 700, color: grade.color,
          marginBottom: '0.5rem', lineHeight: 1
        }}>
          {score} <span style={{ fontSize: '2rem', color: 'var(--text-muted)', fontWeight: 400 }}>/ {quizData.total}</span>
        </div>
        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
          {pct}% - Spaced repetition intervals updated automatically.
        </p>

        {/* Wrong answers summary */}
        {answers.filter(a => !a.correct).length > 0 && (
          <div style={{ textAlign: 'left', marginBottom: '2rem' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem', color: '#ef4444' }}>
              Missed questions ({answers.filter(a => !a.correct).length})
            </h3>
            {answers.filter(a => !a.correct).map((a, i) => (
              <div key={i} style={{
                padding: '0.75rem', borderRadius: '10px', marginBottom: '0.5rem',
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)'
              }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '4px' }}>{a.q.question}</p>
                <p style={{ fontSize: '0.82rem', color: '#22c55e' }}>? {a.q.answer}</p>
                {a.q.explanation && <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: '2px' }}>{a.q.explanation}</p>}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn-primary" onClick={generateQuiz}>
            Generate Another Quiz
          </button>
          <button className="btn-secondary" onClick={() => window.location.href = '/'}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // -- Render: Quiz in progress ------------------------------
  if (!quizData) return null;
  const q    = quizData.questions[currentIdx];
  const diff = DIFFICULTY_CONFIG[q?.difficulty || difficulty] || DIFFICULTY_CONFIG.medium;

  return (
    <div className="animate-fade-in" style={{ maxWidth: '800px', margin: '0 auto' }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem' }}>{topicParam ? `Review: ${topicParam}` : 'Daily Quiz'}</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            {quizData.difficulty?.toUpperCase()} difficulty ? {quizData.entries_used || ''} {quizData.entries_used ? 'entries used' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ fontSize: '0.85rem', color: '#22c55e', fontWeight: 600 }}>
            {score} ?
          </div>
          <div style={{ background: 'rgba(255,255,255,0.08)', padding: '6px 14px', borderRadius: '20px', fontSize: '0.85rem' }}>
            {currentIdx + 1} / {quizData.total}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', marginBottom: '1.5rem', overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: '2px',
          background: 'linear-gradient(90deg, var(--primary-glow), var(--secondary-glow))',
          width: `${((currentIdx) / quizData.total) * 100}%`,
          transition: 'width 0.4s ease'
        }} />
      </div>

      {/* Question card */}
      <div className="glass-card" style={{ padding: '2rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: '0.75rem', padding: '3px 10px', borderRadius: '20px',
            background: diff.bg, color: diff.color, border: `1px solid ${diff.border}`,
            fontWeight: 600
          }}>
            {diff.label}
          </span>
          <span style={{
            fontSize: '0.75rem', padding: '3px 10px', borderRadius: '20px',
            background: 'rgba(99,102,241,0.1)', color: '#c7d2fe',
            border: '1px solid rgba(99,102,241,0.2)'
          }}>
            {q.topic}
          </span>
        </div>

        <h2 style={{ fontSize: '1.25rem', marginBottom: '1.75rem', lineHeight: 1.55, fontWeight: 600 }}>
          {q.question}
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {q.options.map((opt, idx) => {
            const isSelected    = selectedOpt === opt;
            const showCorrect   = feedback && opt === q.answer;
            const showIncorrect = feedback === 'incorrect' && isSelected;

            let bg = 'rgba(255,255,255,0.03)';
            let border = '1px solid rgba(255,255,255,0.08)';
            let textColor = 'var(--text-main)';

            if (isSelected && !feedback) { bg = 'rgba(99,102,241,0.15)'; border = '1px solid var(--primary-glow)'; }
            if (showCorrect)  { bg = 'rgba(34,197,94,0.15)';  border = '1px solid #22c55e'; textColor = '#86efac'; }
            if (showIncorrect){ bg = 'rgba(239,68,68,0.15)';  border = '1px solid #ef4444'; textColor = '#fca5a5'; }

            return (
              <button
                key={idx}
                disabled={feedback !== null}
                onClick={() => setSelectedOpt(opt)}
                style={{
                  background: bg, border, padding: '1rem 1.25rem', borderRadius: '12px',
                  color: textColor, textAlign: 'left', fontSize: '0.97rem',
                  cursor: feedback ? 'default' : 'pointer', transition: 'all 0.2s',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  width: '100%'
                }}
              >
                <span>{opt}</span>
                {showCorrect   && <CheckCircle2 color="#22c55e" size={20} />}
                {showIncorrect && <XCircle color="#ef4444" size={20} />}
              </button>
            );
          })}
        </div>

        {/* Explanation after answer */}
        {feedback && q.explanation && (
          <div style={{
            marginTop: '1.25rem', padding: '0.875rem 1rem', borderRadius: '10px',
            background: feedback === 'correct' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
            border: `1px solid ${feedback === 'correct' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
            fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.6
          }}>
            ? {q.explanation}
          </div>
        )}

        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
          {!feedback ? (
            <button
              className="btn-primary"
              onClick={handleAnswer}
              disabled={!selectedOpt}
              style={{ opacity: selectedOpt ? 1 : 0.5, cursor: selectedOpt ? 'pointer' : 'not-allowed' }}
            >
              Submit Answer
            </button>
          ) : (
            <button
              className="btn-primary"
              onClick={handleNext}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              {currentIdx + 1 < quizData.total ? <><ChevronRight size={18} />Next Question</> : <>See Results ?</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// -- Performance sub-component ------------------------------
function PerformanceView({ perf }) {
  if (!perf) return (
    <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
      <BarChart3 size={40} style={{ margin: '0 auto 1rem' }} />
      <p>No quiz results yet. Generate your first quiz!</p>
    </div>
  );

  const { topics, overall } = perf;

  return (
    <div className="glass-card animate-fade-in" style={{ padding: '2rem' }}>
      <h2 style={{ fontSize: '1.4rem', marginBottom: '0.5rem' }}>Your Performance</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        {overall.total} questions answered ? {overall.pct}% overall accuracy
      </p>

      {/* Overall bar */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: '4px',
            background: overall.pct >= 80 ? '#22c55e' : overall.pct >= 60 ? '#f59e0b' : '#ef4444',
            width: `${overall.pct}%`, transition: 'width 0.5s ease'
          }} />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {topics.map((t, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: '1rem',
            padding: '0.75rem 1rem', borderRadius: '10px',
            background: `${LEVEL_COLOR[t.level]}10`, border: `1px solid ${LEVEL_COLOR[t.level]}30`
          }}>
            <div style={{ flexShrink: 0 }}>{LEVEL_ICON[t.level]}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500, fontSize: '0.9rem', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.topic}</div>
              <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${t.pct}%`, background: LEVEL_COLOR[t.level], borderRadius: '2px' }} />
              </div>
            </div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: LEVEL_COLOR[t.level], flexShrink: 0 }}>
              {t.pct}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
