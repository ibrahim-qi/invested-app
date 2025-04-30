import { createSupabaseServerClient } from '@/lib/supabaseClient';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Database } from '@/lib/database.types'; // Import full DB types
import DeleteSimulationButton from '@/components/DeleteSimulationButton'; // Import delete button

// Define a type for the saved simulation data we fetch
type SavedSimulation = Database['public']['Tables']['saved_simulations']['Row'];
// Also need the Module type for the loop below
type Module = Database['public']['Tables']['learning_modules']['Row'];

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

  // --- Fetch Modules for Recommendation Logic --- 
  const { data: modulesData, error: modulesError } = await supabase
    .from('learning_modules')
    .select('id, title, description') // Fetch needed fields
    .order('module_order', { ascending: true });
  
  if (modulesError) {
      console.error("Error fetching learning modules for dashboard:", modulesError.message);
      // Handle error - maybe don't show recommendations
  }
  const modules: Pick<Module, 'id' | 'title' | 'description'>[] = modulesData || [];
  // ---------------------------------------------

  // --- Fetch All Lessons for Recommendation Logic --- 
  // We need lesson IDs associated with modules to determine completion
  const { data: allLessonsData, error: lessonsError } = await supabase
      .from('lessons')
      .select('id, module_id');

  if (lessonsError) {
      console.error("Error fetching lessons for dashboard:", lessonsError.message);
      // Handle error
  }
  const allLessons: {id: string, module_id: string}[] = allLessonsData || [];
  const moduleToLessonIdsMap = new Map<string, string[]>();
  allLessons.forEach(lesson => {
      if (!moduleToLessonIdsMap.has(lesson.module_id)) {
          moduleToLessonIdsMap.set(lesson.module_id, []);
      }
      moduleToLessonIdsMap.get(lesson.module_id)?.push(lesson.id);
  });
  // ---------------------------------------------------

  // Find the next recommended module (first one not fully completed)
  let recommendedModule: Pick<Module, 'id' | 'title' | 'description'> | null = null;
  for (const module of modules) {
    const moduleLessonIds = moduleToLessonIdsMap.get(module.id) || [];
    const isModuleComplete = moduleLessonIds.length > 0 && moduleLessonIds.every((lessonId: string) => completedLessonIds.has(lessonId)); // Explicit type
    if (!isModuleComplete) {
      recommendedModule = module;
      break; // Found the first incomplete module
    }
  }

  // --- Helper to create query string from sim params --- 
  const createSimulationQueryString = (sim: SavedSimulation): string => {
      const params = {
          initialInvestment: sim.initial_investment,
          monthlyContribution: sim.monthly_contribution,
          timeHorizonYears: sim.time_horizon_years,
          riskLevel: sim.risk_level,
          scenarioId: sim.scenario_id,
          scenarioChoiceId: sim.scenario_choice_id,
      };
      // Filter out null/undefined values and convert numbers to strings
      const filteredParams = Object.entries(params)
          .filter(([_, value]) => value !== null && value !== undefined)
          .map(([key, value]) => [key, String(value)]); // Convert value to string
          
      return new URLSearchParams(filteredParams).toString(); // No assertion needed now
  }
  // -----------------------------------------------------

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
          <h2 className="text-2xl font-semibold mb-4">Module Progress</h2>
          {modules.length > 0 ? (
            <ul className="space-y-3">
              {modules.map((module) => {
                const moduleLessonIds = moduleToLessonIdsMap.get(module.id) || [];
                const isModuleComplete = moduleLessonIds.length > 0 && moduleLessonIds.every(lessonId => completedLessonIds.has(lessonId));
                return (
                  <li key={module.id} className="p-3 border rounded-lg shadow-sm bg-white dark:bg-gray-800 flex justify-between items-center">
                    <Link href={`/learn/${module.id}`} className="hover:underline flex-grow">
                      {module.title}
                    </Link>
                    {isModuleComplete ? (
                      <span className="ml-3 text-sm font-medium text-green-600 dark:text-green-400">✓ Completed</span>
                    ) : (
                       <span className="ml-3 text-sm font-medium text-gray-500 dark:text-gray-400">In Progress</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
             <p className="text-gray-500 dark:text-gray-400">No learning modules found.</p>
          )}
        </div>

        <div>
          <h2 className="text-2xl font-semibold mb-4">Recent Simulations</h2>
          {savedSimulations.length > 0 ? (
            <ul className="space-y-4">
              {savedSimulations.map((sim) => {
                const queryString = createSimulationQueryString(sim);
                return (
                  <li key={sim.id} className="p-4 border rounded-lg shadow-sm bg-white dark:bg-gray-800">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="block text-sm font-medium text-gray-500 dark:text-gray-400">
                          {new Date(sim.created_at).toLocaleDateString()} - {new Date(sim.created_at).toLocaleTimeString()}
                        </span>
                        {sim.simulation_name && <p className="font-semibold text-lg mb-1">{sim.simulation_name}</p>}
                      </div>
                      <DeleteSimulationButton simulationId={sim.id} userId={user.id} />
                    </div>
                    <p className="text-sm">Params: £{sim.initial_investment} initial, £{sim.monthly_contribution}/mo, {sim.time_horizon_years} yrs, {sim.risk_level}</p>
                    {sim.scenario_id && <p className="text-xs italic text-gray-600 dark:text-gray-400">Scenario applied: {sim.scenario_id}</p>}
                    <p className="mt-2 text-lg font-bold text-green-600 dark:text-green-400">Final Balance: £{Number(sim.final_balance).toLocaleString()}</p>
                    <div className="text-right mt-2">
                      <Link 
                        href={`/simulation?${queryString}`}
                        className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline"
                      >
                        Load Parameters
                      </Link>
                    </div>
                  </li>
                );
              })}
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