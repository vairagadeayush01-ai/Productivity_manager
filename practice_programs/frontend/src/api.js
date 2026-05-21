import axios from 'axios';

const API_BASE = 'http://127.0.0.1:8000';

export const api = {
  // Search
  searchToday: async () => {
    const res = await axios.get(`${API_BASE}/search/today`);
    return res.data;
  },
  searchHistory: async (query) => {
    const res = await axios.post(`${API_BASE}/search`, { query, top_k: 5 });
    return res.data;
  },
  getAllHistory: async (skip = 0, limit = 50) => {
    const res = await axios.get(`${API_BASE}/search/history?skip=${skip}&limit=${limit}`);
    return res.data;
  },
  getStats: async () => {
    const res = await axios.get(`${API_BASE}/search/stats`);
    return res.data;
  },
  
  // Ingestion
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
  
  // Quizzes
  getTodayQuiz: async () => {
    const res = await axios.get(`${API_BASE}/quiz/today`);
    return res.data;
  },
  getTopicReviewQuiz: async (topic) => {
    const res = await axios.get(`${API_BASE}/quiz/review/${encodeURIComponent(topic)}`);
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
  
  // Reports
  getWeeklyReport: async () => {
    const res = await axios.get(`${API_BASE}/report/weekly`);
    return res.data;
  },
  
  // Integrations
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
  }
};

