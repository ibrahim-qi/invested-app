'use server';

import { createServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache'; // Optional: if you want to refresh data on the learn page

export async function recordQuizScore(conceptId: string, score: number) {
  const supabase = createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error('User not authenticated for recording score.');
    return { error: 'User not authenticated.' };
  }

  // Check if progress record exists first (optional, update handles this)
  // We assume the record was created on page view by the upsert

  const { error } = await supabase
    .from('user_concept_progress')
    .update({ quiz_score: score }) // Update the quiz_score
    .eq('user_id', user.id)
    .eq('concept_id', conceptId);

  if (error) {
    console.error(`Error updating quiz score for user ${user.id}, concept ${conceptId}:`, error.message);
    return { error: 'Failed to save quiz score.' };
  }

  console.log(`Quiz score ${score} recorded for user ${user.id}, concept ${conceptId}`);

  // Optional: Revalidate the main learn page path if you display scores there
  // revalidatePath('/learn');

  return { success: true };
} 