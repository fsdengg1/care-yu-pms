'use client';

import React, { useEffect, useState } from 'react';
import { progressForSheetStatus } from '@/lib/dailyStatus';

export function ProgressBarCell({
  status,
  progressPercent,
  editable = false,
  onProgressCommit,
}: {
  status?: string;
  progressPercent?: number;
  editable?: boolean;
  onProgressCommit?: (percent: number) => void;
}) {
  const aligned = progressForSheetStatus(status, progressPercent);
  const [percent, setPercent] = useState(aligned);

  useEffect(() => {
    setPercent(aligned);
  }, [aligned]);

  const barColor = percent >= 100 ? '#16a34a' : percent > 0 ? '#2563eb' : '#94a3b8';

  return (
    <div className="sheet-progress-hours">
      <div className="sheet-progress-label">Progress</div>
      <div className="sheet-progress-track" aria-hidden>
        <div className="sheet-progress-fill" style={{ width: `${percent}%`, background: barColor }} />
      </div>
      {editable && onProgressCommit ? (
        <label className="sheet-progress-pct">
          <input
            type="number"
            min={0}
            max={100}
            className="sheet-input sheet-progress-input"
            value={Number.isFinite(percent) ? percent : 0}
            onChange={(event) => setPercent(Math.max(0, Math.min(100, Number(event.target.value) || 0)))}
            onBlur={() => {
              const next = Math.max(0, Math.min(100, Math.round(percent) || 0));
              setPercent(next);
              if (next !== aligned) onProgressCommit(next);
            }}
            title="Progress % (0–100)"
            aria-label="Progress percent"
          />
          <span>%</span>
        </label>
      ) : (
        <div className={`sheet-progress-pct-label ${percent >= 100 ? 'is-complete' : ''}`}>{percent}%</div>
      )}
    </div>
  );
}

export function LoggedHoursCell({
  hoursWorked,
  loggedHours,
  editable = false,
  onHoursCommit,
}: {
  hoursWorked?: number;
  loggedHours?: string;
  editable?: boolean;
  onHoursCommit?: (hours: number) => void;
}) {
  const hours = Math.max(0, Number(hoursWorked) || 0);
  const label = loggedHours && loggedHours.includes('hrs') ? loggedHours : `${hours.toFixed(1)} hrs`;

  return (
    <div className="sheet-progress-hours">
      <div className="sheet-hours-caption">Logged hours</div>
      {editable && onHoursCommit ? (
        <label className="sheet-progress-pct">
          <input
            type="number"
            min={0}
            step={0.25}
            className="sheet-input sheet-hours-input"
            defaultValue={hours}
            key={`hours-${hours}`}
            onBlur={(event) => {
              const next = Math.max(0, Number(event.target.value) || 0);
              if (next !== hours) onHoursCommit(next);
            }}
            title="Logged hours (decimal, e.g. 4.0)"
            aria-label="Logged hours"
          />
          <span>hrs</span>
        </label>
      ) : (
        <span className="sheet-hours-value">{label}</span>
      )}
    </div>
  );
}

export default function LoggedHoursProgressCell({
  status,
  progressPercent,
  hoursWorked,
  loggedHours,
  editable = false,
  onProgressCommit,
  onHoursCommit,
}: {
  status?: string;
  progressPercent?: number;
  hoursWorked?: number;
  loggedHours?: string;
  editable?: boolean;
  onProgressCommit?: (percent: number) => void;
  onHoursCommit?: (hours: number) => void;
}) {
  return (
    <div className="space-y-2">
      <ProgressBarCell
        status={status}
        progressPercent={progressPercent}
        editable={editable}
        onProgressCommit={onProgressCommit}
      />
      <LoggedHoursCell hoursWorked={hoursWorked} loggedHours={loggedHours} editable={editable} onHoursCommit={onHoursCommit} />
    </div>
  );
}
