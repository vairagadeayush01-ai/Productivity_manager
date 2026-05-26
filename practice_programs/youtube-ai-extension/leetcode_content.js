/**
 * leetcode_content.js — Chrome extension content script for leetcode.com
 *
 * Detects when a LeetCode submission is Accepted and captures:
 *   - Problem slug (from URL)
 *   - Solution code (from Monaco editor DOM)
 *   - Language (from language selector)
 *   - Runtime + memory from result cards
 *
 * Sends chrome.runtime.sendMessage({ type: 'LEETCODE_ACCEPTED', payload: {...} })
 * to background.js, which queues it for backend sync.
 *
 * Detection strategy:
 *   - MutationObserver watches for the result status element appearing
 *   - Checks for "Accepted" text in the result area
 *   - Debounces to prevent duplicate captures on rapid DOM changes
 *
 * Runs at document_idle on https://leetcode.com/*
 */

'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCEPTED_TEXT   = 'Accepted';
const DEBOUNCE_MS     = 1500;   // wait for result DOM to fully render
const MAX_CODE_CHARS  = 20000;  // cap solution code size

// Selectors (may need updating if LeetCode changes their DOM)
const RESULT_SELECTORS = [
  '[data-e2e-locator="submission-result"]',
  '.result-container',
  '.text-success',        // green "Accepted" text
];

const LANG_SELECTORS = [
  '[data-cy="lang-select"] .ant-select-selection-item',
  '.lang-select .ant-select-selection-item',
  'button[data-mode-id]',  // CodeMirror/Monaco lang button
];

const CODE_SELECTORS = [
  '.monaco-editor .view-lines',
  '.CodeMirror-code',
  '.ace_content',
];

// ─── State ────────────────────────────────────────────────────────────────────

let _lastCaptureSha = '';   // prevent duplicate reports for same submission
let _captureTimer   = null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getProblemSlug() {
  const match = window.location.pathname.match(/\/problems\/([^\/]+)/);
  return match ? match[1] : '';
}

function getLanguage() {
  for (const sel of LANG_SELECTORS) {
    const el = document.querySelector(sel);
    if (el) {
      const text = (el.textContent || el.getAttribute('data-mode-id') || '').trim();
      if (text) return text.toLowerCase().replace(/\s+/g, '');
    }
  }
  return 'unknown';
}

function getSolutionCode() {
  // Monaco editor — each view-line div is a line of code
  const monacoLines = document.querySelectorAll('.monaco-editor .view-lines .view-line');
  if (monacoLines.length > 0) {
    return Array.from(monacoLines)
      .map(el => el.textContent)
      .join('\n')
      .slice(0, MAX_CODE_CHARS);
  }

  // CodeMirror fallback
  const cmCode = document.querySelector('.CodeMirror-code');
  if (cmCode) {
    return Array.from(cmCode.querySelectorAll('.CodeMirror-line'))
      .map(el => el.textContent)
      .join('\n')
      .slice(0, MAX_CODE_CHARS);
  }

  // Ace editor fallback
  const aceContent = document.querySelector('.ace_content');
  if (aceContent) {
    return Array.from(aceContent.querySelectorAll('.ace_line'))
      .map(el => el.textContent)
      .join('\n')
      .slice(0, MAX_CODE_CHARS);
  }

  return '';
}

function getResultStats() {
  // Try to extract runtime and memory from result display
  let runtime_ms = null;
  let memory_mb  = null;

  const allText = document.body.innerText || '';

  const runtimeMatch = allText.match(/Runtime[:\s]+(\d+)\s*ms/i);
  if (runtimeMatch) runtime_ms = parseInt(runtimeMatch[1], 10);

  const memMatch = allText.match(/Memory[:\s]+([\d.]+)\s*MB/i);
  if (memMatch) memory_mb = parseFloat(memMatch[1]);

  return { runtime_ms, memory_mb };
}

function isAccepted() {
  for (const sel of RESULT_SELECTORS) {
    const el = document.querySelector(sel);
    if (el && el.textContent.trim() === ACCEPTED_TEXT) return true;
  }
  // Broad text search fallback — check for "Accepted" in result area
  const resultArea = document.querySelector(
    '.result-container, [class*="result"], [class*="submission-result"]'
  );
  if (resultArea && resultArea.textContent.includes(ACCEPTED_TEXT)) {
    // Exclude false positives like "Not Accepted"
    const text = resultArea.textContent.trim();
    return text.includes(ACCEPTED_TEXT) && !text.includes('Not ' + ACCEPTED_TEXT);
  }
  return false;
}

function fingerprintCapture(slug, lang) {
  return `${slug}:${lang}:${Date.now().toString().slice(0, -3)}`; // 1-second grain
}

// ─── Main capture logic ───────────────────────────────────────────────────────

function captureAcceptedSubmission() {
  if (!isAccepted()) return;

  const slug     = getProblemSlug();
  const language = getLanguage();
  if (!slug) return;

  const fp = fingerprintCapture(slug, language);
  if (fp === _lastCaptureSha) return;  // duplicate
  _lastCaptureSha = fp;

  const code    = getSolutionCode();
  const { runtime_ms, memory_mb } = getResultStats();

  const payload = {
    problem_slug:  slug,
    title:         slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    language,
    solution_code: code,
    runtime_ms,
    memory_mb,
    url:           window.location.href,
    captured_at:   new Date().toISOString(),
  };

  console.log('[Antigravity] LeetCode Accepted captured:', slug, language);

  chrome.runtime.sendMessage(
    { type: 'LEETCODE_ACCEPTED', payload },
    (response) => {
      if (chrome.runtime.lastError) {
        console.warn('[Antigravity] Could not send to background:', chrome.runtime.lastError.message);
      } else {
        console.log('[Antigravity] Queued:', response);
      }
    }
  );
}

// ─── DOM observation ─────────────────────────────────────────────────────────

const observer = new MutationObserver(() => {
  // Debounce: wait for DOM to stabilise after mutation
  if (_captureTimer) clearTimeout(_captureTimer);
  _captureTimer = setTimeout(captureAcceptedSubmission, DEBOUNCE_MS);
});

// Start observing once the page is ready
function startObserving() {
  observer.observe(document.body, {
    childList: true,
    subtree:   true,
  });
  // Also check immediately in case the result is already rendered (page refresh)
  setTimeout(captureAcceptedSubmission, 2000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startObserving);
} else {
  startObserving();
}

// Handle SPA navigation (LeetCode uses React Router)
let _lastUrl = location.href;
setInterval(() => {
  if (location.href !== _lastUrl) {
    _lastUrl = location.href;
    // Reset state on navigation, then check after render delay
    _lastCaptureSha = '';
    setTimeout(captureAcceptedSubmission, 3000);
  }
}, 1000);
