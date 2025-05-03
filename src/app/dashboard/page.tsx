'use client'; // <-- Make it a client component

import React, { useState, useEffect, useMemo } from 'react'; // <-- Import hooks
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'; // <-- Client-side Supabase
import { useRouter, useSearchParams } from 'next/navigation'; // <-- Use router hook and added useSearchParams
import type { Database } from '@/lib/database.types';
import PersonalizationWizard from '@/components/onboarding/PersonalizationWizard'; // <-- Import the wizard
import Link from 'next/link'; // Needed for linking saved sims
import DeleteSimulationButton from '@/components/DeleteSimulationButton'; // Import delete button
import ConceptModal from '@/components/ConceptModal'; // Import Concept Modal
import type { User } from '@supabase/supabase-js'; // Import User type

// Update UserProfile type to include all onboarding fields
type UserProfile = {
  user_id: string;
  onboarding_complete?: boolean | null;
  financial_knowledge_level?: string | null;
  selected_goals?: string[] | null;
  risk_tolerance_profile?: string | null;
  career_stage?: string | null;
  location_region?: string | null;
  // Add other fields if needed by the dashboard itself later
}

// --- Detailed types for SavedSimulation JSONB columns ---
// type SimulationParametersJson = {
//   initial_investment?: number; // Matches DB column names
//   monthly_contribution?: number;
//   time_horizon?: number;
//   risk_level?: string;
//   // Add others if needed (e.g., scenario_id, scenario_choice_id if stored here)
// };
//
// type SimulationResultsJson = {
//   p50_final_balance?: number;
//   p10_final_balance?: number;
//   p90_final_balance?: number;
//   // Add others if needed (e.g., benchmarks)
// };

// Base type from generated schema
type BaseSavedSimulation = Database['public']['Tables']['saved_simulations']['Row'];

// Extend the base Row type to include properly typed JSONB columns
// type DetailedSavedSimulation = Omit<BaseSavedSimulation, 'parameters' | 'results'> & {
//   parameters: SimulationParametersJson | null;
//   results: SimulationResultsJson | null;
// };
// ---------------------------------------------------------

// Import Concept type separately if not already globally available
type Concept = Database['public']['Tables']['concepts']['Row'];

// --- Type Definitions ---

// Copied/adapted from SimulationClient for suggested params
type SimulationParams = {
  initialInvestment: number;
  monthlyContribution: number;
  timeHorizonYears: number;
  riskLevel: 'conservative' | 'moderate' | 'aggressive';
  // Add inflation/fee if needed for suggestions later
  // annualInflationRate: number;
  // annualFeeRate: number;
};

// Intermediate type for generating suggestions
type SuggestionInput = {
  title: string;
  description: string;
  params: SimulationParams;
};

// Final type for rendered suggestions
type SuggestedSimulation = {
  title: string;
  description: string;
  link: string;
};

// --- Helper Functions ---

// Function to generate simulation suggestions based on profile
const generateSimulationSuggestions = (profile: UserProfile): SuggestedSimulation[] => {
  const suggestionInputs: SuggestionInput[] = []; // Use SuggestionInput type here
  const risk = (profile.risk_tolerance_profile?.toLowerCase() as SimulationParams['riskLevel']) || 'moderate';
  const primaryGoal = profile.selected_goals?.[0];
  const careerStage = profile.career_stage;

  // Suggestion 1: Balanced Approach based on Risk Profile
  suggestionInputs.push({
    title: `Balanced ${formatDisplay(risk)} Approach`,
    description: `A standard simulation based on your ${formatDisplay(risk)} risk profile over 15 years. A good starting point.`, 
    params: {
      initialInvestment: 1000,
      monthlyContribution: 150,
      timeHorizonYears: 15,
      riskLevel: risk,
    }
  });

  // Suggestion 2: Goal-Focused (Example: Home Savings)
  if (primaryGoal === 'home_ownership') {
    suggestionInputs.push({
      title: "Home Savings Focus",
      description: "A shorter-term simulation aimed at saving for a down payment.",
      params: {
        initialInvestment: 2000,
        monthlyContribution: 250,
        timeHorizonYears: 7,
        riskLevel: 'moderate', // Often less aggressive for shorter-term goals
      }
    });
  } 
  // Suggestion 3: Goal-Focused (Example: Retirement)
  else if (primaryGoal === 'retirement' && (careerStage === 'early_career' || careerStage === 'mid_career')) {
     suggestionInputs.push({
      title: "Long-Term Retirement Growth",
      description: `Focusing on long-term growth for retirement, using your ${formatDisplay(risk)} risk profile.`, 
      params: {
        initialInvestment: 500,
        monthlyContribution: 100,
        timeHorizonYears: 30, 
        riskLevel: risk,
      }
    });
  }
  // Add more specific suggestions based on other goals, career stage, knowledge level etc.
  
  // Map inputs to final suggestions with links
  return suggestionInputs.map(input => ({
      title: input.title,
      description: input.description,
      // Create link from the input's params
      link: `/simulation?${new URLSearchParams(input.params as any).toString()}` 
  }));
};

// Helper to format display text (copied from below)
const formatDisplay = (text: string | null | undefined): string => {
    if (!text) return 'N/A';
    return text.split(/[_ -]/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

// Use the base Row type generated from the schema
type SavedSimulation = BaseSavedSimulation;

export default function DashboardPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false); // Track if auth check is done
  // --- State for dashboard data (Use base type) ---
  const [savedSimulations, setSavedSimulations] = useState<SavedSimulation[]>([]);
  const [isLoadingSims, setIsLoadingSims] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  // --- State to prevent simulation fetch loop ---
  const [simsFetchAttempted, setSimsFetchAttempted] = useState(false); 
  // --- State for concepts & modal --- 
  const [allConcepts, setAllConcepts] = useState<Concept[]>([]);
  const [isLoadingConcepts, setIsLoadingConcepts] = useState(false);
  const [conceptError, setConceptError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedConcept, setSelectedConcept] = useState<Concept | null>(null);
  // --- State for User Progress --- 
  const [completedConceptIds, setCompletedConceptIds] = useState<Set<string>>(new Set());
  const [isLoadingProgress, setIsLoadingProgress] = useState(false);
  const [progressError, setProgressError] = useState<string | null>(null);
  // --------------------------------
  const supabase = createClientComponentClient<Database>();
  const router = useRouter();

  useEffect(() => {
    const checkAuthAndFetchProfile = async () => {
      // 1. Check Authentication first
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
          console.error("Error fetching session:", sessionError);
          // Handle error appropriately, maybe redirect or show error
          setIsLoading(false);
          setAuthChecked(true);
          return;
      }

      if (!session) {
        console.log("No session found, redirecting to login.");
        // Redirect to login if user is not authenticated
        router.push('/login?message=Please login to view your dashboard');
        // No need to set loading/authChecked as we are redirecting
        return; 
      }
      
      // Auth check complete
      setAuthChecked(true);
      const user = session.user;

      // 2. Fetch user profile only if authenticated
      console.log("Authenticated, fetching profile for user:", user.id);
      const { data, error } = await supabase
        .from('user_profiles')
        .select('user_id, onboarding_complete, financial_knowledge_level, selected_goals, risk_tolerance_profile, career_stage, location_region') 
        .eq('user_id', user.id)
        .single(); // Expect only one profile

      if (error) {
        console.error('Error fetching user profile:', error.message);
        // Handle profile fetch error (e.g., profile might not exist yet - this is an issue if onboarding depends on it)
        // If it's expected that a profile might not exist until onboarding is attempted,
        // we might need to handle the PGRST116 error specifically or assume onboarding is needed.
        if (error.code === 'PGRST116') {
            console.log('Profile not found for user, assuming onboarding needed.');
            // Treat as onboarding not complete, create a minimal profile object
            setProfile({ user_id: user.id, onboarding_complete: false });
        } else {
            // For other errors, maybe show an error message
            setProfile(null); // Indicate error state
        }
      } else if (data) {
        console.log("Profile fetched:", data);
        setProfile(data as UserProfile);
      } else {
          console.log('No profile data returned, assuming onboarding needed.')
          // Handle case where query succeeds but returns null (shouldn't happen with .single() unless profile doesn't exist)
          setProfile({ user_id: user.id, onboarding_complete: false });
      }

      setIsLoading(false);
    };

    checkAuthAndFetchProfile();
  }, [supabase, router]);

  // --- Effect to Fetch Saved Simulations (adjust type cast) ---
  useEffect(() => {
    // Only run if profile is loaded, onboarding is complete, and we haven't attempted the fetch yet
    if (profile && profile.onboarding_complete && !simsFetchAttempted) {
      const fetchSimulations = async () => {
        console.log("Fetching saved simulations for user:", profile.user_id);
        setIsLoadingSims(true);
        setSimError(null);

        const { data: simData, error } = await supabase
          .from('saved_simulations')
          .select('*') 
          .eq('user_id', profile.user_id)
          .order('created_at', { ascending: false })
          .limit(10);

        if (error) {
          console.error('Error fetching saved simulations:', error.message);
          setSimError("Couldn't load saved simulations.");
        } else {
          console.log("Saved simulations fetched:", simData);
          // Cast to the base type
          setSavedSimulations((simData as SavedSimulation[]) || []); 
        }
        setIsLoadingSims(false);
      };
      // Mark as attempted BEFORE calling fetch
      setSimsFetchAttempted(true);
      fetchSimulations();
    }
  }, [profile, supabase, simsFetchAttempted]); // Depend on profile and attempt flag
  // -------------------------------------------------------------------------------------

  // --- Effect to Fetch Concepts (Runs once after profile load) --- 
  useEffect(() => {
    // Only run if profile exists, onboarding complete, and not already fetched
    if (profile && profile.onboarding_complete && allConcepts.length === 0) {
       const fetchConcepts = async () => {
          console.log("Fetching all concepts...");
          setIsLoadingConcepts(true);
          setConceptError(null);
          // Fetch concepts ordered by creation time or ID for somewhat stable order
          // Select all columns to match the Concept type used in useState
          const { data, error } = await supabase.from('concepts').select('*').order('id', { ascending: true }); 
          if (error) {
              console.error("Error fetching concepts:", error.message);
              setConceptError("Couldn't load educational concepts.");
              setAllConcepts([]); // Ensure it's an empty array on error
          } else {
              console.log("Concepts fetched:", data?.length);
              setAllConcepts(data || []);
          }
          setIsLoadingConcepts(false);
      };
      fetchConcepts();
    }
  }, [profile, supabase, allConcepts.length]);
  // ------------------------------------------

  // --- Effect to Fetch User Progress (Runs once after profile load) --- 
  useEffect(() => {
     if (profile && profile.onboarding_complete && completedConceptIds.size === 0) {
         const fetchProgress = async () => {
             setIsLoadingProgress(true);
             setProgressError(null);
             const { data, error } = await supabase
                 .from('user_concept_progress')
                 .select('concept_id')
                 .eq('user_id', profile.user_id);
             
             if (error) {
                 console.error("Error fetching user progress:", error.message);
                 setProgressError("Couldn't load learning progress.");
             } else {
                 setCompletedConceptIds(new Set(data.map(p => p.concept_id)));
             }
             setIsLoadingProgress(false);
         };
         fetchProgress();
     }
  }, [profile, supabase, completedConceptIds.size]);
  // ---------------------------------------------------------------

  // --- Generate Suggestions (Call helper function) --- 
  // Moved calculation up before conditional return
  const suggestedSimulations = profile ? generateSimulationSuggestions(profile) : [];
  // -----------------------------------------------------

  // --- Determine relevant concepts (Hook) --- 
  // Moved hook call up before conditional return
  const relevantConcepts = useMemo(() => {
    // Profile might be null initially, handle inside useMemo
    if (!profile?.financial_knowledge_level || allConcepts.length === 0) {
        return [];
    }
    const level = profile.financial_knowledge_level.toLowerCase();
    const allowedLevels: (string | null)[] = ['1']; 
    if (level === 'intermediate' || level === 'advanced') {
        allowedLevels.push('2');
    }
    if (level === 'advanced') {
        allowedLevels.push('3');
    }
    allowedLevels.push(null);
    return allConcepts.filter(concept => 
        allowedLevels.includes(concept.knowledge_level_required)
    );
    // Ensure profile is included in dependency array if accessed directly
  }, [profile, allConcepts]); 
  // -------------------------------------------

  // --- Determine Next Recommended Concept --- 
  const nextRecommendedConcept = useMemo(() => {
      if (isLoadingConcepts || isLoadingProgress || allConcepts.length === 0) {
          return null; // Don't recommend until loaded
      }
      // Find the first concept in the ordered list that is NOT in the completed set
      return allConcepts.find(concept => !completedConceptIds.has(concept.id)) || null;
  }, [allConcepts, completedConceptIds, isLoadingConcepts, isLoadingProgress]);
  // --------------------------------------------

  // --- Modal Control Functions ---
  const openConceptModal = (concept: Concept) => {
    setSelectedConcept(concept);
    setIsModalOpen(true);
  };

  const closeConceptModal = () => {
    setIsModalOpen(false);
    setSelectedConcept(null); 
  };
  // -----------------------------

  // --- Helper to create query string (Use direct columns) ---
  const createSimulationQueryString = (sim: SavedSimulation): string => {
      const params: Record<string, string | number | null | undefined> = {
          initialInvestment: sim.initial_investment,
          monthlyContribution: sim.monthly_contribution,
          timeHorizonYears: sim.time_horizon_years,
          riskLevel: sim.risk_level,
          scenarioId: sim.scenario_id,
          scenarioChoiceId: sim.scenario_choice_id,
          annualInflationRate: sim.annual_inflation_rate, 
          annualFeeRate: sim.annual_fee_rate,
      };
      const filteredParams = Object.entries(params)
          .filter(([_, value]) => value !== null && value !== undefined)
          .map(([key, value]) => [key, String(value)]); 
      return new URLSearchParams(filteredParams).toString();
  }
  // -------------------------------------------------------------------------

  // Render loading state
  if (isLoading || !authChecked) { // Wait for auth check AND loading to complete
    return (
        <div className="flex justify-center items-center h-screen">
            <p>Loading dashboard...</p>
            {/* Add a spinner component here if desired */}
        </div>
    );
  }

  // If onboarding is not complete, render the wizard
  if (!profile || profile.onboarding_complete === false || profile.onboarding_complete === null) {
    console.log("Rendering Personalization Wizard");
    return <PersonalizationWizard />;
  }

  // --- Customized Dashboard Content --- 
  console.log("Rendering actual dashboard content with profile:", profile);

  // Derive primary goal after profile is confirmed available
  const primaryGoal = profile.selected_goals && profile.selected_goals.length > 0 
                      ? profile.selected_goals[0] // Use raw value for logic
                      : null;

  // --- Goal Progress Calculation (Simplified) ---
  const goalTargets: Record<string, number> = {
    home_ownership: 30000, // Example target £30k
    retirement: 500000,     // Example target £500k
    debt_management: 5000,  // Example target £5k (pay off)
    build_wealth: 100000,  // Example target £100k
    // Add other goals as needed
  };

  const latestSimulationBalance = savedSimulations[0]?.final_balance ?? 0; // Get latest sim balance

  // Calculate progress for each selected goal
  const goalProgress = profile.selected_goals?.map(goal => {
    const target = goalTargets[goal];
    // Use latest sim balance as proxy for current progress (highly simplified)
    const currentProgress = latestSimulationBalance ?? 0;
    const percentage = target && target > 0 ? Math.min(100, Math.max(0, (currentProgress / target) * 100)) : 0;
    return {
      name: formatDisplay(goal),
      target: target ? `£${target.toLocaleString()}` : 'N/A',
      current: `~£${currentProgress.toLocaleString()} (Projected)`,
      percentage: Math.round(percentage),
    };
  }) || [];
  // -----------------------------------------------

  // Helper function to get goal details (add this within the component or outside if preferred)
  const goalDetailsMap: Record<string, { label: string; target: number }> = {
    'retirement': { label: 'Plan for Retirement', target: 500000 }, // Example targets, adjust as needed
    'home_ownership': { label: 'Save for a Home', target: 30000 },
    'debt_management': { label: 'Manage Debt', target: 5000 },
    'build_wealth': { label: 'General Wealth Building', target: 100000 },
    'education': { label: 'Save for Education', target: 20000 },
  };

  const getGoalDetails = (goalId: string) => {
    return goalDetailsMap[goalId] || { label: formatDisplay(goalId), target: 0 }; // Fallback
  };

  // Helper function for currency formatting (add or import)
  const formatCurrency = (value: number | null | undefined): string => {
    if (value == null) return '£0.00'; // Or N/A
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value);
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <h1 className="text-3xl font-bold mb-6">Welcome back!</h1>
      
      {/* Render the Concept Modal */}
      <ConceptModal 
        isOpen={isModalOpen} 
        onClose={closeConceptModal} 
        concept={selectedConcept} 
      />

      {/* --- How InvestEd Works Section (MOVED HERE) --- */}
      <div className="mb-8 p-6 bg-indigo-50 border border-indigo-200 rounded-lg shadow-sm">
          <h2 className="text-xl font-semibold mb-3 text-indigo-800">How InvestEd Works</h2>
          <p className="text-gray-700 mb-2">
              InvestEd helps you learn about investing and simulate potential outcomes based on your choices.
          </p>
          <ul className="list-disc list-inside space-y-1 text-gray-600">
              <li>
                  <strong>Learn:</strong> Explore key <Link href="/learn" className="text-indigo-600 hover:underline">concepts</Link> through interactive modules, test your knowledge with quizzes, and track your progress. Definitions for tricky terms are available via tooltips.
              </li>
              <li>
                  <strong>Simulate:</strong> Use the <Link href="/simulation" className="text-indigo-600 hover:underline">simulator</Link> to model potential outcomes using a Monte Carlo method. Pay attention to the P10/P50/P90 range to understand potential volatility and likelihoods.
              </li>
              <li>
                  <strong>Analyze:</strong> Review your <span className="font-medium">Saved Simulations</span> below to compare results, understand the impact of your choices, and refine your strategy. Click 'View Analysis' for a detailed breakdown.
              </li>
               <li>
                  <strong>Connect:</strong> Apply what you learn directly in the simulator, and look out for helpful concept explanations triggered by simulation events or parameters.
              </li>
          </ul>
      </div>

      {/* Original Summary Card (KEEP THIS ONE) */}
      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Your Profile Summary</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <p><span className="font-medium text-gray-600">Knowledge Level:</span> {formatDisplay(profile.financial_knowledge_level)}</p>
              <p><span className="font-medium text-gray-600">Risk Profile:</span> {formatDisplay(profile.risk_tolerance_profile)}</p>
              <p><span className="font-medium text-gray-600">Primary Goal:</span> {formatDisplay(primaryGoal)}</p> {/* Use formatDisplay */}
              <p><span className="font-medium text-gray-600">Career Stage:</span> {formatDisplay(profile.career_stage)}</p>
              {profile.selected_goals && profile.selected_goals.length > 1 && (
                    <p className="md:col-span-2"><span className="font-medium text-gray-600">Other Goals:</span> {profile.selected_goals.slice(1).map(formatDisplay).join(', ')}</p>
              )}
          </div>
      </div>

      {/* Recommended Content Section */}
      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Recommended For You</h2>
          {/* Suggested Simulations */}
          <p className="text-gray-600 mb-1 font-medium">Suggested Simulations:</p>
          {suggestedSimulations.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {suggestedSimulations.map((suggestion) => (
                <div key={suggestion.title} className="border border-gray-200 rounded-lg p-4 bg-indigo-50 hover:shadow-md transition-shadow">
                  <h3 className="font-semibold text-indigo-800 mb-1">{suggestion.title}</h3>
                  <p className="text-sm text-gray-600 mb-3">{suggestion.description}</p>
                  <Link href={suggestion.link} className="text-sm font-medium text-indigo-600 hover:text-indigo-900 inline-block">
                    Try this simulation &rarr;
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 italic">Could not generate specific recommendations at this time.</p>
          )}

          {/* Suggested Concepts - Update to show next recommended first */}
          {(relevantConcepts.length > 0 || nextRecommendedConcept) && (
            <div className="mt-6 pt-4 border-t border-gray-200">
              <p className="text-gray-600 mb-1 font-medium">Learning Concepts</p>
              {conceptError && <p className="text-red-500 text-xs italic">{conceptError}</p>}
              {(isLoadingConcepts || isLoadingProgress) && <p className="text-gray-500 text-xs italic">Loading concepts...</p>}
              {!isLoadingConcepts && !isLoadingProgress && !conceptError && (
                 <> 
                    {/* Highlight Next Recommended Concept */}
                    {nextRecommendedConcept ? (
                       <div className="mb-3 p-3 border border-green-200 bg-green-50 rounded-md">
                          <p className="text-xs font-semibold text-green-700 mb-1">Recommended Next Step:</p>
                          <button 
                            onClick={() => openConceptModal(nextRecommendedConcept)} 
                            className="text-indigo-600 hover:text-indigo-800 hover:underline text-sm font-semibold text-left"
                          >
                             {nextRecommendedConcept.title}
                          </button>
                       </div>
                    ) : (
                       <p className="text-sm text-green-600 italic mb-3">You've completed all available concepts!</p> 
                    )}
                    
                    {/* Display other concepts relevant to level (excluding the recommended one if shown) */}
                    <p className="text-gray-600 mb-1 font-medium text-sm">Concepts for your level ({formatDisplay(profile.financial_knowledge_level)}):</p>
                    <ul className="list-disc list-inside space-y-1">
                      {relevantConcepts
                         .filter(concept => concept.id !== nextRecommendedConcept?.id) // Don't repeat recommendation
                         .slice(0, 5) // Limit displayed concepts
                         .map(concept => (
                          <li key={concept.id}>
                            <button 
                              onClick={() => openConceptModal(concept)}
                              className="text-indigo-600 hover:text-indigo-800 hover:underline text-sm text-left"
                            >
                              {concept.title}
                            </button>
                             {completedConceptIds.has(concept.id) && <span className="text-green-500 text-xs ml-1">✓</span>} 
                          </li>
                      ))}
                    </ul>
                    {relevantConcepts.length > 5 && (
                        <Link href="/learn" className="text-xs text-indigo-600 hover:underline mt-2 block">View all...</Link>
                    )}
                </>
              )}
            </div>
          )}
      </div>
      
      {/* Goal Progress Section */}
      {profile?.selected_goals && profile.selected_goals.length > 0 && (
        <div className="bg-white shadow sm:rounded-lg p-4 sm:p-6 mb-8"> {/* Added mb-8 */}
            <h2 className="text-lg font-medium text-gray-900 mb-4">Goal Progress</h2>
            <div className="space-y-6">
                {profile.selected_goals.map(goalId => {
                    const goalDetails = getGoalDetails(goalId); 
                    const target = goalDetails.target;
                    const latestSim = savedSimulations?.[0];
                    // Use direct columns from latestSim
                    const latestSimP50 = latestSim?.final_balance ?? 0; // <-- Use direct final_balance (P50)
                    const latestSimHorizon = latestSim?.time_horizon_years ?? 'N/A'; // <-- Use direct time_horizon_years
                    const latestSimMonthlyContrib = latestSim?.monthly_contribution ?? 0; // <-- Use direct monthly_contribution

                    if (goalId === 'debt_management') {
                        return (
                            <div key={goalId}>
                                <div className="flex justify-between items-baseline">
                                    <h3 className="text-base font-medium text-gray-800">{goalDetails.label}</h3>
                                    <span className="text-sm font-semibold text-gray-600">Target: {formatCurrency(target)}</span>
                                </div>
                                <p className="text-sm text-gray-500 mt-1">
                                    Simulations can help plan contributions towards debt reduction. Your latest simulation uses monthly contributions of {formatCurrency(latestSimMonthlyContrib)}.
                                </p>
                            </div>
                        );
                    } else {
                        const progressPercent = target > 0 ? Math.min(100, Math.round((latestSimP50 / target) * 100)) : 0;
                        return (
                            <div key={goalId}>
                                <div className="flex justify-between items-baseline mb-1">
                                    <h3 className="text-base font-medium text-gray-800">{goalDetails.label}</h3>
                                    <span className="text-sm font-semibold text-gray-600">Target: {formatCurrency(target)}</span>
                                </div>
                                <div className="relative pt-1">
                                     <div className="overflow-hidden h-2 mb-2 text-xs flex rounded bg-indigo-200">
                                         <div style={{ width: `${progressPercent}%` }} className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-indigo-600 transition-all duration-500"></div>
                                     </div>
                                     <div className="flex justify-between items-center text-xs text-gray-500">
                                         <span>Projected @ Year {latestSimHorizon}: ~{formatCurrency(latestSimP50)} (Based on latest sim)</span>
                                         <span className="font-semibold">{progressPercent}%</span>
                                     </div>
                                </div>
                            </div>
                        );
                    }
                })}
            </div>
        </div>
      )}

      {/* Recent Simulations Section */}
      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 mb-8"> {/* Added mb-8 */}
          <h2 className="text-xl font-semibold mb-5 text-gray-800">Recent Simulations</h2>
          {isLoadingSims && <p className="text-gray-500 italic">Loading simulations...</p>}
          {simError && <p className="text-red-500 italic">{simError}</p>}
          {!isLoadingSims && !simError && savedSimulations.length > 0 ? (
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
                      {/* Ensure user object is available for Delete button */} 
                      {profile && <DeleteSimulationButton simulationId={sim.id} userId={profile.user_id} />}
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-gray-600">Params: £{sim.initial_investment?.toLocaleString()} initial, £{sim.monthly_contribution?.toLocaleString()}/mo, {sim.time_horizon_years?.toLocaleString()} yrs, {sim.risk_level}</p>
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
             !isLoadingSims && !simError && <p className="text-gray-500 italic">You haven't saved any simulations yet.</p>
          )}
      </div>
      {/* ------------------------------------------ */}
    </div>
  );
}

// --- Keep original server-side code commented out for reference --- 
/*
import { createServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Database } from '@/lib/database.types'; // Import full DB types
import DeleteSimulationButton from '@/components/DeleteSimulationButton'; // Import delete button
import { LightBulbIcon } from '@heroicons/react/24/outline'; // Import an icon

type SavedSimulation = Database['public']['Tables']['saved_simulations']['Row'];
type Module = Database['public']['Tables']['learning_modules']['Row'];

export default async function DashboardPage() {
    // ... (original server component logic) ...
}
*/ 