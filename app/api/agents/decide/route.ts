// ============================================================================
// POST /api/agents/decide
// Runs N agents (in parallel) against today's market, returns 4-layer decisions.
//
// Body: DecideRequest
// Response: DecideResponse
//
// Notes:
//   - If LLM_API_KEY is unset, MockProvider is used (zero cost, canned output).
//   - Agents run in PARALLEL via Promise.allSettled (one bad agent doesn't fail the whole call).
//   - CTA (cta_forced_001) is handled deterministically — NOT sent to LLM.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import type {
  DecideRequest,
  DecideResponse,
  AgentDecision,
} from "@/lib/types";
import { ALL_AGENTS, getAgent } from "@/lib/agents";
import { getProvider } from "@/lib/llm-provider";
import {
  buildSystemPrompt,
  buildUserMessage,
  parseAgentDecision,
} from "@/lib/prompts";

export const runtime = "nodejs"; // need full fetch + longer timeout than Edge
export const maxDuration = 60; // Vercel Pro: 60s; Free: 10s (may time out for slow LLM)

// ─── Deterministic CTA rule (20-day SMA trend) ──────────────────────────────
function ctaDecision(args: {
  agentId: string;
  date: string;
  sma20: number | null | undefined;
  currentClose: number;
}): AgentDecision {
  const { sma20, currentClose, date, agentId } = args;
  let actionType: AgentDecision["personalAction"]["actionType"] = "hold";
  let rationale = "insufficient SMA window";
  if (sma20 != null) {
    if (currentClose > sma20 * 1.01) {
      actionType = "buy_lite";
      rationale = `close $${currentClose.toFixed(2)} > 20SMA $${sma20.toFixed(2)}, trend up`;
    } else if (currentClose < sma20 * 0.99) {
      actionType = "sell_lite";
      rationale = `close $${currentClose.toFixed(2)} < 20SMA $${sma20.toFixed(2)}, trend down`;
    } else {
      actionType = "hold";
      rationale = "in 1% SMA band";
    }
  }
  return {
    agentId,
    date,
    privateBelief: { lean: "neutral", conviction: 0, actualThesis: rationale },
    publicStatement: {
      statedLean: "neutral",
      statedConviction: 0,
      narrative: "[CTA does not speak]",
    },
    desiredMarketReaction: "n/a",
    personalAction: { actionType, sizePct: 0.3, rationale },
  };
}

export async function POST(req: NextRequest) {
  const start = Date.now();
  let body: DecideRequest;
  try {
    body = (await req.json()) as DecideRequest;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!body.ticker || !body.date || !body.market) {
    return NextResponse.json(
      { error: "ticker, date, market are required" },
      { status: 400 }
    );
  }

  const agentIds = body.agentIds ?? ALL_AGENTS.map((a) => a.id);
  const provider = getProvider();

  const tasks = agentIds.map(async (aid): Promise<AgentDecision | { error: string; agentId: string }> => {
    const agent = getAgent(aid);
    if (!agent) return { agentId: aid, error: "unknown agent" };

    // CTA is deterministic
    if (agent.role === "cta_forced") {
      const lastClose = body.market.history.at(-1)?.close ?? 0;
      return ctaDecision({
        agentId: aid,
        date: body.date,
        sma20: body.market.sma20,
        currentClose: lastClose,
      });
    }

    try {
      const systemPrompt = buildSystemPrompt(agent);
      const userMessage = buildUserMessage({
        agent,
        market: body.market,
        user: body.user,
        priorDecisions: body.priorDecisions,
        allAgents: ALL_AGENTS,
        round: body.round ?? 1,
      });

      const llmResp = await provider.call(systemPrompt, userMessage, {
        jsonMode: true,
        maxTokens: 600,
        temperature: 0.7,
      });

      const decision = parseAgentDecision(llmResp.text, aid, body.date);
      if (!decision) {
        return {
          agentId: aid,
          error: `failed to parse JSON: ${llmResp.text.slice(0, 200)}`,
        };
      }
      return decision;
    } catch (e: unknown) {
      return { agentId: aid, error: e instanceof Error ? e.message : String(e) };
    }
  });

  const results = await Promise.allSettled(tasks);

  const decisions: AgentDecision[] = [];
  const errors: { agentId: string; error: string }[] = [];
  let costUsd = 0;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "rejected") {
      errors.push({ agentId: agentIds[i], error: String(r.reason).slice(0, 200) });
      continue;
    }
    const value = r.value;
    if ("error" in value) {
      errors.push(value);
    } else {
      decisions.push(value);
    }
  }

  const resp: DecideResponse = {
    decisions,
    costUsd,
    latencyMs: Date.now() - start,
    errors: errors.length ? errors : undefined,
  };
  return NextResponse.json(resp);
}
