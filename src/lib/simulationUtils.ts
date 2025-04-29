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

// Simplified deterministic calculation based on average annual returns
export const calculatePortfolioGrowth = (
  params: CalculatePortfolioGrowthParams
): PortfolioGrowthResult => {
  const { initialInvestment, monthlyContribution, timeHorizonYears, riskLevel } = params;

  // Define simplified average annual returns based on risk
  // These are illustrative - real models are more complex
  const annualRateMap = {
    conservative: 0.04, // 4%
    moderate: 0.07, // 7%
    aggressive: 0.10, // 10%
  };

  const annualRate = annualRateMap[riskLevel];
  const monthlyRate = Math.pow(1 + annualRate, 1 / 12) - 1;
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