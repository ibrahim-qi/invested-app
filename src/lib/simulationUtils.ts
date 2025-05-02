import { Json } from "./database.types"; // Import Json type if needed for impact

// --- Define Minimal Event Types --- 
// Avoids direct dependency on full DB types in this core util
type EventImpact = {
  oneOffCost?: number;
  oneOffIncome?: number;
  monthlyContributionChange?: number;
  // Add other potential impact fields as needed
};

export interface SimulationEvent {
  id: string; // Keep ID for potential logging/debugging
  trigger_year: number | null;
  impact: Json | null; // Use Supabase Json type or a generic object/any
  // ---- MANUALLY ADD impact even if not in generated types ----
  event_type: string; // Needed for decision logic
  decision_options: Json | null; // Needed for decision logic
  // Add fields needed for display in SimulationClient.tsx
  title: string;
  description: string;
  associated_concept_id: string | null;
}
// -----------------------------------

interface CalculatePortfolioGrowthParams {
  initialInvestment: number;
  monthlyContribution: number;
  timeHorizonYears: number;
  riskLevel: 'conservative' | 'moderate' | 'aggressive';
  annualInflationRate: number; 
  annualFeeRate: number;       
}

// --- Define Yearly Data Structure --- 
export interface YearlyData {
  year: number;
  contribution: number;   // Contribution *during* this year
  totalContributions: number; // Cumulative contributions *up to end* of this year
  balanceP10: number;     // End-of-year balance (P10)
  balanceP50: number;     // End-of-year balance (P50 - Median)
  balanceP90: number;     // End-of-year balance (P90)
  growthP50: number;      // Growth *during* this year (P50)
  totalGrowthP50: number; // Cumulative growth *up to end* of this year (P50)
  feesP50: number;        // Fees paid *during* this year (P50)
  totalFeesP50: number;   // Cumulative fees *up to end* of this year (P50)
  balanceRealP50?: number; // Optional: Real balance at end of year (P50)
}

// --- Update result type to return YearlyData array --- 
export interface PortfolioGrowthResult {
  yearlyData: YearlyData[];
  // We might still want the overall portfolio characteristics
  portfolioMeanReturn: number;
  portfolioVolatility: number;
}
// ------------------------------------------------------

// --- Define Regional Asset Assumptions ---
const baseAssetAssumptions = {
  stocks: { meanReturn: 0.085, volatility: 0.15 }, // Generic Global Developed
  bonds:  { meanReturn: 0.035, volatility: 0.05 }, // Generic Global Aggregate
  cash:   { meanReturn: 0.015, volatility: 0.01 }, // Generic Global Cash
};

const ukAssetAssumptions = {
  stocks: { meanReturn: 0.075, volatility: 0.16 }, // Example: slightly lower return, higher vol for UK bias
  bonds:  { meanReturn: 0.030, volatility: 0.06 }, // Example: slightly lower return, higher vol
  cash:   { meanReturn: 0.018, volatility: 0.01 }, // Example: slightly higher cash rate
};

// --- Define Benchmark Assumptions ---
const benchmarkAssumptions = {
  globalEquity: { meanReturn: 0.085, volatility: 0.15 }, // Same as base stock assumption
  ukCash: { meanReturn: 0.018, volatility: 0.01 }, // Same as UK cash assumption
  // Add more benchmarks like FTSE 100, S&P 500, Aggregate Bonds if desired
};

export const riskLevelAllocations = {
  conservative: { stocks: 0.30, bonds: 0.50, cash: 0.20 },
  moderate:     { stocks: 0.60, bonds: 0.30, cash: 0.10 },
  aggressive:   { stocks: 0.80, bonds: 0.15, cash: 0.05 },
};
// -----------------------------

// --- Helper: Box-Muller transform for standard normal distribution N(0,1) ---
// Basic approximation, not cryptographically secure randomness.
function randomStandardNormal(): number {
    let u = 0, v = 0;
    while(u === 0) u = Math.random(); // Converting [0,1) to (0,1)
    while(v === 0) v = Math.random();
    return Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
}
// -------------------------------------------------------------------------

// --- Function to Calculate Benchmark Growth (Simplified Deterministic) ---
interface CalculateBenchmarkGrowthParams {
  initialInvestment: number;
  monthlyContribution: number;
  timeHorizonYears: number;
  benchmarkType: keyof typeof benchmarkAssumptions; // e.g., 'globalEquity'
}

export const calculateBenchmarkGrowth = (
  params: CalculateBenchmarkGrowthParams
): YearlyData[] => {
  const {
    initialInvestment,
    monthlyContribution,
    timeHorizonYears,
    benchmarkType
  } = params;

  const assumptions = benchmarkAssumptions[benchmarkType];
  const yearlyData: YearlyData[] = [];
  let balance = initialInvestment;
  let totalContributions = initialInvestment;
  let totalGrowth = 0;

  // Year 0
  yearlyData.push({
    year: 0,
    contribution: initialInvestment,
    totalContributions: initialInvestment,
    balanceP10: initialInvestment, // Deterministic, so P10/P50/P90 are the same
    balanceP50: initialInvestment,
    balanceP90: initialInvestment,
    growthP50: 0,
    totalGrowthP50: 0,
    feesP50: 0, // Assume no fees for simple benchmarks
    totalFeesP50: 0,
  });

  for (let year = 1; year <= timeHorizonYears; year++) {
    const yearlyContribution = monthlyContribution * 12;
    totalContributions += yearlyContribution;
    
    // Apply growth AFTER contributions for the year (simplified approach)
    const balanceBeforeGrowth = balance + yearlyContribution;
    const growthThisYear = balanceBeforeGrowth * assumptions.meanReturn;
    balance = balanceBeforeGrowth + growthThisYear;
    totalGrowth += growthThisYear;

    yearlyData.push({
      year: year,
      contribution: Math.round(yearlyContribution * 100) / 100,
      totalContributions: Math.round(totalContributions * 100) / 100,
      balanceP10: Math.round(balance * 100) / 100,
      balanceP50: Math.round(balance * 100) / 100,
      balanceP90: Math.round(balance * 100) / 100,
      growthP50: Math.round(growthThisYear * 100) / 100,
      totalGrowthP50: Math.round(totalGrowth * 100) / 100,
      feesP50: 0,
      totalFeesP50: 0,
    });
  }

  return yearlyData;
};
// -------------------------------------------------------------------

export const calculatePortfolioGrowth = (
  params: CalculatePortfolioGrowthParams,
  events: SimulationEvent[] = [], 
  eventChoicesMade: Record<string, Json> = {},
  careerStage: string | null | undefined = undefined,
  locationRegion: string | null | undefined = undefined,
  numIterations: number = 500 
): PortfolioGrowthResult => {
  const {
    initialInvestment,
    monthlyContribution,
    timeHorizonYears,
    riskLevel,
    annualInflationRate,
    annualFeeRate,
  } = params;

  // Select assumptions based on region
  let assetAssumptions = baseAssetAssumptions; // Default
  if (locationRegion?.toLowerCase() === 'uk') {
    assetAssumptions = ukAssetAssumptions;
    console.log("Using UK asset assumptions");
  } else {
    console.log("Using default asset assumptions");
  }

  // Start with base allocation for the risk level
  let baseAllocation = riskLevelAllocations[riskLevel];
  let adjustedAllocation = { ...baseAllocation }; // Copy to modify

  // --- Adjust Allocation Based on Career Stage (Simplified) --- 
  if (careerStage) {
      const stage = careerStage.toLowerCase();
      const equityAdjustment = 0.05; // +/- 5%

      if (stage === 'early_career' || stage === 'mid_career') {
          // Increase equity, decrease bonds (or cash if bonds low)
          adjustedAllocation.stocks = Math.min(1, baseAllocation.stocks + equityAdjustment);
          if (baseAllocation.bonds >= equityAdjustment) {
            adjustedAllocation.bonds = baseAllocation.bonds - equityAdjustment;
          } else { // Take from cash if not enough bonds
            adjustedAllocation.cash = Math.max(0, baseAllocation.cash - equityAdjustment);
          }
      } else if (stage === 'late_career' || stage === 'retiring') {
          // Decrease equity, increase bonds
          adjustedAllocation.stocks = Math.max(0, baseAllocation.stocks - equityAdjustment);
          adjustedAllocation.bonds = Math.min(1, baseAllocation.bonds + equityAdjustment); 
      }
      // Ensure sums to 1 (handle potential floating point issues, rebalance cash last)
      adjustedAllocation.cash = 1 - adjustedAllocation.stocks - adjustedAllocation.bonds;
      adjustedAllocation.cash = Math.round(adjustedAllocation.cash * 100) / 100; // Round to avoid tiny errors
      // Final check in case rounding pushed sum slightly off 1
      if (adjustedAllocation.stocks + adjustedAllocation.bonds + adjustedAllocation.cash !== 1) {
           adjustedAllocation.cash = 1 - adjustedAllocation.stocks - adjustedAllocation.bonds;
      } 
      console.log(`Adjusted allocation for ${careerStage}:`, adjustedAllocation);
  }
  // ----------------------------------------------------------

  const allocation = adjustedAllocation; // Use the potentially adjusted allocation
  const totalMonths = timeHorizonYears * 12;
  const feeRateDecimal = annualFeeRate / 100;
  const inflationRateDecimal = annualInflationRate / 100;

  // --- Calculate Portfolio Expected Return & Volatility (Using selected assumptions) ---
  const portfolioMeanReturn = (
    (allocation.stocks * assetAssumptions.stocks.meanReturn) +
    (allocation.bonds * assetAssumptions.bonds.meanReturn) +
    (allocation.cash * assetAssumptions.cash.meanReturn)
  );
  const portfolioVolatility = (
    (allocation.stocks * assetAssumptions.stocks.volatility) +
    (allocation.bonds * assetAssumptions.bonds.volatility) +
    (allocation.cash * assetAssumptions.cash.volatility)
  );
  
  // Convert annual to monthly estimates (approximation)
  const monthlyMeanReturn = Math.pow(1 + portfolioMeanReturn, 1/12) - 1;
  const monthlyVolatility = portfolioVolatility / Math.sqrt(12);
  const annualRateAfterFees = portfolioMeanReturn - feeRateDecimal; // For fee calculation base
  // ------------------------------------------------------------------

  // --- Data structure to store yearly results for EACH iteration ---
  // Array of iterations, each containing an array of yearly snapshots
  const iterationYearlySnapshots: { balance: number; fees: number; contribution: number; }[][] = 
      Array(numIterations).fill(0).map(() => Array(timeHorizonYears + 1));
  // ----------------------------------------------------------------

  for (let i = 0; i < numIterations; i++) {
    let balance = initialInvestment;
    let cumulativeFees = 0;
    let cumulativeContributions = initialInvestment; // Start with initial
    let currentMonthlyContribution = monthlyContribution; // Mutable copy for event impacts

    // Store initial state for year 0
    iterationYearlySnapshots[i][0] = { balance: balance, fees: 0, contribution: initialInvestment };

    for (let year = 1; year <= timeHorizonYears; year++) {
      let yearlyContribution = 0;
      let yearlyFees = 0;
      let startOfYearBalance = balance;

      // --- Apply Event Impacts for the Current Year --- 
      const triggeredEvents = events.filter(e => e.trigger_year === year);
      for (const event of triggeredEvents) {
          let impactToApply: EventImpact | null = null;

          // Check if it's a decision event and a choice was made
          if (event.event_type === 'decision' && eventChoicesMade[event.id]) {
              impactToApply = eventChoicesMade[event.id] as EventImpact;
          } else if (event.event_type !== 'decision' && event.impact) {
              // Apply default impact for non-decision events
              impactToApply = event.impact as EventImpact;
          }
          // If it's a decision event and no choice was made, impactToApply remains null (no impact)

          if (impactToApply) {
              try {
                  // Apply impacts (ensure values are numbers)
                  const oneOffCost = Number(impactToApply.oneOffCost ?? 0);
                  const oneOffIncome = Number(impactToApply.oneOffIncome ?? 0);
                  const contribChange = Number(impactToApply.monthlyContributionChange ?? 0);

                  balance -= oneOffCost;
                  balance += oneOffIncome;
                  currentMonthlyContribution += contribChange;

                  // Ensure non-negative values where applicable
                  balance = Math.max(0, balance);
                  currentMonthlyContribution = Math.max(0, currentMonthlyContribution);

              } catch (e) {
                  console.error(`Iteration ${i}, Year ${year}: Failed to parse or apply impact for event ${event.id}`, e);
              }
          }
      }
      // --------------------------------------------------

      for (let monthInYear = 1; monthInYear <= 12; monthInYear++) {
        const month = (year - 1) * 12 + monthInYear;

        // Calculate fee based on balance *before* contribution/growth
        const monthlyFee = balance * (feeRateDecimal / 12);
        balance -= monthlyFee;
        yearlyFees += monthlyFee;

        // Add monthly contribution (use potentially modified value)
        balance += currentMonthlyContribution;
        yearlyContribution += currentMonthlyContribution;

        // Generate random monthly return
        const randomShock = randomStandardNormal();
        const randomMonthlyReturn = monthlyMeanReturn + randomShock * monthlyVolatility;
        
        // Grow balance
        balance *= (1 + randomMonthlyReturn);
        balance = Math.max(0, balance); // Ensure non-negative balance
      }
      
      cumulativeFees += yearlyFees;
      cumulativeContributions += yearlyContribution;

      // Store end-of-year snapshot for this iteration
      iterationYearlySnapshots[i][year] = { 
          balance: balance, 
          fees: cumulativeFees, // Store cumulative fees up to this year end
          contribution: cumulativeContributions // Store cumulative contributions up to this year end
      };
    }
  }

  // --- Aggregate results year by year --- 
  const finalYearlyData: YearlyData[] = [];
  
  // Year 0 state (initial)
  finalYearlyData.push({
      year: 0,
      contribution: initialInvestment,
      totalContributions: initialInvestment,
      balanceP10: initialInvestment,
      balanceP50: initialInvestment,
      balanceP90: initialInvestment,
      growthP50: 0,
      totalGrowthP50: 0,
      feesP50: 0,
      totalFeesP50: 0,
      balanceRealP50: initialInvestment, // Real balance is same initially
  });

  for (let year = 1; year <= timeHorizonYears; year++) {
    const yearBalances = iterationYearlySnapshots.map(iter => iter[year].balance).sort((a, b) => a - b);
    const yearCumulFees = iterationYearlySnapshots.map(iter => iter[year].fees).sort((a, b) => a - b);
    // Contributions are deterministic, take from any iteration
    const yearCumulContributions = iterationYearlySnapshots[0][year].contribution;
    const contributionThisYear = yearCumulContributions - iterationYearlySnapshots[0][year - 1].contribution;

    const p10Index = Math.floor(numIterations * 0.10);
    const p50Index = Math.floor(numIterations * 0.50);
    const p90Index = Math.floor(numIterations * 0.90);

    const balanceP10 = yearBalances[p10Index];
    const balanceP50 = yearBalances[p50Index];
    const balanceP90 = yearBalances[p90Index];
    const totalFeesP50 = yearCumulFees[p50Index];
    const feesThisYearP50 = totalFeesP50 - (finalYearlyData[year - 1]?.totalFeesP50 ?? 0);

    const totalGrowthP50 = balanceP50 - yearCumulContributions;
    const growthThisYearP50 = totalGrowthP50 - (finalYearlyData[year - 1]?.totalGrowthP50 ?? 0);
    
    const balanceRealP50 = balanceP50 / Math.pow(1 + inflationRateDecimal, year);

    finalYearlyData.push({
      year: year,
      contribution: Math.round(contributionThisYear * 100) / 100,
      totalContributions: Math.round(yearCumulContributions * 100) / 100,
      balanceP10: Math.round(balanceP10 * 100) / 100,
      balanceP50: Math.round(balanceP50 * 100) / 100,
      balanceP90: Math.round(balanceP90 * 100) / 100,
      growthP50: Math.round(growthThisYearP50 * 100) / 100,
      totalGrowthP50: Math.round(totalGrowthP50 * 100) / 100,
      feesP50: Math.round(feesThisYearP50 * 100) / 100,
      totalFeesP50: Math.round(totalFeesP50 * 100) / 100,
      balanceRealP50: Math.round(balanceRealP50 * 100) / 100,
    });
  }
  // ------------------------------------

  return {
    yearlyData: finalYearlyData,
    portfolioMeanReturn: portfolioMeanReturn,
    portfolioVolatility: portfolioVolatility,
  };
}; 