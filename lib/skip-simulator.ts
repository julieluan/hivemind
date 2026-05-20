// ============================================================================
// Skip-day agent simulator
//
// When the user clicks "Skip N days", we don't want the hive to freeze —
// agents should still trade (with their personalities, public/private leans
// and occasional deception) so the end-game recap reflects a coherent journey.
//
// Calling the real LLM for 10 agents × N days is too slow for Vercel's 60s
// function limit. Instead, this module produces deterministic per-agent
// decisions for each day, driven by:
//   1. The actual price action that day (open/close/momentum)
//   2. The agent's tactical personality (momentum / contrarian / risk_cut / …)
//
// Deception (public ≠ private) is sampled per personality (e.g. Catherine
// the influencer lies ~30% of the time, the macro economists ~5%, the
// permabull ~0%) so the recap still has 🎭 events to surface.
// ============================================================================

import type { ActionType, DaySummary, PriceBar, AgentPortfolio } from "./types";
import { ALL_AGENTS } from "./agents";

type Lean = "long" | "short" | "neutral";
type Personality =
  | "momentum"
  | "contrarian"
  | "panic_fomo"
  | "buy_dip"
  | "short_focused"
  | "risk_cut"
  | "neutral";

// Mirrors the AGENT_PERSONALITY map in viz_app_sim.py
const PERSONALITY: Record<string, Personality> = {
  super_influencer_001: "contrarian",
  pod_pm_001: "risk_cut",
  activist_short_001: "short_focused",
  cta_forced_001: "momentum",
  retail_fomo_001: "panic_fomo",
  permabull_001: "buy_dip",
  day_trader_001: "momentum",
};

// Per-personality probability of saying one thing in public and doing another
const DECEPTION_RATE: Record<Personality, number> = {
  contrarian: 0.30, // Cathie talks her book
  risk_cut: 0.18,
  short_focused: 0.10,
  momentum: 0.05,
  panic_fomo: 0.05,
  buy_dip: 0.02,
  neutral: 0.08,
};

// Seedable RNG for deterministic replays
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function pickLean(personality: Personality, dayRet: number, rng: () => number): {
  privateLean: Lean;
  privateConv: number;
  publicLean: Lean;
  publicConv: number;
} {
  // True belief — mostly aligned with personality + day action
  let privateLean: Lean = "neutral";
  let privateConv = 0.5;

  if (personality === "momentum") {
    privateLean = dayRet > 0.005 ? "long" : dayRet < -0.005 ? "short" : "neutral";
    privateConv = Math.min(0.85, 0.5 + Math.abs(dayRet) * 12);
  } else if (personality === "contrarian") {
    privateLean = dayRet < -0.02 ? "long" : dayRet > 0.04 ? "short" : "long";
    privateConv = 0.65 + rng() * 0.20;
  } else if (personality === "panic_fomo") {
    privateLean = dayRet > 0 ? "long" : "short";
    privateConv = Math.min(0.9, 0.4 + Math.abs(dayRet) * 20);
  } else if (personality === "buy_dip") {
    privateLean = "long";
    privateConv = 0.70 + rng() * 0.15;
  } else if (personality === "short_focused") {
    privateLean = "short";
    privateConv = 0.65 + rng() * 0.20;
  } else if (personality === "risk_cut") {
    privateLean = Math.abs(dayRet) > 0.02 ? "neutral" : dayRet > 0 ? "long" : "short";
    privateConv = 0.40 + rng() * 0.15;
  } else {
    privateLean = dayRet > 0 ? "long" : dayRet < 0 ? "short" : "neutral";
    privateConv = 0.45 + rng() * 0.20;
  }

  // Public — same as private most of the time, deceptive otherwise
  const deceive = rng() < DECEPTION_RATE[personality];
  let publicLean: Lean = privateLean;
  let publicConv = privateConv * (0.85 + rng() * 0.15);
  if (deceive && privateLean !== "neutral") {
    publicLean = privateLean === "long" ? "short" : "long";
    publicConv = 0.4 + rng() * 0.3;
  }
  return { privateLean, privateConv, publicLean, publicConv };
}

function pickAction(personality: Personality, dayRet: number, rng: () => number): {
  action: ActionType;
  sizePct: number;
} {
  if (personality === "momentum") {
    if (dayRet > 0.01) return { action: "buy_lite", sizePct: 0.25 };
    if (dayRet < -0.01) return { action: "sell_lite", sizePct: 0.25 };
    return { action: "hold", sizePct: 0 };
  }
  if (personality === "contrarian") {
    if (dayRet < -0.025) return { action: "buy_lite", sizePct: 0.35 + rng() * 0.20 };
    if (dayRet > 0.04) return { action: "sell_lite", sizePct: 0.20 };
    return rng() < 0.4 ? { action: "buy_lite", sizePct: 0.15 } : { action: "hold", sizePct: 0 };
  }
  if (personality === "panic_fomo") {
    if (dayRet > 0.02) return { action: "buy_strong", sizePct: 0.85 };
    if (dayRet < -0.02) return { action: "sell_strong", sizePct: 1.0 };
    return rng() < 0.3 ? { action: "buy_lite", sizePct: 0.5 } : { action: "hold", sizePct: 0 };
  }
  if (personality === "buy_dip") {
    if (dayRet < -0.01) return { action: "buy_lite", sizePct: 0.40 };
    if (dayRet < 0.005) return { action: "buy_lite", sizePct: 0.15 };
    return { action: "hold", sizePct: 0 };
  }
  if (personality === "short_focused") {
    if (dayRet > 0.02) return { action: "buy_lite", sizePct: 0.20 }; // cover
    if (dayRet < -0.01) return { action: "sell_lite", sizePct: 0.30 };
    return { action: "hold", sizePct: 0 };
  }
  if (personality === "risk_cut") {
    if (Math.abs(dayRet) > 0.03) return { action: "sell_lite", sizePct: 0.30 };
    return { action: "hold", sizePct: 0 };
  }
  // neutral / no portfolio (sell_side, economists) → always hold
  return { action: "hold", sizePct: 0 };
}

// ─── Apply same logic as store's applyAgentAction (kept local to avoid cycle)
function updateCostBasis(
  oldShares: number,
  oldBasis: number,
  buyShares: number,
  fillPrice: number
): number {
  const newShares = oldShares + buyShares;
  if (newShares <= 0) return 0;
  return (oldShares * oldBasis + buyShares * fillPrice) / newShares;
}

function applyActionLocal(
  port: AgentPortfolio,
  action: ActionType,
  sizePct: number,
  fillPrice: number
): AgentPortfolio {
  if (fillPrice <= 0) return port;
  const sz = Math.max(0, Math.min(1, sizePct || 0));
  let cash = port.cash;
  let shares = port.shares;
  let basis = port.costBasis;

  if (action === "buy_strong" || action === "buy_lite") {
    const useFrac = action === "buy_strong" ? Math.max(0.7, sz) : sz || 0.3;
    const cashToUse = Math.max(0, cash * useFrac);
    const buyShares = Math.floor(cashToUse / fillPrice);
    if (buyShares > 0) {
      const cost = buyShares * fillPrice;
      basis = updateCostBasis(shares, basis, buyShares, fillPrice);
      cash -= cost;
      shares += buyShares;
    }
  } else if (action === "sell_strong" || action === "sell_lite") {
    const useFrac = action === "sell_strong" ? 1.0 : sz || 0.3;
    const sellShares = Math.floor(shares * useFrac);
    if (sellShares > 0) {
      cash += sellShares * fillPrice;
      shares -= sellShares;
      if (shares === 0) basis = 0;
    }
  }
  return { ...port, cash, shares, costBasis: basis };
}

// ─── Public API ──────────────────────────────────────────────────────────────
// Simulate skipped days for all agents with a portfolio. Returns updated
// portfolios + a day-summary entry per simulated day (so the recap heatmap +
// per-agent table get filled in).
export function simulateSkippedDays(args: {
  bars: PriceBar[];
  portfolios: Record<string, AgentPortfolio>;
  seed?: number;
}): {
  portfolios: Record<string, AgentPortfolio>;
  daySummaries: DaySummary[];
} {
  const { bars, portfolios } = args;
  const rng = makeRng(args.seed ?? 17);
  const nextPortfolios = { ...portfolios };
  const summaries: DaySummary[] = [];

  for (const bar of bars) {
    const dayRet = bar.open > 0 ? (bar.close - bar.open) / bar.open : 0;
    const summaryAgents: DaySummary["agents"] = [];
    let buyUsd = 0;
    let sellUsd = 0;
    let totalCap = 0;

    for (const agent of ALL_AGENTS) {
      if (!agent.hasPortfolio || agent.capital <= 0) continue;
      const personality = PERSONALITY[agent.id] ?? "neutral";
      const beliefs = pickLean(personality, dayRet, rng);
      const { action, sizePct } = pickAction(personality, dayRet, rng);

      // Apply to portfolio at OPEN
      const before = nextPortfolios[agent.id];
      if (before) {
        const after = applyActionLocal(before, action, sizePct, bar.open);
        nextPortfolios[agent.id] = after;
        // Notional flow for net pressure
        const cashDelta = after.cash - before.cash;
        if (cashDelta < 0) buyUsd += -cashDelta;
        else if (cashDelta > 0) sellUsd += cashDelta;
        totalCap += before.initialCapital;
      }

      summaryAgents.push({
        agentId: agent.id,
        publicLean: beliefs.publicLean,
        publicConv: beliefs.publicConv,
        privateLean: beliefs.privateLean,
        privateConv: beliefs.privateConv,
        action,
        deception:
          beliefs.publicLean !== beliefs.privateLean && beliefs.privateLean !== "neutral",
      });
    }

    const netPressure =
      totalCap > 0 ? Math.max(-1, Math.min(1, (buyUsd - sellUsd) / totalCap)) : 0;
    summaries.push({
      date: bar.date,
      netPressure,
      agents: summaryAgents,
    });
  }

  return { portfolios: nextPortfolios, daySummaries: summaries };
}
