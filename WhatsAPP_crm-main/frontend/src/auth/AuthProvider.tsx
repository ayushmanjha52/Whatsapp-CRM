import React, { createContext, useContext, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, setUnauthorizedHandler } from '../lib/api';
import type { SessionUser } from '../lib/types';
import { disconnectRealtime } from '../lib/realtime';

interface AuthValue {
  user: SessionUser | null;
  loading: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  signup: (name: string, email: string, password: string) => Promise<{ user?: SessionUser; needsConfirmation: boolean; message?: string }>;
  logout: () => Promise<void>;
  refresh: () => Promise<unknown>;
}

const AuthContext = createContext<AuthValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const qc = useQueryClient();
  const session = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      try {
        const r = await api<{ user: SessionUser }>('/api/auth/session');
        return r.user;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 5 * 60_000,
    retry: 1
  });

  useEffect(() => {
    setUnauthorizedHandler(() => {
      disconnectRealtime();
      qc.setQueryData(['session'], null);
    });
  }, [qc]);

  const value: AuthValue = {
    user: session.data ?? null,
    loading: session.isLoading,
    isAdmin: session.data?.role === 'admin',
    async login(email, password) {
      const r = await api<{ user: SessionUser }>('/api/auth/login', { method: 'POST', body: { email, password } });
      qc.clear();
      qc.setQueryData(['session'], r.user);
      return r.user;
    },
    async signup(name, email, password) {
      const r = await api<{ user?: SessionUser; needs_confirmation?: boolean; message?: string }>('/api/auth/signup', {
        method: 'POST',
        body: { name, email, password }
      });
      if (r.user) {
        qc.clear();
        qc.setQueryData(['session'], r.user);
      }
      return { user: r.user, needsConfirmation: !!r.needs_confirmation, message: r.message };
    },
    async logout() {
      try {
        await api('/api/auth/logout', { method: 'POST' });
      } finally {
        disconnectRealtime();
        qc.clear();
        qc.setQueryData(['session'], null);
      }
    },
    refresh: () => session.refetch()
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
