'use client';

import { useRouter } from '@/lib/navigation';
import React, { useEffect } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { getDashboardPath } from '@/lib/auth';
import { canAccessTeamDashboard } from '@/lib/rbac';
import TeamDashboardView from '@/components/dashboards/TeamDashboard';

export default function TeamDashboardPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const allowed = canAccessTeamDashboard(user);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!allowed) router.replace(getDashboardPath(user.role_code));
  }, [allowed, loading, router, user]);

  if (loading || !user) return null;
  if (!allowed) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">
        Access denied. Team Dashboard is not available for your role.
      </div>
    );
  }

  return <TeamDashboardView />;
}
