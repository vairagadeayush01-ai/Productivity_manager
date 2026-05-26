/**
 * Chat.jsx — "Chat With My Data" + AI Tutor (tabbed interface)
 *
 * TAB 1: Chat (RAG Q&A)
 *   - Ask any question about your learning history
 *   - Backend retrieves top-6 semantically similar entries, Groq synthesises answer
 *   - Answer streamed token-by-token via SSE
 *   - [SOURCE: Title] markers parsed → rendered as CitationCard components below the answer
 *
 * TAB 2: Tutor (24h session memory)
 *   - Multi-turn conversation stored in DB (TutorConversation + TutorMessage)
 *   - Full last-8-turn context injected into every Groq call
 *   - After 24h: messages deleted, distilled_summary preserved for future sessions
 *   - Shows session expiry countdown and past distilled sessions
 *
 * SSE protocol (same as weekly report):
 *   data: <token>                 ← text chunk
 *   data: [SOURCES_JSON] [...]    ← JSON array of source objects
 *   data: [DONE]                  ← stream complete
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  MessageSquare, BookOpen, Send, RefreshCw, Clock,
  Cpu, ChevronRight, Info, AlertTriangle,
  FileText, Code2, GitBranch, CirclePlay, StickyNote,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

function authHeaders() {
  const t = localStorage.getItem('pm_token');
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}

async function apiFetch(path, opts = {}) {
  const resp = await fetch(`${API}${path}`, { headers: authHeaders(), ...opts });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data?.detail || `HTTP ${resp.status}`);
  return data;
}

// ─── Source type icons ────────────────────────────────────────────────────────
const SOURCE_ICONS = {
  youtube:  <CirclePlay size={12} />,
  leetcode: <Code2      size={12} />,
  github:   <GitBranch  size={12} />,
  manual:   <StickyNote size={12} />,
  paste:    <FileText   size={12} />,
  pdf:      <FileText   size={12} />,
  webpage:  <FileText   size={12} />,
};

const SOURCE_COLORS = {
  youtube:  '#EF4444',
  leetcode: '#FFA116',
  github:   '#24292F',
  manual:   '#6366F1',
  paste:    '#8B5CF6',
  pdf:      '#3B82F6',
  webpage:  '#10B981',
};

// ─── CitationCard ─────────────────────────────────────────────────────────────
function CitationCard({ source }) {
  const icon  = SOURCE_ICONS[source.source_type]  || <FileText size={12} />;
  const color = SOURCE_COLORS[source.source_type] || '#6B7280';
  return (
    <div className="citation-card">
      <div className="citation-card__type" style={{ color }}>
        {icon}
        <span>{source.source_type}</span>
      </div>
      <p className="citation-card__title">
        {source.url
          ? <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
          : source.title
        }
      </p>
      {source.snippet && (
        <p className="citation-card__snippet">{source.snippet}</p>
      )}
      {source.date && <span className="citation-card__date">{source.date}</span>}
    </div>
  );
}

// ─── Parse streamed text: render as proper markdown ──────────────────────────
function MessageContent({ text }) {
  // Pre-process: replace [SOURCE: Title] markers with a special tag
  // then let ReactMarkdown handle the rest
  const parts = text.split(/(\[SOURCE:[^\]]+\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(/^\[SOURCE:(.+)\]$/);
        if (match) {
          return (
            <span key={i} className="chat-source-marker">
              <ChevronRight size={10} />
              {match[1].trim()}
            </span>
          );
        }
        // Render non-source parts as markdown
        return part ? (
          <ReactMarkdown
            key={i}
            remarkPlugins={[remarkGfm]}
            components={{
              // Prevent wrapping in extra <p> when inline
              p: ({ children }) => <p>{children}</p>,
            }}
          >
            {part}
          </ReactMarkdown>
        ) : null;
      })}
    </>
  );
}

// ─── Chat bubble ─────────────────────────────────────────────────────────────
function Bubble({ role, text, sources, streaming }) {
  const isUser = role === 'user';
  return (
    <div className={`chat-bubble-row ${isUser ? 'chat-bubble-row--user' : 'chat-bubble-row--ai'}`}>
      {!isUser && (
        <div className="chat-avatar chat-avatar--ai">
          <Cpu size={13} />
        </div>
      )}
      <div className={`chat-bubble ${isUser ? 'chat-bubble--user' : 'chat-bubble--ai'}`}>
        {isUser
          ? <span>{text}</span>
          : <MessageContent text={text} />
        }
        {streaming && (
          <span className="chat-cursor" aria-hidden>▊</span>
        )}
      </div>
      {isUser && <div className="chat-avatar chat-avatar--user">You</div>}

      {/* Source citations below AI bubble */}
      {!isUser && sources && sources.length > 0 && (
        <div className="chat-citations">
          <p className="chat-citations__label">
            <Info size={11} aria-hidden /> {sources.length} source{sources.length > 1 ? 's' : ''} used
          </p>
          <div className="chat-citations__grid">
            {sources.map((s, i) => <CitationCard key={s.id || i} source={s} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SSE streaming helper ─────────────────────────────────────────────────────
async function streamSSE(url, body, onToken, onSources, onDone, onError, signal) {
  let sources = [];
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body),
      signal,
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err?.detail || `HTTP ${resp.status}`);
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6);
        if (payload === '[DONE]') { onDone(); return; }
        if (payload.startsWith('[SOURCES_JSON]')) {
          try { sources = JSON.parse(payload.slice(15).trim()); } catch {}
          onSources(sources);
        } else {
          onToken(payload);
        }
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') onError(err.message);
  }
  onDone();
}

// ─── RAG Chat Tab ─────────────────────────────────────────────────────────────
function ChatTab() {
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef(null);
  const abortRef  = useRef(null);

  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(scrollToBottom, [messages]);

  const sendMessage = useCallback(async () => {
    const query = input.trim();
    if (!query || streaming) return;

    setInput('');
    const userMsg = { role: 'user', text: query, sources: [] };
    const aiMsg   = { role: 'ai',   text: '',    sources: [], streaming: true };
    setMessages(prev => [...prev, userMsg, aiMsg]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    await streamSSE(
      `${API}/chat/ask`,
      { query },
      (token) => setMessages(prev => {
        const msgs = [...prev];
        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], text: msgs[msgs.length - 1].text + token };
        return msgs;
      }),
      (sources) => setMessages(prev => {
        const msgs = [...prev];
        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], sources };
        return msgs;
      }),
      () => {
        setStreaming(false);
        setMessages(prev => {
          const msgs = [...prev];
          msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], streaming: false };
          return msgs;
        });
      },
      (err) => {
        setStreaming(false);
        setMessages(prev => {
          const msgs = [...prev];
          msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], text: `Error: ${err}`, streaming: false };
          return msgs;
        });
      },
      controller.signal,
    );
  }, [input, streaming]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <div className="chat-pane">
      {/* Message list */}
      <div className="chat-messages" id="chat-messages-list">
        {messages.length === 0 && (
          <div className="chat-empty">
            <MessageSquare size={32} color="var(--text-faint)" />
            <p>Ask anything about your learning history.</p>
            <div className="chat-suggestions">
              {[
                'What graph algorithms have I studied?',
                'Explain the BFS solution I used recently',
                'What did I learn about React hooks?',
                'Which LeetCode patterns do I use most?',
              ].map(s => (
                <button key={s} className="chat-suggestion" onClick={() => setInput(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <Bubble key={i} {...m} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="chat-input-bar">
        <textarea
          id="chat-input"
          className="chat-textarea"
          rows={1}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask about your learning history… (Enter to send)"
          disabled={streaming}
        />
        <button
          id="chat-send-btn"
          className="chat-send-btn"
          onClick={sendMessage}
          disabled={!input.trim() || streaming}
          aria-label="Send"
        >
          {streaming
            ? <RefreshCw size={15} className="animate-spin" />
            : <Send size={15} />
          }
        </button>
      </div>
    </div>
  );
}

// ─── Tutor Tab ────────────────────────────────────────────────────────────────
function TutorTab() {
  const [sessionId, setSessionId]   = useState(null);
  const [expiresAt, setExpiresAt]   = useState(null);
  const [messages, setMessages]     = useState([]);
  const [input, setInput]           = useState('');
  const [streaming, setStreaming]   = useState(false);
  const [loadingSession, setLoadingSession] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [distilled, setDistilled]   = useState([]);
  const [showDistilled, setShowDistilled] = useState(false);
  const bottomRef = useRef(null);
  const abortRef  = useRef(null);

  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(scrollToBottom, [messages]);

  // Load or resume session on mount
  useEffect(() => {
    (async () => {
      setLoadingSession(true);
      try {
        const data = await apiFetch('/tutor/session/current');
        if (data.session_id) {
          setSessionId(data.session_id);
          setExpiresAt(data.expires_at);
          setMessages(
            (data.history || []).map(m => ({
              role: m.role === 'user' ? 'user' : 'ai',
              text: m.content,
              sources: [],
            }))
          );
        }
        // Load past distilled sessions
        const dist = await apiFetch('/tutor/sessions/distilled');
        setDistilled(dist.sessions || []);
      } catch (e) {
        setSessionError(e.message);
      } finally {
        setLoadingSession(false);
      }
    })();
  }, []);

  const startSession = async () => {
    setLoadingSession(true);
    setSessionError('');
    try {
      const data = await apiFetch('/tutor/session', {
        method: 'POST',
        body: JSON.stringify({ topic: null }),
      });
      setSessionId(data.session_id);
      setExpiresAt(data.expires_at);
      setMessages(
        (data.history || []).map(m => ({
          role: m.role === 'user' ? 'user' : 'ai',
          text: m.content,
          sources: [],
        }))
      );
    } catch (e) {
      setSessionError(e.message);
    } finally {
      setLoadingSession(false);
    }
  };

  const sendMessage = useCallback(async () => {
    const msg = input.trim();
    if (!msg || streaming || !sessionId) return;

    setInput('');
    const userMsg = { role: 'user', text: msg, sources: [] };
    const aiMsg   = { role: 'ai',   text: '',  sources: [], streaming: true };
    setMessages(prev => [...prev, userMsg, aiMsg]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    await streamSSE(
      `${API}/tutor/session/${sessionId}/message`,
      { message: msg },
      (token) => setMessages(prev => {
        const msgs = [...prev];
        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], text: msgs[msgs.length - 1].text + token };
        return msgs;
      }),
      (sources) => setMessages(prev => {
        const msgs = [...prev];
        msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], sources };
        return msgs;
      }),
      () => {
        setStreaming(false);
        setMessages(prev => {
          const msgs = [...prev];
          msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], streaming: false };
          return msgs;
        });
      },
      (err) => {
        setStreaming(false);
        setMessages(prev => {
          const msgs = [...prev];
          msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], text: `Error: ${err}`, streaming: false };
          return msgs;
        });
      },
      controller.signal,
    );
  }, [input, streaming, sessionId]);

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // Session expiry countdown
  const timeLeft = expiresAt ? (() => {
    const diff = new Date(expiresAt) - new Date();
    if (diff <= 0) return 'Expired';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}h ${m}m remaining`;
  })() : '';

  if (loadingSession) {
    return (
      <div className="chat-pane chat-pane--centered">
        <RefreshCw size={20} className="animate-spin" color="var(--primary)" />
        <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Loading tutor session…</p>
      </div>
    );
  }

  return (
    <div className="chat-pane">
      {/* Session header */}
      {sessionId ? (
        <div className="tutor-session-bar">
          <div className="tutor-session-bar__info">
            <Clock size={13} aria-hidden />
            <span>Active session — {timeLeft}</span>
          </div>
          <button
            className="tutor-distilled-toggle"
            onClick={() => setShowDistilled(s => !s)}
          >
            <BookOpen size={13} />
            Past sessions ({distilled.length})
          </button>
        </div>
      ) : (
        <div className="tutor-no-session">
          <BookOpen size={28} color="var(--text-faint)" />
          <p>No active tutor session.</p>
          <p className="tutor-no-session__sub">
            Sessions last 24h. After expiry, key insights are distilled and preserved for future context.
          </p>
          {sessionError && (
            <div className="profile-status profile-status--error" style={{ margin: '0.5rem 0' }}>
              <AlertTriangle size={13} /> {sessionError}
            </div>
          )}
          <button className="btn-primary" onClick={startSession}>
            Start Tutor Session
          </button>
        </div>
      )}

      {/* Past distilled sessions panel */}
      {showDistilled && distilled.length > 0 && (
        <div className="tutor-distilled-panel">
          <p className="tutor-distilled-panel__title">Past Session Summaries</p>
          {distilled.map(s => (
            <div key={s.id} className="tutor-distilled-item">
              <span className="tutor-distilled-item__date">
                {new Date(s.distilled_at).toLocaleDateString()}
              </span>
              <p>{s.distilled_summary}</p>
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      {sessionId && (
        <>
          <div className="chat-messages" id="tutor-messages-list">
            {messages.length === 0 && (
              <div className="chat-empty">
                <Cpu size={32} color="var(--text-faint)" />
                <p>Your tutor is ready. Ask anything — I'll remember this conversation for 24h.</p>
                <div className="chat-suggestions">
                  {[
                    'Explain the time complexity of my last BFS solution',
                    'What are the patterns across my LeetCode solutions this week?',
                    'Help me understand what I learned from the DP video',
                    'Why did I use a hash map in my last GitHub commit?',
                  ].map(s => (
                    <button key={s} className="chat-suggestion" onClick={() => setInput(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => <Bubble key={i} {...m} />)}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="chat-input-bar">
            <textarea
              id="tutor-input"
              className="chat-textarea"
              rows={1}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask your tutor… (Enter to send, Shift+Enter for newline)"
              disabled={streaming}
            />
            <button
              id="tutor-send-btn"
              className="chat-send-btn"
              onClick={sendMessage}
              disabled={!input.trim() || streaming}
              aria-label="Send to tutor"
            >
              {streaming
                ? <RefreshCw size={15} className="animate-spin" />
                : <Send size={15} />
              }
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Chat() {
  const [tab, setTab] = useState('chat'); // 'chat' | 'tutor'

  return (
    <div className="page chat-page animate-fade-in">
      <div className="chat-header">
        <div className="chat-header__title">
          <Cpu size={20} color="var(--primary)" aria-hidden />
          <h1>AI Intelligence</h1>
        </div>
        <div className="chat-tabs" role="tablist">
          <button
            id="tab-chat"
            role="tab"
            aria-selected={tab === 'chat'}
            className={`chat-tab ${tab === 'chat' ? 'chat-tab--active' : ''}`}
            onClick={() => setTab('chat')}
          >
            <MessageSquare size={14} aria-hidden />
            Chat with data
          </button>
          <button
            id="tab-tutor"
            role="tab"
            aria-selected={tab === 'tutor'}
            className={`chat-tab ${tab === 'tutor' ? 'chat-tab--active' : ''}`}
            onClick={() => setTab('tutor')}
          >
            <BookOpen size={14} aria-hidden />
            AI Tutor
          </button>
        </div>
      </div>

      <div className="chat-body">
        {tab === 'chat'  && <ChatTab  key="chat" />}
        {tab === 'tutor' && <TutorTab key="tutor" />}
      </div>
    </div>
  );
}
