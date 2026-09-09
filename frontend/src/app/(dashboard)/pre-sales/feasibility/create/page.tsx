'use client';
import { useRouter } from '@/lib/navigation';
import { useEffect } from 'react';

/**
 * Feasibility assignments are now created directly from the Lead Detail page
 * via the + ADD TEAM button in the Feasibility tab.
 * This route redirects to the Feasibility list for reference.
 */
export default function FeasibilityCreateRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/pre-sales/feasibility');
  }, [router]);
  return null;
}
