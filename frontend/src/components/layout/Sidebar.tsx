'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { User } from '@/lib/types';
import { filterNavForUser, isCeoViewOnly, CEO_NAV_CATEGORY_LABELS } from '@/lib/rbac';
import CareyuLogo from '@/components/brand/CareyuLogo';
import { useSidebar } from '@/components/layout/SidebarContext';
import {
  LayoutDashboard,
  Building2,
  Scan,
  Calculator,
  Bot,
  GanttChartSquare,
  CheckSquare,
  FileText,
  Users,
  ShoppingCart,
  UserCheck,
  ShieldAlert,
  History,
  Network,
  MessageSquare,
  Settings,
  ChevronRight,
  Mail,
  Menu,
  BarChart3,
  CalendarClock,
} from 'lucide-react';

interface SidebarProps {
  user: User;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  LayoutDashboard: <LayoutDashboard className="h-4 w-4 shrink-0" />,
  Building2: <Building2 className="h-4 w-4 shrink-0" />,
  Scan: <Scan className="h-4 w-4 shrink-0" />,
  Calculator: <Calculator className="h-4 w-4 shrink-0" />,
  Bot: <Bot className="h-4 w-4 shrink-0" />,
  GanttChartSquare: <GanttChartSquare className="h-4 w-4 shrink-0" />,
  CheckSquare: <CheckSquare className="h-4 w-4 shrink-0" />,
  FileText: <FileText className="h-4 w-4 shrink-0" />,
  Users: <Users className="h-4 w-4 shrink-0" />,
  ShoppingCart: <ShoppingCart className="h-4 w-4 shrink-0" />,
  UserCheck: <UserCheck className="h-4 w-4 shrink-0" />,
  ShieldAlert: <ShieldAlert className="h-4 w-4 shrink-0" />,
  History: <History className="h-4 w-4 shrink-0" />,
  Network: <Network className="h-4 w-4 shrink-0" />,
  MessageSquare: <MessageSquare className="h-4 w-4 shrink-0" />,
  Settings: <Settings className="h-4 w-4 shrink-0" />,
  Mail: <Mail className="h-4 w-4 shrink-0" />,
  BarChart3: <BarChart3 className="h-4 w-4 shrink-0" />,
  CalendarClock: <CalendarClock className="h-4 w-4 shrink-0" />,
};

export default function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const navItems = filterNavForUser(user);
  const ceoView = isCeoViewOnly(user);
  const { collapsed, mobileOpen, isDesktop, toggleSidebar, closeMobile } = useSidebar();
  const iconOnly = isDesktop && collapsed;

  const categories = [
    { key: 'main', label: ceoView ? CEO_NAV_CATEGORY_LABELS.main : 'Overview' },
    { key: 'pre_sales', label: ceoView ? CEO_NAV_CATEGORY_LABELS.pre_sales : 'Pre-Sales Opportunities' },
    { key: 'projects', label: ceoView ? CEO_NAV_CATEGORY_LABELS.projects : 'Project Operations' },
    { key: 'team_work', label: ceoView ? CEO_NAV_CATEGORY_LABELS.team_work : 'Execution & Workload' },
    { key: 'system', label: ceoView ? CEO_NAV_CATEGORY_LABELS.system : 'System & Governance' },
  ];

  return (
    <aside
      className={[
        'app-sidebar app-chrome sticky top-0 flex h-screen shrink-0 flex-col border-r border-slate-800 bg-slate-900',
        isDesktop && collapsed ? 'app-sidebar--collapsed' : 'app-sidebar--expanded',
        !isDesktop && mobileOpen ? 'app-sidebar--mobile-open' : '',
        !isDesktop ? 'app-sidebar--mobile' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Main navigation"
    >
      <div
        className={`border-b border-slate-800 bg-slate-950/50 ${
          iconOnly ? 'flex justify-center px-2 py-3' : 'flex items-center justify-between gap-2 p-4'
        }`}
      >
        {!iconOnly && (
          <div className="min-w-0 flex-1">
            <CareyuLogo variant="light" />
          </div>
        )}
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Toggle sidebar"
          aria-expanded={isDesktop ? !collapsed : mobileOpen}
          className="inline-flex shrink-0 items-center justify-center rounded-md border border-slate-700 p-2 text-slate-300 transition-colors hover:border-cyan-700 hover:bg-slate-800 hover:text-cyan-300"
        >
          <Menu className="h-4 w-4" />
        </button>
      </div>

      <div
        className={`overflow-hidden border-b border-slate-800/80 bg-slate-900/80 transition-all duration-250 ease-in-out ${
          iconOnly ? 'max-h-0 border-b-0 py-0 opacity-0' : 'max-h-16 px-4 py-2.5 opacity-100'
        }`}
        aria-hidden={iconOnly}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Active Role</span>
          <span className="rounded border border-cyan-800/60 bg-cyan-950 px-2 py-0.5 text-xs font-semibold text-cyan-300">
            {user.role_name}
          </span>
        </div>
      </div>

      <div className={`flex-1 space-y-4 overflow-y-auto py-3 ${iconOnly ? 'px-1.5' : 'px-3'}`}>
        {categories.map((cat) => {
          const items = navItems.filter((item) => item.category === cat.key);
          if (items.length === 0) return null;

          return (
            <div key={cat.key} className="space-y-1">
              <div
                className={`px-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 transition-all duration-250 ease-in-out ${
                  iconOnly ? 'pointer-events-none max-h-0 overflow-hidden opacity-0' : 'max-h-8 opacity-100'
                }`}
              >
                {cat.label}
              </div>
              {items.map((item) => {
                const isActive =
                  item.href === '/dashboard'
                    ? pathname === '/dashboard' ||
                      (pathname.startsWith('/dashboard/') && !pathname.startsWith('/dashboard/team'))
                    : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={iconOnly ? item.name : undefined}
                    onClick={() => {
                      if (!isDesktop) closeMobile();
                    }}
                    className={`flex items-center rounded-md text-xs font-medium transition-all duration-200 ${
                      iconOnly ? 'justify-center px-2 py-2.5' : 'justify-between px-3 py-2'
                    } ${
                      isActive
                        ? iconOnly
                          ? 'border border-cyan-500/40 bg-cyan-600/20 text-cyan-300 shadow-sm'
                          : 'border border-cyan-500/40 bg-cyan-600/20 text-cyan-300 shadow-sm'
                        : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                    }`}
                  >
                    <div className={`flex items-center ${iconOnly ? 'justify-center' : 'gap-2.5'}`}>
                      <span className={isActive ? 'text-cyan-400' : 'text-slate-400'}>{ICON_MAP[item.iconName]}</span>
                      <span
                        className={`sidebar-nav-label whitespace-nowrap transition-all duration-250 ease-in-out ${
                          iconOnly ? 'max-w-0 overflow-hidden opacity-0' : 'max-w-[220px] opacity-100'
                        }`}
                      >
                        {item.name}
                      </span>
                    </div>
                    {!iconOnly && (
                      <>
                        {item.badge ? (
                          <span className="rounded-full border border-cyan-700/50 bg-cyan-900/60 px-1.5 py-0.5 text-[10px] text-cyan-300">
                            {item.badge}
                          </span>
                        ) : isActive ? (
                          <ChevronRight className="h-3.5 w-3.5 text-cyan-400" />
                        ) : null}
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>

      <div
        className={`overflow-hidden border-t border-slate-800 bg-slate-950/60 text-center text-[10px] text-slate-500 transition-all duration-250 ease-in-out ${
          iconOnly ? 'max-h-0 border-t-0 p-0 opacity-0' : 'max-h-16 p-3 opacity-100'
        }`}
        aria-hidden={iconOnly}
      >
        Care Yu Automation · Project Hub
      </div>
    </aside>
  );
}
