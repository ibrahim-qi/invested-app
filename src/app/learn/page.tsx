import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabaseClient';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import type { Database } from '@/lib/database.types'; // Import full DB types

type Module = Database['public']['Tables']['learning_modules']['Row'];

type Lesson = Database['public']['Tables']['lessons']['Row']; // Need this type too

// Helper function to fetch lessons for a module (to check completion)
// We only need the IDs here
async function getLessonsForModule(
  supabase: ReturnType<typeof createSupabaseServerClient>, 
  moduleId: string
): Promise<{ id: string }[]> { // Return only IDs
  const { data, error } = await supabase
    .from('lessons')
    .select('id') // Select only ID
    .eq('module_id', moduleId);
  if (error) {
    console.error(`Error fetching lessons for module ${moduleId}:`, error.message);
    return [];
  }
  return data || [];
}

export default async function LearnPage() {
  const supabase = createSupabaseServerClient();

  // Fetch Modules from DB
  const { data: modulesData, error: modulesError } = await supabase
    .from('learning_modules')
    .select('*')
    .order('module_order', { ascending: true });

  if (modulesError) {
    console.error("Error fetching learning modules:", modulesError.message);
    // Handle error display
    return <p className="text-red-500">Error loading learning modules.</p>;
  }

  const modules: Module[] = modulesData || [];

  // Get user session & progress (existing logic)
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  let completedLessonIds = new Set<string>();
  if (userId) {
    const { data: progressData, error: progressError } = await supabase
      .from('user_lesson_progress')
      .select('lesson_id')
      .eq('user_id', userId);
    if (progressError) {
      console.error('Error fetching user progress:', progressError.message);
    } else if (progressData) {
      completedLessonIds = new Set(progressData.map(p => p.lesson_id));
    }
  }

  // Create a map for quick lookup of module lessons for completion check
  const moduleLessonsMap = new Map<string, string[]>();
  for (const module of modules) {
     const lessons = await getLessonsForModule(supabase, module.id);
     moduleLessonsMap.set(module.id, lessons.map(l => l.id));
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Learning Modules</h1>
      {modules.length === 0 && <p>No learning modules available yet.</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {modules.map((module) => {
          const moduleLessonIds = moduleLessonsMap.get(module.id) || [];
          const totalLessonsInModule = moduleLessonIds.length;
          const completedLessonsInModule = moduleLessonIds.filter(lessonId => completedLessonIds.has(lessonId)).length;
          const isModuleComplete = userId && totalLessonsInModule > 0 && completedLessonsInModule === totalLessonsInModule;

          return (
            <Link key={module.id} href={`/learn/${module.id}`} legacyBehavior>
              <a className="relative block p-6 bg-white rounded-lg border border-gray-200 shadow-md hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700">
                {isModuleComplete && (
                  <CheckCircleIcon className="absolute top-3 right-3 h-6 w-6 text-green-500" title="Module Completed" />
                )}
                <h2 className="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                  {module.title}
                </h2>
                <p className="font-normal text-gray-700 dark:text-gray-400 mb-3">
                  {module.description}
                </p>
                {userId && totalLessonsInModule > 0 && (
                   <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-auto pt-2 border-t border-gray-200 dark:border-gray-700">
                       {completedLessonsInModule} / {totalLessonsInModule} Lessons Completed
                   </div>
                )}
                {!userId && totalLessonsInModule > 0 && (
                   <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-auto pt-2 border-t border-gray-200 dark:border-gray-700">
                       {totalLessonsInModule} Lessons
                   </div>
                )}
              </a>
            </Link>
          );
        })}
      </div>
    </div>
  );
} 