'use client';

import { Suspense } from 'react';
import ProjectActivityPage from '../[id]/activity/page';

export default function ProjectActivityStaticPage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-400">Loading project activity...</div>}>
      <ProjectActivityPage />
    </Suspense>
  );
}
