import axios from 'axios';

const API_BASE = 'http://localhost:5000/api';

const getAuthHeader = () => {
  const token = localStorage.getItem('cityfix_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const authAPI = {
  register: (data) => axios.post(`${API_BASE}/auth/register`, data),
  login: (data) => axios.post(`${API_BASE}/auth/login`, data),
  claimReward: (data) => axios.post(`${API_BASE}/auth/rewards/claim`, data, { headers: getAuthHeader() })
};

export const issuesAPI = {
  getAll: () => axios.get(`${API_BASE}/issues`),
  create: (data) => axios.post(`${API_BASE}/issues`, data, { headers: getAuthHeader() }),
  rate: (id, rating) => axios.post(`${API_BASE}/issues/${id}/rate`, { rating }, { headers: getAuthHeader() })
};

export const ownerAPI = {
  getIssues: () => axios.get(`${API_BASE}/owner/issues`, { headers: getAuthHeader() }),
  getUsers: () => axios.get(`${API_BASE}/owner/users`, { headers: getAuthHeader() }),
  updateStatus: (id, status) => axios.put(`${API_BASE}/owner/issues/${id}/status`, { status }, { headers: getAuthHeader() }),
  deleteIssue: (id) => axios.delete(`${API_BASE}/owner/issues/${id}`, { headers: getAuthHeader() })
};
