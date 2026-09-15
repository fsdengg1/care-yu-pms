'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Mail, Monitor, Smartphone, Sun, Moon, RotateCcw, Send, Save, Clock } from 'lucide-react';
import {
  DailyStatusApi,
  EmailReportHistoryEntry,
  EmailReportScheduleConfig,
} from '@/lib/dailyStatusApi';
import { SnapshotPeriod, inferDefaultEmailPeriod, appTodayIso, readStoredWorkDate, writeStoredWorkDate } from '@/lib/dailyStatus';
import { StorageService } from '@/lib/storage';
import SheetDateFilter from '@/components/work/SheetDateFilter';

function friendlyError(message?: string) {
  if (!message || /axios|sql|undefined|json/i.test(message)) return 'Unable to load the email report.';
  return message;
}

function emptyScheduleConfig(): EmailReportScheduleConfig {
  return {
    fromEmail: 'aicareyuautomation@gmail.com',
    fromName: 'CareYu Automation',
    toEmail: 'engg.director@careyu.ai, robotlead1@careyu.ai',
    cc: 'ceo@careyu.ai, cto@careyu.ai, robottech@careyu.ai, fsdengg1@careyu.ai, fsdlead1@careyu.ai, projects@careyu.ai',
    bcc: '',
    subject: 'Daily Work Report',
    contentTemplate: '',
    sendAtNoon: true,
    sendAtEvening: true,
    timezone: 'Asia/Kolkata',
  };
}

function formatHistoryDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(+date)) return value;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(date.getDate()).padStart(2, '0')}-${months[date.getMonth()]}-${date.getFullYear()}`;
}

function statusClass(status: EmailReportHistoryEntry['status']) {
  if (status === 'Sent') return 'text-emerald-300';
  if (status === 'Failed') return 'text-rose-300';
  return 'text-amber-300';
}

const fieldClass =
  'mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-cyan-600';

export default function EmailReportsPage() {
  const [period, setPeriod] = useState<SnapshotPeriod>(() => inferDefaultEmailPeriod());
  const [mode, setMode] = useState<'desktop' | 'mobile'>('desktop');
  const [html, setHtml] = useState('');
  const [subject, setSubject] = useState('');
  const [available, setAvailable] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [schedule, setSchedule] = useState<EmailReportScheduleConfig>(emptyScheduleConfig);
  const [history, setHistory] = useState<EmailReportHistoryEntry[]>([]);
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [workDate, setWorkDate] = useState(appTodayIso);

  const changeWorkDate = (date: string) => {
    const next = date || appTodayIso();
    setWorkDate(next);
    writeStoredWorkDate(next);
  };

  const loadPreview = useCallback(async (nextPeriod: SnapshotPeriod, date = workDate, showBusy = false) => {
    if (showBusy) setBusy(true);
    setError('');
    const preview = await DailyStatusApi.emailPreview(nextPeriod, date);
    if (showBusy) setBusy(false);
    if (!preview.ok) {
      setError(friendlyError(preview.message));
      return;
    }
    setAvailable(preview.data.available);
    setHtml(preview.data.html || '');
    setSubject(preview.data.subject || '');
    setMessage(preview.data.message || '');
  }, [workDate]);

  const loadScheduleAndHistory = useCallback(async () => {
    const [scheduleResult, historyResult] = await Promise.all([
      DailyStatusApi.emailSchedule(),
      DailyStatusApi.emailHistory(),
    ]);
    if (scheduleResult.ok) {
      setSchedule({ ...emptyScheduleConfig(), ...scheduleResult.data.config });
    }
    if (historyResult.ok) {
      setHistory(historyResult.data.history || []);
    }
  }, []);

  useEffect(() => {
    setWorkDate(readStoredWorkDate());
  }, []);

  useEffect(() => {
    void loadPreview(period, workDate, true);
    void loadScheduleAndHistory();
  }, [period, workDate, loadPreview, loadScheduleAndHistory]);

  useEffect(() => {
    const refresh = () => {
      void loadPreview(period, workDate);
      void loadScheduleAndHistory();
    };
    const onDailyUpdateSaved = (event: Event) => {
      const detail = (event as CustomEvent<{ workDate?: string; period?: SnapshotPeriod }>).detail;
      if (detail?.workDate && detail.workDate !== workDate) return;
      void loadPreview(period, workDate);
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('careyu-daily-update-saved', onDailyUpdateSaved as EventListener);
    const timer = window.setInterval(refresh, 4000);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('careyu-daily-update-saved', onDailyUpdateSaved as EventListener);
      window.clearInterval(timer);
    };
  }, [period, workDate, loadPreview, loadScheduleAndHistory]);

  const saveSchedule = async () => {
    setScheduleBusy(true);
    setError('');
    const result = await DailyStatusApi.saveEmailSchedule(schedule);
    setScheduleBusy(false);
    if (!result.ok) {
      setError(friendlyError(result.message));
      return;
    }
    setSchedule(result.data.config);
    setNotice(result.data.message);
    void loadScheduleAndHistory();
  };

  const sendTest = async () => {
    setScheduleBusy(true);
    setError('');
    const slot = period === 'evening' ? 'evening' : 'noon';
    const result = await DailyStatusApi.emailScheduleTest(slot);
    setScheduleBusy(false);
    if (!result.ok) {
      setError(friendlyError(result.message));
      void loadScheduleAndHistory();
      return;
    }
    if (result.data.html) setHtml(result.data.html);
    if (result.data.subject) setSubject(result.data.subject);
    setNotice(result.data.message);
    setAvailable(true);
    void loadScheduleAndHistory();
  };

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden text-xs">
      <div className="rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/30 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
          <Mail className="h-4 w-4" /> Email Reports
        </div>
        <h1 className="mt-1 text-xl font-bold text-slate-100">Daily Work Updates email</h1>
        <p className="mt-1 text-slate-400">
          Mail reports use the same Daily Work Updates sheet (Person, Project, Task Description, and related
          columns). Use <span className="font-semibold text-slate-300">Save</span> on Daily Work Updates so
          this preview picks up the latest edits. Morning email is the locked 11:00 AM snapshot. Evening
          preview always reflects the latest saved evening updates. No mail on Sundays or 2nd/4th Saturdays
          (company leave). Morning locks automatically at 11:00 AM
          ({schedule.timezone || 'Asia/Kolkata'}); evening stays editable after that. Automatic sends run on
          working days at 11:00 AM and 7:15 PM.
        </p>

        <div className="mt-4 grid gap-3 rounded-xl border border-cyan-800/60 bg-slate-950/70 p-4 md:grid-cols-2">
          <label className="block text-slate-200">
            From Email
            <input
              type="email"
              value={schedule.fromEmail}
              onChange={(e) => setSchedule((prev) => ({ ...prev, fromEmail: e.target.value }))}
              placeholder="aicareyuautomation@gmail.com"
              className={fieldClass}
            />
          </label>
          <label className="block text-slate-200">
            To Email
            <input
              type="text"
              value={schedule.toEmail}
              onChange={(e) => setSchedule((prev) => ({ ...prev, toEmail: e.target.value }))}
              placeholder="engg.director@careyu.ai, robotlead1@careyu.ai"
              className={fieldClass}
            />
          </label>
          <div className="md:col-span-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={scheduleBusy}
              onClick={() => void saveSchedule()}
              className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-3 py-2 font-bold text-white hover:bg-cyan-500 disabled:opacity-60"
            >
              <Save className="h-3.5 w-3.5" /> Save Configuration
            </button>
            <button
              type="button"
              disabled={scheduleBusy}
              onClick={() => void sendTest()}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 font-bold text-slate-200 hover:border-cyan-600 disabled:opacity-60"
            >
              <Send className="h-3.5 w-3.5" /> Send Test Email
            </button>
            <span className="self-center text-slate-500">More fields (CC, BCC, schedule) are below.</span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <SheetDateFilter value={workDate} onChange={changeWorkDate} variant="dark" />
          <button
            type="button"
            onClick={() => setPeriod('morning')}
            className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 font-bold ${period === 'morning' ? 'bg-cyan-600 text-white' : 'border border-slate-700 text-slate-200 hover:border-cyan-600'}`}
          >
            <Sun className="h-3.5 w-3.5" /> Morning
          </button>
          <button
            type="button"
            onClick={() => setPeriod('evening')}
            className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 font-bold ${period === 'evening' ? 'bg-cyan-600 text-white' : 'border border-slate-700 text-slate-200 hover:border-cyan-600'}`}
          >
            <Moon className="h-3.5 w-3.5" /> Evening
          </button>
          <button
            type="button"
            onClick={() => setMode('desktop')}
            className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 font-bold ${mode === 'desktop' ? 'bg-slate-800 text-cyan-300' : 'border border-slate-700 text-slate-200'}`}
          >
            <Monitor className="h-3.5 w-3.5" /> Desktop Preview
          </button>
          <button
            type="button"
            onClick={() => setMode('mobile')}
            className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 font-bold ${mode === 'mobile' ? 'bg-slate-800 text-cyan-300' : 'border border-slate-700 text-slate-200'}`}
          >
            <Smartphone className="h-3.5 w-3.5" /> Mobile Preview
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const result = await DailyStatusApi.emailRestore();
              setBusy(false);
              if (!result.ok) {
                setError(friendlyError(result.message));
                return;
              }
              setHtml(result.data.html);
              setSubject(result.data.subject);
              if (result.data.period) setPeriod(result.data.period);
              setNotice('Previous report restored.');
              setAvailable(true);
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 font-bold text-slate-200 hover:border-cyan-600 disabled:opacity-60"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Restore Report
          </button>
          <button
            type="button"
            disabled={busy || !available}
            onClick={async () => {
              const user = StorageService.getCurrentUser();
              setBusy(true);
              const result = await DailyStatusApi.emailSend(
                period,
                schedule.toEmail || user?.email,
                workDate
              );
              setBusy(false);
              if (!result.ok) {
                setError(friendlyError(result.message));
                return;
              }
              setHtml(result.data.html);
              setSubject(result.data.subject);
              setNotice(
                result.data.toEmail
                  ? `${result.data.message} Sent to ${result.data.toEmail}.`
                  : result.data.message
              );
              void loadScheduleAndHistory();
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-3 py-2 font-bold text-white hover:bg-cyan-500 disabled:opacity-60"
          >
            <Send className="h-3.5 w-3.5" /> Send
          </button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-rose-900 bg-rose-950/40 px-4 py-3 text-rose-300">{error}</div>}
      {notice && (
        <div className="rounded-xl border border-emerald-800 bg-emerald-950/40 px-4 py-3 text-emerald-200">{notice}</div>
      )}
      {message && !available && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-slate-400">{message}</div>
      )}

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
          <Clock className="h-4 w-4" /> Email Schedule
        </div>
        <p className="mt-1 text-slate-400">
          Configure From/To addresses in the UI. From must be the Elastic Email verified sender (
          aicareyuautomation@gmail.com). The API key stays on the backend only.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-slate-300">
            From Email
            <input
              type="email"
              value={schedule.fromEmail}
              onChange={(e) => setSchedule((prev) => ({ ...prev, fromEmail: e.target.value }))}
              placeholder="aicareyuautomation@gmail.com"
              className={fieldClass}
            />
          </label>
          <label className="block text-slate-300">
            From Name
            <input
              type="text"
              value={schedule.fromName}
              onChange={(e) => setSchedule((prev) => ({ ...prev, fromName: e.target.value }))}
              placeholder="CareYu Automation"
              className={fieldClass}
            />
          </label>
          <label className="block text-slate-300">
            To Email
            <input
              type="text"
              value={schedule.toEmail}
              onChange={(e) => setSchedule((prev) => ({ ...prev, toEmail: e.target.value }))}
              placeholder="engg.director@careyu.ai, robotlead1@careyu.ai"
              className={fieldClass}
            />
          </label>
          <label className="block text-slate-300">
            CC
            <input
              type="text"
              value={schedule.cc}
              onChange={(e) => setSchedule((prev) => ({ ...prev, cc: e.target.value }))}
              placeholder="ceo@careyu.ai, cto@careyu.ai, …"
              className={fieldClass}
            />
          </label>
          <label className="block text-slate-300">
            BCC
            <input
              type="text"
              value={schedule.bcc}
              onChange={(e) => setSchedule((prev) => ({ ...prev, bcc: e.target.value }))}
              placeholder="optional, comma-separated"
              className={fieldClass}
            />
          </label>
          <label className="block text-slate-300">
            Subject
            <input
              type="text"
              value={schedule.subject}
              onChange={(e) => setSchedule((prev) => ({ ...prev, subject: e.target.value }))}
              placeholder="Daily Work Report"
              className={fieldClass}
            />
          </label>
        </div>
        <label className="mt-4 block text-slate-300">
          Email Content / Template
          <textarea
            value={schedule.contentTemplate}
            onChange={(e) => setSchedule((prev) => ({ ...prev, contentTemplate: e.target.value }))}
            placeholder="Optional intro text. Leave blank to use the generated Daily Work Updates report. Use {{report}} to wrap the generated HTML."
            rows={4}
            className={`${fieldClass} min-h-[96px] resize-y`}
          />
        </label>
        <div className="mt-4 space-y-2 text-slate-300">
          <div className="font-semibold text-slate-200">Send Schedule</div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={schedule.sendAtNoon}
              onChange={(e) => setSchedule((prev) => ({ ...prev, sendAtNoon: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-cyan-600"
            />
            11:00 AM — 11:00 AM Daily Report
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={schedule.sendAtEvening}
              onChange={(e) => setSchedule((prev) => ({ ...prev, sendAtEvening: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-cyan-600"
            />
            7:15 PM — 7:15 PM Daily Report
          </label>
          <p className="pt-1 text-slate-500">Timezone: {schedule.timezone || 'Asia/Kolkata'} (IST)</p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={scheduleBusy}
            onClick={() => void saveSchedule()}
            className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-3 py-2 font-bold text-white hover:bg-cyan-500 disabled:opacity-60"
          >
            <Save className="h-3.5 w-3.5" /> Save Configuration
          </button>
          <button
            type="button"
            disabled={scheduleBusy}
            onClick={() => void sendTest()}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 font-bold text-slate-200 hover:border-cyan-600 disabled:opacity-60"
          >
            <Send className="h-3.5 w-3.5" /> Send Test Email
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="text-sm font-bold text-slate-100">Email History</h2>
        <p className="mt-1 text-slate-400">Scheduled and test deliveries. Failed rows keep the provider error for diagnosis.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="px-3 py-2 font-semibold">Date</th>
                <th className="px-3 py-2 font-semibold">Time</th>
                <th className="px-3 py-2 font-semibold">From</th>
                <th className="px-3 py-2 font-semibold">To</th>
                <th className="px-3 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-slate-500">
                    No email history yet.
                  </td>
                </tr>
              ) : (
                history.map((item) => (
                  <tr key={item.id} className="border-b border-slate-800/80 text-slate-200">
                    <td className="px-3 py-2 whitespace-nowrap">{formatHistoryDate(item.date)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{item.time}</td>
                    <td className="px-3 py-2">{item.fromEmail || '—'}</td>
                    <td className="px-3 py-2">{item.toEmail || '—'}</td>
                    <td className={`px-3 py-2 font-semibold ${statusClass(item.status)}`}>
                      {item.status}
                      {item.error ? <div className="mt-1 font-normal text-rose-400/90">{item.error}</div> : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {available && html && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-100">HTML Preview</h2>
            <span className="text-slate-500">{subject}</span>
          </div>
          <div
            className={`mx-auto rounded-xl border border-slate-800 bg-white ${mode === 'mobile' ? 'max-w-[390px] overflow-hidden' : 'w-full overflow-x-auto'}`}
          >
            <iframe
              title="Email preview"
              srcDoc={html}
              className={`h-[720px] border-0 bg-white ${mode === 'mobile' ? 'w-full' : 'min-w-[1280px] w-full'}`}
            />
          </div>
        </section>
      )}
    </div>
  );
}
