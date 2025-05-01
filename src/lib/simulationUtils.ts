interface CalculatePortfolioGrowthParams {
  initialInvestment: number;
  monthlyContribution: number;
  timeHorizonYears: number;
  riskLevel: 'conservative' | 'moderate' | 'aggressive';
  annualInflationRate: number; // As percentage e.g. 2.5
  annualFeeRate: number;       // As percentage e.g. 0.5
}

interface PortfolioGrowthResult {
  finalBalance: number;
  totalContributions: number;
  totalGrowth: number;
  finalBalanceReal?: number; // Optional real balance
  monthlyData: { month: number; balance: number }[]; // For charting
  weightedAnnualRate: number;
  totalFeesPaid: number;
}

// --- Define Asset Allocation and Returns ---
const expectedAnnualReturns = {
  stocks: 0.085, // 8.5%
  bonds: 0.035,  // 3.5%
  cash: 0.015,   // 1.5%
};

export const riskLevelAllocations = {
  conservative: { stocks: 0.30, bonds: 0.50, cash: 0.20 }, // 30/50/20
  moderate:     { stocks: 0.60, bonds: 0.30, cash: 0.10 }, // 60/30/10
  aggressive:   { stocks: 0.80, bonds: 0.15, cash: 0.05 }, // 80/15/5
};
// -----------------------------------------

// Calculation based on weighted average annual returns from asset allocation
export const calculatePortfolioGrowth = (
  params: CalculatePortfolioGrowthParams
): PortfolioGrowthResult => {
  const {
    initialInvestment,
    monthlyContribution,
    timeHorizonYears,
    riskLevel,
    annualInflationRate,
    annualFeeRate,
  } = params;

  // --- Calculate Weighted Annual Rate (Nominal) ---
  const allocation = riskLevelAllocations[riskLevel];
  const weightedAnnualRate = (
    (allocation.stocks * expectedAnnualReturns.stocks) +
    (allocation.bonds * expectedAnnualReturns.bonds) +
    (allocation.cash * expectedAnnualReturns.cash)
  );
  // -----------------------------------------------

  // --- Convert Percentage Rates to Decimals ---
  const feeRateDecimal = annualFeeRate / 100;
  const inflationRateDecimal = annualInflationRate / 100;
  // -----------------------------------------

  // --- Calculate Effective Monthly Rates ---
  // Adjust nominal rate by fees first
  const annualRateAfterFees = weightedAnnualRate - feeRateDecimal;
  const monthlyRateAfterFees = Math.pow(1 + annualRateAfterFees, 1 / 12) - 1;
  
  // Calculate monthly inflation rate (optional - needed if calculating real balance monthly)
  // const monthlyInflationRate = Math.pow(1 + inflationRateDecimal, 1 / 12) - 1;
  // -------------------------------------

  const totalMonths = timeHorizonYears * 12;

  let balance = initialInvestment;
  let totalFeesPaid = 0; // Initialize fee accumulator
  const monthlyData: { month: number; balance: number }[] = [{ month: 0, balance }];

  for (let month = 1; month <= totalMonths; month++) {
    // --- Calculate and deduct fee BEFORE adding contribution/growth for the month ---
    // Simple approach: Apply annual fee monthly (feeRateDecimal / 12) on the balance *before* contribution/growth
    const monthlyFee = balance * (feeRateDecimal / 12);
    balance -= monthlyFee;
    totalFeesPaid += monthlyFee;
    // -----------------------------------------------------------------------------
    
    balance += monthlyContribution;
    // Apply growth rate AFTER fees are accounted for
    balance *= (1 + monthlyRateAfterFees); 
    monthlyData.push({ month, balance: Math.round(balance * 100) / 100 });
  }

  const finalBalance = balance; // This is the nominal balance
  const totalContributions = initialInvestment + (monthlyContribution * totalMonths);
  const totalGrowth = finalBalance - totalContributions;

  // --- Optional: Calculate Final Real Balance ---
  // Adjust the final nominal balance for cumulative inflation over the horizon
  const finalBalanceReal = finalBalance / Math.pow(1 + inflationRateDecimal, timeHorizonYears);
  // --------------------------------------------

  return {
    finalBalance: Math.round(finalBalance * 100) / 100,
    finalBalanceReal: Math.round(finalBalanceReal * 100) / 100,
    totalContributions: Math.round(totalContributions * 100) / 100,
    totalGrowth: Math.round(totalGrowth * 100) / 100,
    monthlyData,
    weightedAnnualRate: weightedAnnualRate,
    totalFeesPaid: Math.round(totalFeesPaid * 100) / 100,
  };
}; 