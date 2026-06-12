import axios, {
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';

// ---------------------------------------------------------------------------
// In-memory token store — written by AuthContext, read by the request interceptor
// ---------------------------------------------------------------------------
let _accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  _accessToken = token;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

// ---------------------------------------------------------------------------
// Refresh queue — prevents multiple concurrent refresh calls
// ---------------------------------------------------------------------------
let _isRefreshing = false;
let _refreshSubscribers: Array<(token: string) => void> = [];

function subscribeTokenRefresh(cb: (token: string) => void): void {
  _refreshSubscribers.push(cb);
}

function onTokenRefreshed(token: string): void {
  _refreshSubscribers.forEach((cb) => cb(token));
  _refreshSubscribers = [];
}

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export const apiClient: AxiosInstance = axios.create({
  baseURL: `${BASE_URL}/v1`,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Attach Bearer token on every request
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// On 401: refresh once, queue concurrent requests, retry
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (
      error.response?.status !== 401 ||
      original._retry ||
      original.url === '/banking/auth/refresh'
    ) {
      return Promise.reject(error);
    }

    if (_isRefreshing) {
      return new Promise<AxiosResponse>((resolve) => {
        subscribeTokenRefresh((newToken: string) => {
          original.headers['Authorization'] = `Bearer ${newToken}`;
          resolve(apiClient(original));
        });
      });
    }

    original._retry = true;
    _isRefreshing = true;

    try {
      const { data } = await axios.post<{ accessToken: string }>(
        `${BASE_URL}/v1/banking/auth/refresh`,
        {},
        { withCredentials: true },
      );
      const newToken = data.accessToken;
      setAccessToken(newToken);
      onTokenRefreshed(newToken);
      original.headers['Authorization'] = `Bearer ${newToken}`;
      return apiClient(original);
    } catch (refreshError) {
      setAccessToken(null);
      _refreshSubscribers = [];
      return Promise.reject(refreshError);
    } finally {
      _isRefreshing = false;
    }
  },
);
