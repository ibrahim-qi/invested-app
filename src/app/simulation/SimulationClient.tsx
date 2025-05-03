'use client'

import React, { Suspense } from 'react';
import { calculatePortfolioGrowth, calculateBenchmarkGrowth, riskLevelAllocations } from '@/lib/simulationUtils';
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
import Link from 'next/link'; // Import Link
import InfoTooltip from '@/components/common/InfoTooltip'; // Updated import
import ToastNotification from '@/components/common/ToastNotification'; // Import Toast

// --- Add types for JSONB columns (mirroring dashboard) ---
type SimulationParametersJson = {
  initial_investment?: number;
  monthly_contribution?: number;
  time_horizon?: number;
  risk_level?: string;
};

type SimulationResultsJson = {
  p50_final_balance?: number;
  p10_final_balance?: number;
  p90_final_balance?: number;
};
// ------------------------------------------------------

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

// --- Type Definitions ---
// Update SimulationResult and YearlyData if needed based on simulationUtils.ts output
// Assuming YearlyData now includes balanceP10 and balanceP90
type ExtendedYearlyData = YearlyData & {
  balanceP10: number;
  balanceP90: number;
  totalGrowthP10?: number; // Optional if returned
  totalGrowthP90?: number; // Optional if returned
};

type ExtendedPortfolioGrowthResult = PortfolioGrowthResult & {
  yearlyData: ExtendedYearlyData[]; // Use extended type
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
  const [result, setResult] = useState<ExtendedPortfolioGrowthResult | null>(null);
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

  // Add state for impact preview text
  const [impactPreviewText, setImpactPreviewText] = useState<string | null>(null);

  // --- Add State for Benchmark Results --- 
  const [benchmarkEquityData, setBenchmarkEquityData] = useState<YearlyData[] | null>(null);
  const [benchmarkCashData, setBenchmarkCashData] = useState<YearlyData[] | null>(null);
  // -------------------------------------

  // --- Add State for Toast --- 
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  // ---------------------------

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

      // If params came from URL, automatically run simulation AND benchmarks
      if (urlInitialInvestment !== null) {
          console.log("Running simulation & benchmarks automatically from loaded parameters...");
          runSimulationAndBenchmarks(initialParams, {}); 
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

  // --- Memoized values --- 
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
      const choice = scenarioChoices.find(c => c.id === selectedChoiceId);
      if (!choice) return null;
      try {
        const impact = choice.impact as AppScenarioChoice['impact']; 
        return { ...choice, impact };
      } catch (e) {
        console.error("Error parsing scenario choice impact JSON:", e);
        return null; 
      }
  }, [selectedChoiceId, scenarioChoices]);
  // --- End Memoized values ---

  // --- Effect to update impact preview text (Ensure this is AFTER selectedChoice) ---
  useEffect(() => {
    if (selectedChoice?.impact) {
      const { impact } = selectedChoice;
      let feedbackParts: string[] = [];
      // Format the impact object into readable parts
      if (impact.initialInvestmentChange) feedbackParts.push(`Initial Investment ${impact.initialInvestmentChange >= 0 ? '+' : ''}${formatCurrency(impact.initialInvestmentChange)}`);
      if (impact.monthlyContributionChange) feedbackParts.push(`Monthly Contribution ${impact.monthlyContributionChange >= 0 ? '+' : ''}${formatCurrency(impact.monthlyContributionChange)}`);
      if (impact.oneOffCost) feedbackParts.push(`One-off Cost ${formatCurrency(impact.oneOffCost)}`);
      if (impact.oneOffIncome) feedbackParts.push(`One-off Income ${formatCurrency(impact.oneOffIncome)}`);
      // Add other potential impacts here

      if (feedbackParts.length > 0) {
        setImpactPreviewText(`Selected Choice Impact: ${feedbackParts.join(', ')}`);
      } else {
        setImpactPreviewText('Selected Choice has no direct financial impact defined.');
      }
    } else {
      setImpactPreviewText(null); // Clear preview if no choice or impact
    }
  }, [selectedChoice]); // Re-run when selectedChoice changes
  // ------------------------------------------------------------------------------------

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

  // --- Update handleInputChange to clear benchmarks too ---
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
    setBenchmarkEquityData(null); // Clear benchmark results
    setBenchmarkCashData(null);   // Clear benchmark results
    setEventChoicesMade({}); 
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

  // --- Combine Simulation & Benchmark Running --- 
  const runSimulationAndBenchmarks = async (simParams = params, choices = eventChoicesMade) => {
    if (!simParams) { 
        console.log("Simulation params not ready.");
        return;
    }
    setIsCalculating(true); 
    setResult(null);
    setBenchmarkEquityData(null); // Clear previous benchmarks
    setBenchmarkCashData(null);
    setCurrentYear(0); 
    if (choices === eventChoicesMade) {
        setEventChoicesMade({}); 
    }
    
    let adjustedParams = { ...simParams }; 

    // Apply Scenario Impact 
    // ... (existing scenario impact logic) ...
    
    console.log("Running simulation with params:", adjustedParams);
    console.log("Calculating benchmarks...");

    // --- Run simulation and benchmarks concurrently --- 
    try {
      const [simulationOutput, equityBench, cashBench] = await Promise.all([
        // Run main simulation (add small delay if needed for UI responsiveness)
        new Promise<ExtendedPortfolioGrowthResult>(resolve => 
          setTimeout(() => resolve(calculatePortfolioGrowth(
            adjustedParams, 
            events, 
            choices, 
            userProfile?.career_stage, 
            userProfile?.location_region
          ) as ExtendedPortfolioGrowthResult), 50) // 50ms delay
        ),
        // Calculate Equity Benchmark
        Promise.resolve(calculateBenchmarkGrowth({
            initialInvestment: adjustedParams.initialInvestment,
            monthlyContribution: adjustedParams.monthlyContribution,
            timeHorizonYears: adjustedParams.timeHorizonYears,
            benchmarkType: 'globalEquity'
        })),
        // Calculate Cash Benchmark
        Promise.resolve(calculateBenchmarkGrowth({
            initialInvestment: adjustedParams.initialInvestment,
            monthlyContribution: adjustedParams.monthlyContribution,
            timeHorizonYears: adjustedParams.timeHorizonYears,
            benchmarkType: 'ukCash' // Assuming UK context or make dynamic if needed
        }))
      ]);

      setResult(simulationOutput);
      setBenchmarkEquityData(equityBench);
      setBenchmarkCashData(cashBench);
      setCurrentYear(adjustedParams.timeHorizonYears); 

    } catch (error: any) {
        console.error("Error during simulation or benchmark calculation:", error);
        // Handle error state appropriately
        setResult(null);
        setBenchmarkEquityData(null);
        setBenchmarkCashData(null);
        // Set toast error message
        setToastMessage('Calculation Error: ' + (error?.message || 'Failed to run simulation.'));
        setToastType('error');
    } finally {
       setIsCalculating(false); 
    }
  };
  // -------------------------------------------------

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
    if (!user || !result || !result.yearlyData || isSaving || !params) return;

    // Get the final year's data for saving
    const finalYearData = result.yearlyData[result.yearlyData.length - 1];
    if (!finalYearData) return;
    
    const simulationName = prompt("Enter an optional name:", `Sim - ${new Date().toLocaleDateString()}`);

    setIsSaving(true); 
    // Clear previous toast/save messages
    setSaveError(null); 
    setSaveSuccess(false);
    setToastMessage(null);

    // Ensure all required data is present
    if (!finalYearData) {
        setToastMessage("Error: Final year data not available for saving.");
        setToastType('error');
        setIsSaving(false);
        return;
    }
    if (!params) { // Should not happen if button is enabled, but good check
         setToastMessage("Error: Simulation parameters missing.");
         setToastType('error');
         setIsSaving(false);
         return;
    }

    // Original insert logic using direct columns
    const { error } = await supabase.from('saved_simulations').insert({
        user_id: user.id,
        simulation_name: simulationName || null, 
        // --- Ensure all direct columns are populated correctly ---
        initial_investment: params.initialInvestment ?? 0,
        monthly_contribution: params.monthlyContribution ?? 0,
        time_horizon_years: params.timeHorizonYears ?? 0,
        risk_level: params.riskLevel ?? 'moderate',
        final_balance: finalYearData.balanceP50 ?? 0, // Use p50 balance
        total_contributions: finalYearData.totalContributions ?? 0, 
        total_growth: finalYearData.totalGrowthP50 ?? 0, // Use p50 growth
        scenario_id: selectedScenarioId || null,
        scenario_choice_id: selectedChoiceId || null,
        yearly_data: result.yearlyData as unknown as Json, 
        annual_inflation_rate: params.annualInflationRate ?? 0, // Ensure these exist on params
        annual_fee_rate: params.annualFeeRate ?? 0, // Ensure these exist on params
        // Add p10/p90 if columns exist for them
        // final_balance_p10: finalYearData.balanceP10 ?? 0,
        // final_balance_p90: finalYearData.balanceP90 ?? 0,
        // ----------------------------------------------------
    });

    if (error) { 
        setSaveError(error.message); // Keep internal error state if needed elsewhere
        setToastMessage(`Save failed: ${error.message}`);
        setToastType('error');
    } else { 
        setSaveSuccess(true); // Keep internal success state if needed elsewhere
        setToastMessage('Simulation saved successfully!');
        setToastType('success');
        // Optionally reset success state if needed, though toast handles visibility
        // setTimeout(() => setSaveSuccess(false), 3000); 
    } 
    setIsSaving(false);
  };
  // -------------------------------------------------------

  // --- Update Derived Values for Chart and Display --- 
  const chartData = useMemo(() => {
      if (!result?.yearlyData || !params) return []; 
      
      // Merge portfolio data with benchmark data for the chart
      return result.yearlyData.slice(0, currentYear + 1).map((portfolioYearData) => {
          const year = portfolioYearData.year;
          // Find corresponding benchmark data for the same year
          const equityBenchYear = benchmarkEquityData?.find(d => d.year === year);
          const cashBenchYear = benchmarkCashData?.find(d => d.year === year);
          return {
              ...portfolioYearData,
              benchmarkEquityBalance: equityBenchYear?.balanceP50 ?? 0, // Use P50 (deterministic)
              benchmarkCashBalance: cashBenchYear?.balanceP50 ?? 0,   // Use P50 (deterministic)
          };
      });
  }, [result, benchmarkEquityData, benchmarkCashData, currentYear, params]); // Add benchmark dependencies

  const currentYearData = useMemo(() => {
      // Define default data structure including benchmarks
      const defaultData = { 
          year: 0, 
          balanceP50: params?.initialInvestment ?? 0,
          balanceP10: params?.initialInvestment ?? 0,
          balanceP90: params?.initialInvestment ?? 0,
          totalContributions: params?.initialInvestment ?? 0, 
          totalGrowthP50: 0, 
          benchmarkEquityBalance: params?.initialInvestment ?? 0,
          benchmarkCashBalance: params?.initialInvestment ?? 0
      };
      
      if (!chartData || currentYear < 0 || currentYear >= chartData.length) {
          return chartData?.[0] ?? defaultData;
      }
      return chartData[currentYear]; // Get data from the merged chartData
  }, [chartData, currentYear, params?.initialInvestment]); 

  const displayBalanceP50 = currentYearData.balanceP50;
  const displayBalanceP10 = currentYearData.balanceP10;
  const displayBalanceP90 = currentYearData.balanceP90;
  // Get benchmark balances for display
  const displayBenchmarkEquityBalance = currentYearData.benchmarkEquityBalance;
  const displayBenchmarkCashBalance = currentYearData.benchmarkCashBalance;
  const displayContributions = currentYearData.totalContributions;
  const displayGrowthP50 = currentYearData.totalGrowthP50;
  // -----------------------------------------------------

  // --- Add Volatility Hint Calculation --- 
  const volatilityHint = useMemo(() => {
      if (!result || currentYear !== params?.timeHorizonYears) return null;
      const finalYearData = result.yearlyData[result.yearlyData.length - 1];
      if (!finalYearData || finalYearData.balanceP50 <= 0) return null;

      const spread = finalYearData.balanceP90 - finalYearData.balanceP10;
      const spreadPercentage = (spread / finalYearData.balanceP50) * 100;

      if (spreadPercentage > 75) { // Example threshold
        return "High potential range between best and worst-case scenarios, reflecting significant potential volatility.";
      } else if (spreadPercentage > 35) { // Example threshold
        return "Moderate potential range between scenarios, reflecting typical market volatility.";
      } else {
        return "Relatively narrow potential range between scenarios, reflecting lower potential volatility.";
      }
  }, [result, currentYear, params?.timeHorizonYears]);
  // ----------------------------------------

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

  // --- Add Memoized Allocation Display --- 
  const allocationDisplay = useMemo(() => {
    if (!params?.riskLevel) return null;
    const allocation = riskLevelAllocations[params.riskLevel];
    if (!allocation) return null;
    
    // Format the allocation details
    return (
      <div className="mt-2 text-xs text-gray-500 border-t pt-2">
        <p className="font-medium mb-1">Asset Allocation:</p>
        <ul className="list-disc list-inside pl-2 space-y-0.5">
          <li>Stocks/Equities: {formatPercent(allocation.stocks)}</li>
          <li>Bonds: {formatPercent(allocation.bonds)}</li>
          <li>Cash: {formatPercent(allocation.cash)}</li>
        </ul>
      </div>
    );
  }, [params?.riskLevel]); // Recompute when risk level changes
  // ---------------------------------------

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
    <div className="container mx-auto px-4 py-8">
      <ToastNotification 
        message={toastMessage}
        type={toastType}
        onClose={() => setToastMessage(null)} 
      />
      <ConceptModal 
        isOpen={isModalOpen}
        onClose={closeConceptModal}
        concept={selectedConcept}
      />
      
      <h1 className="text-3xl font-bold mb-6 text-gray-800">Investment Simulator</h1>
      
      {/* --- Introduction Text --- */}
      <p className="mb-6 text-gray-600">
        Experiment with different investment parameters, scenarios, and events to see potential long-term outcomes. 
        Use the insights gained here to inform your real-world decisions. 
        Remember to <Link href="/learn" className="text-indigo-600 hover:underline">visit the Learn section</Link> to understand the concepts behind the numbers.
      </p>

      {/* Simulation Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left Column: Inputs */}
        <div className="md:col-span-1 space-y-6">
          {/* Input Parameters Card */}
          <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
            <h2 className="text-xl font-semibold mb-4 text-gray-700">Parameters</h2>
            {/* Add error display for content fetching */}
            {contentError && <p className="text-red-500 text-sm mb-3">{contentError}</p>}
            
            {/* Initial Investment with Tooltip */}
            <div className="mb-4">
              <div className="flex items-center justify-between">
                 <label htmlFor="initialInvestment" className="block text-sm font-medium text-gray-600">Initial Investment (£)</label>
                 <InfoTooltip tip="The starting amount you invest.">
                    <InformationCircleIcon className="h-4 w-4 text-gray-400 cursor-help" />
                 </InfoTooltip>
              </div>
              <input type="number" id="initialInvestment" name="initialInvestment" value={params.initialInvestment} onChange={handleInputChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
              {/* Basic Validation Hint */}
              {params.initialInvestment < 0 && (
                <span className="text-xs text-red-600 mt-1">Initial investment should be zero or positive.</span>
              )}
            </div>
            
            {/* Monthly Contribution with Tooltip */}
            <div className="mb-4">
               <div className="flex items-center justify-between">
                 <label htmlFor="monthlyContribution" className="block text-sm font-medium text-gray-600">Monthly Contribution (£)</label>
                 <InfoTooltip tip="The additional amount you plan to invest each month.">
                    <InformationCircleIcon className="h-4 w-4 text-gray-400 cursor-help" />
                 </InfoTooltip>
              </div>
              <input type="number" id="monthlyContribution" name="monthlyContribution" value={params.monthlyContribution} onChange={handleInputChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
              {/* Basic Validation Hint */}
              {params.monthlyContribution < 0 && (
                <span className="text-xs text-red-600 mt-1">Monthly contribution should be zero or positive.</span>
              )}
            </div>
            
            {/* Time Horizon with Tooltip */}
            <div className="mb-4">
               <div className="flex items-center justify-between">
                 <label htmlFor="timeHorizonYears" className="block text-sm font-medium text-gray-600">Time Horizon (Years)</label>
                 <InfoTooltip tip="How many years you plan to keep the money invested.">
                    <InformationCircleIcon className="h-4 w-4 text-gray-400 cursor-help" />
                 </InfoTooltip>
              </div>
              <input type="number" id="timeHorizonYears" name="timeHorizonYears" value={params.timeHorizonYears} onChange={handleInputChange} min="1" max="50" className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
              {/* Basic Validation Hint */}
              {params.timeHorizonYears <= 0 && (
                <span className="text-xs text-red-600 mt-1">Time horizon must be at least 1 year.</span>
              )}
            </div>
            
            {/* Risk Level */}
            <div className="mb-4">
              <div className="flex justify-between items-center mb-1">
                <label htmlFor="riskLevel" className="block text-sm font-medium text-gray-600">Risk Level</label>
                <button 
                    title="Learn about Risk vs. Return"
                    onClick={() => {
                      const relatedConcept = concepts.find(c => c.slug === 'understanding-risk');
                      if (relatedConcept) {
                        openConceptModal(relatedConcept);
                      } else {
                        alert('Concept details not found.');
                        console.warn('Concepts loaded:', concepts);
                      }
                    }}
                    className="text-gray-400 hover:text-indigo-600"
                  >
                    <InformationCircleIcon className="h-5 w-5" />
                </button>
              </div>
              <select
                id="riskLevel"
                name="riskLevel"
                value={params.riskLevel}
                onChange={handleInputChange}
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md shadow-sm"
              >
                <option value="conservative">Conservative</option>
                <option value="moderate">Moderate</option>
                <option value="aggressive">Aggressive</option>
              </select>
              {/* Display Allocation Here */}
              {allocationDisplay}
            </div>
            
            {/* Advanced Settings with Tooltips */}
            <details className="mt-4 border-t pt-4 border-gray-200">
                  <summary className="text-sm font-medium text-gray-600 cursor-pointer hover:text-gray-800">Advanced Settings (Inflation/Fees)</summary>
                  <div className="mt-3 space-y-3">
                       <div className="mb-3">
                           <div className="flex items-center justify-between">
                             <label htmlFor="annualInflationRate" className="block text-xs font-medium text-gray-500">Assumed Annual Inflation (%)</label>
                             <InfoTooltip tip="The estimated rate at which prices increase per year, reducing the future buying power of money.">
                                <InformationCircleIcon className="h-3 w-3 text-gray-400 cursor-help" />
                             </InfoTooltip>
                           </div>
                           <input type="number" id="annualInflationRate" name="annualInflationRate" value={params.annualInflationRate} onChange={handleInputChange} step="0.1" className="mt-1 block w-full p-1.5 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-xs" />
                           {/* Basic Validation Hint */}
                           {params.annualInflationRate < -10 && (
                             <span className="text-xs text-red-600 mt-1">Deflation seems high. Are you sure?</span>
                           )}
                       </div>
                       <div>
                           <div className="flex items-center justify-between">
                             <label htmlFor="annualFeeRate" className="block text-xs font-medium text-gray-500">Assumed Annual Fees/Charges (%)</label>
                             <InfoTooltip tip="Estimated annual costs for managing investments (e.g., platform fees, fund charges). These reduce your returns.">
                                <InformationCircleIcon className="h-3 w-3 text-gray-400 cursor-help" />
                             </InfoTooltip>
                           </div>
                           <input type="number" id="annualFeeRate" name="annualFeeRate" value={params.annualFeeRate} onChange={handleInputChange} step="0.1" className="mt-1 block w-full p-1.5 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-xs" />
                           {/* Basic Validation Hint */}
                           {params.annualFeeRate < 0 && (
                             <span className="text-xs text-red-600 mt-1">Fees cannot be negative.</span>
                           )}
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
                 
                 {/* --- Display Impact Preview --- */}
                 {impactPreviewText && (
                    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-800">
                       {impactPreviewText}
                    </div>
                 )}
                 {/* ----------------------------- */}
               </div>
             )}
           </div>

          {/* Run Button - use isCalculating state */} 
          <button onClick={() => runSimulationAndBenchmarks()} disabled={isCalculating} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out">
            {isCalculating ? 'Calculating...' : 'Run Simulation'}
          </button>
        </div>

        {/* Right Column: Chart & Results */}
        <div className="md:col-span-2">
          {/* --- Explanation of Monte Carlo --- */}
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
            <h3 className="font-semibold mb-1 text-blue-900">Understanding the Results (Monte Carlo Simulation)</h3>
            <p>
              This simulation uses a Monte Carlo method. Instead of predicting one exact future, it runs thousands of potential scenarios based on historical market returns and volatility, incorporating randomness.
            </p>
            <p className="mt-1">
              The chart shows the <span className="font-semibold">Median (P50)</span> outcome (half of the simulations performed better, half worse), along with a probable range: <span className="font-semibold text-red-600">Lower (P10)</span> and <span className="font-semibold text-green-600">Higher (P90)</span>. This range helps visualize potential risks and rewards associated with your chosen parameters.
            </p>
          </div>

          {/* Results Summary Card */}
          <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 mb-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-700">Results (Year: {currentYear})</h2>
            {isCalculating && <p className="text-center text-gray-500">Calculating...</p>} 
            {!isCalculating && !result && <p className="text-center text-gray-500 italic">Run the simulation to see results.</p>}
            {result && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-center"> {/* Changed to 3 columns */} 
                {/* Col 1: User Portfolio Range */}
                <div className="space-y-3 border-r pr-4 border-gray-200">
                   <p className="text-sm font-medium text-gray-500 underline">Your Portfolio</p>
                   <div>
                     <div className="flex items-center justify-center space-x-1">
                       <p className="text-xs font-medium text-red-500">Lower (P10)</p>
                       <InfoTooltip tip="Represents a poorer outcome (10th percentile): In 10% of simulated scenarios, the result was this amount or less.">
                          <InformationCircleIcon className="h-3 w-3 text-gray-400 cursor-help" />
                       </InfoTooltip>
                     </div>
                     <p className="text-lg font-semibold text-red-700 mt-0.5">{formatCurrency(displayBalanceP10)}</p>
                   </div>
                   <div>
                     <div className="flex items-center justify-center space-x-1">
                       <p className="text-sm font-medium text-indigo-600">Median (P50)</p>
                       <InfoTooltip tip="Represents the middle outcome (50th percentile): Half of the simulated scenarios performed better than this, and half performed worse.">
                           <InformationCircleIcon className="h-3.5 w-3.5 text-gray-400 cursor-help" />
                       </InfoTooltip>
                     </div>
                     <p className="text-xl font-bold text-indigo-800 mt-0.5">{formatCurrency(displayBalanceP50)}</p>
                   </div>
                   <div>
                     <div className="flex items-center justify-center space-x-1">
                       <p className="text-xs font-medium text-green-500">Higher (P90)</p>
                       <InfoTooltip tip="Represents a better outcome (90th percentile): In 90% of simulated scenarios, the result was this amount or less (or, 10% performed better).">
                           <InformationCircleIcon className="h-3 w-3 text-gray-400 cursor-help" />
                       </InfoTooltip>
                     </div>
                     <p className="text-lg font-semibold text-green-700 mt-0.5">{formatCurrency(displayBalanceP90)}</p>
                   </div>
                </div>
                {/* Col 2: Benchmarks */}
                <div className="space-y-3 border-r pr-4 border-gray-200">
                   <p className="text-sm font-medium text-gray-500 underline">Benchmarks</p>
                   <div>
                     <p className="text-xs font-medium text-gray-500">Equity Index</p>
                     <p className="text-lg font-semibold text-gray-800 mt-0.5">{formatCurrency(displayBenchmarkEquityBalance)}</p>
                   </div>
                   <div>
                     <p className="text-xs font-medium text-gray-500">Cash Savings</p>
                     <p className="text-lg font-semibold text-gray-800 mt-0.5">{formatCurrency(displayBenchmarkCashBalance)}</p>
                   </div>
                </div>
                {/* Col 3: Contributions/Growth */}
                <div className="space-y-3">
                   <p className="text-sm font-medium text-gray-500 underline">Breakdown (Median)</p>
                   <div>
                     <p className="text-xs font-medium text-gray-500">Total Contributions</p>
                     <p className="text-lg font-semibold text-gray-800 mt-0.5">{formatCurrency(displayContributions)}</p>
                   </div>
                   <div>
                     <p className="text-xs font-medium text-gray-500">Total Growth</p>
                     <p className="text-lg font-semibold text-gray-800 mt-0.5">{formatCurrency(displayGrowthP50)}</p>
                   </div>
                </div>
              </div>
            )}
            {/* --- Display Volatility Hint --- */} 
            {volatilityHint && !isCalculating && (
                <p className="text-xs text-gray-500 italic mt-4 text-center">
                    {volatilityHint}
                </p>
            )}
            {/* ----------------------------- */} 
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

              {/* Link to Concept (if associated) - Always show if exists */}
              {currentEvent.associated_concept_id && (
                 (() => { 
                    const relatedConcept = concepts.find(c => c.id === currentEvent.associated_concept_id);
                    if (relatedConcept && relatedConcept.slug) {
                       return (
                         <div className="mt-3 pt-3 border-t border-blue-200 flex items-center justify-between">
                           <Link 
                              href={`/learn/${relatedConcept.slug}`}
                              target="_blank" // Open in new tab
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                            >
                               Learn more about "{relatedConcept.title}"...
                           </Link>
                           {/* Conditionally show modal button based on level */}
                           {isConceptLevelAppropriate(relatedConcept.knowledge_level_required) && (
                              <button 
                                onClick={(e) => {
                                  e.preventDefault();
                                  openConceptModal(relatedConcept);
                                }}
                                className="text-xs text-blue-500 hover:text-blue-700 p-1 bg-blue-100 rounded hover:bg-blue-200"
                                title="Open quick view"
                              >
                                 Quick View
                              </button>
                           )}
                         </div>
                       );
                    }
                    return null;
                 })()
              )}
            </div>
          )}
          {/* ---------------------------------- */}

          {/* Chart Card */}
          <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 min-h-[400px]">
            <h2 className="text-xl font-semibold mb-4 text-gray-700">Projected Growth Range vs Benchmarks</h2>
            {result ? (
              <ResponsiveContainer width="100%" height={350}>
                 <LineChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis dataKey="year" tickFormatter={formatYear} interval="preserveStartEnd" className="text-xs"/>
                  <YAxis tickFormatter={formatCurrency} width={80} className="text-xs"/>
                  <Tooltip formatter={(value: number, name: string) => formatCurrency(value)} labelFormatter={(label: number) => `End of Year ${label}`} />
                  <Legend wrapperStyle={{fontSize: "12px"}}/>
                  {/* Benchmarks */}
                  <Line type="monotone" dataKey="benchmarkEquityBalance" name="Benchmark (Equity)" stroke="#fbbf24" strokeWidth={1.5} dot={false} strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="benchmarkCashBalance" name="Benchmark (Cash)" stroke="#6b7280" strokeWidth={1.5} dot={false} strokeDasharray="3 3" />
                  {/* P10 Line */}
                  <Line type="monotone" dataKey="balanceP10" name="Your Portfolio (Lower)" stroke="#ef4444" strokeWidth={1} dot={false} strokeDasharray="5 5" />
                  {/* P50 Line */}
                  <Line type="monotone" dataKey="balanceP50" name="Your Portfolio (Median)" stroke="#4f46e5" strokeWidth={2} dot={false} />
                  {/* P90 Line */}
                  <Line type="monotone" dataKey="balanceP90" name="Your Portfolio (Higher)" stroke="#22c55e" strokeWidth={1} dot={false} strokeDasharray="5 5" />
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