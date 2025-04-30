import React, { Suspense } from 'react';
import { createServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import SimulationContent from './SimulationClient'; // Import the client component

// This is the main Server Component for the page
export default async function SimulationPage() {
  // --- Authentication Check ---
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?message=Please login to run simulations');
  }
  // -----------------------------

  // Render the client component within Suspense
  // Suspense is needed because SimulationContent uses useSearchParams
  return (
    <Suspense fallback={<div>Loading simulation parameters...</div>}>
      <SimulationContent />
    </Suspense>
  );
} 