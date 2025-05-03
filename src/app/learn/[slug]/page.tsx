'use server';

import { createServerClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';
import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation'; // Import notFound
import ConceptRenderer from '@/components/learning/ConceptRenderer'; // Import the renderer
import Link from 'next/link'; // Ensure Link is imported

type ConceptPageProps = {
  params: {
    slug: string;
  };
};

export default async function ConceptPage({ params }: ConceptPageProps) {
  const supabase = createServerClient();
  const { slug } = params;

  // --- Authentication Check ---
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user || authError) {
    console.error('Auth Error:', authError?.message);
    redirect(`/login?message=Please login to view this concept&redirectTo=/learn/${slug}`);
  }
  // -----------------------------

  // Fetch the specific concept using the slug
  const { data: concept, error: conceptError } = await supabase
    .from('concepts')
    .select('id, title, content, slug') // Select only needed fields + id
    .eq('slug', slug)
    .single();

  if (conceptError || !concept) {
    console.error(`Error fetching concept ${slug}:`, conceptError?.message);
    notFound();
  }

  // --- Fetch necessary data for Next Concept recommendation --- 
  const [allConceptsData, progressData] = await Promise.all([
    supabase.from('concepts').select('id, slug, title').order('id', { ascending: true }),
    supabase.from('user_concept_progress').select('concept_id').eq('user_id', user.id)
  ]);

  if (allConceptsData.error) {
    console.error("Error fetching all concepts for recommendation:", allConceptsData.error.message);
    // Handle error gracefully, maybe don't show recommendation
  }
  if (progressData.error) {
    console.error("Error fetching progress for recommendation:", progressData.error.message);
    // Handle error gracefully
  }

  const allConcepts = allConceptsData.data || [];
  const completedConceptIds = new Set(progressData.data?.map(p => p.concept_id) || []);

  // --- Find the next concept --- 
  let nextRecommendedConcept: { slug: string | null; title: string; } | null = null;
  const currentConceptIndex = allConcepts.findIndex(c => c.id === concept.id);

  if (currentConceptIndex !== -1 && currentConceptIndex < allConcepts.length - 1) {
      for (let i = currentConceptIndex + 1; i < allConcepts.length; i++) {
          if (!completedConceptIds.has(allConcepts[i].id)) {
              nextRecommendedConcept = allConcepts[i];
              break; // Found the first uncompleted one
          }
      }
  }
  // ---------------------------------------------------------

  // --- Record Progress (Attempt Upsert) ---
  // Use upsert: inserts if not present, does nothing/updates if present (based on PK conflict)
  const { error: progressError } = await supabase
    .from('user_concept_progress')
    .upsert({
      user_id: user.id,
      concept_id: concept.id,
      // completed_at will default to now() based on table definition
    });

  if (progressError) {
      // Log error but don't block the page view
      console.error(`Error recording progress for user ${user.id}, concept ${concept.id}:`, progressError.message);
      // Possible reasons: RLS policy missing/incorrect, table name wrong, constraint issues.
  }
  // --------------------------------------

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <h1 className="text-3xl font-bold mb-4 text-gray-800">{concept.title}</h1>
      
      {/* Use the ConceptRenderer component */}
      <div className="prose lg:prose-xl max-w-none bg-white p-6 rounded shadow mb-8">
         <ConceptRenderer content={concept.content} conceptId={concept.id} />
      </div>

      {/* --- Link to Simulation --- */}
      <div className="mt-8 p-4 bg-indigo-50 rounded-lg border border-indigo-200 text-center">
        <h3 className="text-lg font-semibold text-indigo-800 mb-2">Apply Your Knowledge!</h3>
        <p className="text-indigo-700 mb-4 text-sm">
          Ready to see how this concept works in practice? Try it out in the simulator.
        </p>
        <Link href={`/simulation?conceptSlug=${concept.slug}`} legacyBehavior>
          <a className="inline-block px-6 py-2 bg-indigo-600 text-white font-medium text-sm rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150 ease-in-out">
            Go to Simulation
          </a>
        </Link>
        {/* Optional: Add more specific parameters if needed, e.g.: */}
        {/* <Link href={`/simulation?riskLevel=moderate&startConcept=${concept.id}`}>...</Link> */}
      </div>
      {/* -------------------------- */}

      {/* Placeholder for potential related simulations or next steps */}
      <div className="mt-8">
        {/* Example: <Link href={`/simulation?startWith=${concept.id}`}>Try a related simulation</Link> */}
        {/* --- Next Recommended Concept Button --- */}
        {nextRecommendedConcept && nextRecommendedConcept.slug && (
            <div className="mt-8 pt-6 border-t border-gray-200 text-center">
                <p className="text-sm text-gray-600 mb-2">Ready for the next step?</p>
                <Link href={`/learn/${nextRecommendedConcept.slug}`} legacyBehavior>
                    <a className="inline-block px-5 py-2 bg-green-600 text-white font-medium text-sm rounded-md shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition duration-150 ease-in-out">
                        Next Concept: {nextRecommendedConcept.title} &rarr;
                    </a>
                </Link>
            </div>
        )}
        {/* ------------------------------------- */}
      </div>
    </div>
  );
}

// Optional: Generate static paths if you have a fixed set of concepts
// export async function generateStaticParams() {
//   const supabase = createServerClient();
//   const { data: concepts } = await supabase.from('concepts').select('slug');
//   return concepts?.map(({ slug }) => ({
//     slug: slug!,
//   })) || [];
// } 