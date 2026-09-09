'use client';

import { Link } from '@/lib/navigation';
import React, { useEffect, useRef } from 'react';

import { AtSign, Bell, CheckCircle2, ClipboardList, Heart, Megaphone, MessageCircle, MessagesSquare, Pin, X } from 'lucide-react';
import { NotificationItem } from '@/lib/types';
import { formatRelativeTime } from '@/lib/format';
import { notificationHref } from '@/lib/notificationHref';
import { notificationPresentation, toastDurationMs } from '@/lib/notificationPresentation';
import { messageTypeMeta } from '@/lib/messageTypes';

function ToastIcon({ item, high }: { item: NotificationItem; high: boolean }) {
  const presentation = notificationPresentation(item);
  const className = `h-4 w-4 ${high ? 'text-rose-300' : 'text-cyan-400'}`;
  if (presentation.messageType) {
    const meta = messageTypeMeta(presentation.messageType);
    const Icon = meta.Icon;
    return <Icon className={`h-4 w-4 ${high ? 'text-rose-300' : meta.iconClass}`} />;
  }
  if (presentation.kind === 'task') return <ClipboardList className={className} />;
  if (presentation.kind === 'project') return <CheckCircle2 className={className} />;
  if (presentation.kind === 'announcement') return <Megaphone className={className} />;
  if (presentation.kind === 'forum') {
    if (item.type === 'FORUM_MENTION') return <AtSign className={className} />;
    if (item.type === 'FORUM_REACTION') return <Heart className={className} />;
    if (item.type === 'FORUM_PINNED') return <Pin className={className} />;
    if (item.type === 'FORUM_REPLY') return <MessageCircle className={className} />;
    return <MessagesSquare className={className} />;
  }
  return <Bell className={className} />;
}

export default function NotificationToast({
  item,
  onDismiss,
  onView,
}: {
  item: NotificationItem;
  onDismiss: (id: string) => void;
  onView: (item: NotificationItem) => void;
}) {
  const presentation = notificationPresentation(item);
  const high = presentation.priority === 'HIGH';
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    const timer = window.setTimeout(() => onDismissRef.current(item.id), toastDurationMs(presentation.priority));
    return () => window.clearTimeout(timer);
  }, [item.id, presentation.priority]);

  return (
    <div
      role={high ? 'alert' : 'status'}
      aria-atomic="true"
      className={`w-full rounded-xl border bg-slate-900/95 p-3 shadow-xl backdrop-blur-md ${
        high ? 'border-rose-700' : 'border-slate-800'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div className={`mt-0.5 rounded-md border p-1.5 ${high ? 'border-rose-800 bg-rose-950/50' : 'border-cyan-800 bg-cyan-950/40'}`}>
          <ToastIcon item={item} high={high} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="text-xs font-bold text-slate-100">{presentation.heading}</div>
            <button
              type="button"
              onClick={() => onDismiss(item.id)}
              className="rounded p-0.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200"
              aria-label="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {presentation.source && <div className="mt-0.5 text-[11px] font-medium text-cyan-300">{presentation.source}</div>}
          <p className="mt-1 text-xs leading-relaxed text-slate-300">{presentation.preview}</p>
          {presentation.detail && <p className="mt-1 text-[11px] text-slate-400">{presentation.detail}</p>}
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-500">{formatRelativeTime(item.created_at)}</span>
            <Link
              href={notificationHref(item)}
              onClick={() => onView(item)}
              className="text-[11px] font-bold text-cyan-400 hover:underline"
            >
              {presentation.actionLabel}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
