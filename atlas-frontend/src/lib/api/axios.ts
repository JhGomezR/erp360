import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';

const API_URL  = process.env.NEXT_PUBLIC_API_URL  || 'https://atlaserp.com.co/api';
// Base sin /api — para construir /{slug}/api/...
const BASE_URL = API_URL.endsWith('/api') ? API_URL.slice(0, -4) : API_URL.replace(/\/api$/, '');

// ─── Helpers de tokens ────────────────────────────────────────────────────────
const CENTRAL_TOKEN_KEY = 'atlas_token';
const TENANT_TOKEN_KEY  = 'atlas_tenant_token';

export const getToken        = (): string | null => typeof window === 'undefined' ? null : localStorage.getItem(CENTRAL_TOKEN_KEY);
export const setToken        = (t: string): void => localStorage.setItem(CENTRAL_TOKEN_KEY, t);
export const getTenantToken  = (): string | null => typeof window === 'undefined' ? null : localStorage.getItem(TENANT_TOKEN_KEY);
export const setTenantToken  = (t: string): void => localStorage.setItem(TENANT_TOKEN_KEY, t);
export const clearTenantToken = (): void => localStorage.removeItem(TENANT_TOKEN_KEY);

export const clearToken      = (): void => {
  localStorage.removeItem(CENTRAL_TOKEN_KEY);
  localStorage.removeItem(TENANT_TOKEN_KEY);
  localStorage.removeItem('atlas_tenant');
  localStorage.removeItem('atlas_user');
};

// ─── 1. Cliente CENTRAL (base: /api) ─────────────────────────────────────────
const apiClient: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  timeout: 15000,
});

apiClient.interceptors.request.use((cfg: InternalAxiosRequestConfig) => {
  const tok = getToken();
  if (tok) cfg.headers.Authorization = `Bearer ${tok}`;
  return cfg;
});

// Con Sanctum los tokens son de larga duración — en 401 simplemente redirigir a login.
apiClient.interceptors.response.use(
  (r) => r,
  (err: AxiosError) => {
    const url = err.config?.url ?? '';
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/register');
    if (err.response?.status === 401 && !isAuthEndpoint) {
      clearToken();
      if (typeof window !== 'undefined') window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ─── 2. Cliente TENANT (base: raíz, URL construida por tenant.api.ts) ─────────
export const tenantApiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  timeout: 15000,
});

tenantApiClient.interceptors.request.use((cfg: InternalAxiosRequestConfig) => {
  const tok = getTenantToken();
  if (tok) cfg.headers.Authorization = `Bearer ${tok}`;
  return cfg;
});

// Con Sanctum los tokens de tenant son de larga duración — en 401 redirigir a login.
tenantApiClient.interceptors.response.use(
  (r) => r,
  (err: AxiosError) => {
    const url = err.config?.url ?? '';
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/exchange');
    if (err.response?.status === 401 && !isAuthEndpoint) {
      clearToken();
      if (typeof window !== 'undefined') window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default apiClient;
