"use client";

import { useState } from "react";
import Image from "next/image";

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

type ExplainMode = "beginner" | "pro";

export default function HomePage() {
  const [tokenAddress, setTokenAddress] = useState("");
  const [chain, setChain] = useState<"eth" | "bsc">("eth");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AggregatedRiskResult | null>(null);
  const [error, setError] = useState("");
  const [explainMode, setExplainMode] = useState<ExplainMode>("beginner");
  const [lastScanAt, setLastScanAt] = useState<Date | null>(null);

  const handleScan = async () => {
    setError("");
    setResult(null);

    if (!tokenAddress.trim()) {
      setError("Paste a valid token contract address first.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenAddress: tokenAddress.trim(), chain })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Scan failed");
      }

      setResult(data as AggregatedRiskResult);
      setLastScanAt(new Date());
    } catch (err: any) {
      setError(err.message || "Something went wrong while scanning this token.");
    } finally {
      setLoading(false);
    }
  };

  const badgeColor = (level: RiskLevel) => {
    if (level === "green")
      return "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40";
    if (level === "yellow")
      return "bg-amber-500/15 text-amber-200 border border-amber-500/40";
    return "bg-red-500/15 text-red-300 border border-red-500/40";
  };

  const dotColor = (level: RiskLevel) => {
    if (level === "green") return "bg-emerald-400";
    if (level === "yellow") return "bg-amber-300";
    return "bg-red-400";
  };

  const labelFromLevel = (level: RiskLevel) => {
    if (level === "green") return "Green · Basic checks passed";
    if (level === "yellow") return "Yellow · Medium risk";
    return "Red · High rug / scam risk";
  };

  const truncateAddress = (addr: string) => {
    if (!addr) return "";
    const t = addr.trim();
    if (t.length <= 12) return t;
    return `${t.slice(0, 6)}…${t.slice(-4)}`;
  };

  // Beginner vs Pro explanation
  const getBeginnerSummary = (check: RiskCheckResult): string => {
    const isOwnership = check.label.toLowerCase().includes("ownership");
    const isHoneypot = check.label.toLowerCase().includes("honeypot");

    if (isOwnership) {
      if (check.level === "green") {
        return "Ownership looks okay. Either it’s renounced or handled in a way that is common for established projects.";
      }
      if (check.level === "yellow") {
        return "Contract is still controlled by a wallet. Team can change important settings, so there is real rug risk if they are not trusted.";
      }
      return "Ownership looks dangerous. This setup gives too much power to someone over the contract.";
    }

    if (isHoneypot) {
      if (check.level === "green") {
        return "No honeypot behaviour was detected in this basic check. You should still be careful, but it doesn’t look like an obvious trap.";
      }
      if (check.level === "yellow") {
        return "Honeypot checks were inconclusive or the token is not in the honeypot database. Treat it as unknown / risky and look deeper.";
      }
      return "High honeypot risk. This token may block sells or heavily tax trades – very likely a trap.";
    }

    // Fallback
    if (check.level === "green") {
      return "This signal looks fine and does not show obvious danger.";
    }
    if (check.level === "yellow") {
      return "There are some warning signs here. You should dig deeper before entering.";
    }
    return "This signal is strongly negative. Assume high risk unless proven otherwise.";
  };

  const renderDetails = (check: RiskCheckResult) => {
    if (explainMode === "pro") {
      return (
        <p className="text-[11px] leading-relaxed text-slate-300">
          {check.details}
        </p>
      );
    }

    // Beginner mode: simple summary + smaller technical details
    const summary = getBeginnerSummary(check);

    return (
      <div className="space-y-1">
        <p className="text-[11px] leading-relaxed text-slate-100">
          {summary}
        </p>
        <p className="text-[10px] leading-relaxed text-slate-500">
          <span className="font-semibold text-slate-400">
            Technical details:
          </span>{" "}
          {check.details}
        </p>
      </div>
    );
  };

  return (
    <main className="min-h-screen w-full flex items-center justify-center px-4 py-10">
      <div className="max-w-6xl w-full space-y-6 md:space-y-8">
        {/* Top brand / header */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* LOGO AREA – only this part changed to use your genie logo + cyan theme */}
            <div className="relative h-11 w-11 rounded-3xl bg-slate-900/80 border border-cyan-400/60 shadow-[0_0_25px_rgba(34,211,238,0.7)] flex items-center justify-center overflow-hidden">
              <Image
                src="/trendgenie-logo.png"
                alt="TrendGenie logo"
                width={44}
                height={44}
                priority
              />
              <span className="pulse-dot absolute h-2 w-2 bg-cyan-400 rounded-full -bottom-1 -right-1" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl md:text-2xl font-semibold tracking-tight">
                  TrendGenie · RugShield
                </h1>
                <span className="text-[10px] uppercase tracking-[0.2em] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-200 border border-cyan-500/40">
                  AI · WEB3 RISK ENGINE
                </span>
              </div>
              <p className="mt-1 text-xs md:text-sm text-slate-400 max-w-xl">
                Run instant traffic-light risk checks on ERC-20 tokens across Ethereum
                and BNB Chain, with explanations tailored for beginners or pro traders.
              </p>
            </div>
          </div>

          <div className="flex flex-col items-start md:items-end gap-2 text-[11px] text-slate-400">
            <span className="px-2.5 py-1 rounded-full bg-slate-900/70 border border-slate-700/80">
              🧪 Beta · Educational only · Not financial advice
            </span>
            <span className="px-2.5 py-1 rounded-full bg-slate-900/70 border border-slate-700/80">
              🔍 Honeypot.is · On-chain ownership · More signals coming soon
            </span>
          </div>
        </header>

        {/* Main scanner card */}
        <div className="card-glass rounded-3xl p-5 md:p-6 lg:p-7">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.3fr)] gap-6 lg:gap-8">
            {/* Left: input + meta */}
            <section className="space-y-5">
              {/* Input area */}
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-slate-200">
                    Scan a token
                  </h2>
                  <span className="text-[11px] text-slate-500">
                    Paste a contract from Etherscan / BscScan
                  </span>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Token contract address
                    </label>
                    <div className="flex flex-col gap-2">
                      <input
                        value={tokenAddress}
                        onChange={e => setTokenAddress(e.target.value)}
                        placeholder="0x…"
                        className="w-full rounded-xl bg-slate-950/80 border border-slate-700/80 px-3 py-2.5 text-sm outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-500/60 transition"
                      />
                      <p className="text-[11px] text-slate-500">
                        We never ask for private keys. Scanner runs read-only checks using
                        public RPC and risk APIs.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Network
                      </label>
                      <div className="inline-flex rounded-xl bg-slate-950/80 border border-slate-700/80 p-1">
                        <button
                          type="button"
                          onClick={() => setChain("eth")}
                          className={`px-3 py-1.5 text-xs md:text-sm rounded-lg font-medium transition ${
                            chain === "eth"
                              ? "bg-slate-100 text-slate-900 shadow-[0_0_20px_rgba(148,163,184,0.8)]"
                              : "text-slate-300 hover:bg-slate-800/80"
                          }`}
                        >
                          Ethereum
                        </button>
                        <button
                          type="button"
                          onClick={() => setChain("bsc")}
                          className={`ml-1 px-3 py-1.5 text-xs md:text-sm rounded-lg font-medium transition ${
                            chain === "bsc"
                              ? "bg-emerald-500 text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.7)]"
                              : "text-slate-300 hover:bg-slate-800/80"
                          }`}
                        >
                          BNB Chain
                        </button>
                      </div>
                    </div>

                    {/* Explain mode toggle */}
                    <div className="space-y-1">
                      <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-[0.16em]">
                        Explanation mode
                      </span>
                      <div className="inline-flex rounded-xl bg-slate-950/80 border border-slate-700/80 p-1">
                        <button
                          type="button"
                          onClick={() => setExplainMode("beginner")}
                          className={`px-3 py-1.5 text-[11px] rounded-lg font-medium transition ${
                            explainMode === "beginner"
                              ? "bg-sky-500 text-slate-950 shadow-[0_0_18px_rgba(56,189,248,0.7)]"
                              : "text-slate-300 hover:bg-slate-800/80"
                          }`}
                        >
                          Beginner
                        </button>
                        <button
                          type="button"
                          onClick={() => setExplainMode("pro")}
                          className={`ml-1 px-3 py-1.5 text-[11px] rounded-lg font-medium transition ${
                            explainMode === "pro"
                              ? "bg-slate-200 text-slate-900 shadow-[0_0_18px_rgba(226,232,240,0.35)]"
                              : "text-slate-300 hover:bg-slate-800/80"
                          }`}
                        >
                          Pro
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-500">
                        {explainMode === "beginner"
                          ? "Simple English: good for students & new traders."
                          : "More direct, technical wording for experienced users."}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/40 rounded-xl px-3 py-2">
                  {error}
                </div>
              )}

              {/* Scan button */}
              <button
                onClick={handleScan}
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 via-sky-400 to-amber-300 text-slate-950 text-sm font-semibold py-2.5 shadow-[0_0_25px_rgba(56,189,248,0.55)] disabled:opacity-60 disabled:shadow-none disabled:cursor-not-allowed transition"
              >
                {loading ? (
                  <>
                    <span className="h-3 w-3 rounded-full border-2 border-slate-900 border-t-transparent animate-spin" />
                    Scanning on-chain…
                  </>
                ) : (
                  <>
                    <span>Run safety scan</span>
                    <span className="text-xs opacity-80">⚡ ~2–5 seconds</span>
                  </>
                )}
              </button>

              {/* Helper bullets */}
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-slate-400">
                <div className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <p>
                    We never trade, approve, or move funds. Everything is read-only analysis on public data.
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-300" />
                  <p>
                    Green does not mean “safe forever”. Use this as an early warning system, not a replacement for research.
                  </p>
                </div>
              </div>
            </section>

            {/* Right: results panel */}
            <section className="space-y-4">
              {/* Overall summary */}
              <div className="rounded-2xl border border-slate-800/80 bg-slate-950/65 px-4 py-3 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-slate-400">
                      Overall safety snapshot
                    </p>
                    <p className="text-sm text-slate-200">
                      Combined read of ownership and honeypot behaviour for this token.
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      <span className="px-2 py-0.5 rounded-full bg-slate-900/80 border border-slate-700/80">
                        Network:{" "}
                        <span className="text-slate-200 font-medium">
                          {chain === "eth" ? "Ethereum" : "BNB Chain"}
                        </span>
                      </span>
                      {tokenAddress.trim() && (
                        <span className="px-2 py-0.5 rounded-full bg-slate-900/80 border border-slate-700/80">
                          Address:{" "}
                          <span className="text-slate-200 font-mono">
                            {truncateAddress(tokenAddress)}
                          </span>
                        </span>
                      )}
                      {lastScanAt && (
                        <span className="px-2 py-0.5 rounded-full bg-slate-900/80 border border-slate-700/80">
                          Last scan:{" "}
                          <span className="text-slate-200">
                            {lastScanAt.toLocaleTimeString()}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                      STATUS
                    </span>
                    <div className="inline-flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          result ? dotColor(result.overall) : "bg-slate-500"
                        }`}
                      />
                      <span
                        className={`text-[11px] px-2 py-1 rounded-full ${
                          result
                            ? badgeColor(result.overall)
                            : "bg-slate-800/80 text-slate-300 border border-slate-700/80"
                        }`}
                      >
                        {result ? labelFromLevel(result.overall) : "Waiting for scan"}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500">
                      Mode:{" "}
                      <span className="font-semibold text-slate-300">
                        {explainMode === "beginner" ? "Beginner-friendly" : "Pro / technical"}
                      </span>
                    </span>
                  </div>
                </div>

                {!result && !loading && (
                  <p className="text-[11px] text-slate-500">
                    Start with a known token like USDT, USDC, CAKE or any meme contract
                    you&apos;re unsure about. We&apos;ll highlight obvious red flags and
                    explain them in your selected mode.
                  </p>
                )}

                {loading && (
                  <div className="space-y-2">
                    <div className="h-2 w-24 rounded-full bg-slate-800 animate-pulse" />
                    <div className="h-2 w-40 rounded-full bg-slate-800 animate-pulse" />
                  </div>
                )}
              </div>

              {/* Detailed checks */}
              <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
                {result ? (
                  result.checks.map(check => (
                    <div
                      key={check.id}
                      className="rounded-2xl border border-slate-800/80 bg-slate-950/75 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 mb-1">
                            <div
                              className={`h-1.5 w-1.5 rounded-full ${dotColor(
                                check.level
                              )}`}
                            />
                            <h3 className="text-sm font-medium text-slate-200">
                              {check.label}
                            </h3>
                          </div>
                          {renderDetails(check)}
                        </div>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full self-start ${badgeColor(
                            check.level
                          )}`}
                        >
                          {check.level.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  !loading && (
                    <div className="rounded-2xl border border-dashed border-slate-700/70 bg-slate-950/40 px-4 py-5 text-[11px] text-slate-400">
                      <p className="mb-2 font-medium text-slate-300">
                        No token scanned yet.
                      </p>
                      <p className="mb-1">
                        Once you run a scan, each section here will break down a single
                        signal (ownership, honeypot, etc.).
                      </p>
                      <p>
                        In <span className="font-semibold text-slate-200">
                          Beginner
                        </span>{" "}
                        mode you get simplified language, and in{" "}
                        <span className="font-semibold text-slate-200">Pro</span> mode you
                        see more direct technical details.
                      </p>
                    </div>
                  )
                )}
              </div>

              {/* Footer note */}
              <p className="text-[10px] text-slate-500">
                This tool is for educational use only and does not constitute financial
                advice. Always verify results directly on Etherscan / BscScan, and never
                invest more than you can afford to lose.
              </p>
            </section>
          </div>
        </div>

        {/* 🔥 Roadmap / Next signals section (unchanged except one small text line) */}
        <section className="rounded-3xl border border-slate-800/80 bg-slate-950/70 backdrop-blur-xl p-5 md:p-6 lg:p-7">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-5">
            <div>
              <h2 className="text-sm md:text-base font-semibold text-slate-100 flex items-center gap-2">
                Next: Advanced Risk Signals
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/40">
                  Product roadmap
                </span>
              </h2>
              <p className="mt-1 text-[11px] md:text-xs text-slate-400 max-w-xl">
                This is the direction we&apos;re building TrendGenie&apos;s risk engine – so
                students, newcomers and pro traders all get institutional-grade tooling
                in a friendly UI.
              </p>
            </div>
            <div className="text-[11px] text-slate-400">
              <p>
                Focus:{" "}
                <span className="font-semibold text-slate-200">
                  LP safety · Holder distribution · Behaviour analytics
                </span>
              </p>
              <p className="text-[10px] text-slate-300">
                Stay tuned for updates as we roll out new features!
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
            {/* Card 1 – LP / Liquidity */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h3 className="text-sm font-semibold text-slate-100">
                    Phase 1 · LP & Liquidity Health
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-300 border border-sky-500/40">
                    In development
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Direct pool reads from Uniswap / PancakeSwap style DEXs to calculate:
                </p>
                <ul className="mt-1 space-y-1 text-[11px] text-slate-300 list-disc list-inside">
                  <li>LP lock status & remaining lock time</li>
                  <li>Share of liquidity held by deployer / dev wallets</li>
                  <li>Liquidity depth vs FDV (thin-liquidity rug patterns)</li>
                </ul>
              </div>
              <p className="mt-3 text-[10px] text-slate-300">
                Goal: show if the team can drain the pool or nuke price with small capital.
              </p>
            </div>

            {/* Card 2 – Top holders */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h3 className="text-sm font-semibold text-slate-100">
                    Phase 2 · Top Holders & Distribution
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-200 border border-amber-500/40">
                    Design stage
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Holder concentration analysis on-chain, not just from explorers:
                </p>
                <ul className="mt-1 space-y-1 text-[11px] text-slate-300 list-disc list-inside">
                  <li>Top 10 wallets & their % of supply</li>
                  <li>Tagging CEX, LP, burn addresses vs real whales</li>
                  <li>“One whale can nuke chart” warning when thresholds are hit</li>
                </ul>
              </div>
              <p className="mt-3 text-[10px] text-slate-300">
                Goal: make it obvious if a few wallets fully control the token&apos;s fate.
              </p>
            </div>

            {/* Card 3 – Behaviour / Alerts */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h3 className="text-sm font-semibold text-slate-100">
                    Phase 3 · Behaviour & Alerts
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/40">
                    Planned
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Historical behaviour & smart alerts for serious users:
                </p>
                <ul className="mt-1 space-y-1 text-[11px] text-slate-300 list-disc list-inside">
                  <li>Dev wallet funding / dumping patterns over time</li>
                  <li>Spikes in new holders vs wash trading patterns</li>
                  <li>Email / webhook alerts on critical risk changes</li>
                </ul>
              </div>
              <p className="mt-3 text-[10px] text-slate-300">
                Goal: evolve from “one-time scanner” into an always-on risk monitor.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
