'use client';

import { Link } from '@/lib/navigation';
import React, { useEffect, useRef, useState } from 'react';
import { User } from '@/lib/types';
import { formatRelativeTime } from '@/lib/format';
import { Bell, Search, LogOut, ChevronDown, Settings, UserRound, Menu } from 'lucide-react';

import AppearanceToggle from '@/components/theme/AppearanceToggle';
import CareyuLogo from '@/components/brand/CareyuLogo';
import { useSidebar } from '@/components/layout/SidebarContext';
import { notificationHref } from '@/lib/notificationHref';
import { useNotifications } from '@/components/notifications/NotificationProvider';
import { useAuth } from '@/components/auth/AuthProvider';
import { useTheme } from '@/components/theme/ThemeProvider';

interface NavbarProps {
  user: User;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'U';
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export default function Navbar({ user }: NavbarProps) {
  const { logout } = useAuth();
  const { appearance } = useTheme();
  const { openMobile, isDesktop } = useSidebar();
  const [showProfile, setShowProfile] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const { notifications, unreadCount, markRead, markAllRead, clearAll } = useNotifications();
  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (profileRef.current && !profileRef.current.contains(target)) setShowProfile(false);
      if (notifRef.current && !notifRef.current.contains(target)) setShowNotifications(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  return (
    <header className="app-topbar">
      <div className="flex min-w-0 items-center gap-3">
        {!isDesktop && (
          <button type="button" onClick={openMobile} aria-label="Open navigation" className="app-icon-btn lg:hidden">
            <Menu className="h-4 w-4" />
          </button>
        )}
        <div className="hidden sm:block lg:hidden">
          <CareyuLogo compact variant={appearance === 'dark' ? 'light' : 'dark'} />
        </div>
        <label className="app-search">
          <Search className="app-search__icon" />
          <input type="search" placeholder="Search projects, leads, tasks…" className="app-search__input" />
        </label>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <AppearanceToggle />

        <div className="relative" ref={notifRef}>
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowProfile(false);
            }}
            className="app-icon-btn relative"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="app-menu w-80 p-3 sm:w-96">
              <div className="mb-2 flex items-center justify-between border-b border-current/10 pb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold">Notifications</span>
                  {unreadCount > 0 ? (
                    <span className="rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-bold text-rose-500">
                      {unreadCount} unread
                    </span>
                  ) : (
                    <span className="rounded-full bg-current/10 px-1.5 py-0.5 text-[10px] font-medium opacity-70">
                      {notifications.length} total
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button type="button" onClick={() => void markAllRead()} className="text-[11px] font-semibold text-cyan-600 dark:text-cyan-300">
                      Mark read
                    </button>
                  )}
                  {notifications.length > 0 && (
                    <button type="button" onClick={() => void clearAll()} className="text-[11px] font-semibold opacity-70 hover:opacity-100">
                      Clear all
                    </button>
                  )}
                  <Link href="/notifications" className="text-[11px] font-semibold text-cyan-600 hover:underline dark:text-cyan-300" onClick={() => setShowNotifications(false)}>
                    View all
                  </Link>
                </div>
              </div>
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="py-6 text-center text-xs opacity-60">You&apos;re all caught up.</div>
                ) : (
                  notifications.slice(0, 8).map((n) => (
                    <Link
                      key={n.id}
                      href={notificationHref(n)}
                      onClick={() => {
                        void markRead(n.id);
                        setShowNotifications(false);
                      }}
                      className={`block w-full rounded-lg border p-2.5 text-left text-xs ${
                        n.read_status ? 'border-transparent opacity-70' : 'border-cyan-500/30 bg-cyan-500/10'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 font-semibold">
                          {!n.read_status && <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-cyan-400" title="Unread" />}
                          <span>{n.title}</span>
                        </div>
                        <span className="shrink-0 text-[10px] opacity-60">{formatRelativeTime(n.created_at)}</span>
                      </div>
                      <div className="mt-1 line-clamp-2 text-[11px] opacity-80">{n.message}</div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="relative border-l border-current/10 pl-3" ref={profileRef}>
          <button
            type="button"
            onClick={() => {
              setShowProfile(!showProfile);
              setShowNotifications(false);
            }}
            className="app-profile-btn"
            aria-haspopup="menu"
            aria-expanded={showProfile}
          >
            <span className="app-avatar">{initials(user.name)}</span>
            <span className="hidden min-w-0 max-w-[9.5rem] text-left sm:block">
              <span className="block truncate text-xs font-semibold leading-tight">{user.name}</span>
              <span className="block truncate text-[10px] leading-tight opacity-60">{user.role_name}</span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </button>

          {showProfile && (
            <div className="app-menu w-60 py-1" role="menu">
              <div className="border-b border-current/10 px-3 py-2.5">
                <div className="text-sm font-semibold">{user.name}</div>
                <div className="text-[11px] opacity-70">{user.role_name}</div>
                <div className="mt-0.5 truncate text-[11px] opacity-50">{user.email}</div>
              </div>
              <Link href="/settings" className="app-menu__item" onClick={() => setShowProfile(false)}>
                <UserRound className="h-3.5 w-3.5" />
                My Profile
              </Link>
              <Link href="/settings" className="app-menu__item" onClick={() => setShowProfile(false)}>
                <Settings className="h-3.5 w-3.5" />
                Settings
              </Link>
              <button type="button" onClick={() => void logout()} className="app-menu__item">
                <LogOut className="h-3.5 w-3.5" />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
