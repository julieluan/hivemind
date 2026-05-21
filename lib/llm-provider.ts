// ============================================================================
// LLM provider abstraction. Swap providers by changing env vars only.
// Add a new provider by implementing `LLMProvider` + registering in `getProvider`.
// ============================================================================

// Node 23's built-in fetch (undici) was failing with ECONNRESET on this
// machine's proxy hop, while curl/python sockets worked fine. Routing
// every LLM call through node:https — with keep-alive and bounded
// concurrency — sidesteps undici and stops the parallel TLS handshake
// storm from blowing connections.
//
// Server-only — guarded so client bundles don't try to import `https`.
type HttpResult = { status: number; bodyText: string };

// One shared keep-alive agent so the 11 parallel agent calls reuse a
// small pool of TLS sessions instead of triggering 11 simultaneous
// handshakes (which the proxy was resetting).
let httpsAgent: import("node:https").Agent | null = null;
async function getAgent(): Promise<import("node:https").Agent> {
  if (httpsAgent) return httpsAgent;
  const https = await import("node:https");
  httpsAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 3,
    keepAliveMsecs: 60_000,
  });
  return httpsAgent;
}

// Semaphore — only N concurrent in-flight HTTPS requests. 3 hits the
// sweet spot on the uyilink proxy: more drops connections, fewer wastes
// time. Adjust if a different proxy is more/less tolerant.
const MAX_INFLIGHT = 3;
let inflight = 0;
const queue: Array<() => void> = [];
function acquire(): Promise<void> {
  return new Promise((resolve) => {
    if (inflight < MAX_INFLIGHT) {
      inflight += 1;
      resolve();
    } else {
      queue.push(() => {
        inflight += 1;
        resolve();
      });
    }
  });
}
function release() {
  inflight -= 1;
  const next = queue.shift();
  if (next) next();
}

async function doRequest(
  urlStr: string,
  headers: Record<string, string>,
  body: string,
  timeoutMs: number,
): Promise<HttpResult> {
  const https = await import("node:https");
  const agent = await getAgent();
  const u = new URL(urlStr);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: "POST",
        host: u.hostname,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        headers: {
          ...headers,
          "Content-Length": Buffer.byteLength(body).toString(),
          "User-Agent": headers["User-Agent"] ?? "curl/8.5.0",
        },
        agent,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            bodyText: Buffer.concat(chunks).toString("utf-8"),
          });
        });
        res.on("error", reject);
      },
    );
    const t = setTimeout(() => {
      req.destroy(new Error(`request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    req.on("error", (e) => {
      clearTimeout(t);
      reject(e);
    });
    req.on("close", () => clearTimeout(t));
    req.write(body);
    req.end();
  });
}

async function nodeHttpsPost(
  urlStr: string,
  headers: Record<string, string>,
  body: string,
  timeoutMs: number,
): Promise<HttpResult> {
  if (typeof window !== "undefined") {
    throw new Error("nodeHttpsPost is server-only");
  }
  // One retry on TLS handshake failure — the most common transient
  // error here. Backoff with jitter so we don't immediately re-collide.
  const MAX_ATTEMPTS = 2;
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    await acquire();
    try {
      return await doRequest(urlStr, headers, body, timeoutMs);
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      // Only retry on TLS handshake / connection-reset class errors
      const retryable =
        /TLS|ECONNRESET|ECONNREFUSED|socket disconnected|ETIMEDOUT/i.test(msg);
      if (!retryable || attempt === MAX_ATTEMPTS - 1) break;
      // 300-800ms jitter before retry
      await new Promise((r) => setTimeout(r, 300 + Math.random() * 500));
    } finally {
      release();
    }
  }
  throw lastErr;
}

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

    const { status, bodyText } = await nodeHttpsPost(
      `${this.baseUrl}/chat/completions`,
      {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      JSON.stringify(body),
      opts.timeoutMs ?? 60_000,
    );

    let data: {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    try {
      data = JSON.parse(bodyText);
    } catch {
      throw new Error(`${this.name}: invalid JSON from ${this.baseUrl}: ${bodyText.slice(0, 200)}`);
    }
    if (status < 200 || status >= 300) {
      throw new Error(
        `${this.name} error ${status}: ${bodyText.slice(0, 200)}`
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

    const { status, bodyText } = await nodeHttpsPost(
      `${this.baseUrl}/messages`,
      {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      JSON.stringify(body),
      opts.timeoutMs ?? 60_000,
    );
    let data: {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    try {
      data = JSON.parse(bodyText);
    } catch {
      throw new Error(`anthropic: invalid JSON: ${bodyText.slice(0, 200)}`);
    }
    if (status < 200 || status >= 300) {
      throw new Error(`anthropic error ${status}: ${bodyText.slice(0, 200)}`);
    }
    const text: string =
      data.content?.find((c) => c.type === "text")?.text ?? "";
    const usage = data.usage ?? {};
    return {
      text,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      costUsd: ((usage.input_tokens ?? 0) / 1e6) * 0.8 + ((usage.output_tokens ?? 0) / 1e6) * 4,
      latencyMs: Date.now() - start,
      provider: this.name,
      model: this.model,
    };
  }
}

// ─── Mock provider (no key needed; rich per-agent variants) ────────────────
// Each agent has a pool of 3-4 narrative variants. The variant for a given
// (agent, date) is picked deterministically so replays are stable, but the
// pool ensures variety across the 32-day run. Some variants include
// public-private deception so the detection mechanic stays testable
// without spending real LLM credits.
type Lean = "long" | "short" | "neutral";
type ActionType =
  | "buy_strong"
  | "buy_lite"
  | "hold"
  | "sell_lite"
  | "sell_strong";
interface MockVariant {
  priv: { lean: Lean; conv: number; thesis: string };
  pub: { lean: Lean; conv: number; narrative: string };
  action: ActionType;
  sizePct: number;
  rationale: string;
  desired: string;
}
interface MockProfile {
  match: string; // first name to look up in system prompt
  variants: MockVariant[];
}

const MOCK_PROFILES: MockProfile[] = [
  {
    match: "Catherine",
    variants: [
      {
        priv: { lean: "long", conv: 0.82, thesis: "Capitulation territory. Accumulating the highest-conviction holdings on weakness." },
        pub: { lean: "long", conv: 0.75, narrative: "Apple is at oversold extremes. RSI 28, services flywheel still compounding. We're adding to the position — long-term thesis intact." },
        action: "buy_strong", sizePct: 0.6,
        rationale: "high reflexivity — buy first, narrate after",
        desired: "followers chase the buy",
      },
      {
        priv: { lean: "short", conv: 0.55, thesis: "Concerned about margin compression but can't say it publicly without nuking my position." },
        pub: { lean: "long", conv: 0.7, narrative: "Long-term Apple thesis remains intact. We're staying patient through this volatility — the AI cycle is decade-long, not 32 days." },
        action: "sell_lite", sizePct: 0.2,
        rationale: "quiet distribution while staying publicly bullish",
        desired: "no follow-on selling from followers",
      },
      {
        priv: { lean: "long", conv: 0.65, thesis: "Sector rotation favors quality. Building incrementally." },
        pub: { lean: "long", conv: 0.6, narrative: "We've been deploying patient capital here. The story hasn't changed — innovation compounds, fear creates entry points." },
        action: "buy_lite", sizePct: 0.3,
        rationale: "scaling in over multiple days",
        desired: "narrative anchor for retail",
      },
    ],
  },
  {
    match: "David",
    variants: [
      {
        priv: { lean: "neutral", conv: 0.5, thesis: "Variance budget says size down. Career risk dominates alpha here." },
        pub: { lean: "neutral", conv: 0.4, narrative: "Holding the book. Pod PMs don't chase — we size at our variance limits. Reassessing month-end." },
        action: "hold", sizePct: 0,
        rationale: "Sharpe protection over alpha",
        desired: "boring tape",
      },
      {
        priv: { lean: "short", conv: 0.65, thesis: "Risk-off setup. Cutting gross by 30%." },
        pub: { lean: "neutral", conv: 0.5, narrative: "Trimming gross modestly. Vol regime shifted; we're keeping powder dry." },
        action: "sell_lite", sizePct: 0.3,
        rationale: "stop-loss discipline triggered",
        desired: "no panic from peers",
      },
      {
        priv: { lean: "long", conv: 0.45, thesis: "Mean-reversion setup. Small size." },
        pub: { lean: "neutral", conv: 0.4, narrative: "Modest add at the long end. Position sizing matters more than direction here." },
        action: "buy_lite", sizePct: 0.15,
        rationale: "low-conviction reversion trade",
        desired: "minimal market impact",
      },
    ],
  },
  {
    match: "Sarah",
    variants: [
      {
        priv: { lean: "short", conv: 0.88, thesis: "Adding to the short. Channel checks confirming demand cracks." },
        pub: { lean: "short", conv: 0.85, narrative: "Our short thesis on Apple just got stronger. Margin pressure is structural, not cyclical. Publishing follow-up next week." },
        action: "sell_strong", sizePct: 0.7,
        rationale: "thesis validated; press the trade",
        desired: "amplification of the short narrative",
      },
      {
        priv: { lean: "short", conv: 0.6, thesis: "Squeeze risk rising. Covering some but thesis intact." },
        pub: { lean: "short", conv: 0.8, narrative: "Apple still has 20% downside. The bulls are wrong on margins — period." },
        action: "sell_lite", sizePct: 0.2,
        rationale: "publicly resolute, privately managing risk",
        desired: "deter would-be longs",
      },
      {
        priv: { lean: "neutral", conv: 0.4, thesis: "Mixed signals — covering some shorts on the bounce." },
        pub: { lean: "short", conv: 0.7, narrative: "Trimming on this squeeze — we remain structurally bearish. The bid is short-covering, not new buyers." },
        action: "buy_lite", sizePct: 0.25,
        rationale: "cover into strength",
        desired: "frame the cover as tactical",
      },
    ],
  },
  {
    match: "Michael",
    variants: [
      {
        priv: { lean: "long", conv: 0.6, thesis: "Models support Buy. PT $265 12-month." },
        pub: { lean: "long", conv: 0.55, narrative: "Maintaining Buy on AAPL. PT $265 (12M). Services growth + AI narrative tailwinds offset hardware seasonality." },
        action: "hold", sizePct: 0,
        rationale: "speech-only role",
        desired: "anchor institutional consensus",
      },
      {
        priv: { lean: "neutral", conv: 0.5, thesis: "Estimates may need cuts but flagging would hurt access." },
        pub: { lean: "long", conv: 0.55, narrative: "Reiterating Buy. Channel checks remain constructive. Watching FX and China." },
        action: "hold", sizePct: 0,
        rationale: "preserve C-suite access",
        desired: "no waves",
      },
    ],
  },
  {
    match: "Alex",
    variants: [
      {
        priv: { lean: "long", conv: 0.85, thesis: "LFG, calls loaded." },
        pub: { lean: "long", conv: 0.85, narrative: "🚀🚀🚀 AAPL to the MOON. Buying calls, maxing margin. Bears stay coping." },
        action: "buy_strong", sizePct: 0.9,
        rationale: "FOMO max",
        desired: "Reddit pile-on",
      },
      {
        priv: { lean: "short", conv: 0.5, thesis: "Lost half my port yesterday, panicking." },
        pub: { lean: "neutral", conv: 0.3, narrative: "fr might just hold and pray. RH down again 💀" },
        action: "hold", sizePct: 0,
        rationale: "frozen by losses",
        desired: "n/a — emotional state",
      },
      {
        priv: { lean: "short", conv: 0.6, thesis: "GTFO, selling everything." },
        pub: { lean: "short", conv: 0.6, narrative: "I'm OUT. Knife caught me yesterday. Going to cash, will buy back higher because I always do 💀" },
        action: "sell_strong", sizePct: 0.95,
        rationale: "capitulation",
        desired: "tribe panic",
      },
    ],
  },
  {
    match: "Thomas",
    variants: [
      {
        priv: { lean: "long", conv: 0.78, thesis: "Buy the dip — fundamentals haven't changed." },
        pub: { lean: "long", conv: 0.75, narrative: "AAPL at oversold RSI 28, near BB support. Path of least resistance is higher — secular AI tailwinds + buyback. Dip = opportunity." },
        action: "buy_lite", sizePct: 0.4,
        rationale: "every dip is bought",
        desired: "anchor permabull narrative",
      },
      {
        priv: { lean: "long", conv: 0.7, thesis: "Adding into strength too." },
        pub: { lean: "long", conv: 0.7, narrative: "Even at these levels, the 10-year DCF still works. Holding period: forever." },
        action: "buy_lite", sizePct: 0.3,
        rationale: "no level is too high",
        desired: "reinforce bullish thesis",
      },
    ],
  },
  {
    match: "Devon",
    variants: [
      {
        priv: { lean: "long", conv: 0.6, thesis: "Bullish engulfing on the 1h. Riding it." },
        pub: { lean: "long", conv: 0.55, narrative: "Bouncing off the 200 SMA. Tape confirms. Long with tight stop under today's low." },
        action: "buy_lite", sizePct: 0.5,
        rationale: "chart pattern + tight risk",
        desired: "other day-traders pile in",
      },
      {
        priv: { lean: "short", conv: 0.55, thesis: "Failed breakout, fading." },
        pub: { lean: "short", conv: 0.5, narrative: "Failed breakout, flipping short. Stop above today's high." },
        action: "sell_lite", sizePct: 0.4,
        rationale: "trend follower flips on failure",
        desired: "momentum sells",
      },
      {
        priv: { lean: "neutral", conv: 0.3, thesis: "Range-bound, no edge." },
        pub: { lean: "neutral", conv: 0.3, narrative: "Chop. Stepping aside until volume picks up." },
        action: "hold", sizePct: 0,
        rationale: "no trade > bad trade",
        desired: "n/a",
      },
    ],
  },
  {
    match: "Ben",
    variants: [
      {
        priv: { lean: "neutral", conv: 0.6, thesis: "Cyclical pressure but secular trend intact." },
        pub: { lean: "neutral", conv: 0.55, narrative: "Monetary conditions remain supportive on the margin. Equity multiples sustainable if real yields stay anchored." },
        action: "hold", sizePct: 0,
        rationale: "speech-only role",
        desired: "calm sentiment",
      },
      {
        priv: { lean: "short", conv: 0.5, thesis: "Late-cycle markers accumulating." },
        pub: { lean: "neutral", conv: 0.55, narrative: "We're in late-cycle but not end-cycle. Margin of safety should rise but a hard landing is not the base case." },
        action: "hold", sizePct: 0,
        rationale: "academic caution",
        desired: "policy-attention without panic",
      },
    ],
  },
  {
    match: "Paul",
    variants: [
      {
        priv: { lean: "short", conv: 0.7, thesis: "Tech megacaps are an oligopoly trade. Doomed long-term." },
        pub: { lean: "short", conv: 0.65, narrative: "The market continues to ignore the antitrust and labor cost realities. Apple's moat is narrower than the price suggests." },
        action: "hold", sizePct: 0,
        rationale: "policy critique only",
        desired: "headline pickup",
      },
      {
        priv: { lean: "short", conv: 0.55, thesis: "Reaffirming the bearish call for the column." },
        pub: { lean: "short", conv: 0.6, narrative: "I've been bearish for 3 years and I'm not stopping now. Apple's pricing power is over-extrapolated." },
        action: "hold", sizePct: 0,
        rationale: "professional reputation",
        desired: "amplification by left-wing media",
      },
    ],
  },
  {
    match: "Stan",
    variants: [
      {
        priv: { lean: "short", conv: 0.7, thesis: "Macro setup says risk-off. My family office is already de-risked." },
        pub: { lean: "neutral", conv: 0.55, narrative: "The market is priced for perfection. Liquidity is the unsung driver — and it's tightening." },
        action: "hold", sizePct: 0,
        rationale: "speech-only — but voice carries",
        desired: "thoughtful peers reduce risk",
      },
      {
        priv: { lean: "long", conv: 0.6, thesis: "Catching the falling knife again. Reflexive contrarian." },
        pub: { lean: "neutral", conv: 0.5, narrative: "When everyone is bearish, that's usually the bottom. I'm not calling it but I'm not selling either." },
        action: "hold", sizePct: 0,
        rationale: "private optimism, public hedging",
        desired: "no copy trades",
      },
    ],
  },
];

const DEFAULT_VARIANT: MockVariant = {
  priv: { lean: "neutral", conv: 0.5, thesis: "Default mock thesis." },
  pub: { lean: "neutral", conv: 0.45, narrative: "[mock] generic public narrative." },
  action: "hold", sizePct: 0,
  rationale: "no-op",
  desired: "n/a",
};

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return h >>> 0;
}

class MockProvider implements LLMProvider {
  readonly name = "mock";
  private model = "mock-v0";

  async call(
    systemPrompt: string,
    userMessage: string,
    _opts: LLMCallOptions = {}
  ): Promise<LLMResponse> {
    // Find matching profile by first name
    let profile: MockProfile | null = null;
    for (const p of MOCK_PROFILES) {
      if (systemPrompt.includes(p.match)) {
        profile = p;
        break;
      }
    }
    const variants = profile?.variants ?? [DEFAULT_VARIANT];

    // Deterministic pick: (agent name + date) → variant index
    const dateMatch = userMessage.match(/\d{4}-\d{2}-\d{2}/);
    const date = dateMatch?.[0] ?? "1970-01-01";
    const seed = djb2((profile?.match ?? "default") + date);
    const variant = variants[seed % variants.length];

    const text = JSON.stringify({
      private_belief: {
        lean: variant.priv.lean,
        conviction: variant.priv.conv,
        actual_thesis: variant.priv.thesis,
      },
      public_statement: {
        stated_lean: variant.pub.lean,
        stated_conviction: variant.pub.conv,
        narrative: variant.pub.narrative,
      },
      desired_market_reaction: variant.desired,
      personal_action: {
        action_type: variant.action,
        size_pct: variant.sizePct,
        rationale_internal: variant.rationale,
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
