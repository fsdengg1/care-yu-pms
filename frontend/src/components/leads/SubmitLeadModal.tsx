'use client';

import React from 'react';
import { Loader2, Send, X } from 'lucide-react';

export default function SubmitLeadModal({
  open,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div className="modal-scrim fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-6">
        <div className="flex items-start justify-between">
          <h3 className="text-base font-bold text-slate-100">Submit Lead to Project Manager?</h3>
          <button type="button" onClick={onCancel} disabled={busy} className="text-slate-400 hover:text-slate-200 disabled:opacity-50">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-slate-400">
          Are you sure you want to submit this lead to the Project Manager? Once submitted, the lead will move to the PM review process.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 disabled:opacity-50">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {busy ? 'Submitting…' : 'Submit to PM'}
          </button>
        </div>
      </div>
    </div>
  );
}
