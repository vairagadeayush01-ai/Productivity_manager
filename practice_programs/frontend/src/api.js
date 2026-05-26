import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

const client = axios.create({ baseURL: API_BASE });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('pm_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config?.url?.includes('/auth/')) {
      clearAuthToken();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export function setAuthToken(token, user) {
  localStorage.setItem('pm_token', token);
  if (user) localStorage.setItem('pm_user', JSON.stringify(user));
  document.documentElement.setAttribute('data-pm-token', token);
}

export function clearAuthToken() {
  localStorage.removeItem('pm_token');
  localStorage.removeItem('pm_user');
  document.documentElement.removeAttribute('data-pm-token');
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem('pm_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const api = {
  // --- Auth ---
  login: async (email, password) => {
    const res = await client.post('/auth/login', { email, password });
    return res.data;
  },
  register: async (email, password) => {
    const res = await client.post('/auth/register', { email, password });
    return res.data;
  },
  me: async () => {
    const res = await client.get('/auth/me');
    return res.data;
  },
  exportData: async () => {
    const res = await client.get('/auth/export');
    return res.data;
  },

  // --- Search / History ---
  searchToday: async () => {
    const res = await client.get('/search/today');
    return res.data;
  },
  getAllHistory: async ({ skip = 0, limit = 50, source_type = null, start_date = null, end_date = null } = {}) => {
    const params = { skip, limit };
    if (source_type) params.source_type = source_type;
    if (start_date)  params.start_date = start_date;
    if (end_date)    params.end_date = end_date;
    const res = await client.get('/search/history', { params });
    return res.data;
  },
  // Convenience wrapper used by History.jsx (page-based)
  getHistory: async ({ page = 1, limit = 10, source_type, start_date, end_date } = {}) => {
    const skip = (page - 1) * limit;
    const params = { skip, limit };
    if (source_type) params.source_type = source_type;
    if (start_date)  params.start_date = start_date;
    if (end_date)    params.end_date = end_date;
    const res = await client.get('/search/history', { params });
    return res.data;
  },
  searchBrain: async (query, n = 5, source_type = null) => {
    const params = { q: query, n };
    if (source_type) params.source_type = source_type;
    const res = await client.get('/search/', { params });
    return res.data;
  },
  // Convenience alias used by Search.jsx
  search: async (query, source_type = null, n = 8) => {
    const params = { q: query, n };
    if (source_type) params.source_type = source_type;
    const res = await client.get('/search/', { params });
    return res.data;
  },
  reindexEntries: async () => {
    const res = await client.post('/search/reindex');
    return res.data;
  },
  getStats: async () => {
    const res = await client.get('/search/stats');
    return res.data;
  },
  deleteEntry: async (id) => {
    const res = await client.delete(`/ingest/entry/${id}`);
    return res.data;
  },

  // --- Diary ---
  getDiaries: async () => {
    const res = await client.get('/diary/');
    return res.data;
  },
  getDiary: async (date) => {
    const res = await client.get(`/diary/${date}`);
    return res.data;
  },

  // --- Ingest ---
  ingestYoutube: async (url) => {
    const res = await client.post('/ingest/youtube', { url });
    return res.data;
  },
  ingestLog: async (note) => {
    const res = await client.post('/ingest/log', { note });
    return res.data;
  },
  ingestLeetCode: async (url, outcome, notes) => {
    const res = await client.post('/ingest/leetcode', { url, outcome, notes });
    return res.data;
  },
  ingestWebpage: async (url) => {
    const res = await client.post('/ingest/webpage', { url });
    return res.data;
  },
  ingestPaste: async (text) => {
    const res = await client.post('/ingest/paste', { text });
    return res.data;
  },

  // --- Quiz ---
  getRecentQuiz: async (difficulty = 'medium', n = 20, days = 7) => {
    const res = await client.get('/quiz/recent', { params: { difficulty, n, days } });
    return res.data;
  },
  getTopicReviewQuiz: async (topic, difficulty = 'medium', n = 10) => {
    const res = await client.get(`/quiz/review/${encodeURIComponent(topic)}`, {
      params: { difficulty, n },
    });
    return res.data;
  },
  submitAnswer: async (data) => {
    const res = await client.post('/quiz/answer', data);
    return res.data;
  },
  getDueTopics: async () => {
    const res = await client.get('/quiz/due');
    return res.data;
  },
  getQuizPerformance: async () => {
    const res = await client.get('/quiz/performance');
    return res.data;
  },

  // --- Report ---
  getWeeklyReport: async () => {
    const res = await client.get('/report/weekly');
    return res.data;
  },

  // --- Auto-fetch integrations ---
  getIntegrationStatus: async () => {
    const res = await client.get('/fetch/status');
    return res.data;
  },
  syncGitHub: async () => {
    const res = await client.post('/fetch/github');
    return res.data;
  },
  syncLeetCode: async () => {
    const res = await client.post('/fetch/leetcode');
    return res.data;
  },
  fetchAllToday: async () => {
    const res = await client.post('/fetch/all-today');
    return res.data;
  },
};
