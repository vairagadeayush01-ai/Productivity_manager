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
}

export function clearAuthToken() {
  localStorage.removeItem('pm_token');
  localStorage.removeItem('pm_user');
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

  searchToday: async () => {
    const res = await client.get('/search/today');
    return res.data;
  },
  getAllHistory: async (skip = 0, limit = 50) => {
    const res = await client.get('/search/history', { params: { skip, limit } });
    return res.data;
  },
  getDiaries: async () => {
    const res = await client.get('/diary/');
    return res.data;
  },
  getDiary: async (date) => {
    const res = await client.get(`/diary/${date}`);
    return res.data;
  },
  searchBrain: async (query, n = 5) => {
    const res = await client.get('/search/', { params: { q: query, n } });
    return res.data;
  },
  getStats: async () => {
    const res = await client.get('/search/stats');
    return res.data;
  },
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
  getTodayQuiz: async (difficulty = 'medium', n = 20) => {
    const res = await client.get('/quiz/today', { params: { difficulty, n } });
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
  getWeeklyReport: async () => {
    const res = await client.get('/report/weekly');
    return res.data;
  },
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
