'use client';

import { Link } from '@/lib/navigation';
import React from 'react';

import { AtSign, Bell, Heart, Mail, MessageCircle, MessagesSquare, Pin } from 'lucide-react';
import { formatRelativeTime } from '@/lib/format';
import { notificationHref } from '@/lib/notificationHref';
import { notificationPresentation } from '@/lib/notificationPresentation';
import { useNotifications } from '@/components/notifications/NotificationProvider';
import { NotificationDelivery, NotificationItem, NotificationLifecycleStatus } from '@/lib/types';
import { StorageService } from '@/lib/storage';
import { apiRequest } from '@/lib/api';

function NotificationGlyph({ item }: { item: NotificationItem }) {
  const presentation = notificationPresentation(item);
  const className = 'h-4 w-4 text-cyan-400';
  if (item.type === 'FORUM_MENTION') return <AtSign className={className} />;
  if (item.type === 'FORUM_REACTION') return <Heart className={className} />;
  if (item.type === 'FORUM_PINNED') return <Pin className={className} />;
  if (item.type === 'FORUM_REPLY') return <MessageCircle className={className} />;
  if (item.email_channel === 'CLIENT' || item.type.startsWith('CLIENT_')) return <Mail className={className} />;
  if (presentation.kind === 'forum') return <MessagesSquare className={className} />;
  return <Bell className={className} />;
}

function isClientItem(item: NotificationItem) {
  return item.email_channel === 'CLIENT' || item.type.startsWith('CLIENT_');
}

const STATUS_LABEL: Record<string, string> = {
  NOT_SENT: 'Not Sent',
  MANUALLY_SENT: 'Manually Sent',
  AUTOMATICALLY_SENT: 'Automatically Sent',
  VIEWED: 'Viewed',
  COMPLETED: 'Completed',
  OVERDUE: 'Overdue',
};

function statusLabel(item: NotificationItem) {
  const status = (item.notification_status || item.email_dispatch || item.email_status || '') as NotificationLifecycleStatus | string;
  return STATUS_LABEL[status] || status;
}

export default function NotificationsPage() {
  const { notifications, markRead, markAllRead, clearAll, unreadCount } = useNotifications();
  const user = StorageService.getCurrentUser();
  const isAdmin = user?.role_code === 'SYSTEM_ADMIN';
  const [tab, setTab] = React.useState<'INTERNAL' | 'CLIENT'>('INTERNAL');
  const [deliveries, setDeliveries] = React.useState<NotificationDelivery[]>([]);
  const [retrying, setRetrying] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isAdmin) return;
    void apiRequest<{ deliveries: NotificationDelivery[] }>('/api/notifications/admin/deliveries').then((result) => {
      if (result.ok) setDeliveries(result.data.deliveries || []);
    });
  }, [isAdmin]);

  const visible = notifications.filter((item) => (tab === 'CLIENT' ? isClientItem(item) : !isClientItem(item)));

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
        <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs uppercase tracking-wider">
          <Bell className="w-4 h-4" /> Notifications
        </div>
        <h1 className="text-xl font-bold text-slate-100 mt-1">Notification Center</h1>
        <p className="text-xs text-slate-400 mt-1">
          Internal PMS alerts stay on the dashboard. Outlook email is sent only when someone clicks Send Email Notification or when a reminder is due. Client emails are listed separately.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('INTERNAL')}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${tab === 'INTERNAL' ? 'bg-cyan-600 text-white' : 'border border-slate-700 text-slate-300'}`}
          >
            Internal PMS
          </button>
          <button
            type="button"
            onClick={() => setTab('CLIENT')}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${tab === 'CLIENT' ? 'bg-amber-600 text-slate-950' : 'border border-slate-700 text-slate-300'}`}
          >
            Client / Customer
          </button>
          {notifications.length > 0 && (
            <button
              type="button"
              onClick={() => void clearAll()}
              className="ml-auto rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-slate-800"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-5 space-y-3">
        {visible.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            {tab === 'CLIENT' ? 'No client or customer emails yet.' : "You're all caught up. No internal PMS notifications."}
          </div>
        ) : visible.map((n) => (
          <Link
            key={n.id}
            href={notificationHref(n)}
            onClick={() => {
              void markRead(n.id);
            }}
            className={`block w-full text-left p-3.5 border rounded-lg text-xs space-y-1 transition-all ${
              n.read_status ? 'bg-slate-950/40 border-slate-800 text-slate-400 opacity-80' : 'bg-cyan-950/30 border-cyan-800/80 text-slate-100'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-bold text-cyan-300">
                {!n.read_status && <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" title="Unread" />}
                <NotificationGlyph item={n} />
                {n.title}
              </span>
              <span className="flex items-center gap-2 text-[10px] font-mono text-slate-500">
                {n.notification_status && (
                  <span className="text-cyan-300">{statusLabel(n)}</span>
                )}
                {n.email_status && n.email_status !== 'NOT_SENT' && (
                  <span className={n.email_status === 'FAILED' ? 'text-rose-300' : n.email_status === 'SENT' ? 'text-emerald-300' : 'text-slate-400'}>
                    {n.email_status === 'SENT' ? 'Sent' : n.email_status === 'FAILED' ? 'Failed' : n.email_status}
                  </span>
                )}
                <span className={n.read_status ? 'text-slate-500' : 'text-cyan-400 font-bold'}>{n.read_status ? 'Read' : 'Unread'}</span>
                <span>{formatRelativeTime(n.created_at)}</span>
              </span>
            </div>
            <p className="text-slate-300">{n.message}</p>
            {n.notification_history && n.notification_history.length > 0 && (
              <p className="text-[10px] text-slate-500">
                Last: {n.notification_history[n.notification_history.length - 1].reason}
              </p>
            )}
          </Link>
        ))}
      </div>

      {isAdmin && (
        <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-5 space-y-3">
          <h2 className="text-sm font-bold text-slate-100">Email delivery log</h2>
          <p className="text-xs text-slate-400">Internal and client deliveries. Failed emails can be retried. This view is limited to System Admin.</p>
          {deliveries.length === 0 ? (
            <p className="text-xs text-slate-500">No email deliveries recorded yet.</p>
          ) : deliveries.slice(0, 20).map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs">
              <div>
                <div className="font-semibold text-slate-200">{item.subject}</div>
                <div className="text-slate-400">
                  {item.email_channel === 'CLIENT' ? 'Client' : 'Internal'} · {item.recipient_email} · {item.status}
                  {item.dispatch_mode ? ` · ${item.dispatch_mode}` : ''}
                  {item.transaction_id ? ` · ${item.transaction_id}` : ''}
                </div>
                {item.failure_reason && <div className="text-rose-300">{item.failure_reason}</div>}
              </div>
              {item.status === 'FAILED' && (
                <button
                  type="button"
                  disabled={retrying === item.notification_id}
                  onClick={async () => {
                    setRetrying(item.notification_id);
                    await apiRequest(`/api/notifications/${item.notification_id}/retry-email`, { method: 'POST' });
                    const result = await apiRequest<{ deliveries: NotificationDelivery[] }>('/api/notifications/admin/deliveries');
                    if (result.ok) setDeliveries(result.data.deliveries || []);
                    setRetrying(null);
                  }}
                  className="rounded bg-cyan-600 px-3 py-1.5 font-bold text-white disabled:opacity-60"
                >
                  Retry
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
