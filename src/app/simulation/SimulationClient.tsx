'use client'

import React, { Suspense } from 'react';
import { calculatePortfolioGrowth, riskLevelAllocations } from '@/lib/simulationUtils';
import type { PortfolioGrowthResult, YearlyData, SimulationEvent } from '@/lib/simulationUtils';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { Scenario as AppScenario, ScenarioChoice as AppScenarioChoice } from '@/types/simulation.types';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/database.types';
import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import { InformationCircleIcon } from '@heroicons/react/24/outline';
import ConceptModal from '@/components/ConceptModal';

// DB Types
type DbScenario = Database['public']['Tables']['scenarios']['Row'];
type DbScenarioChoice = Database['public']['Tables']['scenario_choices']['Row'];
type Concept = Database['public']['Tables']['concepts']['Row'];
type UserProfile = Database['public']['Tables']['user_profiles']['Row'];
// Add back EventChoiceOption type definition
type EventChoiceOption = { text: string; impact: Json };

// Placeholder types for simulation - we'll refine these
type SimulationParams = {
  initialInvestment: number;
  monthlyContribution: number;
  timeHorizonYears: number;
  riskLevel: 'conservative' | 'moderate' | 'aggressive';
  annualInflationRate: number;
  annualFeeRate: number;
};

// -- Add state for new parameters --
type SimulationAdvancedParams = SimulationParams & {
  annualInflationRate: number;
  annualFeeRate: number;
};
// --------------------------------

type SimulationResult = {
  finalBalance: number; // Represents P50 now
  totalContributions: number;
  totalGrowth: number; // Growth based on P50
  finalBalanceReal?: number; // P50 real balance
  
  finalBalanceP10: number;
  finalBalanceP50: number; 
  finalBalanceP90: number;

  monthlyDataP50: { month: number; balance: number }[]; 
  
  weightedAnnualRate?: number;
  totalFeesPaid?: number;
};

// Helper to format percentage
const formatPercent = (value: number) => `${(value * 100).toFixed(0)}%`;

// Helper to format Y-axis ticks as currency
const formatCurrency = (value: number) => `£${value.toLocaleString()}`;

// Helper to format X-axis ticks from months to years
const formatYear = (year: number) => `Year ${year}`;

// --- SimulationContent Client Component (Now default export) --- 
export default function SimulationContent() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const router = useRouter(); // Import useRouter

  // --- State --- 
  // Group state variables for clarity
  const [params, setParams] = useState<SimulationParams | null>(null); // Initial params might be null until profile loads
  const [result, setResult] = useState<PortfolioGrowthResult | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Start loading until profile & initial params are set
  const [isCalculating, setIsCalculating] = useState(false); // Separate state for calculation
  
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null); 
  const [isLoadingProfile, setIsLoadingProfile] = useState(true); 

  const [scenarios, setScenarios] = useState<DbScenario[]>([]);
  const [scenarioChoices, setScenarioChoices] = useState<DbScenarioChoice[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(''); // Initialize empty
  const [selectedChoiceId, setSelectedChoiceId] = useState<string>(''); // Initialize empty
  const [scenarioError, setScenarioError] = useState<string | null>(null);
  
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [events, setEvents] = useState<SimulationEvent[]>([]);
  const [contentError, setContentError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedConcept, setSelectedConcept] = useState<Concept | null>(null);

  const [eventChoicesMade, setEventChoicesMade] = useState<Record<string, Json>>({});
  
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [currentYear, setCurrentYear] = useState(0); 

  // --- Initial Loading Effect (User, Profile, Initial Params) ---
  useEffect(() => {
    const initialize = async () => {
      setIsLoading(true);
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      setUser(user);

      let fetchedProfile: UserProfile | null = null;
      if (user) {
        const { data: profileData, error: profileError } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('user_id', user.id)
            .single();
        if (profileError) {
            console.error("Error fetching profile during init:", profileError.message);
            // If profile essential & not found, maybe redirect or show fatal error?
        } else {
            fetchedProfile = profileData;
            setUserProfile(fetchedProfile);
        }
      }

      // Now set initial parameters based on URL or profile defaults
      const urlInitialInvestment = searchParams.get('initialInvestment');
      const urlMonthlyContribution = searchParams.get('monthlyContribution');
      const urlTimeHorizonYears = searchParams.get('timeHorizonYears');
      const urlRiskLevel = searchParams.get('riskLevel');
      const urlScenarioId = searchParams.get('scenarioId');
      const urlScenarioChoiceId = searchParams.get('scenarioChoiceId');

      let initialParams: SimulationParams;
      if (urlInitialInvestment !== null) { // Check if ANY param is set in URL
         console.log("Setting initial params from URL");
         initialParams = {
            initialInvestment: parseFloat(urlInitialInvestment || '1000'), // Fallback just in case
            monthlyContribution: parseFloat(urlMonthlyContribution || '100'),
            timeHorizonYears: parseInt(urlTimeHorizonYears || '10', 10),
            riskLevel: (urlRiskLevel as SimulationParams['riskLevel']) || 'moderate',
            annualInflationRate: parseFloat(searchParams.get('annualInflationRate') || '2.5'), 
            annualFeeRate: parseFloat(searchParams.get('annualFeeRate') || '0.5'), 
         };
         // Set selected scenario/choice if provided in URL
         setSelectedScenarioId(urlScenarioId || '');
         setSelectedChoiceId(urlScenarioChoiceId || '');
      } else {
         console.log("Setting initial params based on profile defaults");
         // --- Set Defaults Based on Profile --- 
         const primaryGoal = fetchedProfile?.selected_goals?.[0];
         let defaultTimeHorizon = 15;
         let defaultRisk = (fetchedProfile?.risk_tolerance_profile?.toLowerCase() as SimulationParams['riskLevel']) || 'moderate';
         let defaultInitial = 1000;
         let defaultMonthly = 150;

         if (primaryGoal === 'retirement') defaultTimeHorizon = 30;
         else if (primaryGoal === 'home_ownership') defaultTimeHorizon = 7;
         // Add more goal-based default adjustments if desired

         initialParams = {
            initialInvestment: defaultInitial,
            monthlyContribution: defaultMonthly,
            timeHorizonYears: defaultTimeHorizon,
            riskLevel: defaultRisk,
            annualInflationRate: 2.5, // Default values
            annualFeeRate: 0.5,       // Default values
         };
         // Reset scenario/choice if using profile defaults
         setSelectedScenarioId('');
         setSelectedChoiceId('');
         // ---------------------------------------
      }
      
      setParams(initialParams);
      setCurrentYear(0); // Reset timeline whenever params are set initially
      setIsLoading(false); // Initial data loaded
      setIsLoadingProfile(false); // Profile loading finished here too

      // If params came from URL, automatically run simulation
      if (urlInitialInvestment !== null) {
          console.log("Running simulation automatically from loaded parameters...");
          // Call runSimulation directly, but need to handle async/state updates carefully
          // It might be better to trigger runSimulation via a separate useEffect that depends on `params`
          // For now, let's try calling it, but be aware of potential race conditions
          // We need to pass the initial params and empty choices
          runSimulation(initialParams, {}); 
      }
    };

    initialize();

    // We remove the separate profile fetcher and auth listener for simplicity now,
    // assuming profile won't change mid-simulation session. Re-introduce if needed.

  }, [supabase, searchParams]); // Depend on supabase and searchParams

  // --- Separate Effect to run simulation when parameters change (excluding the initial auto-run) ---
  // This avoids issues with calling runSimulation inside the init useEffect
  // We need a flag to prevent running on the very first load if params came from URL
  // const [initialAutoRunDone, setInitialAutoRunDone] = useState(false);
  // useEffect(() => {
  //    if (params && searchParams.has('initialInvestment') && !initialAutoRunDone) {
  //       runSimulation(params, {});
  //       setInitialAutoRunDone(true);
  //    }
  // }, [params, searchParams, initialAutoRunDone]);

  // --- Fetch Scenarios (can run independently) ---
  useEffect(() => {
    const fetchScenarioData = async () => {
      setScenarioError(null);
      try {
          const { data: scenariosData, error: scenariosError } = await supabase
            .from('scenarios')
            .select('*')
            .order('scenario_order', { ascending: true });
          if (scenariosError) throw scenariosError;
          setScenarios(scenariosData || []);

          const { data: choicesData, error: choicesError } = await supabase
            .from('scenario_choices')
            .select('*')
            .order('choice_order', { ascending: true }); // Order globally first
          if (choicesError) throw choicesError;
          setScenarioChoices(choicesData || []);

      } catch (error: any) {
          console.error("Error fetching scenario data:", error.message);
          setScenarioError("Failed to load scenarios. Please try refreshing.");
      }
    };
    fetchScenarioData();
  }, [supabase]);

  // --- useEffect hook to fetch concepts and events (can run independently) ---
  useEffect(() => {
      const fetchContent = async () => {
          setContentError(null);
          try {
              // Fetch Concepts
              const { data: conceptsData, error: conceptsError } = await supabase
                  .from('concepts')
                  .select('*');
              if (conceptsError) throw conceptsError;
              setConcepts(conceptsData || []);
              console.log("Concepts fetched:", conceptsData?.length);

              // Fetch Events
              const { data: eventsData, error: eventsError } = await supabase
                  .from('simulation_events')
                  .select('*')
                  .order('trigger_year', { ascending: true }); // Order by year
              if (eventsError) throw eventsError;
              // Cast eventsData via unknown to the imported SimulationEvent type
              setEvents((eventsData as unknown as SimulationEvent[]) || []);
              console.log("Events fetched:", eventsData?.length);

          } catch (error: any) {
              console.error("Error fetching concepts/events:", error.message);
              setContentError("Failed to load learning content.");
          }
      };
      fetchContent();
  }, [supabase]);

  // --- Helper to check if concept is appropriate for user level --- 
  const isConceptLevelAppropriate = (conceptLevel: string | null | undefined): boolean => {
      if (isLoadingProfile || !userProfile?.financial_knowledge_level) {
          // If profile is loading or level unknown, assume appropriate for now
          // Alternatively, could default to false or a basic level
          return true; 
      }
      if (!conceptLevel) return true; // Concept has no level requirement

      const userLevel = userProfile.financial_knowledge_level.toLowerCase();
      const reqLevel = parseInt(conceptLevel, 10);

      if (isNaN(reqLevel)) return true; // Invalid requirement format

      if (userLevel === 'beginner') return reqLevel <= 1;
      if (userLevel === 'intermediate') return reqLevel <= 2;
      if (userLevel === 'advanced') return reqLevel <= 3;

      return true; // Default fallback
  };
  // -------------------------------------------------------------------

  // Memoize derived scenario objects
  const selectedScenario = useMemo(() => {
      if (!selectedScenarioId) return null;
      return scenarios.find(s => s.id === selectedScenarioId);
  }, [selectedScenarioId, scenarios]);

  const choicesForSelectedScenario = useMemo(() => {
      if (!selectedScenarioId) return [];
      return scenarioChoices.filter(c => c.scenario_id === selectedScenarioId);
  }, [selectedScenarioId, scenarioChoices]);

  const selectedChoice = useMemo(() => {
      if (!selectedChoiceId) return null;
      // IMPORTANT: Parse the JSON impact here when the choice is selected/derived
      const choice = scenarioChoices.find(c => c.id === selectedChoiceId);
      if (!choice) return null;
      try {
        const impact = choice.impact as AppScenarioChoice['impact']; // Assuming structure matches
        // Add validation for impact structure if needed
        return { ...choice, impact }; // Return choice with parsed impact
      } catch (e) {
        console.error("Error parsing scenario choice impact JSON:", e);
        return null; // Or handle error appropriately
      }
  }, [selectedChoiceId, scenarioChoices]);
  // --------------------------------------------------------

  // --- Update handleInputChange for new number inputs ---
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const isNumericField = ['initialInvestment', 'monthlyContribution', 'timeHorizonYears', 'annualInflationRate', 'annualFeeRate'].includes(name);

    setParams(prev => {
      if (!prev) return null; // Should not happen if loaded
      return {
        ...prev,
        [name]: isNumericField ? parseFloat(value) || 0 : value,
      }
    });
    // Reset timeline and results when params change manually
    setCurrentYear(0);
    setResult(null); 
    setEventChoicesMade({}); // Reset choices if params change
  };
  // -----------------------------------------------------

  // --- Event Choice Handler ---
  const handleEventChoice = (eventId: string, choiceImpact: Json) => {
    setEventChoicesMade(prev => ({
      ...prev,
      [eventId]: choiceImpact, 
    }));
    // Note: This doesn't automatically re-run the simulation.
    // A re-run would be needed if choices should immediately reflect.
    // For now, choices only apply when 'Run Simulation' is clicked.
  };
  // --------------------------

  // --- Update runSimulation function --- 
  // Accept params/choices optionally to be called from init effect
  const runSimulation = async (simParams = params, choices = eventChoicesMade) => { 
    if (!simParams) { // Guard against running before params are set
        console.log("Simulation params not ready.");
        return;
    }
    setIsCalculating(true); // Use isCalculating flag
    setResult(null);
    setCurrentYear(0); // Reset timeline on run
    // Don't reset choices here if passed in (e.g., from init effect)
    if (choices === eventChoicesMade) {
        setEventChoicesMade({}); // Only reset if using current state
    }
    
    let adjustedParams = { ...simParams }; 

    // --- Apply Scenario Impact --- 
    // Need to ensure selectedScenario/selectedChoice are derived correctly before this runs
    // This part might need adjustment if runSimulation is called before scenario state is set
    const currentSelectedChoice = scenarioChoices.find(c => c.id === selectedChoiceId);
    if (selectedScenario && currentSelectedChoice) { 
        try {
            const impact = currentSelectedChoice.impact as AppScenarioChoice['impact'];
            adjustedParams.initialInvestment += (impact.initialInvestmentChange ?? 0) - (impact.oneOffCost ?? 0) + (impact.oneOffIncome ?? 0);
            adjustedParams.monthlyContribution += (impact.monthlyContributionChange ?? 0);
            adjustedParams.initialInvestment = Math.max(0, adjustedParams.initialInvestment);
            adjustedParams.monthlyContribution = Math.max(0, adjustedParams.monthlyContribution);
            console.log("Applied scenario impact:", impact);
        } catch(e) {
             console.error("Error parsing or applying scenario impact:", e);
        }
    }
    // -------------------------------------------------------

    console.log("Running simulation with params:", adjustedParams); 

    await new Promise(resolve => setTimeout(resolve, 200)); 
    // Pass career stage to simulation logic in the correct argument position
    const simulationOutput = calculatePortfolioGrowth(
        adjustedParams, 
        events, 
        choices, 
        userProfile?.career_stage, 
        userProfile?.location_region // Pass location region
    );
    setResult(simulationOutput);
    setCurrentYear(adjustedParams.timeHorizonYears); 
    setIsCalculating(false); // Calculation done
  };
  // -----------------------------------------------

  // --- Timeline Control Handlers --- 
  const handleYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setCurrentYear(parseInt(e.target.value, 10));
  };

  const goToYear = (year: number) => {
      setCurrentYear(Math.max(0, Math.min(params?.timeHorizonYears || 0, year)));
  };
  // ---------------------------------

  // --- Update handleSaveSimulation to include new params ---
  const handleSaveSimulation = async () => {
    if (!user || !result || !result.yearlyData || isSaving) return;

    // Get the final year's data for saving
    const finalYearData = result.yearlyData[result.yearlyData.length - 1];
    if (!finalYearData) return;
    
    const simulationName = prompt("Enter an optional name:", `Sim - ${new Date().toLocaleDateString()}`);

    setIsSaving(true); setSaveError(null); setSaveSuccess(false);
    const { error } = await supabase.from('saved_simulations').insert({
        user_id: user.id,
        simulation_name: simulationName || null, 
        initial_investment: params?.initialInvestment || 0,
        monthly_contribution: params?.monthlyContribution || 0,
        time_horizon_years: params?.timeHorizonYears || 0,
        risk_level: params?.riskLevel || 'moderate',
        final_balance: finalYearData.balanceP50, 
        total_contributions: finalYearData.totalContributions,
        total_growth: finalYearData.totalGrowthP50, 
        scenario_id: selectedScenarioId || null,
        scenario_choice_id: selectedChoiceId || null,
        // Cast yearlyData to Json to match potentially incorrect generated type
        yearly_data: result.yearlyData as unknown as Json, 
        // Optional fields can be added if columns exist:
        // final_balance_p10: finalYearData.balanceP10,
        // final_balance_p90: finalYearData.balanceP90,
        // total_fees_paid: finalYearData.totalFeesP50,
    });
    if (error) { setSaveError(error.message); } else { setSaveSuccess(true); setTimeout(() => setSaveSuccess(false), 3000); }
    setIsSaving(false);
  };
  // -------------------------------------------------------

  // --- Calculate display values based on currentYear --- 
  const chartData = useMemo(() => {
      if (!result?.yearlyData) return [];
      // Slice the yearly data up to the current year
      // Include year 0 explicitly if currentYear is 0 or more
      return result.yearlyData.slice(0, currentYear + 1); 
  }, [result, currentYear]);

  const currentYearData = useMemo(() => {
      if (!result?.yearlyData || currentYear < 0 || currentYear >= result.yearlyData.length) {
          // Return default values or handle edge case (e.g., year 0)
          return result?.yearlyData[0] ?? { year: 0, balanceP50: 0, totalContributions: 0, totalGrowthP50: 0 };
      }
      return result.yearlyData[currentYear];
  }, [result, currentYear]);

  const displayBalance = currentYearData.balanceP50;
  const displayContributions = currentYearData.totalContributions;
  const displayGrowth = currentYearData.totalGrowthP50;
  // -----------------------------------------------------

  // --- Find event for the current year, considering knowledge level --- 
  const currentEvent = useMemo(() => {
    const eventForYear = events.find(event => event.trigger_year === currentYear);
    if (!eventForYear) return null;

    // If event has an associated concept, check if it's appropriate
    if (eventForYear.associated_concept_id) {
      const relatedConcept = concepts.find(c => c.id === eventForYear.associated_concept_id);
      if (relatedConcept && !isConceptLevelAppropriate(relatedConcept.knowledge_level_required)) {
        // Concept is too advanced, don't show this event (or show simplified?)
        return null; // Hide event for now
      }
    }
    // Event is appropriate or has no concept link
    return eventForYear;
  }, [events, concepts, currentYear, isConceptLevelAppropriate]); // Add dependencies
  // ------------------------------------------------------------------

  // --- Modal Control Functions ---
  const openConceptModal = (concept: Concept) => {
    setSelectedConcept(concept);
    setIsModalOpen(true);
  };

  const closeConceptModal = () => {
    setIsModalOpen(false);
    setSelectedConcept(null); // Clear concept when closing
  };
  // -----------------------------

  // JSX for the client component
  // Add checks for loading state and null params
  if (isLoading || !params) {
      return (
        <div className="flex justify-center items-center h-screen">
            <p>Loading simulator...</p>
        </div>
      );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <h1 className="text-3xl font-bold mb-6 text-gray-800">Investment Growth Simulator</h1>

      {/* Render the Concept Modal */}
      <ConceptModal 
        isOpen={isModalOpen} 
        onClose={closeConceptModal} 
        concept={selectedConcept} 
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Column 1: Inputs & Scenarios */}
        <div className="lg:col-span-1 space-y-6">
          {/* Input Parameters Card */}
          <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
            <h2 className="text-xl font-semibold mb-4 text-gray-700">Parameters</h2>
            {/* Add error display for content fetching */}
            {contentError && <p className="text-red-500 text-sm mb-3">{contentError}</p>}
            <div className="mb-4">
              <label htmlFor="initialInvestment" className="block text-sm font-medium text-gray-600">Initial Investment (£)</label>
              <input type="number" id="initialInvestment" name="initialInvestment" value={params.initialInvestment} onChange={handleInputChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
            </div>
            <div className="mb-4">
              <label htmlFor="monthlyContribution" className="block text-sm font-medium text-gray-600">Monthly Contribution (£)</label>
              <input type="number" id="monthlyContribution" name="monthlyContribution" value={params.monthlyContribution} onChange={handleInputChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
            </div>
            <div className="mb-4">
              <label htmlFor="timeHorizonYears" className="block text-sm font-medium text-gray-600">Time Horizon (Years)</label>
              <input type="number" id="timeHorizonYears" name="timeHorizonYears" value={params.timeHorizonYears} onChange={handleInputChange} min="1" max="50" className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
            </div>
            <div className="mb-4">
              <div className="flex justify-between items-center mb-1">
                <label htmlFor="riskLevel" className="block text-sm font-medium text-gray-600">Risk Level</label>
                {/* Placeholder for concept popup trigger */}
                <button 
                    title="Learn about Risk vs. Return"
                    onClick={() => {
                      const riskConcept = concepts.find(c => c.slug === 'risk-vs-return');
                      if (riskConcept) {
                        // Check level before opening modal
                        if (isConceptLevelAppropriate(riskConcept.knowledge_level_required)) {
                           openConceptModal(riskConcept);
                        } else {
                           // Optionally show a different message if too advanced
                           alert('More details available as your knowledge level increases.'); 
                        }
                      } else {
                        alert('Concept details not found.');
                      }
                    }} 
                    className="text-gray-400 hover:text-indigo-600"
                  >
                    <InformationCircleIcon className="h-5 w-5" />
                </button>
              </div>
              <select id="riskLevel" name="riskLevel" value={params.riskLevel} onChange={handleInputChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white">
                  <option value="conservative">Conservative</option>
                  <option value="moderate">Moderate</option>
                  <option value="aggressive">Aggressive</option>
              </select>
            </div>
            <details className="mt-4 border-t pt-4 border-gray-200">
                  <summary className="text-sm font-medium text-gray-600 cursor-pointer hover:text-gray-800">Advanced Settings (Inflation/Fees)</summary>
                  <div className="mt-3 space-y-3">
                       <div className="mb-3">
                          <label htmlFor="annualInflationRate" className="block text-xs font-medium text-gray-500">Assumed Annual Inflation (%)</label>
                          <input type="number" id="annualInflationRate" name="annualInflationRate" value={params.annualInflationRate} onChange={handleInputChange} step="0.1" className="mt-1 block w-full p-1.5 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-xs" />
                       </div>
                       <div>
                          <label htmlFor="annualFeeRate" className="block text-xs font-medium text-gray-500">Assumed Annual Fees/Charges (%)</label>
                          <input type="number" id="annualFeeRate" name="annualFeeRate" value={params.annualFeeRate} onChange={handleInputChange} step="0.1" className="mt-1 block w-full p-1.5 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-xs" />
                       </div>
                  </div>
            </details>
          </div>

          {/* Scenarios Card */}
          <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
             <h2 className="text-xl font-semibold mb-4 text-gray-700">Scenarios (Optional)</h2>
             {scenarioError && <p className="text-red-500 text-sm mb-3">{scenarioError}</p>}
             <div className="mb-4">
               <label htmlFor="scenario" className="block text-sm font-medium text-gray-600">Select Scenario:</label>
               <select id="scenario" value={selectedScenarioId} onChange={(e) => {
                 setSelectedScenarioId(e.target.value);
                 setSelectedChoiceId(''); // Reset choice ID
                 setResult(null); 
                 setCurrentYear(0); // Reset timeline
               }} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white">
                 <option value="">-- No Scenario --</option>
                 {scenarios.map(s => <option key={s.id} value={s.id}>{s.title}</option>)} 
               </select>
             </div>
             {selectedScenario && (
               <div className="mt-4 border-t border-gray-200 pt-4">
                 <p className="text-sm text-gray-600 mb-3">{selectedScenario.description}</p>
                 <p className="block text-sm font-medium text-gray-600 mb-2">Your Choice:</p>
                 {choicesForSelectedScenario.length > 0 ? (
                   <div className="space-y-2">
                     {choicesForSelectedScenario.map(choice => (
                       <button
                         key={choice.id}
                         onClick={(e) => {
                           e.preventDefault();
                           setSelectedChoiceId(choice.id);
                           setResult(null);
                           setCurrentYear(0); // Reset timeline
                         }}
                         className={`block w-full text-left p-3 border rounded-md text-sm transition-colors duration-150 ease-in-out ${selectedChoiceId === choice.id ? 'bg-indigo-100 border-indigo-300 ring-1 ring-indigo-400' : 'bg-gray-50 border-gray-300 hover:bg-gray-100'}`}
                       >
                         {choice.text}
                       </button>
                     ))}
                   </div>
                 ) : (
                   <p className="text-sm text-gray-500 italic">No choices available for this scenario.</p>
                 )}
               </div>
             )}
           </div>

          {/* Run Button - use isCalculating state */} 
          <button onClick={() => runSimulation()} disabled={isCalculating} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out">
            {isCalculating ? 'Calculating...' : 'Run Simulation'}
          </button>
        </div>

        {/* Column 2: Results & Chart */}
        <div className="lg:col-span-2">
          {/* Results Summary Card - use isCalculating state */} 
          <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 mb-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-700">Results (Year: {currentYear})</h2>
            {isCalculating && <p className="text-center text-gray-500">Calculating...</p>} 
            {!isCalculating && !result && <p className="text-center text-gray-500 italic">Run the simulation to see results.</p>}
            {result && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-sm font-medium text-gray-500">Contributions</p>
                  <p className="text-xl font-semibold text-gray-800 mt-1">{formatCurrency(displayContributions)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Growth</p>
                  <p className="text-xl font-semibold text-green-700 mt-1">{formatCurrency(displayGrowth)}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">End Balance (P50)</p>
                  <p className="text-2xl font-bold text-indigo-800 mt-1">{formatCurrency(displayBalance)}</p>
                </div>
              </div>
            )}
          </div>

          {/* --- Timeline Control --- */} 
          {result && (
               <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200 mb-6">
                  <label htmlFor="timelineSlider" className="block text-sm font-medium text-gray-600 mb-2">Timeline: Year {currentYear}</label>
                  <input 
                     type="range" 
                     id="timelineSlider"
                     min="0"
                     max={params.timeHorizonYears}
                     value={currentYear}
                     onChange={handleYearChange}
                     className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1 px-1">
                      <span>Year 0</span>
                      <span>Year {params.timeHorizonYears}</span>
                  </div>
                  <div className="flex justify-center space-x-4 mt-3">
                      <button onClick={() => goToYear(currentYear - 1)} disabled={currentYear <= 0} className="px-3 py-1 text-sm border rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50">Prev Year</button>
                      <button onClick={() => goToYear(currentYear + 1)} disabled={currentYear >= params.timeHorizonYears} className="px-3 py-1 text-sm border rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50">Next Year</button>
                  </div>
              </div>
          )}
          {/* ------------------------ */} 

          {/* --- Display Current Year Event --- */}
          {currentEvent && (
            <div className={`p-4 rounded-lg shadow-inner border mb-6 text-sm ${currentEvent.event_type === 'decision' ? 'bg-yellow-50 border-yellow-200' : 'bg-blue-50 border-blue-200'}`}>
              <h3 className={`font-semibold mb-1 ${currentEvent.event_type === 'decision' ? 'text-yellow-800' : 'text-blue-800'}`}>{currentEvent.title} (Year {currentEvent.trigger_year})</h3>
              <p className="text-gray-700 mb-3">{currentEvent.description}</p>

              {/* Decision Event Choices */}
              {currentEvent.event_type === 'decision' && Array.isArray(currentEvent.decision_options) && currentEvent.decision_options.length > 0 && (
                <div className="mt-3 pt-3 border-t border-yellow-200">
                  <p className="text-xs font-semibold text-gray-600 mb-2">Your decision:</p>
                  <div className="space-y-2">
                    {(currentEvent.decision_options as EventChoiceOption[]).map((option, index) => {
                      // Check if JSON comparison is feasible/reliable, might need unique IDs per choice
                      const isSelected = JSON.stringify(eventChoicesMade[currentEvent.id]) === JSON.stringify(option.impact);
                      return (
                        <button
                          key={index} // Use index if choices don't have unique IDs
                          onClick={(e) => {
                            e.preventDefault();
                            handleEventChoice(currentEvent.id, option.impact);
                          }}
                          className={`block w-full text-left p-2 border rounded-md text-xs transition-colors duration-150 ease-in-out ${isSelected ? 'bg-green-100 border-green-300 ring-1 ring-green-400' : 'bg-white border-gray-300 hover:bg-gray-50'}`}
                        >
                          {option.text}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Automatic Event Concept Link - Check level before showing */}
              {currentEvent.event_type !== 'decision' && currentEvent.associated_concept_id && (
                 (() => { // IIFE to allow conditional rendering after finding concept
                    const relatedConcept = concepts.find(c => c.id === currentEvent.associated_concept_id);
                    if (relatedConcept && isConceptLevelAppropriate(relatedConcept.knowledge_level_required)) {
                       return (
                          <button 
                            onClick={(e) => {
                              e.preventDefault();
                              openConceptModal(relatedConcept);
                            }}
                            className="mt-2 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                          >
                             Learn more...
                          </button>
                       );
                    } 
                    return null; // Don't show button if concept not found or level inappropriate
                 })()
              )}
            </div>
          )}
          {/* ---------------------------------- */}

          {/* Chart Card */}
          <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 min-h-[400px]">
            <h2 className="text-xl font-semibold mb-4 text-gray-700">Projected Growth (P50 Estimate)</h2>
            {result ? (
              <ResponsiveContainer width="100%" height={350}>
                 <LineChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis 
                     dataKey="year"
                     tickFormatter={formatYear}
                     interval="preserveStartEnd"
                     className="text-xs"
                  />
                  <YAxis tickFormatter={formatCurrency} width={80} className="text-xs"/>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} labelFormatter={(label: number) => `End of Year ${label}`} />
                  <Legend wrapperStyle={{fontSize: "12px"}}/>
                  <Line type="monotone" dataKey="balanceP50" name="Projected Balance (P50)" stroke="#4f46e5" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500 italic">
                  Run simulation to view chart.
              </div>
            )}
          </div>

          {/* Save Button Card */}
          {result && user && (
            <div className="mt-6 text-right">
                 <button onClick={handleSaveSimulation} disabled={isSaving} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-5 rounded-lg shadow-sm disabled:opacity-50 transition duration-150 ease-in-out">
                    {isSaving ? 'Saving...' : 'Save Simulation'}
                 </button>
                 {saveError && <p className="text-red-500 text-xs mt-1 text-right">{saveError}</p>}
                 {saveSuccess && <p className="text-green-600 text-xs mt-1 text-right">Simulation saved successfully!</p>}
             </div>
          )}

        </div>
      </div>
    </div>
  );
} 