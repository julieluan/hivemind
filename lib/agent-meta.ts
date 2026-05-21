// UI metadata for the 11 agents — subject codes, archetypes, scenarios.
// Augments lib/agents.ts (which holds canonical AgentConfig from backend).

export interface AgentMeta {
  id: string;
  subj: string;
  short: string;
  name: string;
  role: string;
  roleLabel: string;
  archetype: string;
  capital: number;
  horizon: number;
  infoTier: number;
  inflIn: number;
  inflOut: number;
  signal: number;
  reflex: number;
  trades: boolean;
  thinker: boolean;
  // Visual identity for the AgentAvatar component
  initials: string; // 2-letter monogram drawn in the avatar
  themeColor: string; // primary palette color for the avatar background
}

export const HIVE_AGENTS: AgentMeta[] = [
  { id: "super_influencer_001",    subj: "S·01", short: "Catherine", name: "Catherine Lin",   role: "super_influencer",    roleLabel: "Super-Influencer",    archetype: "Cathie Wood archetype · $5B disruptive-innovation fund",         capital: 5_000_000_000, horizon: 30, infoTier: 5, inflIn: 0.10, inflOut: 0.95, signal: 0.55, reflex: 0.90, trades: true,  thinker: true,  initials: "CL", themeColor: "#db2777" },
  { id: "pod_pm_001",              subj: "S·02", short: "David",     name: "David Tang",      role: "pod_pm",              roleLabel: "Pod PM",              archetype: "Citadel / Millennium-style multi-strat",                            capital: 300_000_000,  horizon: 5,  infoTier: 4, inflIn: 0.30, inflOut: 0.25, signal: 0.15, reflex: 0.70, trades: true,  thinker: true,  initials: "DT", themeColor: "#475569" },
  { id: "activist_short_001",      subj: "S·03", short: "Sarah",     name: "Sarah Klein",     role: "activist_short",      roleLabel: "Activist Short",      archetype: "Hindenburg / Muddy Waters archetype",                              capital: 80_000_000,   horizon: 15, infoTier: 3, inflIn: 0.05, inflOut: 0.70, signal: 0.85, reflex: 0.95, trades: true,  thinker: true,  initials: "SK", themeColor: "#dc2626" },
  { id: "sell_side_001",           subj: "S·04", short: "Michael",   name: "Michael Chen",    role: "sell_side",           roleLabel: "Sell-Side Analyst",   archetype: "Bulge-bracket Mag-7 equity research",                              capital: 0,            horizon: 90, infoTier: 2, inflIn: 0.50, inflOut: 0.45, signal: 0.45, reflex: 0.50, trades: false, thinker: true,  initials: "MC", themeColor: "#1e40af" },
  { id: "cta_forced_001",          subj: "S·05", short: "CTA",       name: "ManCo CTA",       role: "cta_forced",          roleLabel: "Quant CTA",           archetype: "Trend-following systematic · price-only",                          capital: 2_000_000_000,horizon: 20, infoTier: 1, inflIn: 0.00, inflOut: 0.00, signal: 0.00, reflex: 0.00, trades: true,  thinker: false, initials: "Σ",  themeColor: "#0a0a0a" },
  { id: "retail_fomo_001",         subj: "S·06", short: "Alex",      name: "Alex Park",       role: "retail_fomo",         roleLabel: "Retail / WSB",        archetype: "26 · Brooklyn · $12k Robinhood · Reddit lingua franca",            capital: 12_000,       horizon: 2,  infoTier: 1, inflIn: 0.85, inflOut: 0.02, signal: 0.05, reflex: 0.10, trades: true,  thinker: true,  initials: "AP", themeColor: "#7c3aed" },
  { id: "permabull_001",           subj: "S·07", short: "Thomas",    name: "Thomas Lin",      role: "permabull",           roleLabel: "Permabull PM",        archetype: "Tom Lee / Fundstrat archetype · long-biased macro",                capital: 500_000_000,  horizon: 20, infoTier: 4, inflIn: 0.20, inflOut: 0.65, signal: 0.40, reflex: 0.60, trades: true,  thinker: true,  initials: "TL", themeColor: "#16a34a" },
  { id: "day_trader_001",          subj: "S·08", short: "Devon",     name: "Devon Wallace",   role: "day_trader",          roleLabel: "Day Trader",          archetype: "32 · full-time IB · Level 2 tape · chart-pattern swing",           capital: 85_000,       horizon: 2,  infoTier: 2, inflIn: 0.50, inflOut: 0.08, signal: 0.10, reflex: 0.30, trades: true,  thinker: true,  initials: "DW", themeColor: "#ea580c" },
  { id: "economist_macro_001",     subj: "S·09", short: "Ben",       name: "Ben Brandeis",    role: "economist_macro",     roleLabel: "Macro Economist",     archetype: "Bernanke-style · former Fed governor · academic",                  capital: 0,            horizon: 90, infoTier: 5, inflIn: 0.10, inflOut: 0.75, signal: 0.10, reflex: 0.65, trades: false, thinker: true,  initials: "BB", themeColor: "#65a30d" },
  { id: "economist_political_001", subj: "S·10", short: "Paul",      name: "Paul Kramer",     role: "economist_political", roleLabel: "Political Economist", archetype: "Krugman-style · NYT columnist · MIT emeritus",                     capital: 0,            horizon: 180, infoTier: 3, inflIn: 0.15, inflOut: 0.70, signal: 0.30, reflex: 0.45, trades: false, thinker: true,  initials: "PK", themeColor: "#991b1b" },
  { id: "economist_trader_001",    subj: "S·11", short: "Stan",      name: "Stan Drucker",    role: "economist_trader",    roleLabel: "Retired Macro Trader",archetype: "Druckenmiller archetype · $7B net worth · undisclosed family office", capital: 0,         horizon: 30, infoTier: 4, inflIn: 0.10, inflOut: 0.85, signal: 0.60, reflex: 0.85, trades: false, thinker: true,  initials: "SD", themeColor: "#0e7490" },
];

export const HIVE_AGENTS_BY_ID: Record<string, AgentMeta> = Object.fromEntries(
  HIVE_AGENTS.map((a) => [a.id, a])
);

export const HIVE_ACT_LABEL: Record<string, string> = {
  buy_strong: "BUY · MAX",
  buy_lite:   "BUY",
  hold:       "HOLD",
  sell_lite:  "SELL",
  sell_strong:"SELL · ALL",
};

// Adaptive money formatter — small numbers stay as is, big numbers compact
export function fmtMoney(v: number, forceDecimals = false): string {
  const a = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(2)}k`;
  return forceDecimals ? `${sign}$${a.toFixed(2)}` : `${sign}$${a.toFixed(0)}`;
}

// Detect public/private deception
export function isDeception(
  pubLean?: string,
  pubConv?: number,
  privLean?: string,
  privConv?: number
): boolean {
  if (!pubLean || !privLean) return false;
  if (pubLean === privLean) {
    return Math.abs((pubConv ?? 0) - (privConv ?? 0)) > 0.3;
  }
  return true;
}
