'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import axios from 'axios';
import { setAccessToken } from '@/lib/api/client';
import type {
  JwtPayload,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Minimal client-side JWT decode (no verify — server validates on every API call)
// ---------------------------------------------------------------------------
function decodeJwt(token: string): JwtPayload | null {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------
interface AuthContextValue {
  user: JwtPayload | null;
  isLoading: boolean;
  login(req: LoginRequest): Promise<void>;
  register(req: RegisterRequest): Promise<RegisterResponse>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<JwtPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const tokenRef = useRef<string | null>(null);

  const applyToken = useCallback((token: string | null) => {
    tokenRef.current = token;
    setAccessToken(token);
    setUser(token ? decodeJwt(token) : null);

    if (typeof document !== 'undefined') {
      if (token) {
        const secure = location.protocol === 'https:' ? '; Secure' : '';
        document.cookie = `auth_marker=1; path=/; SameSite=Strict${secure}`;
      } else {
        document.cookie = 'auth_marker=; path=/; max-age=0; SameSite=Strict';
      }
    }
  }, []);

  // Silent refresh on mount — reads the httpOnly refresh_token cookie
  useEffect(() => {
    axios
      .post<LoginResponse>(
        `${BASE_URL}/v1/banking/auth/refresh`,
        {},
        { withCredentials: true },
      )
      .then(({ data }) => applyToken(data.accessToken))
      .catch(() => applyToken(null))
      .finally(() => setIsLoading(false));
  }, [applyToken]);

  const login = useCallback(
    async (req: LoginRequest): Promise<void> => {
      const { data } = await axios.post<LoginResponse>(
        `${BASE_URL}/v1/banking/auth/login`,
        req,
        { withCredentials: true },
      );
      applyToken(data.accessToken);
    },
    [applyToken],
  );

  const register = useCallback(async (req: RegisterRequest): Promise<RegisterResponse> => {
    const { data } = await axios.post<RegisterResponse>(
      `${BASE_URL}/v1/banking/auth/register`,
      req,
    );
    return data;
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await axios.post(
        `${BASE_URL}/v1/banking/auth/logout`,
        {},
        {
          withCredentials: true,
          headers: tokenRef.current
            ? { Authorization: `Bearer ${tokenRef.current}` }
            : {},
        },
      );
    } finally {
      applyToken(null);
    }
  }, [applyToken]);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
