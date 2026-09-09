'use client';

import { useRouter } from '@/lib/navigation';
import React, { useEffect } from 'react';

import { getDashboardPath } from '@/lib/auth';
import { useAuth } from '@/components/auth/AuthProvider';
import CEODashboard from '@/components/dashboards/CEODashboard';
import SalesDashboard from '@/components/dashboards/SalesDashboard';
import ProcurementDashboard from '@/components/dashboards/ProcurementDashboard';

export default function DashboardDispatcherPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const path = user ? getDashboardPath(user.role_code) : null;

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (path && path !== '/dashboard') {
      router.replace(path);
    }
  }, [loading, path, router, user]);

  if (loading || !user) return null;
  if (path !== '/dashboard') return null;

  switch (user.role_code) {
    case 'SALES':
      return <SalesDashboard user={user} />;
    case 'PROCUREMENT':
      return <ProcurementDashboard user={user} />;
    default:
      return <CEODashboard user={user} />;
  }
}
