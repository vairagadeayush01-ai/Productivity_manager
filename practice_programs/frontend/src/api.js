import axios from 'axios';

const API_BASE = 'http://127.0.0.1:8000';

export const api = {
  // ── Today's entries ──────────────────────────────────────
  searchToday: async () => {
    const res = await axios.get(`${API_BASE}/search/today`);
    return res.data;
  },

  // ── History (all time) ────────────────────────────────────
  getAllHistory: async (skip = 0, limit = 50) => {
    const res = await axios.get(`${API_BASE}/search/history?skip=${skip}&limit=${limit}`);
    return res.data;
  },
  
  // ── Daily Diary ───────────────────────────────────────────
  getDiaries: async () => {
    const res = await axios.get(`${API_BASE}/diary/`);
    return res.data;
  },
  getDiary: async (date) => {
    const res = await axios.get(`${API_BASE}/diary/${date}`);
    return res.data;
  },

  // ── Second Brain semantic search ──────────────────────────
  // FIX: backend uses GET /search/?q=  not POST /search
  searchBrain: async (query, n = 5) => {
    const res = await axios.get(`${API_BASE}/search/`, {
      params: { q: query, n }
    });
    return res.data;
  },

  // ── Stats ─────────────────────────────────────────────────
  getStats: async () => {
    const res = await axios.get(`${API_BASE}/search/stats`);
    return res.data;
  },

  // ── Ingestion ─────────────────────────────────────────────
  ingestYoutube: async (url) => {
    const res = await axios.post(`${API_BASE}/ingest/youtube`, { url });
    return res.data;
  },
  ingestLog: async (note) => {
    const res = await axios.post(`${API_BASE}/ingest/log`, { note });
    return res.data;
  },
  ingestLeetCode: async (url, outcome, notes) => {
    const res = await axios.post(`${API_BASE}/ingest/leetcode`, { url, outcome, notes });
    return res.data;
  },

  // ── Quizzes ───────────────────────────────────────────────
  getTodayQuiz: async (difficulty = 'medium', n = 20) => {
    const res = await axios.get(`${API_BASE}/quiz/today`, {
      params: { difficulty, n }
    });
    return res.data;
  },
  getTopicReviewQuiz: async (topic, difficulty = 'medium', n = 10) => {
    const res = await axios.get(`${API_BASE}/quiz/review/${encodeURIComponent(topic)}`, {
      params: { difficulty, n }
    });
    return res.data;
  },
  submitAnswer: async (data) => {
    const res = await axios.post(`${API_BASE}/quiz/answer`, data);
    return res.data;
  },
  getDueTopics: async () => {
    const res = await axios.get(`${API_BASE}/quiz/due`);
    return res.data;
  },
  getQuizPerformance: async () => {
    const res = await axios.get(`${API_BASE}/quiz/performance`);
    return res.data;
  },

  // ── Reports ───────────────────────────────────────────────
  getWeeklyReport: async () => {
    const res = await axios.get(`${API_BASE}/report/weekly`);
    return res.data;
  },

  // ── Integrations ──────────────────────────────────────────
  getIntegrationStatus: async () => {
    const res = await axios.get(`${API_BASE}/fetch/status`);
    return res.data;
  },
  syncGitHub: async () => {
    const res = await axios.post(`${API_BASE}/fetch/github`);
    return res.data;
  },
  syncLeetCode: async () => {
    const res = await axios.post(`${API_BASE}/fetch/leetcode`);
    return res.data;
  },
  /** Fetches GitHub + LeetCode in one call — called on Dashboard mount */
  fetchAllToday: async () => {
    const res = await axios.post(`${API_BASE}/fetch/all-today`);
    return res.data;
  },
};
