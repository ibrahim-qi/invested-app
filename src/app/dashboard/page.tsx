import { createSupabaseServerClient } from '@/lib/supabaseClient';
import { redirect } from 'next/navigation';
import { learningModulesData } from '@/lib/learningModulesData';
import Link from 'next/link';
import type { Database } from '@/lib/database.types'; // Import full DB types

// Define a type for the saved simulation data we fetch
type SavedSimulation = Database['public']['Tables']['saved_simulations']['Row'];

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

  // Fetch Saved Simulations
  let savedSimulations: SavedSimulation[] = [];
  const { data: simData, error: simError } = await supabase
    .from('saved_simulations')
    .select('*') // Select all columns for display
    .eq('user_id', user.id)
    .order('created_at', { ascending: false }) // Show newest first
    .limit(10); // Limit to latest 10 for now

  if (simError) {
    console.error('Error fetching saved simulations:', simError.message);
  } else if (simData) {
    savedSimulations = simData;
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        <div>
          <h2 className="text-2xl font-semibold mb-4">Quick Links</h2>
          <div className="flex flex-col space-y-2">
            <Link href="/learn" className="text-blue-600 hover:underline">Browse All Modules</Link>
            <Link href="/simulation" className="text-blue-600 hover:underline">Run New Simulation</Link>
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-semibold mb-4">Recent Simulations</h2>
          {savedSimulations.length > 0 ? (
            <ul className="space-y-4">
              {savedSimulations.map((sim) => (
                <li key={sim.id} className="p-4 border rounded-lg shadow-sm bg-white dark:bg-gray-800">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      {new Date(sim.created_at).toLocaleDateString()} - {new Date(sim.created_at).toLocaleTimeString()}
                    </span>
                    {/* Add Delete button later */}
                  </div>
                  {sim.simulation_name && <p className="font-semibold text-lg mb-1">{sim.simulation_name}</p>}
                  <p className="text-sm">Params: £{sim.initial_investment} initial, £{sim.monthly_contribution}/mo, {sim.time_horizon_years} yrs, {sim.risk_level}</p>
                  {sim.scenario_id && <p className="text-xs italic text-gray-600 dark:text-gray-400">Scenario applied</p>}
                  <p className="mt-2 text-lg font-bold text-green-600 dark:text-green-400">Final Balance: £{Number(sim.final_balance).toLocaleString()}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500 dark:text-gray-400">You haven't saved any simulations yet.</p>
          )}
          {/* Add link to view all saved simulations later */}
        </div>
      </div>
    </div>
  );
} 