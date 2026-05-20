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

// ─── Per-agent canned fallback when the LLM call fails ─────────────────────
// Same shape as Mock provider, so the UI always renders all 11 voices.
function fallbackDecision(args: {
  agentId: string;
  date: string;
  agentName: string;
  agentRole: string;
  noteSuffix?: string;
}): AgentDecision {
  const { agentId, date, agentName, agentRole, noteSuffix = "" } = args;
  // Personality hints from agent name
  const hints: Record<string, { lean: "long" | "short" | "neutral"; conv: number }> = {
    Catherine: { lean: "long", conv: 0.78 },
    David: { lean: "neutral", conv: 0.45 },
    Sarah: { lean: "short", conv: 0.82 },
    Michael: { lean: "long", conv: 0.55 },
    Alex: { lean: "long", conv: 0.65 },
    Thomas: { lean: "long", conv: 0.70 },
    Devon: { lean: "neutral", conv: 0.40 },
    Ben: { lean: "neutral", conv: 0.50 },
    Paul: { lean: "short", conv: 0.60 },
    Stan: { lean: "neutral", conv: 0.55 },
  };
  let pick: { lean: "long" | "short" | "neutral"; conv: number } = { lean: "neutral", conv: 0.5 };
  for (const [k, v] of Object.entries(hints)) {
    if (agentName.includes(k)) {
      pick = v;
      break;
    }
  }
  const actionType =
    pick.lean === "long" ? "buy_lite" : pick.lean === "short" ? "sell_lite" : "hold";
  const narrative = `${agentRole} read · stance ${pick.lean} (${Math.round(pick.conv * 100)}% conviction).${noteSuffix}`;
  return {
    agentId,
    date,
    privateBelief: {
      lean: pick.lean,
      conviction: pick.conv,
      actualThesis: `${agentRole} fallback thesis (LLM unavailable)`,
    },
    publicStatement: {
      statedLean: pick.lean,
      statedConviction: Math.round(pick.conv * 0.85 * 100) / 100,
      narrative,
    },
    desiredMarketReaction: "n/a",
    personalAction: { actionType, sizePct: 0.3, rationale: "fallback heuristic" },
  };
}

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

  const tasks = agentIds.map(async (aid): Promise<{ decision: AgentDecision; error?: string }> => {
    const agent = getAgent(aid);
    if (!agent) {
      return {
        decision: fallbackDecision({
          agentId: aid,
          date: body.date,
          agentName: aid,
          agentRole: "unknown",
          noteSuffix: " [unknown agent]",
        }),
        error: "unknown agent",
      };
    }

    // CTA is deterministic
    if (agent.role === "cta_forced") {
      const lastClose = body.market.history.at(-1)?.close ?? 0;
      return {
        decision: ctaDecision({
          agentId: aid,
          date: body.date,
          sma20: body.market.sma20,
          currentClose: lastClose,
        }),
      };
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
        timeoutMs: 8_000,
      });

      const parsed = parseAgentDecision(llmResp.text, aid, body.date);
      if (!parsed) {
        return {
          decision: fallbackDecision({
            agentId: aid,
            date: body.date,
            agentName: agent.name,
            agentRole: agent.role,
            noteSuffix: " [LLM JSON parse failed]",
          }),
          error: `failed to parse JSON: ${llmResp.text.slice(0, 200)}`,
        };
      }
      return { decision: parsed };
    } catch (e: unknown) {
      return {
        decision: fallbackDecision({
          agentId: aid,
          date: body.date,
          agentName: agent.name,
          agentRole: agent.role,
          noteSuffix: " [LLM unavailable]",
        }),
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });

  const results = await Promise.allSettled(tasks);

  const decisions: AgentDecision[] = [];
  const errors: { agentId: string; error: string }[] = [];
  const costUsd = 0;

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "rejected") {
      // Even on a hard reject, render a fallback for that agent so all 11 appear
      const agent = getAgent(agentIds[i]);
      decisions.push(
        fallbackDecision({
          agentId: agentIds[i],
          date: body.date,
          agentName: agent?.name ?? agentIds[i],
          agentRole: agent?.role ?? "unknown",
          noteSuffix: " [task rejected]",
        })
      );
      errors.push({ agentId: agentIds[i], error: String(r.reason).slice(0, 200) });
      continue;
    }
    decisions.push(r.value.decision);
    if (r.value.error) errors.push({ agentId: agentIds[i], error: r.value.error });
  }

  const resp: DecideResponse = {
    decisions,
    costUsd,
    latencyMs: Date.now() - start,
    errors: errors.length ? errors : undefined,
  };
  return NextResponse.json(resp);
}
