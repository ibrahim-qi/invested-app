import { Json } from "./database.types"; // Import Json type if needed for impact

// --- Configuration ---
const MONTE_CARLO_ITERATIONS = 500; // Number of simulations to run for percentile calculation

// --- Define Minimal Event Types --- 
// Avoids direct dependency on full DB types in this core util
type EventImpact = {
  oneOffCost?: number;
  oneOffIncome?: number;
  monthlyContributionChange?: number;
  // Add impact types for automatic events
  annualReturnAdjustment?: number; 
  volatilityMultiplier?: number;  
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
// Baseline expected returns and volatility for different asset classes.
// These are simplified, long-term averages for educational purposes.
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
// Simplified assumptions for benchmark comparisons (deterministic calculation).
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
// Generates random numbers following a normal distribution, used to simulate market volatility.
// Basic approximation, sufficient for educational simulation.
function randomStandardNormal(): number {
    let u = 0, v = 0;
    while(u === 0) u = Math.random(); // Converting [0,1) to (0,1)
    while(v === 0) v = Math.random();
    return Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v );
}
// -------------------------------------------------------------------------

// --- Function to Calculate Benchmark Growth (Simplified Deterministic) ---
// Calculates benchmark growth year-by-year using only the mean return (no volatility).
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

/**
 * Calculates portfolio growth over time using a Monte Carlo simulation.
 * 
 * @param params - The core simulation parameters (investment, contribution, horizon, risk, rates).
 * @param events - Array of potential simulation events impacting the portfolio.
 * @param eventChoicesMade - User decisions made for specific events.
 * @param careerStage - User's career stage, used to adjust asset allocation.
 * @param locationRegion - User's location, used to select asset return assumptions.
 * @returns PortfolioGrowthResult containing yearly data across percentiles.
 */
export const calculatePortfolioGrowth = (
  params: CalculatePortfolioGrowthParams,
  events: SimulationEvent[] = [], 
  eventChoicesMade: Record<string, Json> = {},
  careerStage: string | null | undefined = undefined,
  locationRegion: string | null | undefined = undefined,
  // numIterations is now a constant: MONTE_CARLO_ITERATIONS 
): PortfolioGrowthResult => {
  const {
    initialInvestment,
    monthlyContribution,
    timeHorizonYears,
    riskLevel,
    annualInflationRate,
    annualFeeRate,
  } = params;

  // Select appropriate asset return/volatility assumptions based on location
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

  // --- Adjust Allocation Based on Career Stage (Simplified Lifecycling) --- 
  // Reduces risk slightly as user gets closer to retirement.
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

  // --- Calculate Portfolio Expected Return & Volatility (Weighted Average) ---
  // Based on the final asset allocation and regional assumptions.
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
  
  // Convert annual rates to monthly estimates for simulation steps (approximation).
  const monthlyMeanReturn = Math.pow(1 + portfolioMeanReturn, 1/12) - 1;
  const monthlyVolatility = portfolioVolatility / Math.sqrt(12);
  // Estimate annual return after fees for simplified fee calculation
  const annualRateAfterFees = portfolioMeanReturn - feeRateDecimal;
  // ------------------------------------------------------------------

  // --- Data structure to store yearly results for EACH iteration ---
  // Used to calculate percentiles (P10, P50, P90) at the end.
  // Array of iterations, each containing an array of yearly snapshots.
  const iterationYearlySnapshots: { balance: number; fees: number; contribution: number; growth: number; }[][] = 
      Array(MONTE_CARLO_ITERATIONS).fill(0).map(() => Array(timeHorizonYears + 1));
  // ----------------------------------------------------------------

  // --- Run Monte Carlo Simulation --- 
  for (let i = 0; i < MONTE_CARLO_ITERATIONS; i++) {
    let currentBalance = initialInvestment;
    let baseMonthlyContribution = monthlyContribution; // Store the base before adjustments
    let currentMonthlyContribution = monthlyContribution; // Mutable for the current iteration
    let cumulativeFees = 0;
    let cumulativeContributions = initialInvestment;
    let cumulativeGrowth = 0;

    // Initialize snapshot for year 0
    iterationYearlySnapshots[i][0] = { 
        balance: currentBalance, 
        fees: 0, 
        contribution: initialInvestment, // Year 0 contribution is initial investment
        growth: 0 
    };

    // Loop through each month
    for (let month = 1; month <= totalMonths; month++) {
      const currentYear = Math.floor((month - 1) / 12);
      let effectiveMonthlyMeanReturn = monthlyMeanReturn; // Start with base portfolio return
      let effectiveMonthlyVolatility = monthlyVolatility; // Start with base portfolio volatility
      let monthlyContributionForThisMonth = currentMonthlyContribution; 
      let oneOffImpact = 0;

      // --- Apply Event Impacts for the start of the current year --- 
      // Check if this is the FIRST month of a new year (after year 0)
      if (month % 12 === 1 && currentYear > 0) { 
          const yearEvent = events.find(e => e.trigger_year === currentYear); // Event triggers IN year X (0-indexed)
          if (yearEvent) {
              let impactSource: EventImpact | null | Json = null;
              let isDecisionImpact = false;
              // Determine the correct source of impact data
              if (yearEvent.event_type === 'decision' && eventChoicesMade[yearEvent.id]) {
                 impactSource = eventChoicesMade[yearEvent.id]; // Impact from user choice
                 isDecisionImpact = true;
              } else if (yearEvent.event_type !== 'decision' && yearEvent.impact) {
                 impactSource = yearEvent.impact; // Impact from automatic event's impact column
              }

              // Ensure impactSource is treated as an object for safe access
              if (impactSource && typeof impactSource === 'object') { 
                  // Assert impactSource to access potentially dynamic keys from JSON
                  const impactData = impactSource as any; 

                  // Safely access and convert potential impact values to numbers, defaulting to 0 or 1
                  const returnAdj = Number(impactData.annualReturnAdjustment ?? 0);
                  const volMultiplier = Number(impactData.volatilityMultiplier ?? 1);
                  const contribChange = Number(impactData.monthlyContributionChange ?? 0);
                  const income = Number(impactData.oneOffIncome ?? 0);
                  const cost = Number(impactData.oneOffCost ?? 0);

                  // Apply return/volatility adjustments (only from automatic events for now)
                  if (!isDecisionImpact) { // Apply market adjustments only from non-decision events
                      if (!isNaN(returnAdj)) {
                          // Convert annual adjustment to approximate monthly adjustment factor
                          const monthlyAdjFactor = Math.pow(1 + returnAdj, 1/12);
                          effectiveMonthlyMeanReturn = (1 + effectiveMonthlyMeanReturn) * monthlyAdjFactor - 1;
                      }
                      if (!isNaN(volMultiplier) && volMultiplier > 0) {
                          effectiveMonthlyVolatility *= volMultiplier;
                      }
                  }

                  // Apply contribution change (can come from decisions or auto events)
                  if (!isNaN(contribChange)) {
                     currentMonthlyContribution += contribChange;
                     currentMonthlyContribution = Math.max(0, currentMonthlyContribution);
                     // Update the rate for the current month immediately
                     monthlyContributionForThisMonth = currentMonthlyContribution; 
                  }
                  
                  // Calculate and apply one-off impact (can come from decisions or auto events)
                  if (!isNaN(income) && !isNaN(cost)) {
                     oneOffImpact = income - cost;
                     currentBalance += oneOffImpact; // Apply immediately at start of year (month 1)
                  }
              } else if (impactSource) {
                  console.warn(`Event ${yearEvent.id} has impactSource but it's not an object:`, impactSource);
              }
          }
      }
      // ---------------------------------------------------------------

      // Add monthly contribution (use the rate determined for this month/year)
      currentBalance += monthlyContributionForThisMonth;
      currentBalance = Math.max(0, currentBalance); 

      // Calculate random monthly return using the *effective* rates for this year
      const randomFactor = randomStandardNormal(); 
      const monthlyReturn = effectiveMonthlyMeanReturn + randomFactor * effectiveMonthlyVolatility;
      
      // Calculate growth for the month BEFORE fees
      const growthThisMonth = currentBalance * monthlyReturn;
      currentBalance += growthThisMonth;
      currentBalance = Math.max(0, currentBalance); // Ensure non-negative after growth

      // --- Store cumulative values at the END of each year --- 
      if (month % 12 === 0) {
        const year = month / 12;
        
        // Calculate approximate fees for the year
        const startOfYearBalance = iterationYearlySnapshots[i][year - 1]?.balance ?? initialInvestment;
        const avgBalanceThisYear = (startOfYearBalance + currentBalance) / 2;
        const feesThisYear = Math.max(0, avgBalanceThisYear * feeRateDecimal);
        currentBalance -= feesThisYear; // Deduct fees at year end
        currentBalance = Math.max(0, currentBalance);
        
        // --- Calculate Contribution and Growth during this specific year --- 
        // Contribution during year = sum of monthly contributions + one-off impacts during that year
        // Find the applicable monthly contribution for this past year (it might have changed mid-year due to event)
        // This requires a slightly more complex look back or storing the contribution rate per year.
        // Simplification: Use the contribution rate at the *end* of the year for the whole year.
        const contributionThisYear = (currentMonthlyContribution * 12) + oneOffImpact; // oneOffImpact already happened at month 1

        // Growth during year = End Balance - Start Balance - Contribution This Year + Fees This Year
        const growthDuringThisYear = currentBalance - startOfYearBalance - contributionThisYear + feesThisYear;
        // ------------------------------------------------------------------
        
        // Store snapshot for the end of this year
        iterationYearlySnapshots[i][year] = { 
            balance: currentBalance, 
            fees: feesThisYear, // Fees incurred *during* this year
            contribution: contributionThisYear, // Contribution made *during* this year
            growth: growthDuringThisYear // Growth achieved *during* this year
        };
      }
      // ---------------------------------------------------------
    }
  }
  // --- End Monte Carlo Simulation Loop ---

  // --- Calculate Percentiles and Final Yearly Data --- 
  const finalYearlyData: YearlyData[] = [];

  // Pre-calculate the P50 indices for efficiency
  const p50Indices = Array(timeHorizonYears + 1).fill(0).map((_, year) => {
      const yearBalances = iterationYearlySnapshots.map(iter => iter[year]?.balance ?? 0).sort((a, b) => a - b);
      const yearFees = iterationYearlySnapshots.map(iter => iter[year]?.fees ?? 0).sort((a, b) => a - b);
      const yearContributions = iterationYearlySnapshots.map(iter => iter[year]?.contribution ?? 0).sort((a, b) => a - b);
      const yearGrowths = iterationYearlySnapshots.map(iter => iter[year]?.growth ?? 0).sort((a, b) => a - b);
      const p50Index = Math.floor(MONTE_CARLO_ITERATIONS * 0.5);
      return {
          balance: yearBalances[p50Index],
          fees: yearFees[p50Index],
          contribution: yearContributions[p50Index],
          growth: yearGrowths[p50Index]
      };
  });

  for (let year = 0; year <= timeHorizonYears; year++) {
    // Get all iteration results for this specific year and sort for P10/P90
    const yearBalances = iterationYearlySnapshots.map(iter => iter[year]?.balance ?? 0).sort((a, b) => a - b);
    // No need to re-sort fees/contributions/growths if only using P50 from precalculated data
    
    // Calculate P10, P90 indices
    const p10Index = Math.floor(MONTE_CARLO_ITERATIONS * 0.1);
    const p90Index = Math.floor(MONTE_CARLO_ITERATIONS * 0.9);

    // Calculate cumulative totals for the median (P50) path up to this year
    let totalContributionsP50 = 0;
    let totalGrowthP50 = 0;
    let totalFeesP50 = 0;
    for(let y=0; y<=year; y++) { // Sum up values from the precalculated P50 path
        totalContributionsP50 += p50Indices[y].contribution;
        totalGrowthP50 += p50Indices[y].growth;
        totalFeesP50 += p50Indices[y].fees;
    }
    
    // Calculate real balance (adjusted for inflation) for P50
    const inflationFactor = Math.pow(1 + inflationRateDecimal, year);
    // Use the pre-calculated P50 balance for this year
    const balanceP50 = p50Indices[year].balance;
    const balanceRealP50 = balanceP50 / inflationFactor;

    finalYearlyData.push({
      year: year,
      contribution: Math.round(p50Indices[year].contribution * 100) / 100, // Use P50 value for the year
      totalContributions: Math.round(totalContributionsP50 * 100) / 100,
      balanceP10: Math.round(yearBalances[p10Index] * 100) / 100, // Use sorted balances for P10/P90
      balanceP50: Math.round(balanceP50 * 100) / 100,
      balanceP90: Math.round(yearBalances[p90Index] * 100) / 100, // Use sorted balances for P10/P90
      growthP50: Math.round(p50Indices[year].growth * 100) / 100, // Use P50 value for the year
      totalGrowthP50: Math.round(totalGrowthP50 * 100) / 100,
      feesP50: Math.round(p50Indices[year].fees * 100) / 100, // Use P50 value for the year
      totalFeesP50: Math.round(totalFeesP50 * 100) / 100,
      balanceRealP50: Math.round(balanceRealP50 * 100) / 100, // Add real balance
    });
  }
  // -----------------------------------------------------

  return {
    yearlyData: finalYearlyData,
    portfolioMeanReturn: portfolioMeanReturn,
    portfolioVolatility: portfolioVolatility,
  };
}; 