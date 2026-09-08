'use client';

import React from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Navbar from '@/components/layout/Navbar';
import CareyuLogo from '@/components/brand/CareyuLogo';
import { SidebarProvider, useSidebar } from '@/components/layout/SidebarContext';
import { NotificationProvider } from '@/components/notifications/NotificationProvider';
import NotificationToastHost from '@/components/notifications/NotificationToastHost';
import { AuthProvider, useAuth } from '@/components/auth/AuthProvider';

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { mobileOpen, closeMobile, isDesktop } = useSidebar();

  if (loading || !user) {
    return (
      <div className="theme-app flex min-h-screen flex-col items-center justify-center gap-3 bg-background text-xs text-muted-foreground">
        <CareyuLogo />
        Loading Care Yu Automation Project Hub...
      </div>
    );
  }

  return (
    <div className="theme-app flex min-h-screen bg-background text-foreground">
      {!isDesktop && mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          className="modal-scrim-light fixed inset-0 z-40 backdrop-blur-[1px] lg:hidden"
          onClick={closeMobile}
        />
      )}
      <Sidebar user={user} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden transition-[margin] duration-250 ease-in-out">
        <NotificationProvider user={user}>
          <Navbar user={user} />
          <NotificationToastHost />
          <main className="theme-inverted flex-1 overflow-y-auto overflow-x-hidden bg-background p-6">{children}</main>
        </NotificationProvider>
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <SidebarProvider>
        <DashboardShell>{children}</DashboardShell>
      </SidebarProvider>
    </AuthProvider>
  );
}
