'use client';

import { useRouter } from '@/lib/navigation';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { User } from '@/lib/types';
import { apiRequest } from '@/lib/api';
import { logoutWithApi } from '@/lib/auth';
import { StorageService } from '@/lib/storage';
import { resetToastLiveState } from '@/components/notifications/NotificationProvider';
import { clearShownToastIds } from '@/lib/notificationPresentation';

type AuthContextValue = {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  refreshUser: () => Promise<boolean>;
  applyUser: (next: User) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function rememberSession() {
  return Boolean(typeof window !== 'undefined' && localStorage.getItem('cya_current_user_v6'));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const token = StorageService.getAuthToken();
    if (!token) {
      StorageService.clearCurrentUser();
      setUser(null);
      return false;
    }

    const me = await apiRequest<{ user: User }>('/api/auth/me');
    if (!me.ok) {
      StorageService.clearCurrentUser();
      setUser(null);
      return false;
    }

    StorageService.setCurrentUser(me.data.user, rememberSession());
    setUser(me.data.user);
    return true;
  }, []);

  const applyUser = useCallback((next: User) => {
    StorageService.setCurrentUser(next, rememberSession());
    setUser(next);
  }, []);

  const logout = useCallback(async () => {
    const current = user || StorageService.getCurrentUser();
    if (current) {
      clearShownToastIds(current.id);
    }
    resetToastLiveState();
    await logoutWithApi();
    StorageService.clearCurrentUser();
    setUser(null);
    window.location.replace('/login');
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ok = await refreshUser();
      if (cancelled) return;
      if (!ok) {
        const next = `${window.location.pathname}${window.location.search}`;
        const encoded = encodeURIComponent(next);
        router.replace(next.startsWith('/login') ? '/login' : `/login?next=${encoded}`);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshUser, router]);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      loading,
      refreshUser,
      applyUser,
      logout,
    }),
    [user, loading, refreshUser, applyUser, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
