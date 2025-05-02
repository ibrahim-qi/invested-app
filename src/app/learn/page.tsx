'use server';

import { createServerClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';
import { redirect } from 'next/navigation';
import { BookOpenIcon } from '@heroicons/react/24/outline'; // Example Icon

// Define the Concept type based on your schema
// Ensure 'category', 'title', 'summary', 'id' exist
// MANUALLY ADD category and summary if not in generated types
type Concept = Database['public']['Tables']['concepts']['Row'] & {
    category?: string | null; // Add manually
    summary?: string | null;  // Add manually
};

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
    .select('*')
    .order('category', { ascending: true })
    .order('title', { ascending: true });

  if (conceptsError) {
    console.error("Error fetching concepts:", conceptsError.message);
    return <p className="text-red-500">Error loading learning concepts.</p>;
  }

  // Cast through unknown to align with manually adjusted type
  const concepts: Concept[] = (conceptsData as unknown as Concept[]) || [];

  // Group concepts by category
  const conceptsByCategory: { [category: string]: Concept[] } = {};
  concepts.forEach(concept => {
    // Access manually added category field
    const category = concept.category || 'Uncategorized'; // Default category if null/empty
    if (!conceptsByCategory[category]) {
      conceptsByCategory[category] = [];
    }
    conceptsByCategory[category].push(concept);
  });

  const categories = Object.keys(conceptsByCategory).sort(); // Sort category names alphabetically

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">Learning Concepts</h1>
      
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
              {conceptsByCategory[category].map((concept) => (
                // Basic card display - can link to a modal or detail page later
                <div 
                  key={concept.id} 
                  className="block p-4 bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200 cursor-pointer" 
                  // TODO: Add onClick to open modal or navigate to a detail page
                  // onClick={() => openConceptModal(concept)}
                >
                  <div className="flex items-center mb-2">
                      <BookOpenIcon className="h-5 w-5 text-indigo-500 mr-2 flex-shrink-0" />
                      <h3 className="text-lg font-semibold text-gray-800 truncate" title={concept.title}>
                         {concept.title}
                      </h3>
                   </div>
                  <p className="text-sm text-gray-600 line-clamp-3">
                    {/* Access manually added summary field */}
                    {concept.summary || 'No summary available.'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
} 