import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '@/components/layout/Sidebar';
import Navbar from '@/components/layout/Navbar';
import CareyuLogo from '@/components/brand/CareyuLogo';
import { SidebarProvider, useSidebar } from '@/components/layout/SidebarContext';
import { NotificationProvider } from '@/components/notifications/NotificationProvider';
import NotificationToastHost from '@/components/notifications/NotificationToastHost';
import { AuthProvider, useAuth } from '@/components/auth/AuthProvider';

function DashboardShell() {
  const { user, loading } = useAuth();
  const { mobileOpen, closeMobile, isDesktop } = useSidebar();

  if (loading || !user) {
    return (
      <div className="theme-app app-boot">
        <CareyuLogo variant="light" />
        <p>Opening Project Hub…</p>
      </div>
    );
  }

  return (
    <div className="theme-app flex min-h-screen bg-background text-foreground">
      {!isDesktop && mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          className="modal-scrim-light fixed inset-0 z-40 backdrop-blur-[2px] lg:hidden"
          onClick={closeMobile}
        />
      )}
      <Sidebar user={user} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <NotificationProvider user={user}>
          <Navbar user={user} />
          <NotificationToastHost />
          <main className="theme-inverted app-canvas flex-1 overflow-y-auto overflow-x-hidden">
            <Outlet />
          </main>
        </NotificationProvider>
      </div>
    </div>
  );
}

export default function DashboardLayout() {
  return (
    <AuthProvider>
      <SidebarProvider>
        <DashboardShell />
      </SidebarProvider>
    </AuthProvider>
  );
}
