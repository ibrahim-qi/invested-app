interface CalculatePortfolioGrowthParams {
  initialInvestment: number;
  monthlyContribution: number;
  timeHorizonYears: number;
  riskLevel: 'conservative' | 'moderate' | 'aggressive';
}

interface PortfolioGrowthResult {
  finalBalance: number;
  totalContributions: number;
  totalGrowth: number;
  monthlyData: { month: number; balance: number }[]; // For charting
}

// --- Define Asset Allocation and Returns ---
const expectedAnnualReturns = {
  stocks: 0.085, // 8.5%
  bonds: 0.035,  // 3.5%
  cash: 0.015,   // 1.5%
};

const riskLevelAllocations = {
  conservative: { stocks: 0.30, bonds: 0.50, cash: 0.20 }, // 30/50/20
  moderate:     { stocks: 0.60, bonds: 0.30, cash: 0.10 }, // 60/30/10
  aggressive:   { stocks: 0.80, bonds: 0.15, cash: 0.05 }, // 80/15/5
};
// -----------------------------------------

// Calculation based on weighted average annual returns from asset allocation
export const calculatePortfolioGrowth = (
  params: CalculatePortfolioGrowthParams
): PortfolioGrowthResult => {
  const { initialInvestment, monthlyContribution, timeHorizonYears, riskLevel } = params;

  // --- Calculate Weighted Annual Rate ---
  const allocation = riskLevelAllocations[riskLevel];
  const weightedAnnualRate = (
    (allocation.stocks * expectedAnnualReturns.stocks) +
    (allocation.bonds * expectedAnnualReturns.bonds) +
    (allocation.cash * expectedAnnualReturns.cash)
  );
  // ------------------------------------

  const monthlyRate = Math.pow(1 + weightedAnnualRate, 1 / 12) - 1;
  const totalMonths = timeHorizonYears * 12;

  let balance = initialInvestment;
  const monthlyData: { month: number; balance: number }[] = [{ month: 0, balance }];

  for (let month = 1; month <= totalMonths; month++) {
    // Add contribution first, then apply growth
    balance += monthlyContribution;
    balance *= (1 + monthlyRate);
    monthlyData.push({ month, balance: Math.round(balance * 100) / 100 });
  }

  const finalBalance = balance;
  const totalContributions = initialInvestment + (monthlyContribution * totalMonths);
  const totalGrowth = finalBalance - totalContributions;

  return {
    finalBalance: Math.round(finalBalance * 100) / 100,
    totalContributions: Math.round(totalContributions * 100) / 100,
    totalGrowth: Math.round(totalGrowth * 100) / 100,
    monthlyData,
  };
}; 