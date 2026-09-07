'use client';

import { Suspense } from 'react';
import LeadDetailPage from '../[id]/page';

export default function LeadDetailStaticPage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-400">Loading lead...</div>}>
      <LeadDetailPage />
    </Suspense>
  );
}
