// ============================================================================
// LLM provider abstraction. Swap providers by changing env vars only.
// Add a new provider by implementing `LLMProvider` + registering in `getProvider`.
// ============================================================================

export interface LLMCallOptions {
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  timeoutMs?: number;
}

export interface LLMResponse {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  latencyMs: number;
  provider: string;
  model: string;
}

export interface LLMProvider {
  readonly name: string;
  call(
    systemPrompt: string,
    userMessage: string,
    opts?: LLMCallOptions
  ): Promise<LLMResponse>;
}

// ─── Base: OpenAI-compatible (works for MiniMax, OpenAI, DeepSeek, most Chinese) ──
abstract class OpenAICompatibleProvider implements LLMProvider {
  abstract readonly name: string;
  protected baseUrl: string;
  protected apiKey: string;
  protected model: string;

  constructor(baseUrl: string, apiKey: string, model: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.model = model;
  }

  async call(
    systemPrompt: string,
    userMessage: string,
    opts: LLMCallOptions = {}
  ): Promise<LLMResponse> {
    const start = Date.now();
    const body: Record<string, unknown> = {
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_tokens: opts.maxTokens ?? 800,
      temperature: opts.temperature ?? 0.7,
    };
    if (opts.jsonMode) {
      body.response_format = { type: "json_object" };
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      opts.timeoutMs ?? 60_000
    );

    try {
      const resp = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(
          `${this.name} error ${resp.status}: ${JSON.stringify(data).slice(0, 200)}`
        );
      }

      const text: string = data.choices?.[0]?.message?.content ?? "";
      const usage = data.usage ?? {};
      return {
        text,
        inputTokens: usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        costUsd: this.estimateCost(
          usage.prompt_tokens ?? 0,
          usage.completion_tokens ?? 0
        ),
        latencyMs: Date.now() - start,
        provider: this.name,
        model: this.model,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  protected abstract estimateCost(inTok: number, outTok: number): number;
}

// ─── MiniMax (default for now) ──────────────────────────────────────────────
class MiniMaxProvider extends OpenAICompatibleProvider {
  readonly name = "minimax";
  protected estimateCost(inTok: number, outTok: number): number {
    // MiniMax-M2 pricing (approximate, USD): ~$0.001/1K in, ~$0.008/1K out
    return (inTok / 1000) * 0.001 + (outTok / 1000) * 0.008;
  }
}

// ─── OpenAI ─────────────────────────────────────────────────────────────────
class OpenAIProvider extends OpenAICompatibleProvider {
  readonly name = "openai";
  protected estimateCost(inTok: number, outTok: number): number {
    // gpt-4o-mini approx
    return (inTok / 1000) * 0.00015 + (outTok / 1000) * 0.0006;
  }
}

// ─── Anthropic (different auth + body shape) ────────────────────────────────
class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(apiKey: string, model: string, baseUrl = "https://api.anthropic.com/v1") {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async call(
    systemPrompt: string,
    userMessage: string,
    opts: LLMCallOptions = {}
  ): Promise<LLMResponse> {
    const start = Date.now();
    const body = {
      model: this.model,
      max_tokens: opts.maxTokens ?? 800,
      temperature: opts.temperature ?? 0.7,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    };

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      opts.timeoutMs ?? 60_000
    );

    try {
      const resp = await fetch(`${this.baseUrl}/messages`, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(
          `anthropic error ${resp.status}: ${JSON.stringify(data).slice(0, 200)}`
        );
      }
      const text: string =
        data.content?.find((c: { type: string }) => c.type === "text")?.text ?? "";
      const usage = data.usage ?? {};
      return {
        text,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        costUsd: (usage.input_tokens / 1e6) * 0.8 + (usage.output_tokens / 1e6) * 4,
        latencyMs: Date.now() - start,
        provider: this.name,
        model: this.model,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ─── Mock provider (no key needed; deterministic canned responses) ─────────
class MockProvider implements LLMProvider {
  readonly name = "mock";
  private model = "mock-v0";

  async call(
    systemPrompt: string,
    _userMessage: string,
    _opts: LLMCallOptions = {}
  ): Promise<LLMResponse> {
    // Detect role from system prompt keywords, return plausible canned 4-layer
    const roleHints: Record<string, { lean: string; conv: number }> = {
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
    let hit = { lean: "neutral", conv: 0.5 };
    for (const [name, v] of Object.entries(roleHints)) {
      if (systemPrompt.includes(name)) {
        hit = v;
        break;
      }
    }

    const text = JSON.stringify({
      private_belief: {
        lean: hit.lean,
        conviction: hit.conv,
        actual_thesis: "[mock] sample thesis matching personality",
      },
      public_statement: {
        stated_lean: hit.lean,
        stated_conviction: hit.conv * 0.85,
        narrative: "[mock] sample public narrative for this agent",
      },
      desired_market_reaction: "[mock]",
      personal_action: {
        action_type: hit.lean === "long" ? "buy_lite" : hit.lean === "short" ? "sell_lite" : "hold",
        size_pct: 0.3,
        rationale_internal: "[mock] deterministic canned response",
      },
    });

    return {
      text,
      inputTokens: 0,
      outputTokens: text.length / 4,
      costUsd: 0,
      latencyMs: 5,
      provider: this.name,
      model: this.model,
    };
  }
}

// ─── Factory: env-driven selection ──────────────────────────────────────────
let cached: LLMProvider | null = null;

export function getProvider(): LLMProvider {
  if (cached) return cached;

  const providerName = (process.env.LLM_PROVIDER ?? "minimax").toLowerCase();
  const apiKey = process.env.LLM_API_KEY ?? "";
  const model = process.env.LLM_MODEL ?? "MiniMax-M2";
  const baseUrl =
    process.env.LLM_BASE_URL ??
    (providerName === "openai"
      ? "https://api.openai.com/v1"
      : providerName === "anthropic"
        ? "https://api.anthropic.com/v1"
        : "https://api.minimax.io/v1");

  // No key OR explicit mock mode → fall back to mock for dev
  if (!apiKey || providerName === "mock") {
    cached = new MockProvider();
    return cached;
  }

  switch (providerName) {
    case "openai":
      cached = new OpenAIProvider(baseUrl, apiKey, model);
      break;
    case "anthropic":
      cached = new AnthropicProvider(apiKey, model, baseUrl);
      break;
    case "minimax":
    default:
      cached = new MiniMaxProvider(baseUrl, apiKey, model);
      break;
  }
  return cached;
}

// Test helper for unit tests / mock injection
export function _resetProviderCache() {
  cached = null;
}
