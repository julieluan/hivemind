// ============================================================================
// Compose the user-side prompt that frames today's market context + peer posts.
// System prompt comes from agents.ts; this fills in the dynamic context.
// ============================================================================

import type {
  AgentConfig,
  AgentDecision,
  MarketContext,
  UserPortfolio,
  PrivateBelief,
  PublicStatement,
  PersonalAction,
} from "./types";
import { SIZING_ADDENDUM } from "./agents";

// ─── Info-tier filtering: each agent sees different data ────────────────────
export function buildMarketView(market: MarketContext, infoTier: number): string {
  const last = market.history[market.history.length - 1];
  const prev =
    market.history.length > 1 ? market.history[market.history.length - 2] : last;
  const pct1d = prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : 0;

  const lines = [
    `Ticker: ${market.ticker}`,
    `Current price: $${last.close.toFixed(2)}`,
    `Today change: ${pct1d >= 0 ? "+" : ""}${pct1d.toFixed(2)}%`,
    `Last 5 closes: ${market.history
      .slice(-5)
      .map((b) => `$${b.close.toFixed(2)}`)
      .join(", ")}`,
  ];

  if (infoTier >= 1) {
    lines.push(`\n[TIER 1 — Retail headlines + chart]`);
    if (market.sma20)
      lines.push(
        `20-day SMA: $${market.sma20.toFixed(2)} (${
          last.close > market.sma20 ? "above" : "below"
        })`
      );
    if (market.mom5d !== undefined)
      lines.push(`5-day momentum: ${market.mom5d.toFixed(2)}%`);
    if (market.newsHeadlines.length) {
      lines.push("\nHeadlines:");
      market.newsHeadlines.slice(0, 4).forEach((h) => lines.push(`  • ${h}`));
    }
  }

  if (infoTier >= 2) {
    lines.push(`\n[TIER 2 — Sell-Side analyst]`);
    if (market.rsi14 !== undefined) lines.push(`RSI(14): ${market.rsi14?.toFixed(1)}`);
    if (market.macdHist !== undefined)
      lines.push(`MACD hist: ${market.macdHist?.toFixed(2)}`);
    if (market.bbUpper && market.bbLower)
      lines.push(
        `BB(20,2σ): upper $${market.bbUpper.toFixed(2)}, lower $${market.bbLower.toFixed(2)}`
      );
    lines.push("PT consensus: (broker)");
    lines.push("Earnings in: ~18 days");
  }

  if (infoTier >= 3) {
    lines.push(`\n[TIER 3 — Activist research]`);
    const vol_30d_avg = market.history.length >= 30
      ? market.history.slice(-30).reduce((s, b) => s + b.volume, 0) / 30
      : last.volume;
    const ratio = vol_30d_avg > 0 ? last.volume / vol_30d_avg : 1;
    lines.push(
      `Volume today: ${(last.volume / 1e6).toFixed(1)}M vs 30d avg ${(vol_30d_avg / 1e6).toFixed(1)}M (${ratio.toFixed(2)}x)`
    );
    lines.push("Insider Form 4 last 30d: (placeholder)");
    lines.push("Options skew (3M put/call IV): (placeholder)");
  }

  if (infoTier >= 4) {
    lines.push(`\n[TIER 4 — Hedge Fund flow]`);
    lines.push("Net options flow last 5d: (placeholder)");
    lines.push("Dealer gamma exposure: (placeholder)");
    lines.push("13F lag: (placeholder)");
  }

  if (infoTier >= 5) {
    lines.push(`\n[TIER 5 — Macro / Fed channel]`);
    lines.push("Fed minutes draft signal: (placeholder)");
    lines.push("PCE nowcast: (placeholder)");
    lines.push("Rate path probabilities: (placeholder)");
  }

  return lines.join("\n");
}

// ─── Peer-posts section (for multi-round discussion) ────────────────────────
export function buildPeerSection(
  selfAgentId: string,
  priorDecisions: AgentDecision[],
  agents: AgentConfig[]
): string {
  const peers = priorDecisions.filter((d) => d.agentId !== selfAgentId);
  if (peers.length === 0) return "(no prior posts; you go first)";
  const lines = ["\n=== OTHER AGENTS' POSTS YOU SAW ==="];
  for (const p of peers) {
    const agent = agents.find((a) => a.id === p.agentId);
    const name = agent?.name ?? p.agentId;
    lines.push(`\n[${name}]`);
    lines.push(
      `  Stated lean: ${p.publicStatement.statedLean} (conviction ${p.publicStatement.statedConviction.toFixed(2)})`
    );
    lines.push(`  Said: "${p.publicStatement.narrative}"`);
  }
  return lines.join("\n");
}

// ─── Portfolio line for the LLM ─────────────────────────────────────────────
export function buildPortfolioLine(p: UserPortfolio): string {
  const total = p.cash + p.shares * 0;
  return `Cash: $${p.cash.toLocaleString()} | Shares: ${p.shares.toLocaleString()} | Initial: $${p.initialCapital.toLocaleString()}`;
}

// ─── The full user-side message ──────────────────────────────────────────────
export function buildUserMessage(args: {
  agent: AgentConfig;
  market: MarketContext;
  user: UserPortfolio;
  priorDecisions?: AgentDecision[];
  allAgents: AgentConfig[];
  round?: number;
}): string {
  const { agent, market, user, allAgents } = args;
  const view = buildMarketView(market, agent.infoTier);
  const peers = args.priorDecisions
    ? buildPeerSection(agent.id, args.priorDecisions, allAgents)
    : "(no prior posts; you go first)";
  const round = args.round ?? 1;

  return `Day: ${market.asOfDate}

YOUR PORTFOLIO (agent's own book):
${buildPortfolioLine({ ...user, initialCapital: agent.capital })}

YOUR INFORMATION VIEW (filtered by your tier ${agent.infoTier}):
${view}

INFLUENCER POSTS YOU RECEIVED:
${peers}

DISCUSSION ROUND: ${round}${round > 1 ? " (you have seen prior round above — you may update your view)" : ""}

Now produce your 4-layer JSON decision per your system prompt schema.`;
}

// ─── Compose the full system prompt with sizing addendum ────────────────────
export function buildSystemPrompt(agent: AgentConfig): string {
  return agent.systemPrompt + SIZING_ADDENDUM;
}

// ─── Parse 4-layer JSON from LLM raw text ───────────────────────────────────
export function parseAgentDecision(
  raw: string,
  agentId: string,
  date: string
): AgentDecision | null {
  // Strip ```json … ``` / ``` … ``` fences Claude likes to add
  let body = raw.trim();
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) body = fence[1].trim();

  // Greedy match from first { to last } to capture the JSON blob
  const match = body.match(/\{[\s\S]*\}/);
  let candidate = match ? match[0] : body;

  const tryParse = (s: string): Record<string, unknown> | null => {
    try {
      return JSON.parse(s) as Record<string, unknown>;
    } catch {
      try {
        return JSON.parse(s.replace(/'/g, '"')) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
  };

  let parsed = tryParse(candidate);

  // Repair a truncated JSON (maxTokens cut-off): close open quotes / braces
  if (!parsed) {
    let repaired = candidate;
    // Trim a trailing comma
    repaired = repaired.replace(/,\s*$/, "");
    // Trim a dangling key like:  "foo": "abc
    repaired = repaired.replace(/,\s*"[^"]*"\s*:\s*"[^"]*$/, "");
    // Close an open string
    const quoteCount = (repaired.match(/(?<!\\)"/g) || []).length;
    if (quoteCount % 2 === 1) repaired += '"';
    // Balance braces
    const openBr = (repaired.match(/\{/g) || []).length;
    const closeBr = (repaired.match(/\}/g) || []).length;
    repaired += "}".repeat(Math.max(0, openBr - closeBr));
    parsed = tryParse(repaired);
  }

  if (!parsed) return null;

  const pb = (parsed.private_belief ?? {}) as Record<string, unknown>;
  const ps = (parsed.public_statement ?? {}) as Record<string, unknown>;
  const pa = (parsed.personal_action ?? {}) as Record<string, unknown>;

  const normalize = (v: unknown, allowed: string[], fallback: string) => {
    const s = String(v ?? fallback).toLowerCase();
    return allowed.includes(s) ? s : fallback;
  };

  const privateBelief: PrivateBelief = {
    lean: normalize(pb.lean, ["long", "short", "neutral"], "neutral") as PrivateBelief["lean"],
    conviction: Number(pb.conviction ?? 0.5),
    actualThesis: String(pb.actual_thesis ?? ""),
  };

  const publicStatement: PublicStatement = {
    statedLean: normalize(
      ps.stated_lean,
      ["long", "short", "neutral"],
      "neutral"
    ) as PublicStatement["statedLean"],
    statedConviction: Number(ps.stated_conviction ?? 0.5),
    narrative: String(ps.narrative ?? ""),
  };

  const personalAction: PersonalAction = {
    actionType: normalize(
      pa.action_type,
      ["buy_strong", "buy_lite", "hold", "sell_lite", "sell_strong"],
      "hold"
    ) as PersonalAction["actionType"],
    sizePct: Number(pa.size_pct ?? 0),
    rationale: String(pa.rationale_internal ?? ""),
    stopLossPct: pa.stop_loss_pct != null ? Number(pa.stop_loss_pct) : null,
    takeProfitPct: pa.take_profit_pct != null ? Number(pa.take_profit_pct) : null,
  };

  return {
    agentId,
    date,
    privateBelief,
    publicStatement,
    desiredMarketReaction: String(parsed.desired_market_reaction ?? ""),
    personalAction,
  };
}
