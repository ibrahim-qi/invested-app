'use client'

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { calculatePortfolioGrowth } from '@/lib/simulationUtils'; // Import the new calculation function
// Import Recharts components
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import type { Scenario as AppScenario, ScenarioChoice as AppScenarioChoice } from '@/types/simulation.types'; // Import scenario types
import { createClient } from '@/lib/supabaseClient'; // Import client-side client
import type { User } from '@supabase/supabase-js'; // Import User type
import type { Database } from '@/lib/database.types'; // Import full DB types
import { useSearchParams } from 'next/navigation'; // Import useSearchParams

// DB Types
type DbScenario = Database['public']['Tables']['scenarios']['Row'];
type DbScenarioChoice = Database['public']['Tables']['scenario_choices']['Row'];

// Placeholder types for simulation - we'll refine these
type SimulationParams = {
  initialInvestment: number;
  monthlyContribution: number;
  timeHorizonYears: number;
  riskLevel: 'conservative' | 'moderate' | 'aggressive';
};

type SimulationResult = {
  finalBalance: number;
  totalContributions: number;
  totalGrowth: number;
  monthlyData?: { month: number; balance: number }[]; // Make monthlyData optional here
};

// Helper to format Y-axis ticks as currency
const formatCurrency = (value: number) => `£${value.toLocaleString()}`;

// Helper to format X-axis ticks from months to years
const formatYear = (month: number) => `Year ${Math.floor(month / 12)}`;

// --- Component to Read Query Params --- 
// Needs to be separate because useSearchParams requires Suspense boundary
function SimulationContent() {
  const supabase = createClient();
  const searchParams = useSearchParams();

  // Function to get initial state from search params or defaults
  const getInitialParams = (): SimulationParams => {
    return {
      initialInvestment: parseFloat(searchParams.get('initialInvestment') || '1000'),
      monthlyContribution: parseFloat(searchParams.get('monthlyContribution') || '100'),
      timeHorizonYears: parseInt(searchParams.get('timeHorizonYears') || '10', 10),
      riskLevel: (searchParams.get('riskLevel') as SimulationParams['riskLevel']) || 'moderate',
    };
  };
  
  // Function to get initial scenario state from search params
  const getInitialScenarioIds = (): { scenarioId: string; choiceId: string } => {
      return {
          scenarioId: searchParams.get('scenarioId') || '',
          choiceId: searchParams.get('scenarioChoiceId') || '',
      };
  };

  // Initialize state with values from URL params or defaults
  const [params, setParams] = useState<SimulationParams>(getInitialParams());
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [scenarios, setScenarios] = useState<DbScenario[]>([]);
  const [scenarioChoices, setScenarioChoices] = useState<DbScenarioChoice[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(getInitialScenarioIds().scenarioId);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string>(getInitialScenarioIds().choiceId);
  const [scenarioError, setScenarioError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // --- Fetch User (existing useEffect) --- 
  useEffect(() => {
    const fetchUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!error) {
        setUser(data.user);
      }
    };
    fetchUser();

    // Optional: Listen for auth changes if needed
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
        setUser(session?.user ?? null);
    });

    return () => {
        authListener?.subscription.unsubscribe();
    };

  }, [supabase]);

  // --- Fetch Scenarios (existing useEffect) --- 
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

  // --- Auto-run simulation if params loaded from URL --- 
  useEffect(() => {
      // Check if *any* known query param exists to indicate loading
      if (searchParams.has('initialInvestment')) {
          console.log("Running simulation automatically from loaded parameters...");
          runSimulation();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount after initial params are set
  // -----------------------------------------------------

  // Memoize derived scenario objects to avoid recalculation on every render
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setParams(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value,
    }));
  };

  const handleScenarioSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedScenarioId(e.target.value);
    setSelectedChoiceId(''); // Reset choice ID
    setResult(null); 
  };

  const handleChoiceSelect = (choiceId: string) => {
    setSelectedChoiceId(choiceId);
    setResult(null);
  };

  const runSimulation = async () => {
    setIsLoading(true);
    setResult(null);
    
    // --- Apply Scenario Impact --- 
    let adjustedParams = { ...params }; 
    let scenarioImpactText = "No scenario applied.";

    if (selectedScenario && selectedChoice) {
      const impact = selectedChoice.impact;
      adjustedParams.initialInvestment += (impact.initialInvestmentChange ?? 0);
      adjustedParams.initialInvestment -= (impact.oneOffCost ?? 0); // Treat one-off cost as reducing initial investment
      adjustedParams.initialInvestment += (impact.oneOffIncome ?? 0); // Treat one-off income as adding to initial investment
      adjustedParams.monthlyContribution += (impact.monthlyContributionChange ?? 0);

      // Ensure params don't go negative where it makes no sense
      adjustedParams.initialInvestment = Math.max(0, adjustedParams.initialInvestment);
      adjustedParams.monthlyContribution = Math.max(0, adjustedParams.monthlyContribution);

      scenarioImpactText = `Scenario: ${selectedScenario.title}. Choice: ${selectedChoice.text}.`;
      console.log("Applied scenario impact:", impact);
    }
    console.log("Running simulation with adjusted params:", adjustedParams);
    // ---------------------------

    await new Promise(resolve => setTimeout(resolve, 200)); 
    const simulationOutput = calculatePortfolioGrowth(adjustedParams); // Use adjusted params
    setResult(simulationOutput);
    setIsLoading(false);
  };

  // --- Handle Save Simulation ---
  const handleSaveSimulation = async () => {
    if (!user || !result || isSaving) return;

    // *** Ask for optional name ***
    const simulationName = prompt("Enter an optional name for this simulation:", 
                                `Sim - ${new Date().toLocaleDateString()}` // Default name
                           );
    // If user cancels prompt, simulationName will be null. We proceed anyway.
    // ---------------------------

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    // Apply scenario impact again to get the adjusted params used for the result
    let adjustedParams = { ...params }; 
    if (selectedScenario && selectedChoice) {
        const impact = selectedChoice.impact;
        adjustedParams.initialInvestment += (impact.initialInvestmentChange ?? 0);
        adjustedParams.initialInvestment -= (impact.oneOffCost ?? 0);
        adjustedParams.initialInvestment += (impact.oneOffIncome ?? 0);
        adjustedParams.monthlyContribution += (impact.monthlyContributionChange ?? 0);
        adjustedParams.initialInvestment = Math.max(0, adjustedParams.initialInvestment);
        adjustedParams.monthlyContribution = Math.max(0, adjustedParams.monthlyContribution);
    }

    const { error } = await supabase
      .from('saved_simulations')
      .insert({
        user_id: user.id,
        simulation_name: simulationName, // Use the name from prompt (or null if cancelled)
        initial_investment: adjustedParams.initialInvestment,
        monthly_contribution: adjustedParams.monthlyContribution,
        time_horizon_years: adjustedParams.timeHorizonYears,
        risk_level: adjustedParams.riskLevel,
        scenario_id: selectedScenario?.id || null,
        scenario_choice_id: selectedChoice?.id || null,
        final_balance: result.finalBalance,
        total_contributions: result.totalContributions,
        total_growth: result.totalGrowth,
      });

    if (error) {
      console.error("Error saving simulation:", error.message);
      setSaveError("Failed to save simulation. Please try again.");
    } else {
      setSaveSuccess(true);
      // Hide success message after a few seconds
      setTimeout(() => setSaveSuccess(false), 3000);
    }
    setIsSaving(false);
  };
  // -----------------------------

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Investment Portfolio Simulation</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Input Parameters Section */}
        <div className="md:col-span-1 bg-gray-100 dark:bg-gray-800 p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Parameters</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="initialInvestment" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Initial Investment (£)</label>
              <input
                type="number"
                name="initialInvestment"
                id="initialInvestment"
                value={params.initialInvestment}
                onChange={handleInputChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="monthlyContribution" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Monthly Contribution (£)</label>
              <input
                type="number"
                name="monthlyContribution"
                id="monthlyContribution"
                value={params.monthlyContribution}
                onChange={handleInputChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="timeHorizonYears" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Time Horizon (Years)</label>
              <input
                type="number"
                name="timeHorizonYears"
                id="timeHorizonYears"
                min="1"
                max="50" // Set reasonable max for FR7
                value={params.timeHorizonYears}
                onChange={handleInputChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>
            <div>
              <label htmlFor="riskLevel" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Risk Level</label>
              <select
                name="riskLevel"
                id="riskLevel"
                value={params.riskLevel}
                onChange={handleInputChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              >
                <option value="conservative">Conservative</option>
                <option value="moderate">Moderate</option>
                <option value="aggressive">Aggressive</option>
              </select>
            </div>

            {/* Scenario Selection Section (Add below parameters) */}
            <div>
              <label htmlFor="scenarioSelect" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Select a life event:</label>
              <select 
                 id="scenarioSelect"
                 value={selectedScenarioId}
                 onChange={handleScenarioSelect}
                 className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              >
                 <option value="">-- No Scenario --</option>
                 {scenarios.map(s => (
                   <option key={s.id} value={s.id}>{s.title}</option>
                 ))}
              </select>
            </div>

            {selectedScenario && (
             <div className="mt-4">
               <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{selectedScenario.description}</p>
               <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Your choice:</label>
               <div className="space-y-2 mt-1">
                {choicesForSelectedScenario.map(choice => {
                  const isChecked = selectedChoiceId === choice.id;
                  return (
                    <label key={choice.id} className={`flex items-center p-2 border rounded cursor-pointer ${isChecked ? 'bg-blue-100 dark:bg-blue-900 border-blue-300 dark:border-blue-700' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                       <input
                         type="radio"
                         name="scenarioChoice"
                         checked={isChecked}
                         onChange={() => handleChoiceSelect(choice.id)}
                         className="mr-2"
                       />
                       <span className="text-sm">{choice.text}</span>
                    </label>
                  );
                })}
              </div>
             </div>
            )}

            <button
                onClick={runSimulation}
                disabled={Boolean(isLoading || (selectedScenario && !selectedChoiceId))}
                className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                title={selectedScenario && !selectedChoiceId ? 'Please select a choice for the scenario' : ''}
              >
                {isLoading ? 'Simulating...' : 'Run Simulation'}
              </button>
          </div>
        </div>

        {/* Results Display Section */}
        <div className="md:col-span-2 bg-white dark:bg-gray-900 p-6 rounded-lg shadow">
          <div className="flex justify-between items-start mb-4">
             <h2 className="text-xl font-semibold">Results</h2>
             {/* --- Save Button --- */} 
             {user && result && !isLoading && (
                <button 
                    onClick={handleSaveSimulation}
                    disabled={isSaving || saveSuccess}
                    className="bg-purple-600 hover:bg-purple-700 text-white text-sm py-1 px-3 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isSaving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Simulation'}
                </button>
             )}
             {/* ------------------- */} 
          </div>
          {saveError && <p className="text-red-500 text-sm mb-2">{saveError}</p>}
          
          {isLoading && <p>Calculating results...</p>}
          {result && !isLoading && (
            <div className="space-y-3">
              <p className="text-lg">Projected Balance: <span className="font-bold text-green-600 dark:text-green-400">£{result.finalBalance.toLocaleString()}</span></p>
              <p className="text-md">Total Contributions: <span className="font-semibold">£{result.totalContributions.toLocaleString()}</span></p>
              <p className="text-md">Estimated Growth: <span className="font-semibold text-green-700 dark:text-green-500">£{result.totalGrowth.toLocaleString()}</span></p>
              
              {/* Recharts Line Chart - Add check for monthlyData */}
              {result.monthlyData && result.monthlyData.length > 0 ? (
                <div className="mt-6 h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={result.monthlyData} // Safe to use now
                      margin={{
                        top: 5,
                        right: 30,
                        left: 20, 
                        bottom: 5,
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="month" 
                        tickFormatter={formatYear} 
                        interval={Math.max(1, Math.floor(result.monthlyData.length / 10)) * 12} // Safe to use now
                      />
                      <YAxis tickFormatter={formatCurrency} width={80} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Legend />
                      <Line type="monotone" dataKey="balance" name="Portfolio Balance" stroke="#16a34a" activeDot={{ r: 8 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                 <p className="text-gray-500 mt-6">Chart data is unavailable.</p>
              )}
            </div>
          )}
          {!result && !isLoading && (
            <p className="text-gray-500">Enter parameters and run the simulation to see results.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Main Exported Component with Suspense Boundary --- 
export default function SimulationPage() {
  // useSearchParams needs to be wrapped in <Suspense>
  // Easiest way is to wrap the part of the component that uses it.
  return (
    <Suspense fallback={<div>Loading simulation parameters...</div>}>
       <SimulationContent />
    </Suspense>
  );
} 