'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { DailySheetStatus, SHEET_STATUSES, sheetStatusClass } from '@/lib/dailyStatus';
import { placeDropdown } from '@/lib/dropdownPlacement';

export default function StatusDropdown({
  value,
  onChange,
  disabled,
  variant = 'default',
}: {
  value: string;
  onChange: (status: DailySheetStatus) => void;
  disabled?: boolean;
  variant?: 'default' | 'sheet';
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 160, maxHeight: 240 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const box = buttonRef.current?.getBoundingClientRect();
      if (!box) return;
      const next = placeDropdown(box, { minWidth: 160, preferredHeight: 240 });
      setCoords(next);
    };
    place();
    const onDoc = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex items-center gap-1 rounded border text-[10px] font-bold whitespace-nowrap hover:opacity-90 disabled:cursor-default disabled:opacity-80 ${sheetStatusClass(value)} ${variant === 'sheet' ? 'sheet-status-badge' : 'w-full rounded-full px-2 py-1'}`}
      >
        <span className="min-w-0 truncate">{value || 'Not Started'}</span>
        {!disabled && <ChevronDown className="h-3 w-3 shrink-0" />}
      </button>
      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width, maxHeight: coords.maxHeight, zIndex: 9999 }}
            className="overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-1 shadow-xl"
          >
            {SHEET_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => {
                  onChange(status);
                  setOpen(false);
                }}
                className="flex w-full items-center rounded-lg px-2 py-1.5 hover:bg-slate-800"
              >
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${sheetStatusClass(status)}`}>
                  {status}
                </span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
