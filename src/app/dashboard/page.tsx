import { createServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Database } from '@/lib/database.types'; // Import full DB types
import DeleteSimulationButton from '@/components/DeleteSimulationButton'; // Import delete button
import { LightBulbIcon } from '@heroicons/react/24/outline'; // Import an icon

// Define a type for the saved simulation data we fetch
type SavedSimulation = Database['public']['Tables']['saved_simulations']['Row'];
// Also need the Module type for the loop below
type Module = Database['public']['Tables']['learning_modules']['Row'];

export default async function DashboardPage() {
  const supabase = createServerClient();

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
    <div className="container mx-auto p-8">
      <h1 className="text-3xl font-bold mb-8">Welcome back, <span className="font-medium text-gray-700">{user.email}!</span></h1>

      {recommendedModule ? (
        <div className="bg-white border border-blue-200 text-blue-900 p-5 rounded-lg shadow-sm mb-8 flex items-start space-x-4" role="alert">
          <LightBulbIcon className="h-6 w-6 text-blue-500 flex-shrink-0 mt-1" />
          <div>
            <p className="font-semibold text-lg">Your Next Step:</p>
            <p className="text-sm mt-1">We recommend continuing with the following module:</p>
            <Link href={`/learn/${recommendedModule.id}`} legacyBehavior>
              <a className="block mt-3 p-3 bg-gray-50 border border-gray-200 rounded hover:shadow-md hover:bg-white transition duration-150 ease-in-out">
                <h3 className="text-lg font-semibold text-gray-900">{recommendedModule.title}</h3>
                <p className="text-sm text-gray-600 mt-1">{recommendedModule.description}</p>
              </a>
            </Link>
          </div>
        </div>
      ) : (
        <div className="bg-green-50 border border-green-200 text-green-900 p-5 rounded-lg shadow-sm mb-8 flex items-start space-x-4" role="alert">
           <svg className="h-6 w-6 text-green-500 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
           <div>
              <p className="font-semibold text-lg">Congratulations!</p>
              <p className="text-sm mt-1">You have completed all available learning modules.</p>
           </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 transition-shadow duration-150 hover:shadow-lg">
          <h2 className="text-xl font-semibold mb-5 text-gray-800">Module Progress</h2>
          {modules.length > 0 ? (
            <ul className="space-y-4">
              {modules.map((module, index) => {
                const moduleLessonIds = moduleToLessonIdsMap.get(module.id) || [];
                const isModuleComplete = moduleLessonIds.length > 0 && moduleLessonIds.every(lessonId => completedLessonIds.has(lessonId));
                // Remove border from last item
                const isLastItem = index === modules.length - 1;
                return (
                  <li 
                    key={module.id} 
                    className={`pb-4 flex justify-between items-center ${!isLastItem ? 'border-b border-gray-200' : ''}`}
                  >
                    <Link href={`/learn/${module.id}`} className="hover:text-indigo-600 flex-grow font-medium text-gray-700 text-base mr-4">
                      {module.title}
                    </Link>
                    {isModuleComplete ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Completed
                      </span>
                    ) : (
                       <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                         In Progress
                       </span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
             <p className="text-gray-500 italic">No learning modules found.</p>
          )}
        </div>

        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 transition-shadow duration-150 hover:shadow-lg">
          <h2 className="text-xl font-semibold mb-5 text-gray-800">Recent Simulations</h2>
          {savedSimulations.length > 0 ? (
            <ul className="space-y-5">
              {savedSimulations.map((sim) => {
                const queryString = createSimulationQueryString(sim);
                return (
                  <li key={sim.id} className="p-4 border rounded-md bg-gray-50 flex flex-col space-y-3 hover:shadow-lg transition-shadow duration-150 ease-in-out hover:bg-gray-100">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="block text-xs font-medium text-gray-500">
                          {new Date(sim.created_at).toLocaleDateString()} - {new Date(sim.created_at).toLocaleTimeString()}
                        </span>
                        {sim.simulation_name && <p className="font-semibold text-base mt-1 text-gray-800">{sim.simulation_name}</p>}
                      </div>
                      <DeleteSimulationButton simulationId={sim.id} userId={user.id} />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-gray-600">Params: £{sim.initial_investment.toLocaleString()} initial, £{sim.monthly_contribution.toLocaleString()}/mo, {sim.time_horizon_years} yrs, {sim.risk_level}</p>
                      {sim.scenario_id && <p className="text-xs italic text-gray-500">Scenario applied: {sim.scenario_id}</p>}
                      <p className="pt-1 text-base font-semibold text-green-700">Final Balance: £{Number(sim.final_balance).toLocaleString()}</p>
                    </div>
                    <div className="text-right pt-2 border-t border-gray-200">
                      <Link 
                        href={`/simulation?${queryString}`}
                        className="text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors duration-150 ease-in-out"
                      >
                        Load Parameters &rarr;
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-gray-500 italic">You haven't saved any simulations yet.</p>
          )}
        </div>
      </div>
    </div>
  );
} 