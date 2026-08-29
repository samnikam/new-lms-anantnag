import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

/**
 * In development this stays relative so Vite proxies to localhost:4000.
 * In production VITE_API_URL points at the deployed API origin.
 */
export const API_BASE = import.meta.env.VITE_API_URL
  ? `${String(import.meta.env.VITE_API_URL).replace(/\/$/, '')}/api`
  : '/api';

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true, // the refresh token rides in an httpOnly cookie
});

let accessToken: string | null = null;
let refreshing: Promise<string | null> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

/**
 * On a 401 the client silently rotates the refresh token once and replays the
 * original request. Concurrent 401s share a single refresh.
 */
api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retried?: boolean };
    const isAuthCall = original?.url?.includes('/auth/login') || original?.url?.includes('/auth/refresh');

    if (error.response?.status !== 401 || original?._retried || isAuthCall) {
      return Promise.reject(error);
    }

    original._retried = true;
    refreshing ??= api
      .post<{ accessToken: string }>('/auth/refresh')
      .then((res) => res.data.accessToken)
      .catch(() => null)
      .finally(() => {
        refreshing = null;
      });

    const token = await refreshing;
    if (!token) {
      setAccessToken(null);
      window.dispatchEvent(new CustomEvent('lms:signed-out'));
      return Promise.reject(error);
    }

    setAccessToken(token);
    original.headers.Authorization = `Bearer ${token}`;
    return api(original);
  },
);

/** Pulls a human-readable message out of any API error shape. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.') {
  const message = (error as AxiosError<{ message?: string | string[] }>)?.response?.data?.message;
  if (Array.isArray(message)) return message[0];
  return message || fallback;
}
