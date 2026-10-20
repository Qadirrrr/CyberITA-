import axios from 'axios';

let accessToken = null;

export function setAccessToken(token) {
  accessToken = token || null;
}

export function getAccessToken() {
  return accessToken;
}

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

const AUTH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];
let refreshPromise = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    const status = error.response?.status;
    const isAuthPath = AUTH_PATHS.some((path) => String(config?.url || '').startsWith(path));

    if (status === 401 && config && !config._retried && !isAuthPath) {
      config._retried = true;
      try {
        refreshPromise = refreshPromise || api.post('/auth/refresh');
        const { data } = await refreshPromise;
        refreshPromise = null;
        setAccessToken(data.accessToken);
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(config);
      } catch (refreshError) {
        refreshPromise = null;
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('auth:expired'));
        throw error;
      }
    }

    throw error;
  }
);

export function getErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  const data = error?.response?.data;
  const details = data?.error?.details ?? data?.details;
  if (Array.isArray(details) && details.length) {
    const messages = details.map((detail) => detail?.message).filter((message) => typeof message === 'string' && message);
    if (messages.length) return messages.join(', ');
  }
  const serverMessage =
    data?.error?.message ?? (typeof data?.error === 'string' ? data.error : null) ?? data?.message;
  if (typeof serverMessage === 'string' && serverMessage) return serverMessage;
  if (typeof error?.message === 'string' && error.message) return error.message;
  return fallback;
}

export function getFieldErrors(error) {
  const data = error?.response?.data;
  const details = data?.error?.details ?? data?.details;
  if (!Array.isArray(details)) return {};
  return details.reduce((acc, detail) => {
    const key = String(detail.path || '').split('.').pop();
    if (key) acc[key] = detail.message;
    return acc;
  }, {});
}

export default api;
