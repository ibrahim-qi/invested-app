'use client';

import React, { useState, useEffect } from 'react';
import type { Database, Json } from '@/lib/database.types';
import type { YearlyData, SimulationEvent as UtilSimulationEvent } from '@/lib/simulationUtils';
import { calculatePortfolioGrowth } from '@/lib/simulationUtils';

// Re-use type definitions (consider moving shared types to a common file)
type SavedSimulation = Database['public']['Tables']['saved_simulations']['Row'] & {
  yearly_data?: Json | YearlyData[] | null;
  event_choices_made?: Json | Record<string, Json> | null;
};
type SimulationEvent = UtilSimulationEvent;

// Helper function (could be shared)
const formatCurrencyInput = (value: number | string | undefined | null): string => {
  if (value === null || value === undefined || value === '') return '';
  // Remove non-numeric characters except decimal point
  const numericValue = String(value).replace(/[^0-9.]/g, '');
  return numericValue; // Keep as string for input value
};

// Helper function (could be shared)
const formatCurrency = (value: number | null | undefined) => {
  if (value === null || value === undefined) return 'N/A';
  return `£${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};


interface WhatIfModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalSimulation: SavedSimulation;
  allEvents: SimulationEvent[];
  relevantDecisionEvents: SimulationEvent[];
  onRunComplete: (resultData: YearlyData[]) => void;
}

export default function WhatIfModal({
  isOpen,
  onClose,
  originalSimulation,
  allEvents,
  relevantDecisionEvents,
  onRunComplete,
}: WhatIfModalProps) {

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State for modified parameters
  const [monthlyContribution, setMonthlyContribution] = useState<string>(
      formatCurrencyInput(originalSimulation.monthly_contribution)
  );
  const [riskLevel, setRiskLevel] = useState<'conservative' | 'moderate' | 'aggressive'>(
      originalSimulation.risk_level as 'conservative' | 'moderate' | 'aggressive'
  );
  // State for modified event choices: Record<eventId, chosenOptionImpactJson + choiceText>
  const [modifiedEventChoices, setModifiedEventChoices] = useState<Record<string, Json>>(() => {
      // Initialize with original choices, ensuring they have choiceText if possible
      const originalChoices = originalSimulation.event_choices_made;
       if (originalChoices && typeof originalChoices === 'object') {
           // Attempt to enrich original choices with text if missing (might be needed depending on how they were saved)
            const enrichedChoices: Record<string, Json> = {};
            // Assert that originalChoices is an indexable object here
            const choicesObj = originalChoices as Record<string, Json>; 
            for (const eventId in choicesObj) {
                // Access using the asserted object
                const choiceData = choicesObj[eventId];
                if (typeof choiceData === 'object' && choiceData !== null && !('choiceText' in choiceData)) {
                    // Find the corresponding event and option to get the text
                    const event = allEvents.find(e => e.id === eventId);
                    const decisionOptions = event?.decision_options as { options?: Array<{ text: string; impact: Json }> } | null;
                     // Use optional chaining on options here too for safety
                    const matchedOption = decisionOptions?.options?.find(opt => JSON.stringify(opt.impact) === JSON.stringify(choiceData));
                    if (matchedOption) {
                        enrichedChoices[eventId] = { ...choiceData, choiceText: matchedOption.text };
                    } else {
                         enrichedChoices[eventId] = choiceData; // Keep original if no match found
                    }
                } else {
                     enrichedChoices[eventId] = choiceData; // Already has text or not an object
                }
            }
          return enrichedChoices;
      }
      return {};
  });

  // Reset form state when original simulation changes or modal opens
  useEffect(() => {
      if (isOpen) {
          setMonthlyContribution(formatCurrencyInput(originalSimulation.monthly_contribution));
          setRiskLevel(originalSimulation.risk_level as 'conservative' | 'moderate' | 'aggressive');
           const originalChoices = originalSimulation.event_choices_made;
           if (originalChoices && typeof originalChoices === 'object') {
                 // Re-run the enrichment logic when modal opens/simulation changes
                 const enrichedChoices: Record<string, Json> = {};
                 // Assert that originalChoices is an indexable object here
                 const choicesObj = originalChoices as Record<string, Json>;
                 for (const eventId in choicesObj) {
                     // Access using the asserted object
                    const choiceData = choicesObj[eventId]; 
                     if (typeof choiceData === 'object' && choiceData !== null && !('choiceText' in choiceData)) {
                         const event = allEvents.find(e => e.id === eventId);
                        const decisionOptions = event?.decision_options as { options?: Array<{ text: string; impact: Json }> } | null;
                         // Use optional chaining on options here too for safety
                         const matchedOption = decisionOptions?.options?.find(opt => JSON.stringify(opt.impact) === JSON.stringify(choiceData));
                         if (matchedOption) {
                             enrichedChoices[eventId] = { ...choiceData, choiceText: matchedOption.text };
                         } else {
                              enrichedChoices[eventId] = choiceData;
                         }
                    } else {
                        enrichedChoices[eventId] = choiceData;
                    }
                 }
                setModifiedEventChoices(enrichedChoices);
           } else {
               setModifiedEventChoices({});
           }
           setError(null); // Clear errors
           setIsLoading(false); // Reset loading state
      }
  }, [originalSimulation, isOpen, allEvents]); // Depend on isOpen and allEvents for reset/enrichment


  const handleRunComparison = async () => {
      setIsLoading(true);
      setError(null);
      console.log("Running What-If with:", { monthlyContribution, riskLevel, modifiedEventChoices });

      const contributionValue = parseFloat(monthlyContribution);
      if (isNaN(contributionValue) || contributionValue < 0) {
          setError("Please enter a valid monthly contribution.");
          setIsLoading(false);
          return;
      }

      try {
          // Base parameters from original simulation, overridden by modified state
           const params = {
                initialInvestment: originalSimulation.initial_investment,
                monthlyContribution: contributionValue, // Use modified state
                timeHorizonYears: originalSimulation.time_horizon_years,
                riskLevel: riskLevel, // Use modified state
                annualInflationRate: originalSimulation.annual_inflation_rate ?? 0,
                annualFeeRate: originalSimulation.annual_fee_rate ?? 0,
            };

            // Get user profile info if needed (using placeholders for now)
            const careerStage = undefined; // Placeholder
            const locationRegion = undefined; // Placeholder

            const result = calculatePortfolioGrowth(
                params,
                allEvents, // Pass all potential events
                modifiedEventChoices, // Pass the potentially MODIFIED choices
                careerStage,
                locationRegion
            );

            console.log("What-If Calculation Result:", result);
            onRunComplete(result.yearlyData); // Send results back to parent
            // Optional: Close modal after successful run
            onClose();

      } catch (err: any) {
          console.error("Error running What-If simulation:", err);
          setError(`Failed to run What-If: ${err.message || 'Unknown error'}`);
      } finally {
          setIsLoading(false);
      }
  };

  // Handle changes to event choice selections
  const handleEventChoiceChange = (eventId: string, selectedOption: { text: string; impact: Json }) => {
      console.log(`Event ${eventId} choice changed to:`, selectedOption);
      setModifiedEventChoices(prev => ({
          ...prev,
          [eventId]: { ...(selectedOption.impact as object), choiceText: selectedOption.text }
      }));
  };


  if (!isOpen) return null;

  return (
    // Basic Modal Structure (using Tailwind CSS for styling)
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto flex flex-col">
        <div className="flex justify-between items-center mb-4 border-b pb-2">
          <h2 className="text-xl font-semibold text-gray-800">Run What-If Analysis</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>

        <div className="flex-grow overflow-y-auto pr-2 space-y-4 text-sm mb-4">
           {/* Read-only parameters */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
                 <p>Time Horizon:</p> <p className="font-medium text-gray-800">{originalSimulation.time_horizon_years} Years</p>
                 <p>Initial Investment:</p> <p className="font-medium text-gray-800">{formatCurrency(originalSimulation.initial_investment)}</p>
                 <p>Annual Inflation:</p> <p className="font-medium text-gray-800">{(originalSimulation.annual_inflation_rate ?? 0) * 100}%</p>
                 <p>Annual Fee:</p> <p className="font-medium text-gray-800">{(originalSimulation.annual_fee_rate ?? 0) * 100}%</p>
            </div>

            {/* Modifiable Parameters */}
             <div className="border-t pt-3">
                <label htmlFor="whatif-contribution" className="block text-sm font-medium text-gray-700">
                    Monthly Contribution (£)
                </label>
                <input
                    type="text" // Use text for easier formatting/parsing
                    id="whatif-contribution"
                    value={monthlyContribution}
                    onChange={(e) => setMonthlyContribution(formatCurrencyInput(e.target.value))}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    placeholder="e.g., 500"
                />
             </div>

             <div>
                 <label htmlFor="whatif-risk" className="block text-sm font-medium text-gray-700">
                    Risk Level
                 </label>
                 <select
                    id="whatif-risk"
                    value={riskLevel}
                    onChange={(e) => setRiskLevel(e.target.value as 'conservative' | 'moderate' | 'aggressive')}
                     className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                >
                    <option value="conservative">Conservative</option>
                    <option value="moderate">Moderate</option>
                    <option value="aggressive">Aggressive</option>
                 </select>
             </div>

             {/* Modify Event Choices */}
             {relevantDecisionEvents.length > 0 && (
                 <div className="border-t pt-4 mt-4">
                    <h3 className="text-base font-semibold text-gray-700 mb-2">Modify Decision Choices</h3>
                    <p className="text-xs text-gray-500 mb-3">Change any choices made during the original simulation to see their potential impact.</p>
                    <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                        {relevantDecisionEvents.map(event => {
                             const decisionOptions = event.decision_options as { options?: Array<{ text: string; impact: Json }> } | null;
                             // Only show events that actually are decision events with options
                             if (!decisionOptions?.options || decisionOptions.options.length <= 1) return null;

                             // Get the currently selected choice's TEXT for this event from the state
                             const currentChoiceData = modifiedEventChoices[event.id];
                             const currentSelectedText = (currentChoiceData as any)?.choiceText || '';
                             // console.log(`Event ${event.id}: Current selected text in state: '${currentSelectedText}'`); // Debugging log

                             // Fallback: Try to determine initial text if not in state (should be handled by useEffect now)
                            // let initialSelectedText = currentSelectedText;
                            // if (!initialSelectedText) {
                            //      const originalChoiceData = (originalSimulation.event_choices_made as Record<string, Json>)?.[event.id];
                            //      initialSelectedText = (originalChoiceData as any)?.choiceText || '';
                            //      console.log(`Event ${event.id}: Fallback initial selected text: '${initialSelectedText}'`);
                            // }

                             return (
                                <div key={event.id} className="p-2 border rounded-md bg-gray-50">
                                    <p className="text-xs font-medium text-gray-800 mb-1">Year {event.trigger_year}: {event.title}</p>
                                     <select
                                        value={currentSelectedText} // Bind select value to the stored text
                                        onChange={(e) => {
                                            // Add optional chaining here
                                            const selectedOpt = decisionOptions?.options?.find(opt => opt.text === e.target.value);
                                            if (selectedOpt) {
                                                handleEventChoiceChange(event.id, selectedOpt);
                                            } else {
                                                console.warn("Selected option text not found:", e.target.value);
                                            }
                                        }}
                                         className={`mt-1 block w-full pl-2 pr-8 py-1 text-xs border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 rounded-md ${!currentSelectedText ? 'text-gray-400' : ''}`}
                                        aria-label={`Choice for ${event.title}`}
                                    >
                                         {/* Add a placeholder if no choice was originally made or state is empty */}
                                         {!currentSelectedText && <option value="" disabled>-- Select --</option>}
                                         {/* Add optional chaining here */}
                                         {decisionOptions?.options?.map(option => (
                                             <option key={option.text} value={option.text}>
                                                 {option.text}
                                             </option>
                                         ))}
                                    </select>
                                </div>
                             );
                        })}
                    </div>
                 </div>
             )}

        </div>

        {error && (
            <p className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded border border-red-200">Error: {error}</p>
        )}

        <div className="mt-auto pt-4 border-t flex justify-end space-x-3">
          <button
             type="button"
             onClick={onClose}
             className="px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
             disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleRunComparison}
            disabled={isLoading}
            className="px-4 py-2 bg-indigo-600 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {isLoading ? (
                <span className="inline-flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Calculating...
                 </span>
            ) : (
                 'Run Comparison'
            )}
          </button>
        </div>
      </div>
    </div>
  );
} 