// src/lib/viem.ts
import { createPublicClient, http } from "viem";
import { mainnet, bsc } from "viem/chains";

const mainnetRpc = process.env.MAINNET_RPC_URL;
const bscRpc = process.env.BSC_RPC_URL;

if (!mainnetRpc) {
  throw new Error("MAINNET_RPC_URL is not set in .env");
}

if (!bscRpc) {
  throw new Error("BSC_RPC_URL is not set in .env");
}

export const ethClient = createPublicClient({
  chain: mainnet,
  transport: http(mainnetRpc)
});

export const bscClient = createPublicClient({
  chain: bsc,
  transport: http(bscRpc)
});

export type SupportedChain = "eth" | "bsc";

export function getClient(chain: SupportedChain) {
  return chain === "eth" ? ethClient : bscClient;
}
