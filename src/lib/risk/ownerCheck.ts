// src/lib/risk/ownerCheck.ts

import { getAddress, isAddress } from "viem";
import { getClient, type SupportedChain } from "../viem";
import type { RiskCheckResult } from "./types";

const OWNABLE_ABI = [
  {
    inputs: [],
    name: "owner",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Known “infra” owner addresses jinko hum rug-risk nahi maan rahe
const TRUSTED_OWNERS: Record<SupportedChain, string[]> = {
  eth: [
    // yahan future me Uniswap / multisig addresses add kar sakte ho
  ],
  bsc: [
    "0x73feaa1eE314F8c655E354234017bE2193C9E24E" // PancakeSwap MasterChef / infra
  ]
};

function isTrustedOwner(chain: SupportedChain, owner: string): boolean {
  const list = TRUSTED_OWNERS[chain] ?? [];
  const lower = owner.toLowerCase();
  return list.some(addr => addr.toLowerCase() === lower);
}

export async function checkOwner(
  tokenAddress: string,
  chain: SupportedChain
): Promise<RiskCheckResult> {
  if (!isAddress(tokenAddress)) {
    return {
      id: "owner-invalid",
      label: "Contract Ownership",
      level: "red",
      details: "Invalid token address passed into ownership check."
    };
  }

  const client = getClient(chain);

  try {
    const owner = await client.readContract({
      address: getAddress(tokenAddress),
      abi: OWNABLE_ABI,
      functionName: "owner"
    });

    const ownerStr = (owner as string).toLowerCase();

    // 1) Renounced
    if (ownerStr === ZERO_ADDRESS.toLowerCase()) {
      return {
        id: "owner-renounced",
        label: "Contract Ownership",
        level: "green",
        details:
          "Ownership appears renounced (owner is the zero address). Dev can no longer change contract parameters via Ownable."
      };
    }

    // 2) Trusted infra owners (e.g. PancakeSwap)
    if (isTrustedOwner(chain, owner as string)) {
      return {
        id: "owner-trusted",
        label: "Contract Ownership",
        level: "green",
        details:
          `Ownership is held by a known infrastructure contract (${owner}). This pattern is common for established DeFi protocols and is not a direct rug signal, but you should still check the project docs.`
      };
    }

    // 3) Check if owner is EOA vs contract
    const code = await client.getCode({
      address: owner as `0x${string}`
    });

    const isEOA = !code || code === "0x";

    if (isEOA) {
      // EOA = private wallet -> real rug risk
      return {
        id: "owner-eoa",
        label: "Contract Ownership",
        level: "yellow",
        details:
          `Ownership is NOT renounced and is controlled by a normal wallet address (${owner}). ` +
          "This means the owner can potentially change critical parameters, mint/blacklist, or even block trading. Medium rug risk – only enter if you deeply trust the team."
      };
    }

    // 4) Owner is another contract (timelock / governance / farm)
    return {
      id: "owner-contract",
      label: "Contract Ownership",
      level: "green",
      details:
        `Ownership is held by another contract (${owner}). This is usually a governance, timelock, or farm contract. ` +
        "Not automatically safe, but far better than a single private wallet. Read project docs to understand how that owner contract works."
    };
  } catch (error: any) {
    // owner() nahi mila ya non-standard pattern
    return {
      id: "owner-unknown",
      label: "Contract Ownership",
      level: "green",
      details:
        "This token does not expose a standard owner() function, or the call failed. Many older/upgradeable tokens use different patterns. Treat this as neutral – check other signals like liquidity, holders, and honeypot risk."
    };
  }
}
