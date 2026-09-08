'use client';

import React from 'react';
import { Send, X } from 'lucide-react';

export default function CreateProjectModal({
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
          <h3 className="text-base font-bold text-slate-100">Submit this project to PM?</h3>
          <button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-200">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-slate-400">
          Mandatory fields will be validated. After submit, status becomes Submitted to PM and the project enters PM Review. Existing leads are not changed.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
          >
            <Send className="h-4 w-4" /> Submit to PM
          </button>
        </div>
      </div>
    </div>
  );
}
