// ============================================================================
// POST /api/agents/scenario-react
// Asks each agent (in parallel) how they would react to a hypothetical event.
// Returns a short narrative + action — for the "🌐 What-if" power-up.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { ALL_AGENTS } from "@/lib/agents";
import { getProvider } from "@/lib/llm-provider";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ScenarioReaction {
  agentId: string;
  agentName: string;
  agentRole: string;
  action: string;
  reasoning: string;
  conviction: number;
}

interface ReactRequest {
  scenarioText: string;
  shockPct?: number;
  ticker: string;
  asOfDate: string;
  // Optional: subset of agent IDs
  agentIds?: string[];
}

interface ReactResponse {
  reactions: ScenarioReaction[];
  costUsd: number;
  latencyMs: number;
  errors?: { agentId: string; error: string }[];
}

function fallbackReaction(args: {
  agentId: string;
  agentName: string;
  agentRole: string;
}): ScenarioReaction {
  const { agentId, agentName, agentRole } = args;
  return {
    agentId,
    agentName,
    agentRole,
    action: "Hold",
    reasoning: `${agentRole} would likely await more confirming evidence before repositioning. [LLM unavailable — rule-based estimate]`,
    conviction: 0.4,
  };
}

export async function POST(req: NextRequest) {
  const start = Date.now();
  let body: ReactRequest;
  try {
    body = (await req.json()) as ReactRequest;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!body.scenarioText || !body.ticker || !body.asOfDate) {
    return NextResponse.json(
      { error: "scenarioText, ticker, asOfDate are required" },
      { status: 400 }
    );
  }

  const agentIds = (body.agentIds ?? ALL_AGENTS.map((a) => a.id)).filter(
    (id) => id !== "cta_forced_001"
  );
  const provider = getProvider();

  const shockLine = body.shockPct != null
    ? `\nEstimated immediate price impact: ${(body.shockPct * 100).toFixed(0)}% on ${body.ticker}.`
    : "";

  const tasks = agentIds.map(async (aid) => {
    const agent = ALL_AGENTS.find((a) => a.id === aid);
    if (!agent) return { ok: false as const, agentId: aid, error: "unknown agent" };

    const system = agent.systemPrompt + `

You are responding to a HYPOTHETICAL scenario projection. Be concise (under 60 words).
Return ONLY raw JSON (no markdown fence) with these exact keys:
{
  "action": "Buy max" | "Buy" | "Hold" | "Sell" | "Sell all",
  "conviction": 0.0-1.0,
  "reasoning": "2-3 sentence explanation in your voice, referencing your strategy"
}`;

    const userMsg = `HYPOTHETICAL EVENT on ${body.asOfDate}:
"${body.scenarioText}"${shockLine}

Ticker: ${body.ticker}
Your capital: $${agent.capital.toLocaleString()}

How would YOU specifically react? What action would you take, and why does this event matter (or not matter) to your strategy? Return the JSON now.`;

    try {
      const llmResp = await provider.call(system, userMsg, {
        jsonMode: true,
        maxTokens: 300,
        temperature: 0.7,
        timeoutMs: 30_000,
      });

      // Strip markdown fences
      let raw = llmResp.text.trim();
      const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fence) raw = fence[1].trim();
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) {
        return {
          ok: false as const,
          agentId: aid,
          error: `unparseable: ${raw.slice(0, 100)}`,
        };
      }
      const parsed = JSON.parse(m[0]) as Record<string, unknown>;
      return {
        ok: true as const,
        reaction: {
          agentId: aid,
          agentName: agent.name,
          agentRole: agent.role,
          action: String(parsed.action ?? "Hold").slice(0, 20),
          reasoning: String(parsed.reasoning ?? "").slice(0, 400),
          conviction: Number(parsed.conviction ?? 0.5),
        },
      };
    } catch (e: unknown) {
      return {
        ok: false as const,
        agentId: aid,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });

  const results = await Promise.allSettled(tasks);
  const reactions: ScenarioReaction[] = [];
  const errors: { agentId: string; error: string }[] = [];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "rejected") {
      const agent = ALL_AGENTS.find((a) => a.id === agentIds[i]);
      reactions.push(
        fallbackReaction({
          agentId: agentIds[i],
          agentName: agent?.name ?? agentIds[i],
          agentRole: agent?.role ?? "unknown",
        })
      );
      errors.push({ agentId: agentIds[i], error: String(r.reason).slice(0, 200) });
      continue;
    }
    if (r.value.ok) {
      reactions.push(r.value.reaction);
    } else {
      const agent = ALL_AGENTS.find((a) => a.id === agentIds[i]);
      reactions.push(
        fallbackReaction({
          agentId: agentIds[i],
          agentName: agent?.name ?? agentIds[i],
          agentRole: agent?.role ?? "unknown",
        })
      );
      errors.push({ agentId: agentIds[i], error: r.value.error });
    }
  }

  const resp: ReactResponse = {
    reactions,
    costUsd: 0,
    latencyMs: Date.now() - start,
    errors: errors.length ? errors : undefined,
  };
  return NextResponse.json(resp);
}
