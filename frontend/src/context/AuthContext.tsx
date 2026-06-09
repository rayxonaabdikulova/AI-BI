"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import axios from "axios";
import { getApiBaseUrl } from "@/lib/api";

type AuthContextValue = {
  token: string | null;
  initialized: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_STORAGE_KEY = "ai-bi-token";

type TokenResponse = {
  access_token: string;
  token_type: string;
};

type Credentials = {
  username: string;
  password: string;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  });
  const [initialized] = useState(true);
  const apiBase = useMemo(() => getApiBaseUrl(), []);

  const persistToken = useCallback((newToken: string) => {
    setToken(newToken);
    localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      const body: Credentials = { username, password };
      const { data } = await axios.post<TokenResponse>(`${apiBase}/api/login`, body);
      if (!data?.access_token) {
        throw new Error("Login failed: token missing in response.");
      }
      persistToken(data.access_token);
    },
    [apiBase, persistToken],
  );

  const register = useCallback(
    async (username: string, password: string) => {
      const body: Credentials = { username, password };
      await axios.post(`${apiBase}/api/register`, body);
      await login(username, password);
    },
    [apiBase, login],
  );

  const logout = useCallback(() => {
    setToken(null);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ token, initialized, login, register, logout }),
    [initialized, login, logout, register, token],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }
  return context;
}

