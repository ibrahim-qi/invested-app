'use server';

import { createServerClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';
import { redirect } from 'next/navigation';
import { BookOpenIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';

// Define the Concept type based on your schema
// Ensure 'category', 'title', 'slug', 'id' exist in the generated types
// REMOVED manual summary field
type Concept = Database['public']['Tables']['concepts']['Row'];
// If category isn't optional in your db, ensure the type reflects that
// Or handle potential null category values below if needed.


export default async function LearnPage() {
  const supabase = createServerClient();

  // --- Authentication Check ---
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?message=Please login to browse learning concepts');
  }
  // -----------------------------

  // Fetch all concepts from the DB, ordered by category then title
  const { data: conceptsData, error: conceptsError } = await supabase
    .from('concepts')
    .select('*') // Select all columns to match the Concept type
    .order('category', { ascending: true, nullsFirst: false })
    .order('title', { ascending: true });

  if (conceptsError) {
    console.error("Error fetching concepts:", conceptsError.message);
    return <p className="text-red-500">Error loading learning concepts.</p>;
  }

  // Cast directly to Concept[] if types align
  const concepts: Concept[] = conceptsData || [];

  // --- Fetch User Progress ---
  const { data: progressData, error: progressError } = await supabase
    .from('user_concept_progress')
    .select('concept_id') // Select only the concept_id
    .eq('user_id', user.id);

  if (progressError) {
    console.error("Error fetching user progress:", progressError.message);
    // Don't block page load, just log the error
  }
  // Create a Set of completed concept IDs for efficient lookup
  const completedConceptIds = new Set(progressData?.map(p => p.concept_id) || []);
  // -------------------------

  // --- Determine Next Recommended Concept --- 
  let recommendedConcept: Concept | null = null;
  // Iterate through the sorted concepts to find the first one not completed
  for (const concept of concepts) {
      if (!completedConceptIds.has(concept.id)) {
          recommendedConcept = concept;
          break; // Found the first uncompleted one
      }
  }
  // -----------------------------------------

  // Group concepts by category
  const conceptsByCategory: { [category: string]: Concept[] } = {};
  concepts.forEach(concept => {
    // Use category directly, provide default if null/undefined/empty
    const category = concept.category || 'Uncategorized';
    if (!conceptsByCategory[category]) {
      conceptsByCategory[category] = [];
    }
    conceptsByCategory[category].push(concept);
  });

  const categories = Object.keys(conceptsByCategory).sort();

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">Learning Concepts</h1>
      
      {/* --- Recommended Concept Section --- */}
      {recommendedConcept && (
        <div className="mb-8 p-4 bg-yellow-50 border border-yellow-300 rounded-lg shadow-sm">
          <h2 className="text-xl font-semibold text-yellow-800 mb-2">Recommended Next Step</h2>
          <p className="text-sm text-yellow-700 mb-3">
             Based on your progress, we suggest tackling this concept next:
          </p>
          <Link href={`/learn/${recommendedConcept.slug}`} legacyBehavior>
              <a className="inline-flex items-center px-4 py-2 bg-yellow-500 text-white font-medium text-sm rounded-md shadow-sm hover:bg-yellow-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 transition duration-150 ease-in-out">
                 {recommendedConcept.title}
                 <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 ml-2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25 21 12m0 0-3.75 3.75M21 12H3" />
                 </svg>
              </a>
           </Link>
        </div>
      )}
      {/* ----------------------------------- */}

      {concepts.length === 0 && (
        <p className="text-gray-600">No learning concepts available yet.</p>
      )}

      {categories.map((category) => (
        <div key={category} className="mb-8">
          <h2 className="text-2xl font-semibold mb-4 text-indigo-700 border-b pb-2">
            {category}
          </h2>
          {conceptsByCategory[category].length === 0 ? (
            <p className="text-sm text-gray-500">No concepts in this category yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {conceptsByCategory[category].map((concept) => {
                const isCompleted = completedConceptIds.has(concept.id);
                return (
                  <Link href={`/learn/${concept.slug}`} key={concept.id} legacyBehavior>
                    <a className={`block p-4 bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200 cursor-pointer ${isCompleted ? 'opacity-70 border-green-300' : ''}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center min-w-0">
                          <BookOpenIcon className={`h-5 w-5 ${isCompleted ? 'text-green-500' : 'text-indigo-500'} mr-2 flex-shrink-0`} />
                          <h3 className="text-lg font-semibold text-gray-800 truncate" title={concept.title ?? undefined}>
                            {concept.title ?? 'Untitled Concept'}
                          </h3>
                        </div>
                        {isCompleted && (
                          <CheckCircleIcon className="h-5 w-5 text-green-500 flex-shrink-0 ml-2" title="Completed" />
                        )}
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-3">
                        {concept.summary || 'Click to view details.'}
                      </p>
                    </a>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
} 