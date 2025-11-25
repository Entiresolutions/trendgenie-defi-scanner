// src/app/api/scan/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAddress } from "viem";
import { aggregateResults } from "@/lib/risk/aggregate";
import { checkOwner } from "@/lib/risk/ownerCheck";
import { checkHoneypot } from "@/lib/risk/honeypotCheck";
import type { SupportedChain } from "@/lib/viem";

const ScanInputSchema = z.object({
  tokenAddress: z.string().trim().min(1, "Token address is required"),
  chain: z.enum(["eth", "bsc"]).default("eth")
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tokenAddress, chain } = ScanInputSchema.parse(body);

    if (!isAddress(tokenAddress)) {
      return NextResponse.json(
        { error: "Invalid token address format." },
        { status: 400 }
      );
    }

    const ch = chain as SupportedChain;

    const [ownerResult, honeypotResult] = await Promise.all([
      checkOwner(tokenAddress, ch),
      checkHoneypot(tokenAddress, ch)
    ]);

    const aggregated = aggregateResults([ownerResult, honeypotResult]);

    return NextResponse.json(aggregated, { status: 200 });
  } catch (error: any) {
    console.error("Scan error:", error);
    return NextResponse.json(
      { error: "Invalid request or internal error." },
      { status: 400 }
    );
  }
}
