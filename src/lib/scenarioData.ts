import type { Scenario } from '@/types/simulation.types';

export const scenarioData: Scenario[] = [
  {
    id: 'job-promotion',
    title: 'Job Promotion Opportunity',
    description: 'You\'ve been offered a promotion! It comes with a salary increase but also potentially longer hours, impacting your ability to contribute extra to savings immediately.',
    choices: [
      {
        id: 'promo-accept',
        text: 'Accept the promotion (+£300/month net increase)',
        impact: { monthlyContributionChange: 300 }
      },
      {
        id: 'promo-decline',
        text: 'Decline the promotion (no change)',
        impact: {}
      }
    ]
  },
  {
    id: 'car-repair',
    title: 'Unexpected Car Trouble',
    description: 'Your car needs a significant repair costing £1,500. You need to decide how to cover this expense.',
    choices: [
      {
        id: 'repair-emergency-fund',
        text: 'Pay from emergency fund (reduce initial investment for simulation)',
        impact: { initialInvestmentChange: -1500 } // Simulates taking from savings
      },
      {
        id: 'repair-cut-contributions',
        text: 'Temporarily reduce investment contributions for 6 months',
        // More complex impact - requires modifying simulation logic over time
        // For now, let\'s simulate as a one-off cost equivalent 
        impact: { oneOffCost: 1500 }
      },
      {
        id: 'repair-ignore',
        text: 'Ignore the repair for now (no immediate financial impact)',
        impact: {}
      }
    ]
  },
  {
    id: 'windfall',
    title: 'Small Inheritance',
    description: 'You\'ve received an unexpected inheritance of £5,000.',
    choices: [
      {
        id: 'windfall-invest',
        text: 'Add it to your initial investment',
        impact: { initialInvestmentChange: 5000 }
      },
      {
        id: 'windfall-spend',
        text: 'Use it for a holiday (no change to investment simulation)',
        impact: {}
      }
    ]
  }
  // Add more scenarios later
]; 