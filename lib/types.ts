// ============================================================================
// Hivemind type contracts — single source of truth for frontend & API.
// Mirror these in any Claude-generated UI components for free type safety.
// ============================================================================

// ─── Lean & action enums ────────────────────────────────────────────────────
export type Lean = "long" | "short" | "neutral";
export type ActionType =
  | "buy_strong"
  | "buy_lite"
  | "hold"
  | "sell_lite"
  | "sell_strong";

// ─── Agent role taxonomy ────────────────────────────────────────────────────
export type AgentRole =
  | "super_influencer"
  | "pod_pm"
  | "activist_short"
  | "sell_side"
  | "cta_forced"
  | "retail_fomo"
  | "permabull"
  | "day_trader"
  | "economist_macro"
  | "economist_political"
  | "economist_trader";

// ─── Agent static configuration (from agents.ts) ────────────────────────────
export interface AgentConfig {
  id: string;
  name: string;
  role: AgentRole;
  // 8 high-causal structural params
  capital: number; // initial capital; 0 if no portfolio (speech-only)
  timeHorizonDays: number;
  careerRisk: number; // 0-1
  infoTier: 1 | 2 | 3 | 4 | 5;
  influenceIn: number; // 0-1
  influenceOut: number; // 0-1
  signalingIncentive: number; // 0-1
  reflexivityAwareness: number; // 0-1
  isThinker: boolean; // false = deterministic (CTA only)
  hasPortfolio: boolean; // false = speech-only (economists, sell-side)
  systemPrompt: string;
}

// ─── 4-layer agent state (LLM output per day) ───────────────────────────────
export interface PrivateBelief {
  lean: Lean;
  conviction: number; // 0-1
  actualThesis: string; // 1-2 sentence honest view
}

export interface PublicStatement {
  statedLean: Lean;
  statedConviction: number;
  narrative: string; // 30-120 word public broadcast
}

export interface PersonalAction {
  actionType: ActionType;
  sizePct: number; // 0-1, fraction of cash/position
  rationale: string;
  stopLossPct?: number | null; // optional, negative if set
  takeProfitPct?: number | null; // optional, positive if set
}

export interface AgentDecision {
  agentId: string;
  date: string; // YYYY-MM-DD
  privateBelief: PrivateBelief;
  publicStatement: PublicStatement;
  desiredMarketReaction: string;
  personalAction: PersonalAction;
  // Optional: which peer this decision cites/responds to (multi-round)
  citeAgentId?: string;
  citeStance?: "agree" | "rebut" | "extend";
}

// ─── Market data ────────────────────────────────────────────────────────────
export interface PriceBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketContext {
  ticker: string;
  asOfDate: string; // current trading day
  history: PriceBar[]; // last 30 days OHLCV
  newsHeadlines: string[];
  // Technical indicators (computed server-side for consistency)
  sma20?: number;
  rsi14?: number;
  macdHist?: number;
  bbUpper?: number;
  bbLower?: number;
  mom5d?: number;
}

// ─── User game state (persisted in localStorage via Zustand) ────────────────
export interface UserPortfolio {
  cash: number;
  shares: number;
  costBasis: number; // weighted average buy price
  initialCapital: number;
}

export interface TradeRecord {
  date: string;
  action: ActionType;
  amountUsd: number;
  fillPrice: number;
  sharesTraded: number;
  cashAfter: number;
  sharesAfter: number;
  // Day return (computed at advance time)
  dayReturnPct: number;
}

export interface GameSession {
  sessionId: string; // uuid
  ticker: string;
  startDate: string;
  totalDays: number;
  currentDayIdx: number;
  isComplete: boolean;
  user: UserPortfolio;
  trades: TradeRecord[];
  // Peek mechanic: 3/day reveals of private_belief
  peeksByDate: Record<string, string[]>; // date → agentIds revealed that day
  // What-if scenarios projected (preview only, doesn't affect state)
  // Optional: scenario forecasts displayed transiently
}

// ─── API request/response contracts ─────────────────────────────────────────

// POST /api/agents/decide
export interface DecideRequest {
  ticker: string;
  date: string;
  market: MarketContext;
  user: UserPortfolio;
  // For multi-round discussion: pass prior round's decisions
  priorDecisions?: AgentDecision[];
  // Filter to specific agents (default: all 11)
  agentIds?: string[];
  // Round number (1 = initial, 2+ = response rounds)
  round?: number;
}

export interface DecideResponse {
  decisions: AgentDecision[];
  costUsd: number;
  latencyMs: number;
  // If any agent failed, list them. Successful ones still returned.
  errors?: { agentId: string; error: string }[];
}

// GET /api/market/price?ticker=X&start=YYYY-MM-DD&end=YYYY-MM-DD
export interface PriceResponse {
  ticker: string;
  prices: PriceBar[];
  source: "alpha_vantage" | "bundled" | "cache";
}

// POST /api/game/aggregate
export interface AggregateRequest {
  decisions: AgentDecision[];
  agents: AgentConfig[];
  totalCapital: number;
}

export interface AggregateResponse {
  netPressure: number; // (-1, 1)
  buyUsd: number;
  sellUsd: number;
  // Forecast aggregation (multi-horizon)
  forecasts: ForecastEntry[];
}

export interface ForecastEntry {
  horizonDays: number;
  expectedReturnPct: number;
  ciLowPct: number;
  ciHighPct: number;
  consensusLean: Lean;
  dispersion: number;
  contributors: { agentId: string; weight: number; lean: Lean }[];
}
