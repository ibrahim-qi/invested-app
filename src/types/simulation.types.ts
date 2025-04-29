// src/types/simulation.types.ts

// Defines the potential impact of a scenario choice on simulation parameters
export interface ScenarioImpact {
  // Modifiers (applied before simulation runs)
  initialInvestmentChange?: number; // e.g., -5000 for down payment
  monthlyContributionChange?: number; // e.g., +200 for salary increase
  oneOffCost?: number; // e.g., 1500 for car repair
  oneOffIncome?: number; // e.g., 3000 for bonus
  // We could add impacts on risk tolerance suggestion, time horizon etc. later
}

// Represents a single choice within a scenario
export interface ScenarioChoice {
  id: string;
  text: string; // e.g., "Accept the promotion", "Delay house purchase"
  impact: ScenarioImpact;
}

// Represents a life event scenario presented to the user
export interface Scenario {
  id: string;
  title: string;
  description: string;
  choices: ScenarioChoice[];
} 