'use client';

import { Link } from '@/lib/navigation';
import React, { useEffect, useMemo, useState } from 'react';

import { ChevronDown, ChevronUp, History, Inbox, Search } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { formatRelativeTime } from '@/lib/format';

export interface LeadWorkflowEvent {
  id: string;
  at: string;
  lead_id: string;
  lead_number: string;
  customer_name: string;
  title: string;
  project_title?: string;
  actor: string;
  status: string;
  href: string;
}

const SESSION_KEY = 'careyu-project-activity-open';

export default function LeadWorkflowTimeline({
  title = 'Project Activity',
}: {
  title?: string;
}) {
  const [events, setEvents] = useState<LeadWorkflowEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      setOpen(sessionStorage.getItem(SESSION_KEY) === '1');
    } catch {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const result = await apiRequest<{ events: LeadWorkflowEvent[] }>('/api/dashboard/activity');
      if (result.ok) setEvents(result.data.events || []);
      setLoaded(true);
    })();
  }, []);

  function toggle() {
    setOpen((current) => {
      const next = !current;
      try {
        sessionStorage.setItem(SESSION_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return events;
    const matchingIds = new Set(
      events
        .filter((event) =>
          [event.title, event.project_title, event.lead_number, event.lead_id, event.customer_name, event.actor, event.status]
            .join(' ')
            .toLowerCase()
            .includes(needle)
        )
        .map((event) => event.lead_id)
    );
    return events.filter((event) => matchingIds.has(event.lead_id));
  }, [events, query]);

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between border-b border-slate-800 pb-2 text-left"
      >
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-100">
          <History className="h-4 w-4 text-cyan-400" /> {title}
        </h2>
        <span className="inline-flex items-center gap-1 text-xs text-slate-400">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>
      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="pt-3">
            <label className="relative mb-3 block">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search project activity..."
                className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-slate-100 outline-none focus:border-cyan-600"
              />
            </label>
            {!loaded ? (
              <p className="text-xs text-slate-500">Loading timeline…</p>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center">
                <Inbox className="mx-auto mb-2 h-6 w-6 text-slate-600" />
                <p className="text-xs text-slate-400">
                  {query.trim() ? 'No project activity found.' : 'No lead activity yet. Create a lead or wait for the next workflow step.'}
                </p>
              </div>
            ) : (
              <ol className="space-y-0">
                {filtered.map((event, index) => (
                  <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
                    <div className="flex w-4 shrink-0 flex-col items-center">
                      <span className="mt-1 h-2.5 w-2.5 rounded-full bg-cyan-400 ring-4 ring-slate-900" />
                      {index < filtered.length - 1 && <span className="mt-1 w-px flex-1 bg-slate-700" />}
                    </div>
                    <Link href={event.href} className="min-w-0 flex-1 rounded-lg border border-slate-800/80 bg-slate-950/50 px-3 py-2 hover:border-cyan-800">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-xs font-semibold text-slate-100">{event.project_title || event.title}</div>
                        <div className="shrink-0 text-[10px] text-slate-500">{formatRelativeTime(event.at)}</div>
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-400">
                        <span className="font-mono font-bold text-cyan-400">{event.lead_number}</span>
                        {' · '}
                        {event.customer_name}
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-500">{event.actor}{event.project_title ? ` · ${event.title}` : ''}</div>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
