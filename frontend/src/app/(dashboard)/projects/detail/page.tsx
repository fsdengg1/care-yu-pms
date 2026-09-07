'use client';

import { Suspense } from 'react';
import ProjectDetailPage from '../[id]/page';

export default function ProjectDetailStaticPage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-400">Loading project...</div>}>
      <ProjectDetailPage />
    </Suspense>
  );
}
