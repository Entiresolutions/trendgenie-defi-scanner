// src/lib/risk/aggregate.ts
import { AggregatedRiskResult, RiskCheckResult, RiskLevel } from "./types";

export function aggregateResults(checks: RiskCheckResult[]): AggregatedRiskResult {
  const levels = checks.map(c => c.level);

  let overall: RiskLevel = "green";

  if (levels.includes("red")) {
    overall = "red";
  } else if (levels.includes("yellow")) {
    overall = "yellow";
  }

  return { overall, checks };
}
