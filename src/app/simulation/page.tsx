'use client'

import React, { useState } from 'react';
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

export default function SimulationPage() {
  const [params, setParams] = useState<SimulationParams>({
    initialInvestment: 1000,
    monthlyContribution: 100,
    timeHorizonYears: 10,
    riskLevel: 'moderate',
  });
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setParams(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value,
    }));
  };

  const runSimulation = async () => {
    setIsLoading(true);
    setResult(null);
    console.log("Running simulation with params:", params);

    // Simulate slight delay for perceived calculation
    await new Promise(resolve => setTimeout(resolve, 200)); 

    // Use the actual calculation function
    const simulationOutput = calculatePortfolioGrowth(params);

    setResult(simulationOutput); // Set the full result including monthly data

    setIsLoading(false);
  };

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
            <button
              onClick={runSimulation}
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50 disabled:cursor-wait"
            >
              {isLoading ? 'Simulating...' : 'Run Simulation'}
            </button>
          </div>
        </div>

        {/* Results Display Section */}
        <div className="md:col-span-2 bg-white dark:bg-gray-900 p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Results</h2>
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