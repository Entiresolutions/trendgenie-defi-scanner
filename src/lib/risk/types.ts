// src/lib/risk/types.ts
export type RiskLevel = "green" | "yellow" | "red";

export interface RiskCheckResult {
  id: string;
  label: string;
  level: RiskLevel;
  details: string;
}

export interface AggregatedRiskResult {
  overall: RiskLevel;
  checks: RiskCheckResult[];
}
