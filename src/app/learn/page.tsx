import Link from 'next/link';
import { learningModulesData } from '@/lib/learningModulesData';
import { createSupabaseServerClient } from '@/lib/supabaseClient'; // Server client
import { CheckCircleIcon } from '@heroicons/react/24/solid'; // Icon for completion

// This page now needs to be async to fetch server-side data
export default async function LearnPage() {
  const supabase = createSupabaseServerClient();

  // Get current user session
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;

  let completedLessonIds = new Set<string>();

  // If user is logged in, fetch their completed lessons
  if (userId) {
    const { data: progressData, error } = await supabase
      .from('user_lesson_progress')
      .select('lesson_id')
      .eq('user_id', userId);

    if (error) {
      console.error('Error fetching user progress:', error.message);
      // Handle error appropriately, maybe show a message
    } else if (progressData) {
      completedLessonIds = new Set(progressData.map(p => p.lesson_id));
    }
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Learning Modules</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {learningModulesData.map((module) => {
          // Check if all lessons in this module are completed
          const allLessons = module.lessons.map(l => l.id);
          const isModuleComplete = userId && allLessons.every(lessonId => completedLessonIds.has(lessonId));

          return (
            <Link key={module.id} href={`/learn/${module.id}`} legacyBehavior>
              <a className="relative block p-6 bg-white rounded-lg border border-gray-200 shadow-md hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700">
                {/* Completion Checkmark */}
                {isModuleComplete && (
                  <CheckCircleIcon className="absolute top-3 right-3 h-6 w-6 text-green-500" title="Module Completed" />
                )}
                <h2 className="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                  {module.title}
                </h2>
                <p className="font-normal text-gray-700 dark:text-gray-400">
                  {module.description}
                </p>
                {/* TODO: Add lesson completion count later */}
              </a>
            </Link>
          );
        })}
      </div>
    </div>
  );
} 