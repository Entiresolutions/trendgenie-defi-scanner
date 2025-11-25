// src/lib/risk/honeypotCheck.ts

import type { RiskCheckResult, RiskLevel } from "./types";
import type { SupportedChain } from "../viem";

// Default public API base (can be overridden via env)
const HONEYPOT_API_BASE =
  process.env.HONEYPOT_API_BASE_URL ?? "https://api.honeypot.is";

// Optional API key – docs ke mutabiq abhi required nahi, lekin future-proofing
const HONEYPOT_API_KEY = process.env.HONEYPOT_API_KEY ?? "";

const chainToId: Record<SupportedChain, number> = {
  eth: 1, // Ethereum
  bsc: 56 // Binance Smart Chain
};

interface HoneypotSummaryFlag {
  flag?: string;
  description?: string;
  severity?: string;
  severityIndex?: number;
}

interface HoneypotSummary {
  risk?: string; // "very_low" | "low" | "medium" | "high" | "very_high" | "honeypot" | "unknown"
  riskLevel?: number; // 0–100
  flags?: HoneypotSummaryFlag[];
}

interface HoneypotResult {
  isHoneypot?: boolean;
  honeypotReason?: string;
}

interface HoneypotSimulationResult {
  buyTax?: number;
  sellTax?: number;
  transferTax?: number;
}

interface HoneypotTokenInfo {
  name?: string;
  symbol?: string;
}

interface HoneypotApiResponse {
  token?: HoneypotTokenInfo;
  summary?: HoneypotSummary;
  honeypotResult?: HoneypotResult;
  simulationResult?: HoneypotSimulationResult;
}

/**
 * Small helper to add timeout to fetch so API hang na kare.
 */
async function fetchWithTimeout(
  url: string,
  timeoutMs = 6000
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {};
  if (HONEYPOT_API_KEY) {
    headers["X-API-KEY"] = HONEYPOT_API_KEY;
  }

  try {
    return await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
      cache: "no-store"
    });
  } finally {
    clearTimeout(id);
  }
}

/**
 * Map Honeypot.is risk -> hamara 3-color system
 */
function mapRiskToLevel(
  risk: string | undefined,
  riskLevel: number | undefined,
  isHoneypot: boolean | undefined
): RiskLevel {
  if (isHoneypot) return "red";

  const rl = riskLevel ?? -1;

  switch (risk) {
    case "honeypot":
      return "red";
    case "very_high":
      return "red";
    case "high":
      // high risk -> user ko clear red dikhana better
      return "red";
    case "medium":
      return "yellow";
    case "low":
    case "very_low":
      // safe-ish
      return "green";
    case "unknown":
    default:
      // unknown ya kuch aur: neutral / warning
      if (rl >= 90) return "red";
      if (rl >= 60) return "yellow";
      if (rl >= 0 && rl < 20) return "green";
      return "yellow";
  }
}

/**
 * Build human readable summary string from API response
 */
function buildDetails(
  resp: HoneypotApiResponse,
  level: RiskLevel
): string {
  const parts: string[] = [];
  const token = resp.token;
  const tokenNamePart =
    token?.symbol && token?.name
      ? `${token.symbol} (${token.name})`
      : token?.symbol || token?.name || "This token";

  const risk = resp.summary?.risk;
  const riskLevel = resp.summary?.riskLevel;

  if (risk) {
    const prettyRisk = risk.replace("_", " ");
    if (typeof riskLevel === "number") {
      parts.push(
        `${tokenNamePart} is rated as "${prettyRisk}" risk by Honeypot.is (score ${riskLevel}/100).`
      );
    } else {
      parts.push(
        `${tokenNamePart} is rated as "${prettyRisk}" risk by Honeypot.is.`
      );
    }
  }

  const hp = resp.honeypotResult;
  if (hp?.isHoneypot) {
    if (hp.honeypotReason) {
      parts.push(
        `The token is reported as a honeypot. Reason: ${hp.honeypotReason}.`
      );
    } else {
      parts.push("The token is reported as a honeypot (sell very likely blocked).");
    }
  }

  const sim = resp.simulationResult;
  if (sim) {
    const taxes: string[] = [];
    if (typeof sim.buyTax === "number") taxes.push(`buy tax ~${sim.buyTax}%`);
    if (typeof sim.sellTax === "number") taxes.push(`sell tax ~${sim.sellTax}%`);
    if (typeof sim.transferTax === "number")
      taxes.push(`transfer tax ~${sim.transferTax}%`);

    if (taxes.length > 0) {
      parts.push(`Detected taxes: ${taxes.join(", ")}.`);
    }
  }

  const flags = resp.summary?.flags;
  if (flags && flags.length > 0) {
    // sirf top 2–3 most severe flags dikhate hain
    const sorted = [...flags].sort(
      (a, b) => (b.severityIndex ?? 0) - (a.severityIndex ?? 0)
    );
    const top = sorted.slice(0, 3);
    const flagTexts = top
      .map(f => f.description || f.flag)
      .filter(Boolean) as string[];

    if (flagTexts.length > 0) {
      parts.push(
        `Key warnings: ${flagTexts.join(" | ")}`
      );
    }
  }

  if (parts.length === 0) {
    if (level === "green") {
      parts.push(
        "No honeypot behaviour detected by Honeypot.is and no major warnings were returned."
      );
    } else {
      parts.push(
        "Honeypot.is did not return detailed data. Treat this token with caution and double-check before investing."
      );
    }
  }

  return parts.join(" ");
}

/**
 * Main honeypot check used by /api/scan
 */
export async function checkHoneypot(
  tokenAddress: string,
  chain: SupportedChain
): Promise<RiskCheckResult> {
  const chainId = chainToId[chain];

  const url = `${HONEYPOT_API_BASE.replace(
    /\/+$/,
    ""
  )}/v2/IsHoneypot?address=${encodeURIComponent(
    tokenAddress
  )}&chainID=${encodeURIComponent(String(chainId))}`;

  try {
    const res = await fetchWithTimeout(url, 7000);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        id: "honeypot-api-failed",
        label: "Honeypot Risk (Honeypot.is)",
        level: "yellow",
        details:
          `Failed to query Honeypot.is (HTTP ${res.status}). Response: ${text.slice(
            0,
            200
          ) || "no body"}. Treat this as neutral and do extra checks manually.`
      };
    }

    const json = (await res.json()) as HoneypotApiResponse;

    const risk = json.summary?.risk;
    const riskLevel = json.summary?.riskLevel;
    const isHoneypot = json.honeypotResult?.isHoneypot;

    const level = mapRiskToLevel(risk, riskLevel, isHoneypot);
    const details = buildDetails(json, level);

    return {
      id: "honeypot-api",
      label: "Honeypot Risk (Honeypot.is)",
      level,
      details
    };
  } catch (error: any) {
    // Network / timeout / parse error -> neutral warning, app crash nahi karega
    return {
      id: "honeypot-api-error",
      label: "Honeypot Risk (Honeypot.is)",
      level: "yellow",
      details:
        `Could not complete honeypot check (network or timeout error). Error: ${
          error?.message || "unknown"
        }. Treat this result as neutral and do extra checks.`
    };
  }
}
