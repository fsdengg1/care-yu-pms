'use client';

import { useRouter } from '@/lib/navigation';
import React, { useEffect } from 'react';

import { User } from '@/lib/types';
import { getDashboardPath } from '@/lib/auth';
import { useAuth } from '@/components/auth/AuthProvider';

export default function RoleDashboardGate({
  expectedPath,
  children,
}: {
  expectedPath: string;
  children: (user: User) => React.ReactNode;
}) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const allowed = Boolean(user && getDashboardPath(user.role_code) === expectedPath);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!allowed) {
      router.replace(getDashboardPath(user.role_code));
    }
  }, [allowed, loading, router, user]);

  if (loading || !user) return null;
  if (!allowed) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">
        Access denied for this dashboard. Redirecting to your workspace...
      </div>
    );
  }

  return <>{children(user)}</>;
}
