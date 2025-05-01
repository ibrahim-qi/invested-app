interface CalculatePortfolioGrowthParams {
  initialInvestment: number;
  monthlyContribution: number;
  timeHorizonYears: number;
  riskLevel: 'conservative' | 'moderate' | 'aggressive';
  annualInflationRate: number; 
  annualFeeRate: number;       
}

// --- Update result type for Monte Carlo ---
interface PortfolioGrowthResult {
  // Keep existing for reference / potentially median nominal
  finalBalance: number; 
  totalContributions: number;
  totalGrowth: number; // Median growth?
  finalBalanceReal?: number; // Median real balance?
  
  // Percentile results (Nominal)
  finalBalanceP10: number;
  finalBalanceP50: number; // Median
  finalBalanceP90: number;

  // Median monthly path for charting
  monthlyDataP50: { month: number; balance: number }[]; 
  
  // Keep for display
  weightedAnnualRate: number;
  totalFeesPaid: number; // Should this be median fees paid?
}
// ----------------------------------------

// --- Asset Class Assumptions ---
const assetAssumptions = {
  stocks: { meanReturn: 0.085, volatility: 0.15 }, // 8.5% return, 15% std dev
  bonds:  { meanReturn: 0.035, volatility: 0.05 }, // 3.5% return, 5% std dev
  cash:   { meanReturn: 0.015, volatility: 0.01 }, // 1.5% return, 1% std dev 
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

export const calculatePortfolioGrowth = (
  params: CalculatePortfolioGrowthParams,
  numIterations: number = 500 // Number of simulation runs (configurable, default 500)
): PortfolioGrowthResult => {
  const {
    initialInvestment,
    monthlyContribution,
    timeHorizonYears,
    riskLevel,
    annualInflationRate,
    annualFeeRate,
  } = params;

  const allocation = riskLevelAllocations[riskLevel];
  const totalMonths = timeHorizonYears * 12;
  const feeRateDecimal = annualFeeRate / 100;
  const inflationRateDecimal = annualInflationRate / 100;

  // --- Calculate Portfolio Expected Return & Volatility (Simplified) ---
  const portfolioMeanReturn = (
    (allocation.stocks * assetAssumptions.stocks.meanReturn) +
    (allocation.bonds * assetAssumptions.bonds.meanReturn) +
    (allocation.cash * assetAssumptions.cash.meanReturn)
  );
  // Simplified weighted average volatility (ignores correlation - EDUCATIONAL APPROXIMATION)
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

  const finalBalances: number[] = [];
  const medianMonthlyPathBalances: number[][] = Array(totalMonths + 1).fill(0).map(() => []);
  let medianTotalFeesPaidArr: number[] = [];

  for (let i = 0; i < numIterations; i++) {
    let balance = initialInvestment;
    let currentTotalFees = 0;
    medianMonthlyPathBalances[0].push(balance); // Store initial balance for month 0

    for (let month = 1; month <= totalMonths; month++) {
      // Calculate fee based on balance *before* contribution/growth
      const monthlyFee = balance * (feeRateDecimal / 12);
      balance -= monthlyFee;
      currentTotalFees += monthlyFee;

      balance += monthlyContribution;

      // Generate random monthly return based on portfolio characteristics
      const randomShock = randomStandardNormal(); // N(0,1) sample
      const randomMonthlyReturn = monthlyMeanReturn + randomShock * monthlyVolatility;
      
      // Adjust for fees within the growth factor - simpler than adjusting mean beforehand
      const effectiveMonthlyGrowthFactor = (1 + randomMonthlyReturn) * (1 - (feeRateDecimal / 12)); 

      balance *= effectiveMonthlyGrowthFactor;
      balance = Math.max(0, balance); // Ensure balance doesn't go below zero

      medianMonthlyPathBalances[month].push(balance);
    }
    finalBalances.push(balance);
    medianTotalFeesPaidArr.push(currentTotalFees);
  }

  // --- Process Results --- 
  finalBalances.sort((a, b) => a - b);
  const p10Index = Math.floor(numIterations * 0.10);
  const p50Index = Math.floor(numIterations * 0.50);
  const p90Index = Math.floor(numIterations * 0.90);

  const finalBalanceP10 = finalBalances[p10Index];
  const finalBalanceP50 = finalBalances[p50Index]; // Median nominal balance
  const finalBalanceP90 = finalBalances[p90Index];

  // Calculate median monthly path data
  const monthlyDataP50: { month: number; balance: number }[] = [];
  for (let month = 0; month <= totalMonths; month++) {
      medianMonthlyPathBalances[month].sort((a, b) => a - b);
      monthlyDataP50.push({ month, balance: Math.round(medianMonthlyPathBalances[month][p50Index] * 100) / 100 });
  }

  medianTotalFeesPaidArr.sort((a,b) => a - b);
  const medianTotalFeesPaid = medianTotalFeesPaidArr[p50Index];

  const totalContributions = initialInvestment + (monthlyContribution * totalMonths);
  // Growth based on median outcome
  const totalGrowthP50 = finalBalanceP50 - totalContributions; 
  // Median real balance
  const finalBalanceRealP50 = finalBalanceP50 / Math.pow(1 + inflationRateDecimal, timeHorizonYears);
  // -----------------------

  return {
    finalBalance: Math.round(finalBalanceP50 * 100) / 100, // Keep finalBalance as median
    totalContributions: Math.round(totalContributions * 100) / 100,
    totalGrowth: Math.round(totalGrowthP50 * 100) / 100,
    finalBalanceReal: Math.round(finalBalanceRealP50 * 100) / 100, 
    
    finalBalanceP10: Math.round(finalBalanceP10 * 100) / 100,
    finalBalanceP50: Math.round(finalBalanceP50 * 100) / 100,
    finalBalanceP90: Math.round(finalBalanceP90 * 100) / 100,

    monthlyDataP50: monthlyDataP50, 
    
    weightedAnnualRate: portfolioMeanReturn, // Return the portfolio's mean return
    totalFeesPaid: Math.round(medianTotalFeesPaid * 100) / 100, // Return median fees paid
  };
}; 