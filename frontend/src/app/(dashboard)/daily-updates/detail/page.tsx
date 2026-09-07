'use client';

import { Suspense } from 'react';
import DailyUpdateDetailPage from '../[id]/page';

export default function DailyUpdateDetailStaticPage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-400">Loading daily update...</div>}>
      <DailyUpdateDetailPage />
    </Suspense>
  );
}
