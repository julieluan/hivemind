// ============================================================================
// POST /api/game/aggregate
// Given today's agent decisions, computes:
//   - net pressure (buy_usd, sell_usd, net)
//   - multi-horizon forecasts (T+1, T+5, T+20)
//
// Pure function — no LLM call, runs anywhere fast.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import type {
  AggregateRequest,
  AggregateResponse,
  AgentConfig,
  AgentDecision,
} from "@/lib/types";
import { aggregateForecast } from "@/lib/price-engine";

export const runtime = "nodejs";

const ACTION_SIGN: Record<string, number> = {
  buy_strong: 1,
  buy_lite: 1,
  sell_lite: -1,
  sell_strong: -1,
  hold: 0,
};

const ACTION_SIZE_MAP: Record<string, number> = {
  buy_strong: 1.0,
  sell_strong: 1.0,
  buy_lite: 0, // use the agent's reported size_pct
  sell_lite: 0,
  hold: 0,
};

function actionUsd(
  decision: AgentDecision,
  agentCapital: number
): { buy: number; sell: number } {
  const sign = ACTION_SIGN[decision.personalAction.actionType];
  if (sign === 0) return { buy: 0, sell: 0 };
  const liteCap = ACTION_SIZE_MAP[decision.personalAction.actionType];
  const sz =
    liteCap === 1.0 ? 1.0 : Math.max(0, Math.min(1, decision.personalAction.sizePct ?? 0));
  const notional = agentCapital * sz;
  return sign > 0 ? { buy: notional, sell: 0 } : { buy: 0, sell: notional };
}

export async function POST(req: NextRequest) {
  let body: AggregateRequest;
  try {
    body = (await req.json()) as AggregateRequest;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  let buyUsd = 0;
  let sellUsd = 0;

  for (const decision of body.decisions) {
    const agent = body.agents.find((a) => a.id === decision.agentId);
    if (!agent || !agent.hasPortfolio || agent.capital <= 0) continue;
    const { buy, sell } = actionUsd(decision, agent.capital);
    buyUsd += buy;
    sellUsd += sell;
  }

  const totalCap = Math.max(body.totalCapital, 1);
  const netPressure = Math.max(-1, Math.min(1, (buyUsd - sellUsd) / totalCap));

  const forecasts = [1, 5, 20].map((h) =>
    aggregateForecast({
      decisions: body.decisions,
      agents: body.agents,
      targetHorizon: h,
    })
  );

  const resp: AggregateResponse = {
    netPressure,
    buyUsd,
    sellUsd,
    forecasts,
  };
  return NextResponse.json(resp);
}
