'use client';

import { Suspense } from 'react';
import CeoEscalationDetailPage from '../[id]/page';

export default function CeoEscalationDetailStaticPage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-400">Loading escalation...</div>}>
      <CeoEscalationDetailPage />
    </Suspense>
  );
}
