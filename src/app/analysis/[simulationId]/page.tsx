'use client'

import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useParams } from 'next/navigation'; // Hook to get dynamic route params
import type { Database, Json } from '@/lib/database.types';
import type { User } from '@supabase/supabase-js';
// Import chart components and types
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { YearlyData } from '@/lib/simulationUtils'; // Import YearlyData type
// Import calculation function and event type
import { calculateBenchmarkGrowth, calculatePortfolioGrowth, SimulationEvent as UtilSimulationEvent } from '@/lib/simulationUtils';
import WhatIfModal from '@/components/analysis/WhatIfModal'; // Assume we create this
// Import ConceptModal if we want to link concepts
// import ConceptModal from '@/components/learning/ConceptModal'; 
// Add type for Concept if not already implicitly available via SimulationEvent
type Concept = Database['public']['Tables']['concepts']['Row'];

// Type for saved simulation data, now including yearly_data and event_choices_made
// Manually add yearly_data and event_choices_made for now until type generation is fixed
type SavedSimulation = Database['public']['Tables']['saved_simulations']['Row'] & {
  yearly_data?: Json | YearlyData[] | null; // Make it optional and allow raw Json or parsed type
  event_choices_made?: Json | Record<string, Json> | null; // Add event choices made
  // Add user_profile relation if needed for impact calc - requires adjusting select query
  // user_profile?: Database['public']['Tables']['user_profiles']['Row'] | null;
};

// Use the manually defined/exported type from utils if DB one is broken
// type SimulationEvent = Database['public']['Tables']['simulation_events']['Row'];
type SimulationEvent = UtilSimulationEvent;

// Type for storing decision impact results
interface DecisionImpact {
    eventId: string;
    choiceMadeText: string;
    alternativeChoiceText: string;
    impactAmount: number; // Difference in final P50 balance
}

// TODO: We will likely need to re-run the simulation or fetch/display 
// pre-calculated yearly data later to show the chart and full details.
// For now, just display the saved parameters.

// Helper to format currency (can be shared)
const formatCurrency = (value: number | null | undefined) => {
  if (value === null || value === undefined) return 'N/A';
  return `£${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Helper to format date (can be shared)
const formatDate = (dateString: string | null) => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-GB', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
};

// Helper to format chart X-axis (can be shared)
const formatYear = (year: number) => `Year ${year}`;

export default function SimulationDetailPage() {
  const supabase = createClient();
  const params = useParams(); // Get route params { simulationId: '...' }
  const simulationId = params.simulationId as string;

  const [simulation, setSimulation] = useState<SavedSimulation | null>(null);
  // State specifically for the chart data, parsed from the saved JSON
  const [chartData, setChartData] = useState<YearlyData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  // --- State for Benchmark Data ---
  const [benchmarkDataEquity, setBenchmarkDataEquity] = useState<YearlyData[] | null>(null);
  const [benchmarkDataCash, setBenchmarkDataCash] = useState<YearlyData[] | null>(null);
  // --- State for Scenario/Choice Names ---
  const [scenarioTitle, setScenarioTitle] = useState<string | null>(null);
  const [choiceText, setChoiceText] = useState<string | null>(null);
  // --- State for All Simulation Events ---
  const [allEvents, setAllEvents] = useState<SimulationEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(true);
  // -------------------------------------
  // --- State for Decision Impacts --- 
  const [decisionImpacts, setDecisionImpacts] = useState<DecisionImpact[]>([]);
  const [isCalculatingImpacts, setIsCalculatingImpacts] = useState(false);
  // ----------------------------------
  const [isWhatIfModalOpen, setIsWhatIfModalOpen] = useState(false);
  const [whatIfChartData, setWhatIfChartData] = useState<YearlyData[] | null>(null); // State for comparison results
  // --- State for Concepts --- 
  const [allConcepts, setAllConcepts] = useState<Concept[]>([]);
  const [isLoadingConcepts, setIsLoadingConcepts] = useState(true);
  // State for Concept Modal (if implementing links)
  // const [selectedConcept, setSelectedConcept] = useState<Concept | null>(null);

  // Fetch user (similar to analysis list page)
  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
    };
    getUser();
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
     return () => {
        authListener?.subscription.unsubscribe();
    };
  }, [supabase]);

  // Fetch simulation, benchmarks, names, AND all events
  useEffect(() => {
    const fetchAllData = async () => {
      if (!user || !simulationId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      setChartData(null); 
      setBenchmarkDataEquity(null); 
      setBenchmarkDataCash(null);  
      setScenarioTitle(null); 
      setChoiceText(null);   
      setAllEvents([]); // Reset events
      setIsLoadingEvents(true);
      setDecisionImpacts([]); // Reset impacts
      setAllConcepts([]); // Reset concepts
      setIsLoadingConcepts(true);

      // --- Fetch All Events & Concepts Concurrently ---
      const eventsPromise = supabase.from('simulation_events').select('*');
      const conceptsPromise = supabase.from('concepts').select('*'); // <-- Fetch concepts
      // ------------------------------------------------

      try {
        // Fetch main simulation data - ADD event_choices_made
        // Consider adding `user_profiles (*)` if needed for impact calc
        const { data, error: dbError } = await supabase
          .from('saved_simulations')
          .select('*, event_choices_made') // <-- Fetch event_choices_made
          .eq('id', simulationId)
          .eq('user_id', user.id) 
          .single(); 

        if (dbError) {
          if (dbError.code === 'PGRST116') {
            setError('Simulation not found or you do not have permission to view it.');
          } else {
            throw dbError;
          }
        } else if (data) {
            // Manually cast event_choices_made if needed
            const simData = data as unknown as SavedSimulation; 
            // Ensure event_choices_made is parsed if it's a string
            if (simData.event_choices_made && typeof simData.event_choices_made === 'string') {
                try {
                    simData.event_choices_made = JSON.parse(simData.event_choices_made);
                } catch (e) {
                    console.error("Failed to parse event_choices_made JSON:", e);
                    simData.event_choices_made = null; // Set to null or handle error
                    // Optionally set an error state here
                }
            }
            setSimulation(simData); 
            
            // Parse the yearly_data JSON for the main chart
            const yearlyData = simData.yearly_data;
            if (yearlyData) {
                try {
                    // Ensure it's treated as YearlyData[] after parsing/checking
                    const parsedData = typeof yearlyData === 'string' ? JSON.parse(yearlyData) : yearlyData;
                    // Add a basic check to see if it looks like the expected array
                    if (Array.isArray(parsedData) && (parsedData.length === 0 || typeof parsedData[0]?.year === 'number')) {
                      setChartData(parsedData as YearlyData[]);
                    } else {
                      console.error("Parsed yearly_data is not in the expected format:", parsedData);
                      setError("Chart data format is incorrect.");
                    }
                } catch (parseError) {
                    console.error("Error parsing yearly_data:", parseError);
                    setError("Failed to parse chart data for this simulation.");
                }
            } else {
                 setError("Chart data is missing for this simulation.");
            }

            // --- Calculate Benchmark Data --- 
            if (simData.time_horizon_years) { // Ensure we have needed params
                const benchmarkParams = {
                    initialInvestment: simData.initial_investment,
                    monthlyContribution: simData.monthly_contribution,
                    timeHorizonYears: simData.time_horizon_years,
                };
                try {
                    const equityData = calculateBenchmarkGrowth({
                         ...benchmarkParams, 
                         benchmarkType: 'globalEquity'
                    });
                    setBenchmarkDataEquity(equityData);

                    const cashData = calculateBenchmarkGrowth({
                        ...benchmarkParams,
                        benchmarkType: 'ukCash' // Example: UK Cash
                    });
                    setBenchmarkDataCash(cashData);
                } catch (benchmarkError) {
                     console.error("Error calculating benchmark data:", benchmarkError);
                     // Set error or proceed without benchmarks?
                     // setError("Failed to calculate benchmark comparisons.");
                }
            } else {
                 console.warn("Cannot calculate benchmarks, missing simulation parameters.");
            }
            // --------------------------------

            // --- Fetch Scenario/Choice Names --- 
            if (simData.scenario_id) {
                const { data: scenarioData, error: scenarioError } = await supabase
                    .from('scenarios')
                    .select('title')
                    .eq('id', simData.scenario_id)
                    .single();
                if (scenarioError) {
                    console.error('Error fetching scenario title:', scenarioError);
                } else {
                    setScenarioTitle(scenarioData?.title || 'Unknown Scenario');
                }
            }
            if (simData.scenario_choice_id) {
                 const { data: choiceData, error: choiceError } = await supabase
                    .from('scenario_choices')
                    .select('text')
                    .eq('id', simData.scenario_choice_id)
                    .single();
                 if (choiceError) {
                    console.error('Error fetching choice text:', choiceError);
                 } else {
                    setChoiceText(choiceData?.text || 'Unknown Choice');
                 }
            }
            // ------------------------------------

            // --- Set All Events & Concepts from Concurrent Fetches ---
            const [{ data: eventsData, error: eventsError }, { data: conceptsData, error: conceptsError }] = await Promise.all([eventsPromise, conceptsPromise]);

            if (eventsError) {
                console.error("Error fetching all simulation events:", eventsError);
            } else {
                setAllEvents((eventsData as unknown as SimulationEvent[]) || []);
            }
            setIsLoadingEvents(false);

            if (conceptsError) {
                console.error("Error fetching all concepts:", conceptsError);
                // Handle error - maybe show warning
            } else {
                // Manually assert type if needed
                setAllConcepts((conceptsData as unknown as Concept[]) || []);
            }
            setIsLoadingConcepts(false);
            // ------------------------------------------------------

        } else {
             setError('Simulation data not found.'); // Should be caught by PGRST116, but as fallback
        }
        
      } catch (err: any) {
        console.error('Error fetching simulation details:', err.message);
        if (!error) { 
           setError('Failed to load simulation details. Please try again.');
        }
        setIsLoadingEvents(false); // Ensure loading state is cleared on error
        setIsLoadingConcepts(false);
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
  }, [user, simulationId, supabase]); // Removed error from deps, handle within try/catch

  // --- Filter relevant decision events --- 
  const relevantDecisionEvents = useMemo(() => {
      if (!simulation || allEvents.length === 0) return [];
      return allEvents.filter(event => 
          event.event_type === 'decision' && 
          event.trigger_year !== null && 
          event.trigger_year <= simulation.time_horizon_years
      );
  }, [simulation, allEvents]);
  // ---------------------------------------

  // --- useEffect to Calculate Decision Impacts ---
 useEffect(() => {
    // Ensure needed data is loaded and parsed, and not already calculating
    if (!simulation || typeof simulation.event_choices_made !== 'object' || simulation.event_choices_made === null || allEvents.length === 0 || relevantDecisionEvents.length === 0 || chartData === null || isCalculatingImpacts) {
        // Don't run calculation if data isn't ready, choices invalid, no decisions made/relevant, or already running
        return;
    }

    const calculateImpacts = async () => {
        setIsCalculatingImpacts(true);
        console.log("Starting decision impact calculation...");
        const impacts: DecisionImpact[] = [];
        // Ensure choicesMade is treated as the correct type
        const choicesMade = simulation.event_choices_made as Record<string, { choiceText?: string; [key: string]: any }>; // More specific type assumption

        // Base parameters for the simulation runs
        const baseParams = {
            initialInvestment: simulation.initial_investment,
            monthlyContribution: simulation.monthly_contribution,
            timeHorizonYears: simulation.time_horizon_years,
            // Ensure risk level is one of the expected literal types
            riskLevel: simulation.risk_level as 'conservative' | 'moderate' | 'aggressive',
            annualInflationRate: simulation.annual_inflation_rate ?? 0, // Provide default if nullable
            annualFeeRate: simulation.annual_fee_rate ?? 0, // Provide default if nullable
        };

        // Get the actual final balance (P50) from the already parsed chart data
        const actualFinalBalance = chartData[chartData.length - 1]?.balanceP50 ?? simulation.final_balance ?? 0;
        if (actualFinalBalance === 0 && simulation.final_balance === 0) {
             console.warn("Actual final balance is 0, impact calculations might be trivial.");
        }

        for (const event of relevantDecisionEvents) {
            // Check if a choice was actually made for this specific event in this simulation run
            if (choicesMade && choicesMade[event.id]) {
                 const userChoiceData = choicesMade[event.id];
                 const userChoiceText = userChoiceData?.choiceText || 'Your Choice'; // Get text if saved
                 console.log(`Processing event: ${event.id} (${event.title}), User choice: ${userChoiceText}`);

                 // Find the alternative choice(s)
                 // Assuming decision_options is { options: Array<{ text: string; impact: Json }> }
                 const decisionOptions = event.decision_options as { options?: Array<{ text: string; impact: Json }> } | null;
                 if (decisionOptions?.options && decisionOptions.options.length > 1) {
                    // Find the *first* option that ISN'T the user's choice text.
                     const alternativeChoice = decisionOptions.options.find(opt => opt.text !== userChoiceText);

                     if (alternativeChoice) {
                        console.log(`Found alternative choice for ${event.id}: ${alternativeChoice.text}`);
                        // Create the modified event choices for the alternative run
                        const alternativeChoicesMade = { ...choicesMade };
                        // Replace the user's choice impact with the alternative's impact payload
                        alternativeChoicesMade[event.id] = { ...(alternativeChoice.impact as object), choiceText: alternativeChoice.text }; // Spread impact and add text

                        try {
                            // Run simulation with ALTERNATIVE choice
                            console.log(`Calculating impact for event ${event.id}, alternative: ${alternativeChoice.text}`);
                            // Pass careerStage/locationRegion if available and used by the util
                            // const profile = simulation.user_profile; // Assuming profile might be fetched/joined
                            const alternativeResult = calculatePortfolioGrowth(
                                baseParams,
                                allEvents, // Pass all potential events
                                alternativeChoicesMade as Record<string, Json>, // Pass modified choices, cast needed
                                undefined, // Pass careerStage if available
                                undefined  // Pass locationRegion if available
                                // Using default numIterations for consistency
                            );
                            const alternativeFinalBalance = alternativeResult.yearlyData[alternativeResult.yearlyData.length - 1]?.balanceP50 ?? 0;

                            const impactAmount = actualFinalBalance - alternativeFinalBalance;

                            impacts.push({
                                eventId: event.id,
                                choiceMadeText: userChoiceText,
                                alternativeChoiceText: alternativeChoice.text,
                                impactAmount: Math.round(impactAmount * 100) / 100, // Round to 2 decimal places
                            });
                            console.log(`Event ${event.id} Impact: ${formatCurrency(impactAmount)} (Actual: ${formatCurrency(actualFinalBalance)}, Alt: ${formatCurrency(alternativeFinalBalance)})`);

                        } catch (calcError: any) {
                            console.error(`Error calculating alternative scenario for event ${event.id} (${alternativeChoice.text}):`, calcError);
                            // Optionally add an error indicator for this specific impact to display in UI
                        }
                     } else {
                         console.warn(`No alternative choice found for event ${event.id} where user chose ${userChoiceText}`);
                     }
                 } else {
                    console.warn(`Decision options missing or invalid for event ${event.id}`);
                 }
            } else {
                 console.log(`No choice recorded for relevant decision event ${event.id} in this simulation.`);
            }
        }

        console.log("Finished decision impact calculation. Impacts:", impacts);
        setDecisionImpacts(impacts);
        setIsCalculatingImpacts(false);
    };

    // Run calculation
    calculateImpacts();

 // Add isCalculatingImpacts to prevent re-entry while running
 }, [simulation, allEvents, relevantDecisionEvents, chartData, isCalculatingImpacts]);

  const handleRunWhatIf = (resultData: YearlyData[]) => {
      console.log("Received What-If Result Data:", resultData);
      setWhatIfChartData(resultData);
      // Optionally close modal here or let modal handle it
      // setIsWhatIfModalOpen(false);
  };

  // --- Handler to open concept modal (if implemented) ---
    // const handleConceptClick = (conceptId: string | null) => {
    //     if (!conceptId) return;
    //     const concept = allConcepts.find(c => c.id === conceptId);
    //     if (concept) {
    //         setSelectedConcept(concept);
    //     }
    // };
    // -----------------------------------------------------

  // Display simulation details
  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">
          Simulation Details
        </h1>
        <Link href="/analysis" className="text-sm text-indigo-600 hover:underline">
          &larr; Back to Saved Simulations
        </Link>
      </div>

      {loading && <p className="text-gray-500">Loading details...</p>}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
      )}

      {!loading && !error && simulation && (
        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 space-y-6"> {/* Increased spacing */}
          <h2 className="text-xl font-semibold text-gray-700 mb-4">
            {simulation.simulation_name || `Simulation ${simulation.id.substring(0, 6)}...`}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium text-gray-500">Date Saved</p>
              <p className="text-gray-800">{formatDate(simulation.created_at)}</p>
            </div>
             <div>
              <p className="font-medium text-gray-500">Time Horizon</p>
              <p className="text-gray-800">{simulation.time_horizon_years} Years</p>
            </div>
             <div>
              <p className="font-medium text-gray-500">Risk Level</p>
              <p className="text-gray-800 capitalize">{simulation.risk_level}</p>
            </div>
            <div>
              <p className="font-medium text-gray-500">Initial Investment</p>
              <p className="text-gray-800">{formatCurrency(simulation.initial_investment)}</p>
            </div>
            <div>
              <p className="font-medium text-gray-500">Monthly Contribution</p>
              <p className="text-gray-800">{formatCurrency(simulation.monthly_contribution)}</p>
            </div>
             {/* Add Scenario/Choice display if they exist */}
            {simulation.scenario_id && (
                 <div>
                    <p className="font-medium text-gray-500">Scenario Applied</p>
                    <p className="text-gray-800">{scenarioTitle || 'Loading...'}</p>
                 </div>
             )}
             {simulation.scenario_choice_id && (
                 <div>
                    <p className="font-medium text-gray-500">Scenario Choice Made</p>
                    <p className="text-gray-800">{choiceText || 'Loading...'}</p>
                 </div>
             )}
           </div>
          
           <div className="border-t pt-4 mt-4">
              <p className="font-medium text-gray-500">Final Balance (P50)</p>
              <p className="text-2xl font-bold text-indigo-800">{formatCurrency(simulation.final_balance)}</p>
              {/* TODO: Add more results like growth, contributions, P10/P90 if available */}
              <p className="font-medium text-gray-500 mt-2">Total Contributions</p>
              <p className="text-gray-800 text-sm">{formatCurrency(simulation.total_contributions)}</p>
              <p className="font-medium text-gray-500 mt-2">Total Growth (P50)</p>
              <p className="text-green-700 text-sm">{formatCurrency(simulation.total_growth)}</p>
           </div>

           {/* Chart Section */}
           <div className="border-t pt-4 mt-4">
                <h3 className="text-lg font-semibold text-gray-700 mb-2">Growth Chart & Benchmarks</h3>
                {(chartData || benchmarkDataEquity || benchmarkDataCash) ? (
                    <ResponsiveContainer width="100%" height={350}>
                        {/* Note: The `data` prop for LineChart should ideally contain all series combined for accurate axis scaling if ranges differ */}
                        {/* However, for simplicity here, we pass the primary data and let recharts handle it. */}
                        <LineChart data={chartData || benchmarkDataEquity || benchmarkDataCash || []} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                         <XAxis 
                            dataKey="year"
                            tickFormatter={formatYear}
                            interval="preserveStartEnd"
                            allowDuplicatedCategory={false} // Important if merging data
                            className="text-xs"
                        />
                        <YAxis tickFormatter={(val) => formatCurrency(val)} width={80} className="text-xs"/>
                        <Tooltip formatter={(value: number) => formatCurrency(value)} labelFormatter={(label: number) => `End of Year ${label}`} />
                        <Legend wrapperStyle={{fontSize: "12px"}}/>

                        {/* User Simulation Line (Original) */}
                        {chartData && (
                           <Line type="monotone" dataKey="balanceP50" data={chartData} name="Original (P50)" stroke="#4f46e5" strokeWidth={2.5} dot={false} />
                        )}
                         {/* --- What-If Line --- */}
                         {whatIfChartData && (
                             <Line type="monotone" dataKey="balanceP50" data={whatIfChartData} name="What-If (P50)" stroke="#db2777" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                         )}                         {/* -------------------- */}
                        {/* Benchmark Lines */}                        {benchmarkDataEquity && (
                             <Line type="monotone" dataKey="balanceP50" data={benchmarkDataEquity} name="Global Equity" stroke="#10b981" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
                        )}
                        {benchmarkDataCash && (
                            <Line type="monotone" dataKey="balanceP50" data={benchmarkDataCash} name="UK Cash" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="3 3" dot={false} />
                        )}
                        </LineChart>
                    </ResponsiveContainer>
                 ) : (
                   <div className="h-64 bg-gray-100 flex items-center justify-center rounded">
                        <p className="text-gray-400 italic">
                            {loading ? "Loading chart data..." : error || "Chart data not available."}
                         </p>
                    </div>
                 )}
                 {/* --- Display What-If Summary --- */}
                 {whatIfChartData && chartData && (
                    <div className="mt-4 p-3 bg-indigo-50 border border-indigo-200 rounded text-sm">
                        <h4 className="font-semibold text-indigo-800 mb-1">What-If Scenario Result:</h4>
                        {/* Use optional chaining for safety even within the conditional block */}
                        <p>Original Final Balance (P50): {formatCurrency(chartData[chartData.length - 1]?.balanceP50)}</p>
                        <p>What-If Final Balance (P50): <span className="font-bold">{formatCurrency(whatIfChartData?.[whatIfChartData.length - 1]?.balanceP50)}</span></p>
                        {/* Check lengths before calculating difference */}
                        {(whatIfChartData.length > 0 && chartData.length > 0) && (
                            <p>Difference:
                                <span className={`font-bold ml-1 ${
                                    // Use optional chaining again for accessing values in comparison
                                    (whatIfChartData?.[whatIfChartData.length - 1]?.balanceP50 ?? 0) >= (chartData?.[chartData.length - 1]?.balanceP50 ?? 0)
                                    ? 'text-green-700' : 'text-red-700'
                                }`}>
                                  {formatCurrency(
                                      (whatIfChartData?.[whatIfChartData.length - 1]?.balanceP50 ?? 0) - (chartData?.[chartData.length - 1]?.balanceP50 ?? 0)
                                  )}
                                </span>
                            </p>
                        )}
                    </div>
                 )}
                 {/* ----------------------------- */}
            </div>

           {/* Decision Points Section */}
           {relevantDecisionEvents.length > 0 && (
             <div className="border-t pt-4 mt-6">
                <h3 className="text-lg font-semibold text-gray-700 mb-3">Key Decision Points & Impact</h3>
                {isCalculatingImpacts && !decisionImpacts.length && <p className="text-sm text-gray-500 italic">Calculating decision impacts...</p>}
                {!isCalculatingImpacts && relevantDecisionEvents.some(event => simulation?.event_choices_made && (simulation.event_choices_made as Record<string, Json>)[event.id]) && decisionImpacts.length === 0 &&
                    <p className="text-sm text-orange-500 italic">Could not calculate impacts for decisions made (check console or data).</p>
                }
                <div className="space-y-4"> {/* Increased spacing */}                   {relevantDecisionEvents.map(event => {
                      // Find the impact calculated for this event
                      const impactData = decisionImpacts.find(imp => imp.eventId === event.id);
                      // Check if a choice was made for this event in the saved sim
                      const choicesMadeRecord = simulation?.event_choices_made as Record<string, Json> | null | undefined;
                      const choiceWasMade = !!(choicesMadeRecord && choicesMadeRecord[event.id]);
                      const userChoiceText = choiceWasMade ? (choicesMadeRecord?.[event.id] as any)?.choiceText || 'Your Choice' : null;

                      // Only render the card if it was a relevant decision event
                      // We display impact info conditionally inside
                      return (
                        <div key={event.id} className="p-3 border rounded-md bg-gray-50 text-sm shadow-sm"> {/* Added shadow */}
                           <p className="font-medium text-gray-800">Year {event.trigger_year}: {event.title}</p>
                           <p className="text-xs text-gray-600 mt-1 mb-2">{event.description}</p>
                           {choiceWasMade ? (
                                impactData ? (
                                 <div className="mt-2 pt-2 border-t border-gray-200">
                                    <p className="text-xs">
                                       <span className="font-semibold">You chose:</span> "{impactData.choiceMadeText}"
                                    </p>
                                    <p className="text-xs mt-1">
                                       <span className="font-semibold">Impact vs choosing "{impactData.alternativeChoiceText}":</span>
                                       <span className={`font-bold ml-1 ${impactData.impactAmount >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                          {impactData.impactAmount >= 0 ? '+' : ''}{formatCurrency(impactData.impactAmount)}
                                       </span>
                                       <span className="text-gray-500"> (difference in final P50 balance)</span>
                                    </p>
                                 </div>
                               ) : isCalculatingImpacts ? (
                                   <p className="text-xs text-gray-500 italic mt-2">(Calculating impact...)</p>
                               ) : (
                                  <p className="text-xs text-orange-600 italic mt-2">(Could not calculate impact. Check console.)</p>
                               )
                            ) : (
                               <p className="text-xs text-gray-400 italic mt-2">(No choice needed or recorded for this event in this simulation run.)</p>
                           )}
                        </div>
                      );
                   })}
                </div>
             </div>
           )}

           {/* --- Learning Assessment / Reflection Section --- */}
           {decisionImpacts.length > 0 && !isLoadingConcepts && (
                 <div className="border-t pt-4 mt-6">
                    <h3 className="text-lg font-semibold text-gray-700 mb-3">Reflection Prompts</h3>
                    <div className="space-y-4">
                        {decisionImpacts.map((impact) => {
                            const event = allEvents.find(e => e.id === impact.eventId);
                            if (!event) return null; // Should not happen if data is consistent

                            const concept = event.associated_concept_id 
                                ? allConcepts.find(c => c.id === event.associated_concept_id) 
                                : null;

                            const impactSign = impact.impactAmount === 0 ? 'neutral' : impact.impactAmount > 0 ? 'positive' : 'negative';
                            const impactColor = impactSign === 'positive' ? 'text-green-700' : impactSign === 'negative' ? 'text-red-700' : 'text-gray-700';
                            const impactPrefix = impactSign === 'positive' ? '+' : '';

                            return (
                                <div key={`reflect-${impact.eventId}`} className="p-3 border border-blue-200 rounded-md bg-blue-50 text-sm shadow-sm">
                                    <p className="font-medium text-gray-800">Regarding "{event.title}" (Year {event.trigger_year}):</p>
                                    <p className="text-xs text-gray-600 mt-1">
                                        You chose "{impact.choiceMadeText}", which had a{' '}
                                        <span className={`font-semibold ${impactColor}`}>
                                            {impactSign} impact ({impactPrefix}{formatCurrency(impact.impactAmount)})
                                        </span>{' '}
                                        compared to choosing "{impact.alternativeChoiceText}".
                                    </p>
                                    {concept ? (
                                        <p className="mt-2 text-blue-800">
                                            <span className="font-semibold">Reflect:</span> Considering the concept of{' '}
                                            <button 
                                                className="font-semibold text-blue-600 hover:underline focus:outline-none"
                                                // onClick={() => handleConceptClick(concept.id)} // Uncomment to enable modal
                                                title={`Learn more about: ${concept.title}`} // Tooltip
                                            >
                                                "{concept.title}"
                                            </button>
                                            , why do you think this choice led to this outcome? What factors might have influenced this result in the simulation?
                                            {/* Optional: Add Text Area Here */}
                                            {/* <textarea className="mt-2 w-full p-2 border rounded text-xs" rows={2} placeholder="Your thoughts... (saving not implemented)"></textarea> */}
                                        </p>
                                    ) : (
                                        <p className="mt-2 text-blue-800">
                                             <span className="font-semibold">Reflect:</span> Why do you think making this choice led to this outcome? What market conditions or other factors shown in the simulation might explain this difference?
                                             {/* Optional: Add Text Area Here */}
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
            {/* --------------------------------------------------- */}

           {/* --- Add What-If Button --- */}
           <div className="flex justify-end pt-4 border-t mt-6"> {/* Added padding/border */}
                <button
                    onClick={() => setIsWhatIfModalOpen(true)}
                    className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                    disabled={isLoadingEvents || isCalculatingImpacts}
                >
                    Run What-If Analysis
                </button>
            </div>
            {/* ------------------------- */}

        </div>
      )}

      {/* --- Render What-If Modal --- */}
      {simulation && (
          <WhatIfModal
              isOpen={isWhatIfModalOpen}
              onClose={() => {
                  setIsWhatIfModalOpen(false);
                  // Optionally clear what-if results when modal closes
                  // setWhatIfChartData(null);
              }}
              originalSimulation={simulation}
              allEvents={allEvents} // Pass all potential events
              relevantDecisionEvents={relevantDecisionEvents} // Pass decisions relevant to original run
              onRunComplete={handleRunWhatIf} // Callback to receive results
          />
      )}
      {/* --------------------------- */}

      {/* --- Render Concept Modal --- */}
      {/* {selectedConcept && (
          <ConceptModal
              concept={selectedConcept}
              isOpen={!!selectedConcept}
              onClose={() => setSelectedConcept(null)}
          />
      )} */}
      {/* --------------------------- */}

    </div>
  );
} 