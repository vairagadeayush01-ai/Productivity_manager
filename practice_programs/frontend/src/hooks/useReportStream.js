/**
 * useReportStream.js — React hook for consuming the SSE report stream.
 *
 * Why fetch() instead of EventSource:
 *   EventSource doesn't support custom headers, so we can't send our
 *   Authorization Bearer token. We use fetch() with a ReadableStream reader
 *   and parse SSE events manually — same protocol, full auth support.
 *
 * SSE event types handled:
 *   stats   → { total_entries, youtube, leetcode, ... }
 *   chunk   → { delta: "incremental text" }
 *   section → { key: "overall"|"strong_areas"|..., content: "full text" }
 *   done    → { stats, report, date, message? }
 *   error   → { message, recoverable: bool }
 *
 * State returned:
 *   stats      — activity counts, populated immediately (fast DB query)
 *   sections   — { overall, strong_areas, needs_attention, next_week }
 *                each populated progressively as sections complete
 *   rawBuffer  — the accumulating raw AI text (for debug / full-text display)
 *   status     — "idle" | "loading" | "streaming" | "done" | "error"
 *   error      — error message string or null
 *   date       — report date string
 *   retry()    — function to re-trigger the stream
 *
 * Usage:
 *   const { stats, sections, status, error, retry } = useReportStream();
 */
import { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
const STREAM_URL = `${API_BASE}/report/weekly/stream`;

const INITIAL_SECTIONS = {
  overall: '',
  strong_areas: '',
  needs_attention: '',
  next_week: '',
};

export function useReportStream() {
  const [stats, setStats]         = useState(null);
  const [sections, setSections]   = useState({ ...INITIAL_SECTIONS });
  const [rawBuffer, setRawBuffer] = useState('');
  const [status, setStatus]       = useState('idle');   // idle|loading|streaming|done|error
  const [error, setError]         = useState(null);
  const [date, setDate]           = useState('');
  const abortRef                  = useRef(null);
  const runIdRef                  = useRef(0);           // incremented on each retry to cancel stale streams

  const startStream = useCallback(async () => {
    // Cancel any previous in-flight stream
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;
    const runId = ++runIdRef.current;

    // Reset state
    setStats(null);
    setSections({ ...INITIAL_SECTIONS });
    setRawBuffer('');
    setError(null);
    setDate('');
    setStatus('loading');

    const token = localStorage.getItem('pm_token');
    if (!token) {
      setError('Not authenticated. Please log in.');
      setStatus('error');
      return;
    }

    let response;
    try {
      response = await fetch(STREAM_URL, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
        signal: controller.signal,
      });
    } catch (fetchErr) {
      if (fetchErr.name === 'AbortError') return;
      setError(`Could not connect to backend: ${fetchErr.message}`);
      setStatus('error');
      return;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      if (response.status === 401) {
        setError('Session expired. Please log in again.');
        window.location.href = '/login';
      } else {
        setError(`Backend error ${response.status}: ${text}`);
      }
      setStatus('error');
      return;
    }

    setStatus('streaming');

    // ── SSE stream reader ─────────────────────────────────────────────────
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let lineBuffer = '';

    // SSE parsing state
    let currentEvent = '';
    let currentData  = '';

    const processEvent = (eventType, dataStr) => {
      if (runId !== runIdRef.current) return; // stale stream — discard

      let parsed;
      try {
        parsed = JSON.parse(dataStr);
      } catch {
        return; // malformed data — skip
      }

      switch (eventType) {
        case 'stats':
          setStats(parsed);
          break;

        case 'chunk':
          // Accumulate raw text for full-text fallback
          setRawBuffer(prev => prev + (parsed.delta || ''));
          break;

        case 'section':
          // Section completed — reveal it
          setSections(prev => ({
            ...prev,
            [parsed.key]: parsed.content,
          }));
          break;

        case 'done':
          // Final event — ensure all sections populated (belt-and-suspenders)
          if (parsed.report) {
            setSections({
              overall:          parsed.report.overall          || '',
              strong_areas:     parsed.report.strong_areas     || '',
              needs_attention:  parsed.report.needs_attention  || '',
              next_week:        parsed.report.next_week        || '',
            });
          }
          if (parsed.stats)   setStats(parsed.stats);
          if (parsed.date)    setDate(parsed.date);
          setStatus('done');
          break;

        case 'error':
          setError(parsed.message || 'An error occurred.');
          if (!parsed.recoverable) {
            setStatus('error');
          }
          // If recoverable, keep streaming — partial content is better than nothing
          break;

        default:
          break;
      }
    };

    // Read stream chunks
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done || runId !== runIdRef.current) break;

        // Decode chunk and split into lines
        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() ?? ''; // keep partial last line

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            currentData = line.slice(6).trim();
          } else if (line === '') {
            // Empty line = end of event block
            if (currentEvent && currentData) {
              processEvent(currentEvent, currentData);
            }
            currentEvent = '';
            currentData  = '';
          }
        }
      }
    } catch (streamErr) {
      if (streamErr.name === 'AbortError') return;
      if (runId !== runIdRef.current) return;
      setError(`Stream read error: ${streamErr.message}`);
      setStatus('error');
    } finally {
      reader.releaseLock();
    }

    // If stream ended without a "done" event, mark done anyway
    if (runId === runIdRef.current) {
      setStatus(prev => prev === 'streaming' ? 'done' : prev);
    }
  }, []);

  // Auto-start on mount
  useEffect(() => {
    startStream();
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [startStream]);

  return {
    stats,
    sections,
    rawBuffer,
    status,
    error,
    date,
    retry: startStream,
  };
}
