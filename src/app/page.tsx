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
  const [showAdvanced, setShowAdvanced] = useState(false); // ✅ advanced panel

  const currentYear = new Date().getFullYear();

  const handleScan = async () => {
    setError("");
    setResult(null);
    setShowAdvanced(false); // reset advanced panel on new scan

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

  const cardAccent = (level: RiskLevel) => {
    if (level === "green")
      return "border-l-2 border-l-emerald-400/90 shadow-[0_0_35px_rgba(16,185,129,0.35)]";
    if (level === "yellow")
      return "border-l-2 border-l-amber-400/90 shadow-[0_0_35px_rgba(251,191,36,0.35)]";
    return "border-l-2 border-l-red-500/90 shadow-[0_0_40px_rgba(248,113,113,0.4)]";
  };

  const labelFromLevel = (level: RiskLevel) => {
    if (level === "green") return "Green · Basic checks passed";
    if (level === "yellow") return "Yellow · Medium risk";
    return "Red · High rug or scam risk";
  };

  const truncateAddress = (addr: string) => {
    if (!addr) return "";
    const t = addr.trim();
    if (t.length <= 12) return t;
    return `${t.slice(0, 6)}…${t.slice(-4)}`;
  };

  const getBeginnerSummary = (check: RiskCheckResult): string => {
    const isOwnership = check.label.toLowerCase().includes("ownership");
    const isHoneypot = check.label.toLowerCase().includes("honeypot");

    if (isOwnership) {
      if (check.level === "green") {
        return "Ownership looks okay. Either it is renounced or handled in a way that is common for established projects.";
      }
      if (check.level === "yellow") {
        return "Contract is still controlled by a wallet. Team can change important settings, so there is real rug risk if they are not trusted.";
      }
      return "Ownership looks dangerous. This setup gives too much power to someone over the contract.";
    }

    if (isHoneypot) {
      if (check.level === "green") {
        return "No honeypot behaviour was detected in this basic check. You should still be careful, but it does not look like an obvious trap.";
      }
      if (check.level === "yellow") {
        return "Honeypot checks were inconclusive or the token is not in the honeypot database. Treat it as unknown or risky and look deeper.";
      }
      return "High honeypot risk. This token may block sells or heavily tax trades and is very likely a trap.";
    }

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

  // ✅ AI-style summary for the chip
  const getAiSummary = (r: AggregatedRiskResult): string => {
    const total = r.checks.length || 1;
    const green = r.checks.filter(c => c.level === "green").length;
    const yellow = r.checks.filter(c => c.level === "yellow").length;
    const red = r.checks.filter(c => c.level === "red").length;

    const ratio = `${green}/${total} green, ${yellow} warning, ${red} high risk`;

    if (r.overall === "green") {
      return `Most signals look healthy (${ratio}). Ownership and basic behaviour do not show obvious rug or honeypot patterns, but you should still cross-check liquidity, holders and recent activity before risking real size.`;
    }
    if (r.overall === "yellow") {
      return `Mixed picture (${ratio}). Some checks look fine, but one or more areas create real downside risk. Treat this as “proceed with caution” and investigate contract controls, liquidity and top holders manually.`;
    }
    return `Risk cluster detected (${ratio}). One or more checks strongly suggest rug or honeypot style behaviour. Treat this token as high risk and only engage after very careful manual verification — or avoid entirely.`;
  };

  const getExplorerUrl = () => {
    const addr = tokenAddress.trim();
    if (!addr) return null;
    const base =
      chain === "eth"
        ? "https://etherscan.io/token/"
        : "https://bscscan.com/token/";
    return `${base}${addr}`;
  };

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-slate-950 text-slate-50">
      {/* Animated background */}
      <div className="pointer-events-none absolute inset-0 -z-20">
        <div className="absolute -left-32 -top-32 h-80 w-80 rounded-full bg-cyan-500/25 blur-3xl tg-orb" />
        <div className="absolute right-[-6rem] top-20 h-96 w-96 rounded-full bg-purple-500/20 blur-3xl tg-orb-slow" />
        <div className="absolute bottom-[-6rem] left-1/3 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl tg-orb-medium" />
      </div>
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.7),transparent_60%),linear-gradient(to_right,rgba(30,64,175,0.24)_1px,transparent_1px),linear-gradient(to_bottom,rgba(30,64,175,0.24)_1px,transparent_1px)] bg-[size:100%_100%,80px_80px,80px_80px] opacity-60 [mask-image:radial-gradient(circle_at_center,black,transparent_70%)]" />

      <div className="relative z-10 flex items-stretch justify-center px-4 py-10 md:py-14">
        <div className="max-w-6xl w-full space-y-6 md:space-y-8">
          {/* Header */}
          <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="relative h-12 w-12">
                <div className="absolute inset-[-3px] rounded-3xl border border-cyan-400/40 bg-gradient-to-tr from-cyan-500/30 via-transparent to-sky-500/30 animate-spin-slow [mask-image:radial-gradient(circle_at_center,black,transparent_68%)]" />
                <div className="relative h-full w-full rounded-3xl bg-slate-950/90 border border-cyan-500/60 shadow-[0_0_35px_rgba(34,211,238,0.9)] flex items-center justify-center overflow-hidden backdrop-blur-2xl">
                  <Image
                    src="/trendgenie-logo.png"
                    alt="TrendGenie logo"
                    width={40}
                    height={40}
                    priority
                    className="tg-logo-glow"
                  />
                  <span className="tg-logo-pulse absolute inset-0 rounded-3xl" />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="bg-gradient-to-r from-cyan-200 via-sky-300 to-emerald-200 bg-clip-text text-transparent text-xl md:text-2xl font-semibold tracking-tight">
                    TrendGenie · RugShield
                  </h1>
                  <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] px-2.5 py-0.5 rounded-full bg-slate-950/80 border border-cyan-500/50 shadow-[0_0_18px_rgba(34,211,238,0.5)]">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-300" />
                    </span>
                    <span>AI · Web3 risk engine</span>
                  </span>
                </div>
                <p className="text-xs md:text-sm text-slate-300/90 max-w-xl">
                  An AI assisted DeFi safety panel that turns complex on chain
                  ownership and honeypot checks into a simple traffic light score
                  for Ethereum and BNB Chain.
                </p>
              </div>
            </div>

            <div className="flex flex-col items-start md:items-end gap-2 text-[11px] text-slate-400">
              <a
                href="https://play.google.com/store/apps/details?id=com.entiresolutions.trendgenie"
                target="_blank"
                rel="noreferrer"
                className="tg-btn-shimmer group inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-amber-300 px-4 py-1.5 text-[11px] font-semibold text-slate-900 shadow-[0_0_26px_rgba(56,189,248,0.8)] hover:shadow-[0_0_38px_rgba(56,189,248,1)] hover:-translate-y-px active:translate-y-0 transition-all duration-300"
              >
                <span className="text-base">⚡</span>
                <span className="flex flex-col items-start leading-tight">
                  <span>Get the TrendGenie Android app</span>
                  <span className="text-[10px] opacity-80">
                    Live on Google Play
                  </span>
                </span>
              </a>

              <div className="inline-flex flex-wrap gap-1.5">
                <span className="px-2.5 py-1 rounded-full bg-slate-950/80 border border-slate-700/80 flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-300 animate-pulse" />
                  <span>Beta · Educational only · Not financial advice</span>
                </span>
                <span className="px-2.5 py-1 rounded-full bg-slate-950/80 border border-slate-700/80">
                  Honeypot DB · Ownership checks · More signals coming soon
                </span>
              </div>
            </div>
          </header>

          {/* Intro */}
          <section className="card-glass rounded-3xl border border-slate-800/80 bg-slate-950/70 backdrop-blur-2xl p-4 md:p-5 space-y-3">
            <h2 className="text-sm md:text-base font-semibold text-slate-100 flex items-center gap-2">
              DeFi safety scanner for Ethereum and BNB Chain
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-900/80 border border-slate-700/80 text-slate-300">
                Read only · No wallet needed
              </span>
            </h2>
            <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
              TrendGenie RugShield uses on chain reads and external honeypot
              databases to help you understand if a token behaves like a honeypot,
              clear rug pattern, or higher risk smart contract. It keeps the logic
              under the hood and shows you an easy traffic light view that works
              for students, newcomers and pro DeFi traders.
            </p>
            <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
              Pair this web scanner with the{" "}
              <a
                href="https://play.google.com/store/apps/details?id=com.entiresolutions.trendgenie"
                target="_blank"
                rel="noreferrer"
                className="text-cyan-300 hover:text-cyan-200 underline underline-offset-2"
              >
                TrendGenie Android app
              </a>{" "}
              to watch trending coins, market sentiment and news while keeping a
              separate panel open for deeper risk checks on Ethereum and BNB Chain.
            </p>
            <ul className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] text-slate-300">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.9)]" />
                <span>
                  Honeypot and ownership checks for ERC-20 style tokens on Ethereum
                  and BNB Smart Chain.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.9)]" />
                <span>
                  Beginner mode explains risk in simple English, pro mode keeps more
                  technical language.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.9)]" />
                <span>
                  Built for DeFi risk education, crypto safety awareness and web3
                  security learning.
                </span>
              </li>
            </ul>
          </section>

          {/* Scanner */}
          <div className="card-glass rounded-3xl p-5 md:p-6 lg:p-7 border border-slate-800/80">
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.3fr)] gap-6 lg:gap-8">
              {/* Left: inputs */}
              <section className="space-y-5">
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/80 border border-slate-700/80 text-[11px]">
                        1
                      </span>
                      Scan a token
                    </h2>
                    <span className="text-[11px] text-slate-500 flex items-center gap-1.5">
                      <span className="text-xs">🔗</span>
                      Paste a contract from Etherscan or BscScan
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-300 mb-1.5">
                        <span className="text-[11px]">Token contract address</span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-900/90 border border-slate-700/90 px-1.5 py-0.5 text-[9px] text-slate-400">
                          <span>🔒</span>
                          <span>Read only</span>
                        </span>
                      </label>
                      <div className="flex flex-col gap-2">
                        <div className="relative">
                          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-500">
                            0x
                          </span>
                          <input
                            value={tokenAddress}
                            onChange={e => setTokenAddress(e.target.value)}
                            placeholder="Paste contract here, for example from USDT or a meme coin you are unsure about"
                            className="w-full rounded-2xl bg-slate-950/80 border border-slate-800/90 pl-8 pr-3 py-2.5 text-xs md:text-sm text-slate-100 outline-none focus-visible:border-cyan-400 focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:shadow-[0_0_0_1px_rgba(34,211,238,0.65)] transition-all duration-200 tg-input-glow"
                          />
                          <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center gap-1.5 text-[10px] text-slate-500">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.9)]" />
                            <span>Never asks for keys</span>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          The scanner uses public RPC and risk APIs only. It never moves
                          funds, signs messages or connects to your wallet.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-medium text-slate-300">
                          Network
                        </label>
                        <div className="inline-flex rounded-2xl bg-slate-950/80 border border-slate-800/90 p-1 shadow-inner">
                          <button
                            type="button"
                            onClick={() => setChain("eth")}
                            className={`px-3 py-1.5 text-xs md:text-sm rounded-xl font-medium transition-all duration-200 flex items-center gap-1.5 ${
                              chain === "eth"
                                ? "bg-slate-100 text-slate-900 shadow-[0_0_20px_rgba(148,163,184,0.9)] scale-[1.02]"
                                : "text-slate-300 hover:bg-slate-900/80 hover:text-slate-50"
                            }`}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            <span>Ethereum</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setChain("bsc")}
                            className={`ml-1 px-3 py-1.5 text-xs md:text-sm rounded-xl font-medium transition-all duration-200 flex items-center gap-1.5 ${
                              chain === "bsc"
                                ? "bg-emerald-500 text-slate-950 shadow-[0_0_22px_rgba(16,185,129,0.85)] scale-[1.02]"
                                : "text-slate-300 hover:bg-slate-900/80 hover:text-slate-50"
                            }`}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
                            <span>BNB Chain</span>
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-[0.16em]">
                          Explanation mode
                        </span>
                        <div className="inline-flex rounded-2xl bg-slate-950/80 border border-slate-800/90 p-1">
                          <button
                            type="button"
                            onClick={() => setExplainMode("beginner")}
                            className={`px-3 py-1.5 text-[11px] rounded-xl font-medium transition-all duration-200 flex items-center gap-1.5 ${
                              explainMode === "beginner"
                                ? "bg-sky-500 text-slate-950 shadow-[0_0_20px_rgba(56,189,248,0.85)] scale-[1.02]"
                                : "text-slate-300 hover:bg-slate-900/80 hover:text-slate-50"
                            }`}
                          >
                            <span className="text-xs">🎓</span>
                            <span>Beginner</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setExplainMode("pro")}
                            className={`ml-1 px-3 py-1.5 text-[11px] rounded-xl font-medium transition-all duration-200 flex items-center gap-1.5 ${
                              explainMode === "pro"
                                ? "bg-slate-200 text-slate-900 shadow-[0_0_20px_rgba(226,232,240,0.65)] scale-[1.02]"
                                : "text-slate-300 hover:bg-slate-900/80 hover:text-slate-50"
                            }`}
                          >
                            <span className="text-xs">⚙️</span>
                            <span>Pro</span>
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-500">
                          {explainMode === "beginner"
                            ? "Simple English summaries for students and new traders."
                            : "More direct and technical wording for experienced users."}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="text-xs text-red-200 bg-red-500/10 border border-red-500/50 rounded-xl px-3 py-2 flex items-start gap-2 tg-error-shake">
                    <span className="mt-0.5 text-sm">⚠️</span>
                    <p>{error}</p>
                  </div>
                )}

                <button
                  onClick={handleScan}
                  disabled={loading}
                  className="group w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 via-sky-400 to-amber-300 text-slate-950 text-sm font-semibold py-2.5 shadow-[0_0_28px_rgba(56,189,248,0.7)] disabled:opacity-60 disabled:shadow-none disabled:cursor-not-allowed transition-all duration-200 hover:-translate-y-[1px] active:translate-y-0 relative overflow-hidden tg-btn-shimmer"
                >
                  <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-white/8 mix-blend-overlay" />
                  {loading ? (
                    <>
                      <span className="h-3 w-3 rounded-full border-2 border-slate-900 border-t-transparent animate-spin" />
                      <span>Scanning on chain</span>
                      <span className="text-xs opacity-80">
                        AI assisted risk pass
                      </span>
                    </>
                  ) : (
                    <>
                      <span>Run safety scan</span>
                      <span className="text-xs opacity-80">
                        ~ 2 to 5 seconds
                      </span>
                    </>
                  )}
                </button>

                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-slate-400">
                  <div className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.9)]" />
                    <p>
                      Scanner never trades, approves or moves funds. It is a
                      read only education tool on public blockchain data.
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.9)]" />
                    <p>
                      Green does not mean safe forever. Use this as an early
                      warning layer, not a replacement for your own research.
                    </p>
                  </div>
                </div>
              </section>

              {/* Right: results */}
              <section className="space-y-4">
                {/* Overall snapshot */}
                <div className="relative rounded-2xl border border-slate-800/90 bg-slate-950/75 px-4 py-3 flex flex-col gap-3 overflow-hidden">
                  <div className="absolute inset-px rounded-2xl bg-gradient-to-br from-cyan-500/5 via-transparent to-emerald-500/5 pointer-events-none" />
                  <div className="relative flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-900/90 border border-slate-700/80 text-[9px]">
                          2
                        </span>
                        Overall safety snapshot
                      </p>
                      <p className="text-sm text-slate-200">
                        Combined view of ownership and honeypot behaviour for this
                        contract.
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                        <span className="px-2 py-0.5 rounded-full bg-slate-950/90 border border-slate-800/90">
                          Network:{" "}
                          <span className="text-slate-200 font-medium">
                            {chain === "eth" ? "Ethereum" : "BNB Chain"}
                          </span>
                        </span>
                        {tokenAddress.trim() && (
                          <span className="px-2 py-0.5 rounded-full bg-slate-950/90 border border-slate-800/90 flex items-center gap-1">
                            Address:{" "}
                            <span className="text-slate-200 font-mono">
                              {truncateAddress(tokenAddress)}
                            </span>
                          </span>
                        )}
                        {lastScanAt && (
                          <span className="px-2 py-0.5 rounded-full bg-slate-950/90 border border-slate-800/90 flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span>
                              Last scan at{" "}
                              <span className="text-slate-200">
                                {lastScanAt.toLocaleTimeString()}
                              </span>
                            </span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                        Status
                      </span>
                      <div className="inline-flex items-center gap-2">
                        <span className="relative flex h-3 w-3 items-center justify-center">
                          {result ? (
                            <>
                              <span
                                className={`absolute inline-flex h-full w-full rounded-full opacity-50 animate-ping ${dotColor(
                                  result.overall
                                )}`}
                              />
                              <span
                                className={`relative inline-flex h-2 w-2 rounded-full ${dotColor(
                                  result.overall
                                )}`}
                              />
                            </>
                          ) : (
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-slate-500" />
                          )}
                        </span>
                        <span
                          className={`text-[11px] px-2 py-1 rounded-full ${
                            result
                              ? badgeColor(result.overall)
                              : "bg-slate-900/80 text-slate-300 border border-slate-700/80"
                          }`}
                        >
                          {result ? labelFromLevel(result.overall) : "Waiting for scan"}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500">
                        Mode:{" "}
                        <span className="font-semibold text-slate-300">
                          {explainMode === "beginner"
                            ? "Beginner friendly"
                            : "Pro and technical"}
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="relative space-y-2">
                    {!result && !loading && (
                      <p className="text-[11px] text-slate-500">
                        Start with a known token like USDT, USDC, CAKE or any meme
                        contract you are unsure about. The panel will highlight
                        obvious red flags and explain them in your selected mode.
                      </p>
                    )}

                    {loading && (
                      <div className="space-y-2">
                        <div className="h-2.5 w-32 rounded-full bg-slate-800/80 animate-pulse" />
                        <div className="h-2.5 w-48 rounded-full bg-slate-800/80 animate-pulse" />
                      </div>
                    )}

                    {/* ✅ AI explanation chip */}
                    {result && !loading && (
                      <div className="mt-1 inline-flex items-start gap-2 rounded-2xl bg-slate-950/90 border border-slate-800/80 px-3 py-2 text-[11px] text-slate-200 tg-fade-in">
                        <span className="mt-0.5 text-xs">✨</span>
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-100 mb-0.5">
                            AI explanation
                          </span>
                          <span className="text-slate-300">
                            {getAiSummary(result)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Detailed checks */}
                <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1 scroll-scan">
                  {loading && (
                    <>
                      {[1, 2, 3].map(i => (
                        <div
                          key={i}
                          className="relative rounded-2xl border border-slate-800/80 bg-slate-950/70 px-4 py-3 overflow-hidden tg-fade-in"
                          style={{ animationDelay: `${i * 80}ms` }}
                        >
                          <div className="absolute inset-0 bg-gradient-to-br from-slate-900/60 to-slate-950/80" />
                          <div className="relative space-y-2">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-1.5 rounded-full bg-slate-700 animate-pulse" />
                              <div className="h-2.5 w-32 rounded-full bg-slate-800 animate-pulse" />
                            </div>
                            <div className="h-2 w-full rounded-full bg-slate-800 animate-pulse" />
                            <div className="h-2 w-3/4 rounded-full bg-slate-800 animate-pulse" />
                          </div>
                        </div>
                      ))}
                    </>
                  )}

                  {!loading && result && (
                    <>
                      {result.checks.map((check, index) => (
                        <div
                          key={check.id}
                          className={`relative group rounded-2xl border border-slate-800/80 bg-slate-950/80 px-4 py-3 overflow-hidden transition-all duration-300 hover:-translate-y-[2px] hover:border-slate-100/25 hover:shadow-[0_18px_45px_rgba(15,23,42,0.9)] tg-fade-in ${cardAccent(
                            check.level
                          )}`}
                          style={{ animationDelay: `${index * 80}ms` }}
                        >
                          <div className="pointer-events-none absolute -top-6 -right-6 h-12 w-12 rounded-full bg-gradient-to-br from-slate-700/50 via-transparent to-transparent opacity-60 group-hover:opacity-90 transition-opacity duration-300" />
                          <div className="pointer-events-none absolute -bottom-6 -left-6 h-12 w-12 rounded-full bg-gradient-to-tr from-slate-700/50 via-transparent to-transparent opacity-60 group-hover:opacity-90 transition-opacity duration-300" />

                          <div className="relative flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 mb-1">
                                <div
                                  className={`relative h-2 w-2 rounded-full ${dotColor(
                                    check.level
                                  )}`}
                                >
                                  <span className="absolute inset-0 rounded-full bg-white/40 opacity-0 group-hover:opacity-60 transition-opacity duration-300 blur-[2px]" />
                                </div>
                                <h3 className="text-sm font-medium text-slate-100">
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
                      ))}
                    </>
                  )}

                  {!loading && !result && (
                    <div className="rounded-2xl border border-dashed border-slate-700/80 bg-slate-950/50 px-4 py-5 text-[11px] text-slate-400 tg-fade-in">
                      <p className="mb-2 font-medium text-slate-300 flex items-center gap-1.5">
                        <span className="text-sm">👀</span>
                        <span>No token scanned yet</span>
                      </p>
                      <p className="mb-1">
                        After you run a scan, this area will show each signal in its own
                        card, such as ownership, honeypot checks and more.
                      </p>
                      <p>
                        In{" "}
                        <span className="font-semibold text-slate-200">
                          Beginner
                        </span>{" "}
                        mode you get simplified language first, and in{" "}
                        <span className="font-semibold text-slate-200">Pro</span> mode
                        you see more direct technical details.
                      </p>
                    </div>
                  )}
                </div>

                {/* ✅ Advanced panel (progressive disclosure) */}
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(v => !v)}
                    className="w-full flex items-center justify-between rounded-2xl border border-slate-800/90 bg-slate-950/80 px-3 py-2 text-[11px] text-slate-300 hover:border-cyan-400/60 hover:bg-slate-900/90 transition-all duration-200"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-xs">🧠</span>
                      <span className="font-medium">
                        Advanced panel: what to check next
                      </span>
                    </span>
                    <span
                      className={`text-xs transform transition-transform duration-200 ${
                        showAdvanced ? "rotate-180" : "rotate-0"
                      }`}
                    >
                      ▾
                    </span>
                  </button>

                  {showAdvanced && (
                    <div className="mt-2 rounded-2xl border border-slate-800/90 bg-slate-950/80 px-3.5 py-3 text-[11px] text-slate-300 space-y-2 tg-fade-in">
                      <p className="text-slate-200 font-medium flex items-center gap-1.5">
                        <span className="text-xs">🔍</span>
                        <span>Deeper manual checks</span>
                      </p>
                      <ul className="list-disc list-inside space-y-1 text-slate-300">
                        <li>
                          Confirm contract source and settings directly on{" "}
                          {chain === "eth" ? "Etherscan" : "BscScan"} (trading status,
                          blacklist, max wallet, fee logic).
                        </li>
                        <li>
                          Review liquidity: LP lock, who holds LP tokens and whether
                          liquidity is thick enough for your position size.
                        </li>
                        <li>
                          Inspect top holders and recent transfers for dev wallets,
                          fresh wallets dumping and concentrated supply.
                        </li>
                      </ul>

                      {getExplorerUrl() && (
                        <p className="pt-1 border-t border-slate-800/80 text-slate-400">
                          Explorer shortcut:{" "}
                          <a
                            href={getExplorerUrl()!}
                            target="_blank"
                            rel="noreferrer"
                            className="text-cyan-300 hover:text-cyan-200 underline underline-offset-2"
                          >
                            Open this token on{" "}
                            {chain === "eth" ? "Etherscan" : "BscScan"}
                          </a>
                        </p>
                      )}

                      <p className="text-[10px] text-slate-500">
                        The scanner gives you a fast, opinionated read. The advanced
                        layer is where you cross-check everything before you size real
                        trades.
                      </p>
                    </div>
                  )}
                </div>

                <p className="text-[10px] text-slate-500">
                  This tool is for educational use only and is not financial advice.
                  Always verify results directly on Etherscan or BscScan, and never
                  invest more than you can afford to lose.
                </p>
              </section>
            </div>
          </div>

          {/* Roadmap */}
          <section className="card-glass rounded-3xl border border-slate-800/80 bg-slate-950/70 backdrop-blur-2xl p-5 md:p-6 lg:p-7">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-5">
              <div>
                <h2 className="text-sm md:text-base font-semibold text-slate-100 flex items-center gap-2">
                  Next: Advanced risk signals
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse" />
                    <span>Product roadmap</span>
                  </span>
                </h2>
                <p className="mt-1 text-[11px] md:text-xs text-slate-400 max-w-xl">
                  TrendGenie is moving toward more institutional DeFi tool
                  while keeping the UI friendly for students, new traders and pro
                  users at the same time.
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
                  Watch this space as we roll out new panels and automation.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
              <div className="relative rounded-2xl border border-sky-500/35 bg-slate-950/85 p-4 flex flex-col justify-between overflow-hidden tg-roadmap-card">
                <div className="absolute inset-0 bg-gradient-to-br from-sky-500/15 via-transparent to-slate-950/90 pointer-events-none" />
                <div className="relative space-y-2">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-slate-100">
                      Phase 1 · LP and liquidity health
                    </h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-200 border border-sky-500/40">
                      In testing
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Direct pool reads from Uniswap and PancakeSwap style DEXs:
                  </p>
                  <ul className="mt-1 space-y-1 text-[11px] text-slate-300 list-disc list-inside">
                    <li>LP lock status and remaining lock time</li>
                    <li>Share of liquidity held by deployer or dev wallets</li>
                    <li>Liquidity depth versus FDV for thin liquidity rugs</li>
                  </ul>
                </div>
                <p className="relative mt-3 text-[10px] text-slate-300">
                  Goal: show if the team can drain the pool or nuke price with
                  relatively small capital.
                </p>
              </div>

              <div className="relative rounded-2xl border border-amber-500/35 bg-slate-950/85 p-4 flex flex-col justify-between overflow-hidden tg-roadmap-card">
                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/15 via-transparent to-slate-950/90 pointer-events-none" />
                <div className="relative space-y-2">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-slate-100">
                      Phase 2 · Top holders and distribution
                    </h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-100 border border-amber-500/40">
                      Design stage
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Holder concentration and labeling that goes beyond the explorer:
                  </p>
                  <ul className="mt-1 space-y-1 text-[11px] text-slate-300 list-disc list-inside">
                    <li>Top 10 wallets and their share of supply</li>
                    <li>Tagging CEX, LP and burn addresses versus real whales</li>
                    <li>Warnings when a single whale can destroy the chart</li>
                  </ul>
                </div>
                <p className="relative mt-3 text-[10px] text-slate-300">
                  Goal: make it obvious when a handful of wallets fully control the
                  token.
                </p>
              </div>

              <div className="relative rounded-2xl border border-emerald-500/35 bg-slate-950/85 p-4 flex flex-col justify-between overflow-hidden tg-roadmap-card">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/15 via-transparent to-slate-950/90 pointer-events-none" />
                <div className="relative space-y-2">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-slate-100">
                      Phase 3 · Behaviour and alerts
                    </h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-100 border border-emerald-500/40">
                      Planned
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Historical behaviour and smart alerts for serious users:
                  </p>
                  <ul className="mt-1 space-y-1 text-[11px] text-slate-300 list-disc list-inside">
                    <li>Dev wallet funding and dumping patterns over time</li>
                    <li>New holder spikes versus wash trading signatures</li>
                    <li>Email or webhook alerts on critical risk changes</li>
                  </ul>
                </div>
                <p className="relative mt-3 text-[10px] text-slate-300">
                  Goal: move from one time scanner to an always on risk monitor.
                </p>
              </div>
            </div>
          </section>

          {/* Footer */}
          <footer className="border-t border-slate-800/80 pt-4 mt-4 pb-2 flex flex-col md:flex-row md:items-center md:justify-between gap-2 text-[11px] md:text-xs text-slate-500">
            <div className="flex flex-wrap items-center gap-2">
              <span>© {currentYear} TrendGenie · Built by Entire Solutions</span>
              <span className="hidden md:inline text-slate-600">·</span>
              <a
                href="https://trendgenie.io"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-cyan-300"
              >
                trendgenie.io
              </a>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <a
                href="https://play.google.com/store/apps/details?id=com.entiresolutions.trendgenie"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-cyan-300"
              >
                Android app on Google Play
              </a>
              <span className="text-[10px] text-slate-200">
                Use the web scanner for deep risk checks and the Android app to watch
                trending coins on the go.
              </span>
            </div>
          </footer>
        </div>
      </div>
    </main>
  );
}
