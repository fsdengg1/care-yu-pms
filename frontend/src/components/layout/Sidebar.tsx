'use client';

import { Link, usePathname } from '@/lib/navigation';
import React from 'react';

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
  PanelLeft,
  PanelLeftClose,
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
        'app-sidebar sticky top-0 flex h-screen shrink-0 flex-col',
        isDesktop && collapsed ? 'app-sidebar--collapsed' : 'app-sidebar--expanded',
        !isDesktop && mobileOpen ? 'app-sidebar--mobile-open' : '',
        !isDesktop ? 'app-sidebar--mobile' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Main navigation"
    >
      <div className="app-sidebar__brand">
        {!iconOnly && (
          <div className="min-w-0 flex-1">
            <CareyuLogo variant="light" compact />
          </div>
        )}
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={iconOnly ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={isDesktop ? !collapsed : mobileOpen}
          className="app-sidebar__toggle"
        >
          {iconOnly ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <div className="app-sidebar__role">
        <span className="app-sidebar__role-label">Role</span>
        <span className="app-sidebar__role-value" title={user.role_name}>
          {user.role_name}
        </span>
      </div>

      <nav className="app-sidebar__nav">
        {categories.map((cat) => {
          const items = navItems.filter((item) => item.category === cat.key);
          if (items.length === 0) return null;

          return (
            <div key={cat.key} className="app-sidebar__section">
              <div className="app-sidebar__section-label">{cat.label}</div>
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
                    className={`app-nav-link${isActive ? ' is-active' : ''}`}
                  >
                    <span className="app-nav-link__main">
                      <span className="app-nav-link__icon">{ICON_MAP[item.iconName]}</span>
                      {!iconOnly && <span className="app-nav-link__label">{item.name}</span>}
                    </span>
                    {!iconOnly && (
                      <>
                        {item.badge ? (
                          <span className="app-nav-link__badge">{item.badge}</span>
                        ) : isActive ? (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
                        ) : null}
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {!iconOnly && <div className="app-sidebar__foot">Care Yu Automation · Project Hub</div>}
    </aside>
  );
}
