// Game scenarios — each is a 32-day window carved out of the bundled
// price data. Different regimes give different agent behavior (panic /
// FOMO / patience). Only the default scenario has a news cache;
// others run with empty headlines (agents still work without news).

export interface Scenario {
  id: string;
  ticker: string;
  startDate: string; // first trading day inclusive
  label: string;
  blurb: string;
  badge: "bull" | "bear" | "chop";
  // Approximate 32-day Buy & Hold return for the picker preview only.
  // Not authoritative — the actual play uses live OHLCV.
  bhReturnPct: number;
  hasNewsCache: boolean;
}

export const SCENARIOS: Scenario[] = [
  {
    id: "apr-2026",
    ticker: "AAPL",
    startDate: "2026-03-30",
    label: "April 2026 · earnings drift",
    blurb: "AAPL coming off oversold RSI 28 with earnings 18 days out. Real headlines fed in.",
    badge: "bull",
    bhReturnPct: 19.5,
    hasNewsCache: true,
  },
  {
    id: "feb-2025",
    ticker: "AAPL",
    startDate: "2025-02-19",
    label: "Feb 2025 · tariff shock",
    blurb: "Hot tape going into a sharp -17% drawdown. Macro panic kicks in mid-run.",
    badge: "bear",
    bhReturnPct: -17.0,
    hasNewsCache: false,
  },
  {
    id: "apr-2022",
    ticker: "AAPL",
    startDate: "2022-04-04",
    label: "April 2022 · rate-hike crash",
    blurb: "Pre-Fed pivot, $174 → $140 over 32 days. Multiple compression in real time.",
    badge: "bear",
    bhReturnPct: -19.3,
    hasNewsCache: false,
  },
  {
    id: "jan-2023",
    ticker: "AAPL",
    startDate: "2023-01-09",
    label: "Jan 2023 · AI rally launch",
    blurb: "The AI narrative ignites. AAPL +14% off the December lows. Permabulls win, shorts squeeze.",
    badge: "bull",
    bhReturnPct: 14.5,
    hasNewsCache: false,
  },
  {
    id: "aug-2024",
    ticker: "AAPL",
    startDate: "2024-08-05",
    label: "Aug 2024 · carry unwind",
    blurb: "Yen-carry unwind day-one. Volatility spike, hive disagrees sharply over 32 days.",
    badge: "chop",
    bhReturnPct: 10.8,
    hasNewsCache: false,
  },
];

export const DEFAULT_SCENARIO = SCENARIOS[0];

export function getScenario(id: string): Scenario {
  return SCENARIOS.find((s) => s.id === id) ?? DEFAULT_SCENARIO;
}
