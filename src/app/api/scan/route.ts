import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";

type Chain = "eth" | "bsc";
type RiskLevel = "green" | "yellow" | "red";

interface RiskCheckResult {
  id: string;
  label: string;
  level: RiskLevel;
  details: string;
}

interface AggregatedRiskResult {
  overall: RiskLevel;
  checks: RiskCheckResult[];
}

/**
 * ENV & provider helpers
 */
const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL;
const BSC_RPC_URL = process.env.BSC_RPC_URL;

if (!MAINNET_RPC_URL) {
  // Vercel build time error message was already seen once – keep explicit
  console.warn("MAINNET_RPC_URL is not set. Ethereum scans will fail.");
}
if (!BSC_RPC_URL) {
  console.warn("BSC_RPC_URL is not set. BNB Chain scans will fail.");
}

function getProvider(chain: Chain) {
  if (chain === "eth") {
    if (!MAINNET_RPC_URL) {
      throw new Error("MAINNET_RPC_URL is not set in environment.");
    }
    return new ethers.JsonRpcProvider(MAINNET_RPC_URL);
  } else {
    if (!BSC_RPC_URL) {
      throw new Error("BSC_RPC_URL is not set in environment.");
    }
    return new ethers.JsonRpcProvider(BSC_RPC_URL);
  }
}

/**
 * Honeypot.is integration (same behaviour as before, but explicit)
 */
const HONEYPOT_API_BASE_URL =
  process.env.HONEYPOT_API_BASE_URL ?? "https://api.honeypot.is";

async function runHoneypotCheck(
  tokenAddress: string,
  chain: Chain
): Promise<RiskCheckResult> {
  const chainId = chain === "eth" ? 1 : 56;

  try {
    const url = `${HONEYPOT_API_BASE_URL}/v2/IsHoneypot?address=${tokenAddress}&chainId=${chainId}`;
    const res = await fetch(url, {
      // keep it fresh, but allow some caching
      next: { revalidate: 60 }
    });

    const bodyText = await res.text();

    if (!res.ok) {
      if (res.status === 404) {
        return {
          id: "honeypot",
          label: "Honeypot Behaviour",
          level: "yellow",
          details: `Failed to query Honeypot.is (HTTP 404). Response: ${bodyText}. Treat this as neutral and do extra checks manually.`
        };
      }

      return {
        id: "honeypot",
        label: "Honeypot Behaviour",
        level: "yellow",
        details: `Honeypot.is request failed with status ${res.status}. Raw response: ${bodyText}.`
      };
    }

    let data: any;
    try {
      data = JSON.parse(bodyText);
    } catch (e) {
      return {
        id: "honeypot",
        label: "Honeypot Behaviour",
        level: "yellow",
        details: `Honeypot.is returned non-JSON response. Raw body: ${bodyText}.`
      };
    }

    // API structure can change – keep logic defensive
    const isHoneypot =
      data?.honeypotResult?.isHoneypot ??
      data?.isHoneypot ??
      data?.simulation?.isHoneypot;

    if (isHoneypot === true) {
      return {
        id: "honeypot",
        label: "Honeypot Behaviour",
        level: "red",
        details:
          "Honeypot.is flagged this token as a honeypot in its trade simulation. This usually means sells are blocked or heavily taxed – extremely high scam risk."
      };
    }

    if (isHoneypot === false) {
      return {
        id: "honeypot",
        label: "Honeypot Behaviour",
        level: "green",
        details:
          "Honeypot.is did not detect honeypot behaviour in its simulation. This does NOT guarantee safety, but no obvious honeypot pattern was found."
      };
    }

    return {
      id: "honeypot",
      label: "Honeypot Behaviour",
      level: "yellow",
      details:
        "Honeypot.is response was received but could not be interpreted cleanly. Treat this as unknown and combine with other risk checks."
    };
  } catch (error: any) {
    console.error("Honeypot check error:", error);
    return {
      id: "honeypot",
      label: "Honeypot Behaviour",
      level: "yellow",
      details: `Honeypot check failed due to a network or parsing error: ${String(
        error?.message ?? error
      )}.`
    };
  }
}

/**
 * Ownership check – simple Ownable pattern read
 */
const OWNABLE_ABI = [
  "function owner() view returns (address)",
  "function getOwner() view returns (address)"
];

async function tryReadOwner(
  tokenAddress: string,
  provider: ethers.JsonRpcProvider
): Promise<string | null> {
  const contract = new ethers.Contract(tokenAddress, OWNABLE_ABI, provider);

  // Try owner()
  try {
    const owner: string = await contract.owner();
    if (owner && owner !== ethers.ZeroAddress) return owner;
    if (owner === ethers.ZeroAddress) return ethers.ZeroAddress;
  } catch {
    // ignore
  }

  // Try getOwner()
  try {
    const owner: string = await contract.getOwner();
    if (owner && owner !== ethers.ZeroAddress) return owner;
    if (owner === ethers.ZeroAddress) return ethers.ZeroAddress;
  } catch {
    // ignore
  }

  return null;
}

async function runOwnershipCheck(
  tokenAddress: string,
  chain: Chain,
  provider: ethers.JsonRpcProvider
): Promise<RiskCheckResult> {
  try {
    const owner = await tryReadOwner(tokenAddress, provider);

    if (owner === null) {
      return {
        id: "ownership",
        label: "Contract Ownership",
        level: "yellow",
        details:
          "Ownership pattern is not a standard Ownable interface, so the owner address could not be read reliably. This does not automatically mean scam, but makes analysis harder."
      };
    }

    if (owner === ethers.ZeroAddress) {
      return {
        id: "ownership",
        label: "Contract Ownership",
        level: "green",
        details:
          "Ownership is renounced (owner is the zero address). The deployer cannot change critical parameters via standard Ownable functions, which reduces rug risk from owner-controlled changes."
      };
    }

    // Known router addresses could be treated as more neutral,
    // but most legit tokens still show team-controlled ownership.
    return {
      id: "ownership",
      label: "Contract Ownership",
      level: "yellow",
      details: `Ownership is not renounced. Owner: ${owner}. This is normal for many tokens (upgradable / tax logic / anti-bot), but it also means the team can still modify key parts of the contract logic. Treat this as additional rug risk unless the project is well-known and trusted.`
    };
  } catch (error: any) {
    console.error("Ownership check error:", error);
    return {
      id: "ownership",
      label: "Contract Ownership",
      level: "yellow",
      details: `Failed to read ownership info due to a contract or RPC error: ${String(
        error?.message ?? error
      )}.`
    };
  }
}

/**
 * LP / Liquidity Health – Uniswap V2 / PancakeSwap-style pools
 * Phase 1: detect main pool + check thin vs medium vs healthy liquidity.
 */

const UNISWAP_V2_FACTORY_ABI = [
  "function getPair(address tokenA, address tokenB) external view returns (address pair)"
];

const UNISWAP_V2_PAIR_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)"
];

const ERC20_METADATA_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

type BaseTokenConfig = {
  address: string;
  symbol: string;
  decimals: number;
  kind: "stable" | "native";
};

const DEX_CONFIG: Record<
  Chain,
  {
    factory: string;
    baseTokens: BaseTokenConfig[];
  }
> = {
  eth: {
    // Uniswap V2 factory
    factory: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
    baseTokens: [
      {
        address: "0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2", // WETH
        symbol: "WETH",
        decimals: 18,
        kind: "native"
      },
      {
        address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", // USDT
        symbol: "USDT",
        decimals: 6,
        kind: "stable"
      },
      {
        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC
        symbol: "USDC",
        decimals: 6,
        kind: "stable"
      }
    ]
  },
  bsc: {
    // PancakeSwap V2 factory
    factory: "0xca143ce32fe78f1f7019d7d551a6402fc5350c73",
    baseTokens: [
      {
        address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // WBNB
        symbol: "WBNB",
        decimals: 18,
        kind: "native"
      },
      {
        address: "0x55d398326f99059fF775485246999027B3197955", // USDT (BSC)
        symbol: "USDT",
        decimals: 18,
        kind: "stable"
      },
      {
        address: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", // BUSD (legacy, many pools still use)
        symbol: "BUSD",
        decimals: 18,
        kind: "stable"
      }
    ]
  }
};

async function analyzeLiquidityAndLpHealth(
  tokenAddress: string,
  chain: Chain,
  provider: ethers.JsonRpcProvider
): Promise<RiskCheckResult> {
  const cfg = DEX_CONFIG[chain];
  const factory = new ethers.Contract(
    cfg.factory,
    UNISWAP_V2_FACTORY_ABI,
    provider
  );

  const tokenLower = tokenAddress.toLowerCase();

  type FoundPool = {
    pairAddress: string;
    base: BaseTokenConfig;
    baseReserve: number;
    tokenReserve: number;
  };

  let foundPool: FoundPool | null = null;

  try {
    for (const base of cfg.baseTokens) {
      const pairAddress: string = await factory.getPair(
        tokenAddress,
        base.address
      );

      if (!pairAddress || pairAddress === ethers.ZeroAddress) {
        continue;
      }

      const pair = new ethers.Contract(
        pairAddress,
        UNISWAP_V2_PAIR_ABI,
        provider
      );

      const [token0, token1, reserves] = await Promise.all([
        pair.token0(),
        pair.token1(),
        pair.getReserves()
      ]);

      const token0Lower = (token0 as string).toLowerCase();
      const token1Lower = (token1 as string).toLowerCase();

      let tokenReserveRaw: bigint;
      let baseReserveRaw: bigint;

      if (token0Lower === tokenLower && token1Lower === base.address.toLowerCase()) {
        tokenReserveRaw = reserves[0];
        baseReserveRaw = reserves[1];
      } else if (
        token1Lower === tokenLower &&
        token0Lower === base.address.toLowerCase()
      ) {
        tokenReserveRaw = reserves[1];
        baseReserveRaw = reserves[0];
      } else {
        // This pair is not token-base as expected; skip
        continue;
      }

      // Try to read token decimals; if fails, assume 18
      let tokenDecimals = 18;
      try {
        const meta = new ethers.Contract(
          tokenAddress,
          ERC20_METADATA_ABI,
          provider
        );
        tokenDecimals = await meta.decimals();
      } catch {
        // ignore, default 18
      }

      const tokenReserve = parseFloat(
        ethers.formatUnits(tokenReserveRaw, tokenDecimals)
      );
      const baseReserve = parseFloat(
        ethers.formatUnits(baseReserveRaw, base.decimals)
      );

      foundPool = {
        pairAddress,
        base,
        baseReserve,
        tokenReserve
      };
      break; // prefer first base in priority list
    }
  } catch (error) {
    console.error("LP detection error:", error);
    // fall through to yellow/unknown result below
  }

  if (!foundPool) {
    return {
      id: "lp-health",
      label: "Liquidity & LP Health",
      level: "red",
      details:
        "No primary DEX liquidity pool was found for this token on the main Uniswap / PancakeSwap-style factories against WETH/WBNB or common stablecoins. That usually means trading is extremely illiquid or only happens on obscure DEXes – very high exit risk."
    };
  }

  const { base, baseReserve, tokenReserve, pairAddress } = foundPool;

  // Simple heuristic thresholds – we don't try to be perfect,
  // just clearly flag paper-thin vs somewhat-respectable liquidity.
  let level: RiskLevel;
  let headline: string;

  if (base.kind === "stable") {
    // Interpreted as roughly USD value
    if (baseReserve < 2000) {
      level = "red";
      headline =
        "Extremely thin stablecoin liquidity. A few thousand dollars can move the price massively or drain the pool.";
    } else if (baseReserve < 10000) {
      level = "yellow";
      headline =
        "Moderate stablecoin liquidity. Small buys/sells will move price, but pool is not completely empty.";
    } else {
      level = "green";
      headline =
        "Decent stablecoin-side liquidity. Big whales can still move price, but retail entries/exits are less likely to instantly nuke the chart.";
    }
  } else {
    // Native asset side (WETH / WBNB)
    if (baseReserve < 5) {
      level = "red";
      headline =
        "Very thin native asset liquidity. Only a few WETH/WBNB in the pool – easy to manipulate and hard to exit size.";
    } else if (baseReserve < 30) {
      level = "yellow";
      headline =
        "Medium native asset liquidity. Enough depth for small trades, but still vulnerable to sharp moves and dumps.";
    } else {
      level = "green";
      headline =
        "Relatively deep native asset liquidity. This does not remove risk, but basic exit liquidity looks reasonable.";
    }
  }

  const shortPair = `${pairAddress.slice(0, 6)}…${pairAddress.slice(-4)}`;

  const details = [
    headline,
    "",
    `Detected pool on ${
      chain === "eth" ? "Uniswap V2-style DEX" : "PancakeSwap V2-style DEX"
    } with base pair ${base.symbol}.`,
    `• Token side reserve: ~${tokenReserve.toFixed(3)} tokens`,
    `• ${base.symbol} side reserve: ~${baseReserve.toFixed(3)} ${base.symbol}`,
    `• Pair address: ${shortPair}`,
    "",
    "This is a basic view of liquidity depth only. It does not yet analyse whether LP tokens are locked or who holds the LP – always check the pool on Etherscan/BscScan and any lock information from lockers like Unicrypt/TeamFinance/PinkLock."
  ].join("\n");

  return {
    id: "lp-health",
    label: "Liquidity & LP Health",
    level,
    details
  };
}

/**
 * Overall aggregation – simple but predictable:
 * any red => red, otherwise any yellow => yellow, else green.
 */
function aggregateOverallRisk(checks: RiskCheckResult[]): RiskLevel {
  if (checks.some(c => c.level === "red")) return "red";
  if (checks.some(c => c.level === "yellow")) return "yellow";
  return "green";
}

/**
 * API handler
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const tokenAddress = (body?.tokenAddress as string | undefined)?.trim();
    const chain = (body?.chain as Chain | undefined) ?? "eth";

    if (!tokenAddress || !ethers.isAddress(tokenAddress)) {
      return NextResponse.json(
        { error: "Invalid or missing token contract address." },
        { status: 400 }
      );
    }

    if (chain !== "eth" && chain !== "bsc") {
      return NextResponse.json(
        { error: "Unsupported chain. Use 'eth' or 'bsc'." },
        { status: 400 }
      );
    }

    const provider = getProvider(chain);

    const [ownership, honeypot, lpHealth] = await Promise.all([
      runOwnershipCheck(tokenAddress, chain, provider),
      runHoneypotCheck(tokenAddress, chain),
      analyzeLiquidityAndLpHealth(tokenAddress, chain, provider)
    ]);

    const checks: RiskCheckResult[] = [ownership, honeypot, lpHealth];

    const result: AggregatedRiskResult = {
      overall: aggregateOverallRisk(checks),
      checks
    };

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error("Unexpected scan error:", error);
    return NextResponse.json(
      {
        error:
          "Unexpected server error while scanning this token. Please try again in a moment."
      },
      { status: 500 }
    );
  }
}
