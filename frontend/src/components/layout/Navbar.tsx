'use client';

import React, { useEffect, useRef, useState } from 'react';
import { User } from '@/lib/types';
import { formatRelativeTime } from '@/lib/format';
import { Bell, Search, LogOut, ChevronDown, Settings, UserRound, Menu } from 'lucide-react';
import Link from 'next/link';
import AppearanceToggle from '@/components/theme/AppearanceToggle';
import CareyuLogo from '@/components/brand/CareyuLogo';
import { useSidebar } from '@/components/layout/SidebarContext';
import { notificationHref } from '@/lib/notificationHref';
import { useNotifications } from '@/components/notifications/NotificationProvider';
import { useAuth } from '@/components/auth/AuthProvider';

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
    <header className="app-chrome h-14 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-40">
      <div className="flex items-center gap-3">
        {!isDesktop && (
          <button
            type="button"
            onClick={openMobile}
            aria-label="Toggle sidebar"
            className="inline-flex items-center justify-center rounded-md border border-slate-700 p-2 text-slate-300 hover:border-cyan-700 hover:bg-slate-800 hover:text-cyan-300 lg:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>
        )}
        <div className="hidden sm:block lg:hidden">
          <CareyuLogo compact />
        </div>
        <div className="relative w-40 sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search projects, leads, BOM, tasks..."
            className="w-full pl-9 pr-4 py-1.5 bg-slate-950/60 border border-slate-800 rounded-md text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <AppearanceToggle />

        <div className="relative" ref={notifRef}>
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowProfile(false);
            }}
            className="p-2 rounded-md hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors relative"
            aria-label="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-[10px] font-bold text-white flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-slate-900 border border-slate-800 rounded-lg shadow-xl p-3 z-50">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-200">Notifications</span>
                  {unreadCount > 0 ? (
                    <span className="text-[10px] bg-rose-950 border border-rose-800 text-rose-300 font-bold px-1.5 py-0.5 rounded-full">
                      {unreadCount} unread
                    </span>
                  ) : (
                    <span className="text-[10px] bg-slate-800 text-slate-400 font-medium px-1.5 py-0.5 rounded-full">
                      {notifications.length} total
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {notifications.length > 0 && (
                    <button
                      type="button"
                      onClick={() => void clearAll()}
                      className="text-[11px] font-bold text-slate-400 hover:text-slate-200"
                    >
                      Clear all
                    </button>
                  )}
                  <Link href="/notifications" className="text-[11px] text-cyan-400 hover:underline" onClick={() => setShowNotifications(false)}>
                    View all
                  </Link>
                </div>
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-500">You&apos;re all caught up.</div>
                ) : (
                  notifications.slice(0, 8).map((n) => (
                    <Link
                      key={n.id}
                      href={notificationHref(n)}
                      onClick={() => {
                        void markRead(n.id);
                        setShowNotifications(false);
                      }}
                      className={`block w-full text-left p-2.5 rounded-lg border transition-all text-xs relative ${
                        n.read_status
                          ? 'bg-slate-950/30 border-slate-800/80 text-slate-400 opacity-80'
                          : 'bg-cyan-950/40 border-cyan-800/60 text-slate-100 shadow-sm'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 font-semibold text-cyan-300">
                          {!n.read_status && (
                            <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block shrink-0" title="Unread" />
                          )}
                          <span>{n.title}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 shrink-0">{formatRelativeTime(n.created_at)}</span>
                      </div>
                      <div className="text-slate-300 mt-1 text-[11px] line-clamp-2">{n.message}</div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="relative border-l border-slate-800 pl-4" ref={profileRef}>
          <button
            type="button"
            onClick={() => {
              setShowProfile(!showProfile);
              setShowNotifications(false);
            }}
            className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-slate-800 transition-colors"
            aria-haspopup="menu"
            aria-expanded={showProfile}
          >
            <div className="w-8 h-8 rounded-full bg-cyan-600/30 border border-cyan-500/50 flex items-center justify-center text-cyan-300 font-bold text-xs">
              {initials(user.name)}
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-xs font-semibold text-slate-100 leading-tight">{user.name}</div>
              <div className="text-[10px] text-slate-400 leading-tight">{user.role_name}</div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {showProfile && (
            <div className="absolute right-0 mt-2 w-56 bg-slate-900 border border-slate-800 rounded-lg shadow-xl py-1 z-50">
              <div className="px-3 py-2 border-b border-slate-800">
                <div className="text-sm font-semibold text-slate-100">{user.name}</div>
                <div className="text-[11px] text-slate-400">{user.role_name}</div>
                <div className="mt-0.5 truncate text-[11px] text-slate-500">{user.email}</div>
              </div>
              <Link
                href="/settings"
                className="flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
                onClick={() => setShowProfile(false)}
              >
                <UserRound className="w-3.5 h-3.5" />
                My Profile
              </Link>
              <Link
                href="/settings"
                className="flex items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
                onClick={() => setShowProfile(false)}
              >
                <Settings className="w-3.5 h-3.5" />
                Settings
              </Link>
              <button
                type="button"
                onClick={() => void logout()}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
              >
                <LogOut className="w-3.5 h-3.5" />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
