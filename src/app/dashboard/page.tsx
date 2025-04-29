import { createSupabaseServerClient } from '@/lib/supabaseClient';
import { redirect } from 'next/navigation';
import { learningModulesData } from '@/lib/learningModulesData';
import Link from 'next/link';

export default async function DashboardPage() {
  const supabase = createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();

  // Redirect to login if user is not authenticated
  if (!user) {
    redirect('/login?message=Please login to view your dashboard');
  }

  // Fetch user's completed lessons
  let completedLessonIds = new Set<string>();
  const { data: progressData, error } = await supabase
    .from('user_lesson_progress')
    .select('lesson_id')
    .eq('user_id', user.id);

  if (error) {
    console.error('Error fetching dashboard progress:', error.message);
    // Handle error - maybe show a generic error message?
  } else if (progressData) {
    completedLessonIds = new Set(progressData.map(p => p.lesson_id));
  }

  // Find the next recommended module (first one not fully completed)
  let recommendedModule = null;
  for (const module of learningModulesData) {
    const allLessons = module.lessons.map(l => l.id);
    const isModuleComplete = allLessons.every(lessonId => completedLessonIds.has(lessonId));
    if (!isModuleComplete) {
      recommendedModule = module;
      break; // Found the first incomplete module
    }
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Welcome back, {user.email}!</h1>

      {recommendedModule ? (
        <div className="bg-blue-100 border-l-4 border-blue-500 text-blue-700 p-4 rounded shadow mb-6" role="alert">
          <p className="font-bold">Your Next Step:</p>
          <p>We recommend continuing with the following module:</p>
          <Link href={`/learn/${recommendedModule.id}`} legacyBehavior>
            <a className="block mt-4 p-4 bg-white rounded shadow hover:shadow-md">
              <h3 className="text-xl font-bold text-gray-900">{recommendedModule.title}</h3>
              <p className="text-gray-600">{recommendedModule.description}</p>
            </a>
          </Link>
        </div>
      ) : (
        <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 rounded shadow mb-6" role="alert">
          <p className="font-bold">Congratulations!</p>
          <p>You have completed all available learning modules.</p>
          {/* Link to simulation or other features later */}
        </div>
      )}

      {/* TODO: Add more dashboard elements later (e.g., overall progress summary, simulation links) */}
      <h2 className="text-2xl font-semibold mb-4">Quick Links</h2>
      <div className="flex space-x-4">
        <Link href="/learn" className="text-blue-600 hover:underline">Browse All Modules</Link>
        <Link href="/simulation" className="text-blue-600 hover:underline">Go to Simulation</Link>
      </div>

    </div>
  );
} 