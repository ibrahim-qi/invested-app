'use client'

import React, { Suspense } from 'react';
import { calculatePortfolioGrowth, riskLevelAllocations } from '@/lib/simulationUtils';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { Scenario as AppScenario, ScenarioChoice as AppScenarioChoice } from '@/types/simulation.types';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { useSearchParams } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';

// DB Types
type DbScenario = Database['public']['Tables']['scenarios']['Row'];
type DbScenarioChoice = Database['public']['Tables']['scenario_choices']['Row'];

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
const formatYear = (month: number) => `Year ${Math.floor(month / 12)}`;

// --- SimulationContent Client Component (Now default export) --- 
export default function SimulationContent() {
  const supabase = createClient();
  const searchParams = useSearchParams();

  // Function to get initial state from search params or defaults
  const getInitialParams = (): SimulationParams => { // Use updated type
    return {
      initialInvestment: parseFloat(searchParams.get('initialInvestment') || '1000'),
      monthlyContribution: parseFloat(searchParams.get('monthlyContribution') || '100'),
      timeHorizonYears: parseInt(searchParams.get('timeHorizonYears') || '10', 10),
      riskLevel: (searchParams.get('riskLevel') as SimulationParams['riskLevel']) || 'moderate',
      // Add defaults for new fields
      annualInflationRate: parseFloat(searchParams.get('annualInflationRate') || '2.5'), // Default 2.5%
      annualFeeRate: parseFloat(searchParams.get('annualFeeRate') || '0.5'),          // Default 0.5%
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
  const [params, setParams] = useState<SimulationParams>(getInitialParams()); // Use updated type
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

  // --- Update handleInputChange for new number inputs ---
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    // Handle numeric inputs specifically, allowing decimals
    const isNumericField = ['initialInvestment', 'monthlyContribution', 'timeHorizonYears', 'annualInflationRate', 'annualFeeRate'].includes(name);

    setParams(prev => ({
      ...prev,
      [name]: isNumericField ? parseFloat(value) || 0 : value,
    }));
  };
  // -----------------------------------------------------

  const handleScenarioSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedScenarioId(e.target.value);
    setSelectedChoiceId(''); // Reset choice ID
    setResult(null); 
  };

  const handleChoiceSelect = (choiceId: string) => {
    setSelectedChoiceId(choiceId);
    setResult(null);
  };

  // --- Update runSimulation to pass new params ---
  const runSimulation = async () => {
    setIsLoading(true);
    setResult(null);
    
    let adjustedParams = { ...params }; // Now includes inflation/fees

    // --- Apply Scenario Impact (NO CHANGE NEEDED HERE YET) --- 
    // Scenarios currently only impact investment/contribution, not inflation/fees
    if (selectedScenario && selectedChoice) {
      const impact = selectedChoice.impact;
      adjustedParams.initialInvestment += (impact.initialInvestmentChange ?? 0);
      adjustedParams.initialInvestment -= (impact.oneOffCost ?? 0); // Treat one-off cost as reducing initial investment
      adjustedParams.initialInvestment += (impact.oneOffIncome ?? 0); // Treat one-off income as adding to initial investment
      adjustedParams.monthlyContribution += (impact.monthlyContributionChange ?? 0);

      // Ensure params don't go negative where it makes no sense
      adjustedParams.initialInvestment = Math.max(0, adjustedParams.initialInvestment);
      adjustedParams.monthlyContribution = Math.max(0, adjustedParams.monthlyContribution);

      console.log("Applied scenario impact:", impact);
    }
    // -------------------------------------------------------

    console.log("Running simulation with params:", adjustedParams); // Log all params

    await new Promise(resolve => setTimeout(resolve, 200)); 
    // Pass the full adjustedParams including inflation/fees
    const simulationOutput = calculatePortfolioGrowth(adjustedParams); 
    setResult(simulationOutput);
    setIsLoading(false);
  };
  // -----------------------------------------------

  // --- Update handleSaveSimulation to include new params ---
  const handleSaveSimulation = async () => {
    if (!user || !result || isSaving) return;

    const simulationName = prompt("Enter an optional name for this simulation:", 
                                `Sim - ${new Date().toLocaleDateString()}`);
    
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    let adjustedParams = { ...params }; // Includes base inflation/fees
     // Apply scenario impact again (if scenarios modify base investment/contribution)
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
        simulation_name: simulationName, 
        initial_investment: adjustedParams.initialInvestment,
        monthly_contribution: adjustedParams.monthlyContribution,
        time_horizon_years: adjustedParams.timeHorizonYears,
        risk_level: adjustedParams.riskLevel,
        // -- Save new parameters --
        annual_inflation_rate: adjustedParams.annualInflationRate,
        annual_fee_rate: adjustedParams.annualFeeRate,
        // -------------------------
        scenario_id: selectedScenario?.id || null,
        scenario_choice_id: selectedChoice?.id || null,
        final_balance: result.finalBalanceP50, // Save median balance 
        final_balance_real: result.finalBalanceReal, 
        total_contributions: result.totalContributions,
        total_growth: result.totalGrowth, // Growth based on median
        weighted_annual_rate: result.weightedAnnualRate,
        total_fees_paid: result.totalFeesPaid, // Median fees
        // Add columns for p10/p90 if choosing Option 2 above
        // final_balance_p10: result.finalBalanceP10,
        // final_balance_p90: result.finalBalanceP90,
      });

     if (error) {
        // Check if error is due to missing columns
        if (error.message.includes('column "annual_inflation_rate" of relation "saved_simulations" does not exist') ||
            error.message.includes('column "annual_fee_rate" of relation "saved_simulations" does not exist')) {
            setSaveError("DB Error: Inflation/Fee columns missing. Please update table.");
            console.error("Missing columns in saved_simulations table for inflation/fees.");
        } else {
            console.error("Error saving simulation:", error.message);
            setSaveError("Failed to save simulation. Please try again.");
        }
     } else {
       setSaveSuccess(true);
       setTimeout(() => setSaveSuccess(false), 3000);
     }
     setIsSaving(false);
  };
  // -------------------------------------------------------

  const currentAllocation = riskLevelAllocations[params.riskLevel];

  // JSX for the client component
  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Investment Portfolio Simulation</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Input Parameters Section */}
        <div className="md:col-span-1 bg-gray-100 dark:bg-gray-800 p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4 dark:text-gray-100">Parameters</h2>
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
                step="100"
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
                max="30" // Set reasonable max for FR7
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
              {/* --- Display Allocation --- */}
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Allocation: {formatPercent(currentAllocation.stocks)} Stocks / {formatPercent(currentAllocation.bonds)} Bonds / {formatPercent(currentAllocation.cash)} Cash
              </p>
              {/* ------------------------- */}
            </div>

            {/* --- Inflation Input --- */}
            <div>
              <label htmlFor="annualInflationRate" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Estimated Annual Inflation (%)</label>
              <input
                type="number"
                name="annualInflationRate"
                id="annualInflationRate"
                value={params.annualInflationRate}
                onChange={handleInputChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                step="0.1"
                min="0"
              />
            </div>
            {/* ----------------------- */}

            {/* --- Fee Input --- */}
            <div>
              <label htmlFor="annualFeeRate" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Estimated Annual Fees (%)</label>
              <input
                type="number"
                name="annualFeeRate"
                id="annualFeeRate"
                value={params.annualFeeRate}
                onChange={handleInputChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                step="0.1"
                min="0"
              />
            </div>
            {/* ---------------- */}

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
                       <span className="text-sm dark:text-gray-200">{choice.text}</span>
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
             <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Results</h2>
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
              {/* --- Update Results Display for Percentiles --- */}
              <p className="text-lg text-gray-700 dark:text-gray-300">Projected Balance Range (Nominal):</p>
              <div className="pl-4 text-md">
                 <p className="dark:text-gray-300">Median (P50): <span className="font-bold text-green-600 dark:text-green-400">£{result.finalBalanceP50.toLocaleString()}</span></p>
                 <p className="text-sm text-gray-600 dark:text-gray-300">Range (P10 - P90): £{result.finalBalanceP10.toLocaleString()} - £{result.finalBalanceP90.toLocaleString()}</p>
              </div>

              {result.finalBalanceReal !== undefined && (
                <p className="text-md text-gray-700 dark:text-gray-300">Median Balance (Real, adjusted for inflation): <span className="font-semibold">£{result.finalBalanceReal.toLocaleString()}</span></p>
              )}
              <p className="text-md text-gray-700 dark:text-gray-300">Total Contributions: <span className="font-semibold">£{result.totalContributions.toLocaleString()}</span></p>
              <p className="text-md text-gray-700 dark:text-gray-300">Median Estimated Growth (Nominal): <span className="font-semibold text-green-700 dark:text-green-500">£{result.totalGrowth.toLocaleString()}</span></p>
              
              {/* Assumed Rate and Fees (Use optional chaining just in case) */}
              {result.weightedAnnualRate !== undefined && (
                <p className="text-sm text-gray-600 dark:text-gray-300">Assumed Avg. Annual Return (portfolio mean): <span className="font-semibold">{formatPercent(result.weightedAnnualRate)}</span></p>
              )}
              {result.totalFeesPaid !== undefined && (
                <p className="text-sm text-gray-600 dark:text-gray-300">Estimated Median Total Fees Paid: <span className="font-semibold">£{result.totalFeesPaid.toLocaleString()}</span></p>
              )}

              {/* Contextual Suggestion */}
              {params.riskLevel === 'aggressive' && (
                 <p className="mt-3 p-2 bg-yellow-100 dark:bg-yellow-900 border border-yellow-300 dark:border-yellow-700 rounded text-sm text-yellow-800 dark:text-yellow-200">
                  Using an aggn devressive strategy? Consider reviewing the 'Risk Management' learning module for important concepts. 
                  {/* Optional: <Link href="/learn/risk-module-id" className="font-semibold underline hover:text-yellow-600"> Learn More</Link> */}
                </p>
              )}

              <p className="text-xs text-gray-500 dark:text-gray-300 mt-1">(Based on {params.annualInflationRate}% estimated inflation and {params.annualFeeRate}% fees. Projections show potential range.)</p>
              {/* ------------------------------------------------- */}
              
              {/* --- Update Chart Data Source --- */}
              {result.monthlyDataP50 && result.monthlyDataP50.length > 0 ? (
                <div className="mt-6 h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={result.monthlyDataP50} // Use median path data
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
                        interval={Math.max(1, Math.floor(result.monthlyDataP50.length / 10)) * 12} 
                      />
                      <YAxis tickFormatter={formatCurrency} width={80} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Legend />
                      {/* Display only the median line for simplicity now */}
                      <Line type="monotone" dataKey="balance" name="Median Portfolio Balance" stroke="#16a34a" activeDot={{ r: 8 }} dot={false} />
                      {/* TODO: Add Area chart or P10/P90 lines later if desired */}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                 <p className="text-gray-500 mt-6">Chart data is unavailable.</p>
              )}
              {/* ------------------------------ */}
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