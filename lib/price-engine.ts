// ============================================================================
// Price engine — β-anchored virtual price + slippage + multi-horizon forecast.
// Direct port of toy_v06/price_engine_v07.py + simulation.py logic.
// ============================================================================

import type { PriceBar, AgentDecision, AgentConfig, ForecastEntry, Lean } from "./types";

export const ANCHOR_LAMBDA = 0.07;
export const SLIPPAGE_IMPACT_COEF = 0.08;

const LEAN_SIGN: Record<Lean, number> = {
  long: 1,
  short: -1,
  neutral: 0,
};

// ─── Virtual price formation ────────────────────────────────────────────────
export function computeBetaVirtual(args: {
  prevVirtual: number;
  prevReal: number;
  curReal: number;
  netPressure: number; // (-1, 1)
  sensitivity?: number; // default 0.3
  anchorLambda?: number;
}): number {
  const { prevVirtual, prevReal, curReal } = args;
  const sens = args.sensitivity ?? 0.3;
  const lambda = args.anchorLambda ?? ANCHOR_LAMBDA;
  if (prevReal <= 0) return curReal;

  const realDrift = (curReal - prevReal) / prevReal;
  let base = prevVirtual * (1 + realDrift) * (1 + sens * netPressure);
  if (lambda > 0 && curReal > 0) {
    const deviation = base / curReal - 1;
    base = base * (1 - lambda * deviation);
  }
  return base;
}

export function computeNetPressure(
  buyUsd: number,
  sellUsd: number,
  totalCapital: number
): number {
  if (totalCapital <= 0) return 0;
  const raw = (buyUsd - sellUsd) / totalCapital;
  return Math.max(-1, Math.min(1, raw));
}

// ─── Linear slippage (price impact from large orders) ───────────────────────
export function applyImpact(args: {
  runningFill: number;
  orderValueUsd: number;
  direction: 1 | -1; // +1 buy, -1 sell
  dailyDollarVolume: number;
  impactCoef?: number;
}): number {
  const { runningFill, orderValueUsd, direction, dailyDollarVolume } = args;
  const coef = args.impactCoef ?? SLIPPAGE_IMPACT_COEF;
  if (dailyDollarVolume <= 0) return runningFill;
  const shift = coef * direction * (orderValueUsd / dailyDollarVolume);
  return Math.max(0.01, runningFill * (1 + shift));
}

// ─── Technical indicators ───────────────────────────────────────────────────
export interface Indicators {
  sma20: number | null;
  rsi14: number | null;
  macdHist: number | null;
  macdDir: "bull" | "bear" | "—";
  bbUpper: number | null;
  bbLower: number | null;
  vol_ann: number | null;
  mom5d: number | null;
  mom20d: number | null;
}

export function computeIndicators(closes: number[]): Indicators {
  const n = closes.length;
  const out: Indicators = {
    sma20: null,
    rsi14: null,
    macdHist: null,
    macdDir: "—",
    bbUpper: null,
    bbLower: null,
    vol_ann: null,
    mom5d: null,
    mom20d: null,
  };

  if (n < 6) return out;
  out.mom5d = (closes[n - 1] / closes[n - 6] - 1) * 100;

  if (n >= 20) {
    const last20 = closes.slice(-20);
    const mean = avg(last20);
    const std = stdDev(last20, mean);
    out.sma20 = mean;
    out.bbUpper = mean + 2 * std;
    out.bbLower = mean - 2 * std;
  }

  if (n >= 14) {
    // Simple-MA RSI (Wilder approximation)
    const last14 = closes.slice(-14);
    let gain = 0;
    let loss = 0;
    for (let i = 1; i < last14.length; i++) {
      const d = last14[i] - last14[i - 1];
      if (d > 0) gain += d;
      else loss += -d;
    }
    const g = gain / 13;
    const l = loss / 13;
    if (l > 0) {
      const rs = g / l;
      out.rsi14 = 100 - 100 / (1 + rs);
    } else {
      out.rsi14 = 70;
    }
  }

  if (n >= 26) {
    const ema12 = ema(closes, 12);
    const ema26 = ema(closes, 26);
    const macdLine = ema12.map((v, i) => v - ema26[i]);
    const signal = ema(macdLine, 9);
    const histNow = macdLine[macdLine.length - 1] - signal[signal.length - 1];
    const histPrev = macdLine[macdLine.length - 2] - signal[signal.length - 2];
    out.macdHist = histNow;
    if (histPrev <= 0 && histNow > 0) out.macdDir = "bull";
    else if (histPrev >= 0 && histNow < 0) out.macdDir = "bear";
    else out.macdDir = histNow > 0 ? "bull" : "bear";
  }

  if (n >= 21) {
    out.mom20d = (closes[n - 1] / closes[n - 21] - 1) * 100;
  }

  // Annualized vol from daily log-returns
  if (n >= 2) {
    const rets: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      rets.push(closes[i] / closes[i - 1] - 1);
    }
    const m = avg(rets);
    const s = stdDev(rets, m);
    out.vol_ann = s * Math.sqrt(252) * 100;
  }

  return out;
}

function avg(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr: number[], mean: number): number {
  const v = arr.reduce((acc, x) => acc + (x - mean) ** 2, 0) / arr.length;
  return Math.sqrt(v);
}

function ema(arr: number[], span: number): number[] {
  const alpha = 2 / (span + 1);
  const out: number[] = [];
  let prev = arr[0];
  for (let i = 0; i < arr.length; i++) {
    prev = i === 0 ? arr[0] : alpha * arr[i] + (1 - alpha) * prev;
    out.push(prev);
  }
  return out;
}

// ─── Forecast aggregator (multi-horizon, reputation × horizon-fit) ──────────
const RETURN_PER_SIGNAL_PER_DAY = 0.008; // 0.8%/day at signal=1 (tunable)

function horizonFitWeight(agentHorizon: number, targetHorizon: number): number {
  const width = Math.max(5, targetHorizon * 0.6);
  const diff = agentHorizon - targetHorizon;
  return Math.exp((-diff * diff) / (2 * width * width));
}

export function aggregateForecast(args: {
  decisions: AgentDecision[];
  agents: AgentConfig[];
  targetHorizon: number;
  reputationMultipliers?: Record<string, number>;
}): ForecastEntry {
  const { decisions, agents, targetHorizon } = args;
  const rep = args.reputationMultipliers ?? {};

  const items: { agentId: string; weight: number; signed: number; lean: Lean }[] = [];
  let totalWeight = 0;

  for (const decision of decisions) {
    const agent = agents.find((a) => a.id === decision.agentId);
    if (!agent) continue;
    const hFit = horizonFitWeight(agent.timeHorizonDays, targetHorizon);
    const repMult = rep[agent.id] ?? 1.0;
    const w = hFit * repMult * (0.5 + 0.5 * agent.influenceOut);
    const signed =
      LEAN_SIGN[decision.privateBelief.lean] * decision.privateBelief.conviction;
    items.push({ agentId: agent.id, weight: w, signed, lean: decision.privateBelief.lean });
    totalWeight += w;
  }

  if (totalWeight === 0) {
    return {
      horizonDays: targetHorizon,
      expectedReturnPct: 0,
      ciLowPct: 0,
      ciHighPct: 0,
      consensusLean: "neutral",
      dispersion: 0,
      contributors: [],
    };
  }

  const weightedSignal =
    items.reduce((acc, x) => acc + x.weight * x.signed, 0) / totalWeight;
  const weightedVar =
    items.reduce(
      (acc, x) => acc + (x.weight / totalWeight) * (x.signed - weightedSignal) ** 2,
      0
    );
  const dispersion = Math.sqrt(weightedVar);

  const expectedPct = weightedSignal * RETURN_PER_SIGNAL_PER_DAY * targetHorizon * 100;
  let ciHalf = 1.96 * dispersion * RETURN_PER_SIGNAL_PER_DAY * targetHorizon * 100;
  ciHalf = Math.max(ciHalf, targetHorizon * 0.5);

  const consensusLean: Lean =
    weightedSignal > 0.08 ? "long" : weightedSignal < -0.08 ? "short" : "neutral";

  const contributors = items
    .map((x) => ({
      agentId: x.agentId,
      weight: x.weight / totalWeight,
      lean: x.lean,
    }))
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight))
    .slice(0, 5);

  return {
    horizonDays: targetHorizon,
    expectedReturnPct: expectedPct,
    ciLowPct: expectedPct - ciHalf,
    ciHighPct: expectedPct + ciHalf,
    consensusLean,
    dispersion,
    contributors,
  };
}
