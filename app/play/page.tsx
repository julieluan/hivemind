"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useGameStore } from "@/lib/store";
import { ALL_AGENTS } from "@/lib/agents";
import type {
  AgentDecision,
  MarketContext,
  AggregateResponse,
  PriceBar,
  ActionType,
} from "@/lib/types";
import { computeIndicators } from "@/lib/price-engine";
import { HIVE_AGENTS_BY_ID, fmtMoney, isDeception } from "@/lib/agent-meta";
import { StreamlitChart, type RangeKey, type Overlay } from "@/components/StreamlitChart";
import { Tutorial, type TutorialStep } from "@/components/Tutorial";
import { AgentAvatar } from "@/components/AgentAvatar";

// ────────────────────────────────────────────────────────────────
// What-if scenarios — same shape as Streamlit's SCENARIOS dict
// ────────────────────────────────────────────────────────────────

const SCENARIOS: Record<string, { shock: number; dir: "crash" | "rally"; blurb: string }> = {
  "War breaks out": { shock: -0.10, dir: "crash", blurb: "Risk-off, flight to safety, vol spikes" },
  "Fed surprise hike +50bps": { shock: -0.04, dir: "crash", blurb: "Multiple compression, growth re-rates" },
  "Apple earnings blowout": { shock: 0.06, dir: "rally", blurb: "Margin beat, guidance raise" },
  "Product recall scandal": { shock: -0.07, dir: "crash", blurb: "Brand hit, near-term cash impact" },
  "AI bubble bursts": { shock: -0.08, dir: "crash", blurb: "Tech selloff, rotation to value" },
  "Massive buyback announcement": { shock: 0.05, dir: "rally", blurb: "EPS accretion, signaling" },
};

// Each agent's tactical style for live scenario reaction (from Streamlit)
const AGENT_PERSONALITY: Record<string, string> = {
  super_influencer_001: "contrarian",
  pod_pm_001: "risk_cut",
  activist_short_001: "short_focused",
  cta_forced_001: "momentum",
  retail_fomo_001: "panic_fomo",
  permabull_001: "buy_dip",
  day_trader_001: "momentum",
};

function reactToScenario(
  personality: string,
  dir: "crash" | "rally",
  privLean: string,
  conviction: number,
  scenarioText: string
): { label: string; color: string; reasoning: string } {
  const c = conviction || 0.5;
  const event = scenarioText.length > 60 ? scenarioText.slice(0, 57) + "…" : scenarioText;

  if (personality === "momentum") {
    return dir === "crash"
      ? {
          label: "Sell",
          color: "var(--loss)",
          reasoning: `My systematic trend signal flipped negative the moment "${event}" hit the tape. I don't argue with price — I follow the new regime. Cutting longs, may flip short if momentum extends.`,
        }
      : {
          label: "Buy",
          color: "var(--gain)",
          reasoning: `Breakout signal triggered. "${event}" is the catalyst the tape needed. I add to the trend regardless of valuation — my edge is following price, not predicting it.`,
        };
  }
  if (personality === "contrarian") {
    const sz = Math.round(Math.min(0.75, 0.30 + 0.4 * c) * 100);
    return dir === "crash"
      ? {
          label: `Buy ${sz}%`,
          color: "var(--gain)",
          reasoning: `"${event}" is exactly the kind of overreaction my $5B fund waits for. I'm deploying ${sz}% of cash into quality names today, then going on CNBC to anchor the long-term narrative. Fear creates the alpha.`,
        }
      : {
          label: "Trim",
          color: "var(--loss)",
          reasoning: `Crowd is chasing "${event}" — that's my cue to fade. I quietly distribute ${Math.round(0.15 * 100)}% of my biggest winners while still publicly bullish. Reflexivity works both ways.`,
        };
  }
  if (personality === "panic_fomo") {
    return dir === "crash"
      ? {
          label: "Sell all",
          color: "var(--loss)",
          reasoning: `Bro "${event}" just nuked my port. I'm out. All of it. I'll buy back higher if it bounces — I always do. Twitter is melting down, I'm not catching this knife.`,
        }
      : {
          label: "Buy max",
          color: "var(--gain)",
          reasoning: `"${event}" — LFG! 🚀 Margin maxed, calls loaded, this is going to the moon. Cope and seethe to the bears. I will be drinking champagne tonight.`,
        };
  }
  if (personality === "buy_dip") {
    const sz = Math.round(Math.min(0.75, 0.30 + 0.4 * c) * 100);
    return {
      label: `Buy ${sz}%`,
      color: "var(--gain)",
      reasoning: dir === "crash"
        ? `"${event}" is short-term noise. Apple has $200B in cash, a moat, and decades of compounding ahead. I'm adding ${sz}% — be greedy when others are fearful. My thesis hasn't changed in 15 years.`
        : `Even after "${event}" rally, the multiple is still reasonable on a 10-year DCF. I add into strength. Holding period: forever.`,
    };
  }
  if (personality === "short_focused") {
    return dir === "crash"
      ? {
          label: "Add short",
          color: "var(--loss)",
          reasoning: `Called this. "${event}" validates my short thesis. Adding to the position — there's another 15-20% downside as the market re-rates. Publishing a follow-up report tomorrow.`,
        }
      : {
          label: "Cover",
          color: "var(--muted)",
          reasoning: `"${event}" is squeezing me. Covering ${Math.round(0.30 * 100)}% of the position to manage risk, but my fundamental thesis stands. Will re-short if it gets back above resistance.`,
        };
  }
  if (personality === "risk_cut") {
    return dir === "crash"
      ? {
          label: privLean === "long" ? "Sell" : "Hold",
          color: "var(--loss)",
          reasoning: `"${event}" trips my Sharpe-protection rule. Cutting gross exposure by ${Math.round((privLean === "long" ? 0.5 : 0.2) * 100)}%. I'd rather underperform in upside than blow up — career risk dominates alpha capture for me.`,
        }
      : {
          label: "Hold",
          color: "var(--muted)",
          reasoning: `Pod PMs don't chase. "${event}" is interesting but I size at my variance budget — adding now means giving back basis points. Holding the book steady, will reassess at month-end.`,
        };
  }
  return {
    label: "Hold",
    color: "var(--muted)",
    reasoning: `${personality} hasn't formed a strong view on "${event}" yet. Staying neutral until more signal emerges.`,
  };
}

// ────────────────────────────────────────────────────────────────
// Top-level helpers
// ────────────────────────────────────────────────────────────────

function Metric({
  label,
  value,
  delta,
  deltaColor,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaColor?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-[0.06em] text-[var(--muted)] font-medium">
        {label}
      </div>
      <div className="text-[1.5rem] font-bold leading-tight tracking-tight num mt-0.5">
        {value}
      </div>
      {delta && (
        <div className="text-[0.82rem] num mt-0.5" style={{ color: deltaColor || "var(--muted)" }}>
          {delta}
        </div>
      )}
    </div>
  );
}

function SectionLabel({
  n,
  children,
  muted,
}: {
  n: number;
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 mb-3 mt-6 pb-2 border-b border-[var(--grid)]">
      <span
        className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold flex-shrink-0 ${
          muted ? "bg-[#cbd5e1] text-[#475569]" : "bg-[var(--ink)] text-white"
        }`}
      >
        {n}
      </span>
      <span className="text-[0.7rem] uppercase tracking-[0.08em] font-bold text-[var(--muted)]">
        {children}
      </span>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Voice card (matches Streamlit voice-block + private reveal)
// ────────────────────────────────────────────────────────────────

function VoiceCard({
  decision,
  peeked,
  peeksLeft,
  accused,
  onProbe,
  onAccuse,
}: {
  decision: AgentDecision;
  peeked: boolean;
  peeksLeft: number;
  accused: boolean;
  onProbe: () => void;
  onAccuse: () => void;
}) {
  const meta = HIVE_AGENTS_BY_ID[decision.agentId];
  if (!meta) return null;
  const pub = decision.publicStatement;
  const priv = decision.privateBelief;
  const act = decision.personalAction;
  const deception = isDeception(pub.statedLean, pub.statedConviction, priv.lean, priv.conviction);

  const leanColor = (l: string) =>
    l === "long" ? "var(--gain)" : l === "short" ? "var(--loss)" : "var(--muted)";
  const actLabel: Record<string, string> = {
    buy_strong: "Buy max",
    buy_lite: "Buy",
    hold: "Hold",
    sell_lite: "Sell",
    sell_strong: "Sell all",
  };
  const actColor = act.actionType.includes("buy")
    ? "var(--gain)"
    : act.actionType.includes("sell")
      ? "var(--loss)"
      : "var(--muted)";

  return (
    <div
      className={`py-3 border-t border-[var(--grid)] first:border-t-0 ${
        accused ? "border-l-[3px] border-l-[var(--loss)] pl-2 -ml-2 bg-red-50/30" : ""
      }`}
    >
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <AgentAvatar
          agentId={decision.agentId}
          size={40}
          ring={accused ? "accuse" : peeked ? "peek" : null}
        />
        <span className="font-semibold text-[0.95rem]">{meta.name}</span>
        <span className="text-[11px] text-[var(--faint)] font-medium">{meta.roleLabel}</span>
        {deception && peeked && <span className="text-xs" title="public diverges from private">🎭</span>}
        <span className="text-[11px] ml-auto" style={{ color: leanColor(pub.statedLean) }}>
          <strong>{pub.statedLean.toLowerCase()}</strong>
          <span className="text-[var(--faint)] ml-1">· {Math.round(pub.statedConviction * 100)}%</span>
        </span>
        <span className="text-[11px]" style={{ color: actColor }}>
          → {actLabel[act.actionType] || act.actionType}
        </span>
      </div>
      <div className="text-[0.85rem] text-[var(--muted)] italic leading-snug">
        &ldquo;{(pub.narrative || "").slice(0, 240)}&rdquo;
      </div>

      {peeked && (
        <div
          className="mt-2 px-3 py-2 rounded-r-md"
          style={{
            background: deception ? "#fff1f2" : "var(--hint)",
            borderLeft: deception ? "3px solid var(--loss)" : "3px solid var(--hint-border)",
          }}
        >
          <div
            className="text-[10px] uppercase tracking-wider font-semibold mb-1"
            style={{ color: deception ? "var(--loss)" : "#92400e" }}
          >
            {deception ? "🎭 CAUGHT LYING — private truth revealed" : "👁 Private thoughts revealed"}
          </div>
          <div className="text-[0.85rem] text-[var(--ink)] leading-snug">
            <strong style={{ color: leanColor(priv.lean) }}>{priv.lean}</strong>{" "}
            <span className="text-[var(--muted)]">(conviction {Math.round(priv.conviction * 100)}%)</span>{" "}
            — <em>{priv.actualThesis}</em>
          </div>
        </div>
      )}

      <div className="mt-1.5 flex items-center gap-3 flex-wrap">
        {!peeked && (
          <button
            onClick={onProbe}
            disabled={peeksLeft <= 0}
            className="text-[11px] text-blue-600 hover:underline disabled:text-[var(--faint)] disabled:cursor-not-allowed disabled:no-underline"
          >
            👁 Peek private thoughts ({peeksLeft}/3 today)
          </button>
        )}
        <button
          onClick={onAccuse}
          className={`text-[11px] font-semibold rounded-md px-2 py-0.5 border transition-colors ${
            accused
              ? "bg-[var(--loss)] text-white border-[var(--loss)]"
              : "bg-white text-[var(--loss)] border-[var(--loss)]/40 hover:border-[var(--loss)]"
          }`}
          title={
            accused
              ? "You called them out as lying today. Click to retract."
              : "Commit your read: this agent is lying today."
          }
        >
          {accused ? "🚩 Flagged as lying" : "🚩 Call out as lying"}
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Day Reveal Modal — the "Among Us voting" moment
// Shows after player commits a day: caught liars, missed liars, false flags
// ────────────────────────────────────────────────────────────────

type DayResult = {
  date: string;
  dayNum: number;
  accusations: string[];
  decisions: AgentDecision[];
  tp: number;
  fp: number;
  fn: number;
  isLastDay: boolean;
};

function DayResultModal({ result, onClose }: { result: DayResult; onClose: () => void }) {
  const accused = new Set(result.accusations);
  const lying = (d: AgentDecision) =>
    isDeception(
      d.publicStatement.statedLean,
      d.publicStatement.statedConviction,
      d.privateBelief.lean,
      d.privateBelief.conviction,
    );
  const liars = result.decisions.filter(lying);
  const caught = liars.filter((d) => accused.has(d.agentId));
  const missed = liars.filter((d) => !accused.has(d.agentId));
  const falseFlagged = result.decisions.filter((d) => accused.has(d.agentId) && !lying(d));

  const score = result.tp - result.fp;

  let headline = "";
  let headlineColor = "var(--ink)";
  if (result.accusations.length === 0 && liars.length === 0) {
    headline = "😇 Clean day — nobody was lying";
  } else if (result.accusations.length === 0) {
    headline = `😶 You didn't flag anyone — ${liars.length} liar${liars.length > 1 ? "s" : ""} slipped through`;
    headlineColor = "var(--muted)";
  } else if (score > 0 && result.fp === 0) {
    headline = score >= 3 ? "🔥 Perfect — every flag landed!" : "🎯 Good reads today";
    headlineColor = "var(--gain)";
  } else if (score > 0) {
    headline = "👁 More right than wrong";
    headlineColor = "var(--gain)";
  } else if (score === 0 && result.tp > 0) {
    headline = "🤝 Even split — some hits, some misses";
  } else if (result.fp > 0 && result.tp === 0) {
    headline = "😅 All false flags — none of your targets were lying";
    headlineColor = "var(--loss)";
  } else {
    headline = "📊 No flags placed";
    headlineColor = "var(--muted)";
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center px-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl max-w-sm w-full p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="text-center mb-4">
          <div className="text-[10px] uppercase tracking-[0.15em] text-[var(--muted)] font-bold mb-1">
            Day {result.dayNum} · {result.date} · Reveal
          </div>
          <div className="text-lg font-bold leading-snug" style={{ color: headlineColor }}>
            {headline}
          </div>
          {result.accusations.length > 0 && (
            <div
              className="text-3xl font-extrabold num mt-1 leading-none"
              style={{ color: score > 0 ? "var(--gain)" : score < 0 ? "var(--loss)" : "var(--muted)" }}
            >
              {score >= 0 ? "+" : ""}{score} detection
            </div>
          )}
        </div>

        {/* Results */}
        <div className="space-y-3 mb-4">
          {caught.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold mb-1.5" style={{ color: "var(--gain)" }}>
                ✅ Caught ({caught.length})
              </div>
              {caught.map((d) => {
                const meta = HIVE_AGENTS_BY_ID[d.agentId];
                return (
                  <div key={d.agentId} className="flex items-center gap-2 py-1 border-t border-[var(--bg-soft)] first:border-t-0">
                    <AgentAvatar agentId={d.agentId} size={26} />
                    <span className="text-sm font-semibold flex-1">{meta?.name}</span>
                    <span className="text-[11px] text-[var(--muted)]">
                      said{" "}
                      <strong style={{ color: d.publicStatement.statedLean === "long" ? "var(--gain)" : d.publicStatement.statedLean === "short" ? "var(--loss)" : "var(--muted)" }}>
                        {d.publicStatement.statedLean}
                      </strong>
                      {" → secretly "}
                      <strong style={{ color: d.privateBelief.lean === "long" ? "var(--gain)" : d.privateBelief.lean === "short" ? "var(--loss)" : "var(--muted)" }}>
                        {d.privateBelief.lean}
                      </strong>
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {missed.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold mb-1.5 text-[var(--muted)]">
                😶 Missed ({missed.length})
              </div>
              {missed.map((d) => {
                const meta = HIVE_AGENTS_BY_ID[d.agentId];
                return (
                  <div key={d.agentId} className="flex items-center gap-2 py-1 border-t border-[var(--bg-soft)] first:border-t-0">
                    <AgentAvatar agentId={d.agentId} size={26} />
                    <span className="text-sm font-semibold flex-1">{meta?.name}</span>
                    <span className="text-[11px] text-[var(--muted)]">
                      was lying (
                      <strong style={{ color: d.privateBelief.lean === "long" ? "var(--gain)" : d.privateBelief.lean === "short" ? "var(--loss)" : "var(--muted)" }}>
                        {d.privateBelief.lean}
                      </strong>
                      {" privately"})
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {falseFlagged.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold mb-1.5" style={{ color: "var(--loss)" }}>
                ❌ False flag ({falseFlagged.length})
              </div>
              {falseFlagged.map((d) => {
                const meta = HIVE_AGENTS_BY_ID[d.agentId];
                return (
                  <div key={d.agentId} className="flex items-center gap-2 py-1 border-t border-[var(--bg-soft)] first:border-t-0">
                    <AgentAvatar agentId={d.agentId} size={26} />
                    <span className="text-sm font-semibold flex-1">{meta?.name}</span>
                    <span className="text-[11px] text-[var(--muted)]">was actually honest</span>
                  </div>
                );
              })}
            </div>
          )}

          {liars.length === 0 && result.accusations.length === 0 && (
            <div className="text-sm text-[var(--muted)] italic text-center py-2">
              All 10 agents told the truth today.
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="w-full bg-[var(--ink)] text-white py-2.5 rounded-lg font-semibold hover:opacity-90 transition-opacity text-sm"
        >
          {result.isLastDay ? "See final results →" : "Next day →"}
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Range pills — 1M / 3M / 1Y / 5Y / Sim radio
// ────────────────────────────────────────────────────────────────

function RangePills({
  value,
  onChange,
}: {
  value: RangeKey;
  onChange: (v: RangeKey) => void;
}) {
  const opts: RangeKey[] = ["1M", "3M", "1Y", "5Y", "Sim"];
  return (
    <div className="inline-flex border border-[var(--border)] rounded-md overflow-hidden bg-white">
      {opts.map((o) => {
        const on = value === o;
        return (
          <button
            key={o}
            onClick={() => onChange(o)}
            className={`px-3 py-1 text-xs font-semibold transition-colors ${
              on
                ? "bg-[var(--ink)] text-white"
                : "text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

// Plain-English explanations for technical indicators (shown on hover)
const INDICATOR_TIPS: Record<Overlay, string> = {
  SMA20:
    "Simple Moving Average over the last 20 days. A trend baseline — if price is above the SMA20 line, momentum is up; if below, down. Crossing it both ways is often used as a buy/sell signal.",
  BB:
    "Bollinger Bands. Two dotted lines drawn 2 standard deviations above and below the SMA20. Wide bands = high volatility, tight bands = low. Price tagging the upper band is often 'stretched up'; tagging the lower is 'oversold.'",
  RSI:
    "Relative Strength Index (14-day). 0–100 scale. Above 70 = overbought (stretched up, often pulls back). Below 30 = oversold (stretched down, often bounces). Shown as a purple line in its own panel below the chart.",
  MACD:
    "Moving Average Convergence Divergence. The histogram (green/red bars) shows the momentum of the trend. Crossing above zero = bullish cross. Crossing below = bearish cross. The orange dotted line is the 9-day signal smoothing.",
  Volume:
    "Number of shares traded each day. Big green bar on a down day = capitulation. Big red bar on an up day = distribution. Volume confirming a price move makes the move more reliable.",
};

function OverlayChips({
  value,
  onChange,
}: {
  value: Overlay[];
  onChange: (v: Overlay[]) => void;
}) {
  const opts: Overlay[] = ["SMA20", "BB", "RSI", "MACD", "Volume"];
  const toggle = (o: Overlay) =>
    onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  return (
    <div className="inline-flex gap-1 flex-wrap">
      {opts.map((o) => {
        const on = value.includes(o);
        return (
          <button
            key={o}
            onClick={() => toggle(o)}
            title={INDICATOR_TIPS[o]}
            className={`px-2.5 py-1 text-xs font-semibold rounded-md border transition-colors ${
              on
                ? "bg-[var(--ink)] text-white border-[var(--ink)]"
                : "bg-white text-[var(--muted)] border-[var(--border)] hover:border-[var(--ink)]"
            }`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Indicator pills under chart
// ────────────────────────────────────────────────────────────────

function Pill({
  label,
  value,
  sub,
  color,
  tip,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  tip?: string;
}) {
  return (
    <span
      title={tip}
      className={`inline-flex items-baseline gap-1.5 px-2.5 py-1 mr-1.5 mb-1.5 bg-[var(--bg-soft)] border border-[var(--grid)] rounded-md text-[0.82rem] ${
        tip ? "cursor-help" : ""
      }`}
    >
      <span className="text-[var(--muted)] font-medium">{label}</span>
      <span className="font-semibold num" style={{ color: color || "var(--ink)" }}>
        {value}
      </span>
      {sub && <span className="text-[var(--muted)] text-[0.75rem]">{sub}</span>}
    </span>
  );
}

// ────────────────────────────────────────────────────────────────
// Main play page
// ────────────────────────────────────────────────────────────────

export default function PlayPage() {
  const router = useRouter();
  const session = useGameStore((s) => s.session);
  const today = useGameStore((s) => s.today);
  const loadDay = useGameStore((s) => s.loadDay);
  const advanceDay = useGameStore((s) => s.advanceDay);
  const skipDays = useGameStore((s) => s.skipDays);
  const peek = useGameStore((s) => s.peek);
  const toggleAccusation = useGameStore((s) => s.toggleAccusation);
  const reset = useGameStore((s) => s.reset);
  const pendingAction = useGameStore((s) => s.pendingAction);
  const pendingAmount = useGameStore((s) => s.pendingAmountUsd);
  const setPending = useGameStore((s) => s.setPending);

  const [allPrices, setAllPrices] = useState<PriceBar[] | null>(null);
  const [pricesError, setPricesError] = useState<string | null>(null);
  const [agentStatus, setAgentStatus] = useState<string>("");
  const [agentErrors, setAgentErrors] = useState<{ agentId: string; error: string }[]>([]);
  const [range, setRange] = useState<RangeKey>("3M");
  const [overlays, setOverlays] = useState<Overlay[]>(["RSI", "Volume"]);
  const [todayNews, setTodayNews] = useState<string[]>([]);
  const [scenarioKey, setScenarioKey] = useState<string>("War breaks out");
  const [customEvent, setCustomEvent] = useState<string>("");
  const [activeScenario, setActiveScenario] = useState<string | null>(null);
  const [skipN, setSkipN] = useState<number>(3);
  const [llmReactions, setLlmReactions] = useState<
    Array<{ agentId: string; agentName: string; agentRole: string; action: string; reasoning: string; conviction: number }>
  >([]);
  const [llmReactLoading, setLlmReactLoading] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [dayResult, setDayResult] = useState<DayResult | null>(null);
  // Decisions that have streamed in but loadDay hasn't been called yet
  const [streamingDecisions, setStreamingDecisions] = useState<AgentDecision[]>([]);

  // Tutorial spotlight targets
  const chartRef = useRef<HTMLDivElement>(null);
  const voicesRef = useRef<HTMLDivElement>(null);
  const powerupsRef = useRef<HTMLDivElement>(null);
  const yourMoveRef = useRef<HTMLDivElement>(null);
  const standingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!session) router.replace("/");
  }, [session, router]);

  // Auto-open the spotlight tutorial on first day of a brand-new session,
  // unless the user dismissed it previously (localStorage flag).
  useEffect(() => {
    if (!session) return;
    if (session.currentDayIdx !== 0 || session.trades.length > 0) return;
    try {
      const seen = window.localStorage.getItem("hivemind:tutorialSeen");
      if (!seen) {
        // Defer slightly so layout has refs measured
        const t = setTimeout(() => setShowTutorial(true), 400);
        return () => clearTimeout(t);
      }
    } catch {
      // SSR / private mode — ignore
    }
  }, [session]);

  const dismissTutorial = () => {
    setShowTutorial(false);
    try {
      window.localStorage.setItem("hivemind:tutorialSeen", "1");
    } catch {
      // ignore
    }
  };

  // ── Fetch prices directly from static asset (fast, CDN-cached) ──────────
  useEffect(() => {
    if (allPrices || !session) return;
    fetch(`/data/${session.ticker}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((d: { prices: PriceBar[] }) => {
        setAllPrices(d.prices);
      })
      .catch((e) => setPricesError(`market data load failed: ${e}`));
  }, [allPrices, session]);

  // ── Per-day agent decide fetch ──────────────────────────────────────────
  useEffect(() => {
    if (!session || !allPrices || today || session.isComplete) return;
    const tradingPrices = allPrices.filter((p) => p.date >= session.startDate);
    const todayBar = tradingPrices[session.currentDayIdx];
    if (!todayBar) {
      setAgentStatus("end of data");
      return;
    }
    const histEndIdx = allPrices.findIndex((p) => p.date === todayBar.date);
    const history = allPrices.slice(Math.max(0, histEndIdx - 30), histEndIdx + 1);
    const closes = history.map((b) => b.close);
    const inds = computeIndicators(closes);

    // Fetch today's headlines first, then run agents with them in context
    const newsUrl = `/data/news/${session.ticker}_${todayBar.date}.json`;
    fetch(newsUrl)
      .then((r) => (r.ok ? r.json() : []))
      .then((arr: Array<{ title?: string }>) => {
        const headlines = (arr || [])
          .map((n) => (n?.title ?? "").replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .slice(0, 6);
        setTodayNews(headlines);
        return headlines;
      })
      .catch(() => {
        setTodayNews([]);
        return [];
      })
      .then(async (headlines: string[]) => {
        const market: MarketContext = {
          ticker: session.ticker,
          asOfDate: todayBar.date,
          history,
          newsHeadlines: headlines,
          sma20: inds.sma20 ?? undefined,
          rsi14: inds.rsi14 ?? undefined,
          macdHist: inds.macdHist ?? undefined,
          bbUpper: inds.bbUpper ?? undefined,
          bbLower: inds.bbLower ?? undefined,
          mom5d: inds.mom5d ?? undefined,
        };
        setAgentStatus(`agents deliberating…`);
        setStreamingDecisions([]);

        const resp = await fetch("/api/agents/decide", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker: session.ticker, date: todayBar.date, market, user: session.user }),
        });
        if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);

        // NDJSON streaming: each line is {"decision": AgentDecision} or {"done":true,...}
        const reader = resp.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        const allDecisions: AgentDecision[] = [];
        let finalErrors: { agentId: string; error: string }[] | undefined;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const obj = JSON.parse(line) as
                | { decision: AgentDecision }
                | { done: true; latencyMs: number; errors?: { agentId: string; error: string }[] };
              if ("done" in obj && obj.done) {
                finalErrors = obj.errors;
              } else if ("decision" in obj) {
                allDecisions.push(obj.decision);
                // Update streaming preview after each agent arrives
                setStreamingDecisions((prev) => [...prev, obj.decision]);
              }
            } catch {
              // Malformed chunk — skip
            }
          }
        }

        // Clear streaming preview and load the day with final decisions
        setStreamingDecisions([]);
        const totalCap = ALL_AGENTS.filter((a) => a.hasPortfolio).reduce((s, a) => s + a.capital, 0);
        const aggResp = await fetch("/api/game/aggregate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decisions: allDecisions, agents: ALL_AGENTS, totalCapital: totalCap }),
        });
        const agg = (await aggResp.json()) as AggregateResponse;
        loadDay(todayBar.date, allDecisions, market, agg);
        setAgentStatus("");
        setAgentErrors(finalErrors ?? []);
      })
      .catch((e) => setAgentStatus(`agents unreachable: ${e}`));
  }, [session, allPrices, today, loadDay]);

  // ── Derived state ───────────────────────────────────────────────────────
  const dayIdx = session?.currentDayIdx ?? 0;
  const total = session?.totalDays ?? 32;
  const isDone = session?.isComplete ?? false;
  const u = session?.user ?? null;
  const tradingPrices = useMemo(
    () => (allPrices && session ? allPrices.filter((p) => p.date >= session.startDate) : []),
    [allPrices, session]
  );
  const todayBar = tradingPrices[dayIdx] ?? null;
  const prevBar = dayIdx > 0 ? tradingPrices[dayIdx - 1] : null;
  const fill = todayBar?.open ?? 0;
  const totalVal = u ? u.cash + u.shares * fill : 0;
  const pnlPct = u && u.initialCapital > 0 ? ((totalVal - u.initialCapital) / u.initialCapital) * 100 : 0;
  const todayPct = todayBar && prevBar ? ((todayBar.open - prevBar.close) / prevBar.close) * 100 : 0;
  const bhShares = u ? Math.floor(u.initialCapital / (tradingPrices[0]?.open || fill || 1)) : 0;
  const bhCash = u ? u.initialCapital - bhShares * (tradingPrices[0]?.open || fill || 1) : 0;
  const bhVal = bhCash + bhShares * fill;
  const bhPnl = u && u.initialCapital > 0 ? ((bhVal - u.initialCapital) / u.initialCapital) * 100 : 0;
  const alpha = pnlPct - bhPnl;
  const unreal = u && u.shares > 0 && u.costBasis > 0 ? (fill / u.costBasis - 1) * 100 : 0;
  const maxBuyShares = u && fill > 0 ? Math.floor(u.cash / fill) : 0;

  // Indicators for the pills row (uses closes strictly before today, like Streamlit)
  const indicatorRow = useMemo(() => {
    if (!allPrices || !todayBar) return null;
    const closes = allPrices.filter((p) => p.date < todayBar.date).map((b) => b.close);
    return computeIndicators(closes);
  }, [allPrices, todayBar]);

  const userTradeMarks = useMemo(
    () =>
      session?.trades.map((t) => ({
        day: t.date,
        fillPrice: t.fillPrice,
        userBuyUsd: t.action.includes("buy") ? t.amountUsd : 0,
        userSellUsd: t.action.includes("sell") ? t.amountUsd : 0,
      })) ?? [],
    [session]
  );

  const simStart = tradingPrices[0]?.date ?? "";
  const simEnd = tradingPrices[tradingPrices.length - 1]?.date ?? "";

  const rankedDecisions = useMemo(() => {
    if (!today) return [];
    return [...today.decisions].sort(
      (a, b) => (b.publicStatement.statedConviction || 0) - (a.publicStatement.statedConviction || 0)
    );
  }, [today]);

  const peeksToday = today && session ? session.peeksByDate[today.date] ?? [] : [];
  const peeksLeft = 3 - peeksToday.length;
  const accusationsToday = today && session ? session.accusationsByDate?.[today.date] ?? [] : [];

  // Count how many agents are hiding their true position today (shown as a tension hint)
  const todayLiarCount = useMemo(() => {
    if (!today) return null;
    return today.decisions.filter((d) =>
      isDeception(
        d.publicStatement.statedLean,
        d.publicStatement.statedConviction,
        d.privateBelief.lean,
        d.privateBelief.conviction,
      )
    ).length;
  }, [today]);

  // Consecutive days where every flag was a correct hit (no false flags), to show streak
  const detectionStreak = useMemo(() => {
    if (!session) return 0;
    const sums = session.daySummaries;
    const accs = session.accusationsByDate ?? {};
    let streak = 0;
    for (let i = sums.length - 1; i >= 0; i--) {
      const s = sums[i];
      const flagged = new Set(accs[s.date] ?? []);
      if (flagged.size === 0) break;
      const tp = s.agents.filter((a) => a.deception && flagged.has(a.agentId)).length;
      const fp = s.agents.filter((a) => !a.deception && flagged.has(a.agentId)).length;
      if (tp > 0 && fp === 0) streak++;
      else break;
    }
    return streak;
  }, [session]);

  // ── Trade preview ────────────────────────────────────────────────────────
  const maxAvail =
    pendingAction === "buy_lite" ? (u?.cash ?? 0) : pendingAction === "sell_lite" ? (u?.shares ?? 0) * fill : 0;
  const pct = maxAvail > 0 ? Math.round((pendingAmount / maxAvail) * 100) : 0;

  useEffect(() => {
    if (!u) return;
    if (pendingAction === "buy_lite") setPending(pendingAction, Math.round(u.cash * 0.3));
    else if (pendingAction === "sell_lite") setPending(pendingAction, Math.round(u.shares * fill * 0.3));
    else setPending(pendingAction, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAction, dayIdx]);

  const handleCommit = () => {
    if (!todayBar || !today) return;
    // Capture today's detection results for the reveal modal before advancing
    const accused = new Set(accusationsToday);
    let tp = 0, fp = 0, fn = 0;
    for (const d of today.decisions) {
      const lying = isDeception(
        d.publicStatement.statedLean,
        d.publicStatement.statedConviction,
        d.privateBelief.lean,
        d.privateBelief.conviction,
      );
      if (accused.has(d.agentId)) {
        if (lying) tp++; else fp++;
      } else if (lying) {
        fn++;
      }
    }
    const isLastDay = dayIdx >= total - 1;
    setDayResult({
      date: today.date,
      dayNum: dayIdx + 1,
      accusations: [...accusationsToday],
      decisions: [...today.decisions],
      tp, fp, fn,
      isLastDay,
    });
    advanceDay({ fillPrice: todayBar.open, realCloseToday: todayBar.close });
  };

  if (!session || !u) {
    return <div className="p-12 text-center text-[var(--muted)]">loading…</div>;
  }

  const firstDay = dayIdx === 0 && session.trades.length === 0;

  // Trade preview text
  let preview: React.ReactNode = null;
  if (pendingAction === "buy_lite") {
    if (u.cash <= 0 || pendingAmount <= 0) {
      preview = <span className="text-[var(--muted)]">Enter an amount above to preview the trade.</span>;
    } else {
      const willBuy = Math.floor(pendingAmount / fill);
      const cost = willBuy * fill;
      preview = (
        <>
          Buy{" "}
          <strong style={{ color: "var(--gain)" }}>{willBuy.toLocaleString()} shares</strong> at ${fill.toFixed(2)} ·{" "}
          <strong>{fmtMoney(cost, true)}</strong> deployed
          <div className="text-xs text-[var(--muted)] mt-1">
            Cash after: {fmtMoney(u.cash - cost)} · Shares after: {(u.shares + willBuy).toLocaleString()}
          </div>
        </>
      );
    }
  } else if (pendingAction === "sell_lite") {
    if (u.shares <= 0) {
      preview = <span style={{ color: "var(--loss)" }}>You have no long position to sell.</span>;
    } else if (pendingAmount <= 0) {
      preview = <span className="text-[var(--muted)]">Enter an amount above to preview the trade.</span>;
    } else {
      let willSell = Math.floor(pendingAmount / fill);
      if (pendingAmount >= u.shares * fill - fill) willSell = u.shares;
      willSell = Math.min(willSell, u.shares);
      const proceeds = willSell * fill;
      preview = (
        <>
          Sell{" "}
          <strong style={{ color: "var(--loss)" }}>{willSell.toLocaleString()} shares</strong> at ${fill.toFixed(2)} · receive{" "}
          <strong>{fmtMoney(proceeds, true)}</strong>
          <div className="text-xs text-[var(--muted)] mt-1">
            Cash after: {fmtMoney(u.cash + proceeds)} · Shares after: {(u.shares - willSell).toLocaleString()}
          </div>
        </>
      );
    }
  } else {
    preview = <span className="text-[var(--muted)]">You&apos;ll hold this day — no trade executes.</span>;
  }

  return (
    <div className="max-w-[1180px] mx-auto px-4 py-4 pb-16">
      {/* ── Top header — Streamlit 7-column metric strip ─────────────────── */}
      <header className="grid grid-cols-[1.2fr_1fr_1fr_1fr_1fr_1fr_1fr] gap-4 items-baseline pb-3 mb-2">
        <div>
          <h1 className="text-2xl font-bold leading-tight tracking-tight">{session.ticker}</h1>
          <div className="text-[0.85rem] text-[var(--muted)] font-medium mt-0.5">
            {isDone ? `Final · ${todayBar?.date}` : `Day ${dayIdx + 1} of ${total} · ${todayBar?.date ?? "—"}`}
          </div>
        </div>
        <Metric
          label="Open"
          value={fill > 0 ? `$${fill.toFixed(2)}` : "—"}
          delta={prevBar ? `${todayPct >= 0 ? "+" : ""}${todayPct.toFixed(2)}%` : undefined}
          deltaColor={todayPct >= 0 ? "var(--gain)" : "var(--loss)"}
        />
        <Metric
          label="Avg cost"
          value={u.shares > 0 && u.costBasis > 0 ? `$${u.costBasis.toFixed(2)}` : "—"}
          delta={u.shares > 0 ? `${unreal >= 0 ? "+" : ""}${unreal.toFixed(2)}% unrealized` : "no position"}
          deltaColor={u.shares > 0 ? (unreal >= 0 ? "var(--gain)" : "var(--loss)") : "var(--muted)"}
        />
        <Metric label="Portfolio" value={fmtMoney(totalVal)} delta={`${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%`} deltaColor={pnlPct >= 0 ? "var(--gain)" : "var(--loss)"} />
        <Metric label="Cash" value={fmtMoney(u.cash)} />
        <Metric label="Position" value={u.shares > 0 ? "LONG" : "—"} delta={u.shares > 0 ? `${u.shares.toLocaleString()} sh` : undefined} />
        <Metric label="Alpha" value={`${alpha >= 0 ? "+" : ""}${alpha.toFixed(2)}%`} delta="vs B&H" deltaColor={alpha >= 0 ? "var(--gain)" : "var(--loss)"} />
      </header>

      <div className="border-t border-[var(--grid)] mb-3" />

      {/* ── Spotlight tutorial trigger (hidden after session ends) ───────── */}
      {!isDone && (
        <div className="flex justify-end mb-1">
          <button
            onClick={() => setShowTutorial(true)}
            className="text-[11px] text-[var(--muted)] hover:text-[var(--ink)] underline decoration-dotted underline-offset-4"
          >
            ? Take the tour
          </button>
        </div>
      )}

      {/* ── End-of-session — full recap ────────────────────────────────── */}
      {isDone && (() => {
        const sums = session.daySummaries;
        // Per-agent stats across the run
        const agentStats: Record<string, {
          name: string;
          role: string;
          deceptions: number;
          actions: Record<string, number>;
          avgPublicConv: number;
          avgPrivateConv: number;
          flipCount: number; // public vs private mismatch days
        }> = {};
        // Only show agents who actually trade — the speakers (sell-side
        // analyst + economists) have no portfolio and would show all "·" cells.
        const portfolioAgentIds = new Set(
          ALL_AGENTS.filter((a) => a.hasPortfolio && a.capital > 0).map((a) => a.id)
        );
        for (const aid of Object.keys(HIVE_AGENTS_BY_ID)) {
          if (!portfolioAgentIds.has(aid)) continue;
          const meta = HIVE_AGENTS_BY_ID[aid];
          agentStats[aid] = {
            name: meta.name,
            role: meta.roleLabel,
            deceptions: 0,
            actions: { buy_strong: 0, buy_lite: 0, hold: 0, sell_lite: 0, sell_strong: 0 },
            avgPublicConv: 0,
            avgPrivateConv: 0,
            flipCount: 0,
          };
        }
        for (const s of sums) {
          for (const a of s.agents) {
            const st = agentStats[a.agentId];
            if (!st) continue;
            if (a.deception) st.deceptions += 1;
            st.actions[a.action] = (st.actions[a.action] || 0) + 1;
            st.avgPublicConv += a.publicConv;
            st.avgPrivateConv += a.privateConv;
            if (a.publicLean !== a.privateLean) st.flipCount += 1;
          }
        }
        const dayN = Math.max(1, sums.length);
        for (const aid of Object.keys(agentStats)) {
          agentStats[aid].avgPublicConv /= dayN;
          agentStats[aid].avgPrivateConv /= dayN;
        }

        // Sorted agent list by deception count
        const agentsList = Object.entries(agentStats)
          .map(([aid, v]) => ({ aid, ...v }))
          .sort((a, b) => b.deceptions - a.deceptions);

        const totalDeceptions = agentsList.reduce((s, a) => s + a.deceptions, 0);
        const totalPeeks = Object.values(session.peeksByDate).reduce((s, v) => s + v.length, 0);
        const peekDays = Object.values(session.peeksByDate).filter((v) => v.length > 0).length;
        const tradeDays = session.trades.filter((t) => t.sharesTraded > 0).length;
        const holdDays = session.trades.length - tradeDays;

        // Per-agent PnL — uses session.agentPortfolios marked at today's open
        const agentPnl = (aid: string): number => {
          const p = session.agentPortfolios[aid];
          if (!p || p.initialCapital <= 0) return 0;
          const mark = p.cash + p.shares * fill;
          return ((mark - p.initialCapital) / p.initialCapital) * 100;
        };

        // Standings bar chart data
        const bars = [
          { name: "You", pnl: pnlPct, color: "#f59e0b", you: true, isBH: false },
          { name: "Buy & Hold", pnl: bhPnl, color: "#94a3b8", you: false, isBH: true },
          ...ALL_AGENTS.filter((a) => a.hasPortfolio && a.capital > 0).map((a) => ({
            name: HIVE_AGENTS_BY_ID[a.id]?.name ?? a.name,
            pnl: agentPnl(a.id),
            color: "#cbd5e1",
            you: false,
            isBH: false,
          })),
        ].sort((a, b) => b.pnl - a.pnl);
        const maxAbsPnl = Math.max(0.1, ...bars.map((b) => Math.abs(b.pnl)));
        const userRank = bars.findIndex((b) => b.you) + 1;
        const agentsBeaten = bars.filter((b) => !b.you && !b.isBH && b.pnl < pnlPct).length;
        const totalAgents = bars.filter((b) => !b.you && !b.isBH).length;
        const beatBH = pnlPct > bhPnl;
        // "Most" = strictly more than half of agents beaten
        const beatMost = agentsBeaten > totalAgents / 2;
        const inProfit = pnlPct > 0;
        const bhHot = bhPnl > 10; // annualized this would be ~120% — hot streak
        const userLast = userRank === bars.length;

        // Headline decision matrix — separates "beat the hive" from "beat B&H"
        // so a strong absolute run isn't shamed just because the market was hot.
        let headline: string;
        if (userRank === 1) {
          headline = "🏆 You won the hive.";
        } else if (beatBH && beatMost) {
          headline = "🏆 Crushed it — beat both Buy & Hold and most of the hive.";
        } else if (beatBH) {
          headline = "✅ You beat Buy & Hold.";
        } else if (beatMost && bhHot) {
          headline = "👏 Strong run — beat most of the hive. Buy & Hold was on fire this stretch (a hard benchmark to crack).";
        } else if (beatMost) {
          headline = "👏 Beat most of the hive — Buy & Hold edged you out.";
        } else if (agentsBeaten > 0 && inProfit) {
          headline = "🙂 Profitable run — beat a few agents.";
        } else if (inProfit) {
          headline = "🙂 You finished in the green. The hive was sharper this round.";
        } else if (userLast) {
          headline = "📉 Tough round — finished last.";
        } else {
          headline = "📉 Red zone — finished in the loss column. Try a different strategy next round.";
        }

        // Context line — gives B&H its credit so user understands the bar
        let bhContext = "";
        if (bhPnl > 15) bhContext = `📈 AAPL Buy & Hold was unusually strong this run: +${bhPnl.toFixed(2)}%.`;
        else if (bhPnl > 5) bhContext = `Buy & Hold returned +${bhPnl.toFixed(2)}% — a solid market backdrop.`;
        else if (bhPnl < -5) bhContext = `📉 AAPL Buy & Hold was negative: ${bhPnl.toFixed(2)}% — a hard tape for everyone.`;
        else bhContext = `Buy & Hold returned ${bhPnl >= 0 ? "+" : ""}${bhPnl.toFixed(2)}% — a sideways tape.`;

        // Days played vs skipped
        const daysPlayed = sums.length;
        const daysSkipped = session.currentDayIdx - daysPlayed;

        // Best/worst day — exclude pure-hold days where shares_traded == 0
        const activeTrades = session.trades.filter((t) => t.sharesTraded > 0);

        const mostDeceptive = agentsList[0];
        const fmtAction = (a: string) =>
          ({ buy_strong: "Buy max", buy_lite: "Buy", hold: "Hold", sell_lite: "Sell", sell_strong: "Sell all" }[a] || a);

        // ── Detection score (the social-deduction main metric) ──────────
        const accusations = session.accusationsByDate ?? {};
        let dTp = 0;
        let dFp = 0;
        let dFn = 0;
        const detectionPerAgent: Record<
          string,
          { tp: number; fp: number; flags: number; deceptions: number }
        > = {};
        for (const s of sums) {
          const flagged = new Set(accusations[s.date] ?? []);
          for (const a of s.agents) {
            if (!detectionPerAgent[a.agentId]) {
              detectionPerAgent[a.agentId] = { tp: 0, fp: 0, flags: 0, deceptions: 0 };
            }
            const ent = detectionPerAgent[a.agentId];
            if (a.deception) ent.deceptions += 1;
            if (flagged.has(a.agentId)) {
              ent.flags += 1;
              if (a.deception) {
                dTp += 1;
                ent.tp += 1;
              } else {
                dFp += 1;
                ent.fp += 1;
              }
            } else if (a.deception) {
              dFn += 1;
            }
          }
        }
        const totalFlags = dTp + dFp;
        const netDetection = dTp - dFp;
        let dVerdict: { text: string; color: string };
        if (totalFlags === 0) {
          dVerdict = { text: "📊 You played the tape, not the people.", color: "var(--muted)" };
        } else if (netDetection >= 5) {
          dVerdict = { text: "🎯 Sharp eye — you read the hive.", color: "var(--gain)" };
        } else if (netDetection >= 1) {
          dVerdict = { text: "👁 Decent reads — more right than wrong.", color: "var(--gain)" };
        } else if (netDetection === 0) {
          dVerdict = { text: "🤝 Even split — coin flip on your calls.", color: "var(--muted)" };
        } else if (netDetection >= -3) {
          dVerdict = { text: "🎲 Mixed signals — close but not quite.", color: "var(--loss)" };
        } else {
          dVerdict = { text: "😅 Trigger happy — too many false flags.", color: "var(--loss)" };
        }

        return (
          <div className="border-2 border-[var(--ink)] rounded-lg p-6 mb-6 bg-[var(--bg-soft)]">
            {/* Detection score hero — the social-deduction primary metric */}
            {totalFlags > 0 ? (
              <div className="mb-6 pb-5 border-b border-[var(--grid)]">
                <div className="text-[0.78rem] uppercase tracking-[0.1em] text-[var(--muted)] font-bold mb-3 text-center">
                  🕵️ Detection score · {totalFlags} flag{totalFlags === 1 ? "" : "s"} placed across the run
                </div>
                <div
                  className="text-center text-6xl font-extrabold num leading-none tracking-tight"
                  style={{
                    color:
                      netDetection > 0
                        ? "var(--gain)"
                        : netDetection < 0
                          ? "var(--loss)"
                          : "var(--muted)",
                  }}
                >
                  {netDetection >= 0 ? "+" : ""}
                  {netDetection}
                </div>
                <div
                  className="text-center text-sm font-semibold mt-2"
                  style={{ color: dVerdict.color }}
                >
                  {dVerdict.text}
                </div>
                <div className="grid grid-cols-3 gap-3 max-w-md mx-auto mt-4">
                  {[
                    { label: "Caught", value: dTp, color: "var(--gain)", sub: "true liars" },
                    { label: "Missed", value: dFn, color: "var(--muted)", sub: "lies you let pass" },
                    { label: "False", value: dFp, color: "var(--loss)", sub: "wrongly accused" },
                  ].map((m) => (
                    <div
                      key={m.label}
                      className="bg-white border border-[var(--border)] rounded-md p-3 text-center"
                    >
                      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold mb-1">
                        {m.label}
                      </div>
                      <div className="text-2xl font-bold num" style={{ color: m.color }}>
                        {m.value}
                      </div>
                      <div className="text-[10px] text-[var(--faint)] mt-0.5">{m.sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mb-6 pb-5 border-b border-[var(--grid)] text-center">
                <div className="text-[0.78rem] uppercase tracking-[0.1em] text-[var(--muted)] font-bold mb-2">
                  🕵️ Detection score
                </div>
                <div className="text-sm text-[var(--muted)] italic">
                  No 🚩 accusations placed.{" "}
                  {dFn > 0
                    ? `${dFn} deception${dFn === 1 ? "" : "s"} went unchallenged across the run.`
                    : "The hive was honest, or you weren't watching."}
                </div>
              </div>
            )}

            {/* Headline */}
            <div className="text-center mb-6">
              <div className="text-[0.78rem] uppercase tracking-[0.1em] text-[var(--muted)] font-bold mb-2">
                🏁 Final results · played {daysPlayed} day{daysPlayed === 1 ? "" : "s"}
                {daysSkipped > 0 && ` · skipped ${daysSkipped}`}
                {` of ${total}`}
              </div>
              <div className="text-2xl font-semibold mb-1 max-w-2xl mx-auto leading-snug">{headline}</div>
              <div className="text-sm text-[var(--muted)] mb-3">{bhContext}</div>
              <div
                className="text-5xl font-extrabold leading-none num tracking-tight"
                style={{ color: pnlPct > 0 ? "var(--gain)" : "var(--loss)" }}
              >
                {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
              </div>
              <div className="text-sm text-[var(--muted)] mt-2">
                Final portfolio {fmtMoney(totalVal)} · started with {fmtMoney(u.initialCapital)}
              </div>
            </div>

            {/* 4 KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {[
                { label: "Beat", value: `${agentsBeaten} / ${totalAgents}`, sub: "AI agents" },
                { label: "Rank", value: `#${userRank} / ${bars.length}`, sub: "incl. B&H" },
                { label: "vs B&H", value: `${alpha >= 0 ? "+" : ""}${alpha.toFixed(2)}%`, sub: "alpha", color: alpha >= 0 ? "var(--gain)" : "var(--loss)" },
                { label: "Trades", value: `${tradeDays}`, sub: `${holdDays} hold days` },
              ].map((m) => (
                <div key={m.label} className="bg-white border border-[var(--border)] rounded-md p-3 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold mb-1">{m.label}</div>
                  <div className="text-xl font-bold num" style={{ color: m.color }}>{m.value}</div>
                  <div className="text-[11px] text-[var(--muted)] mt-0.5">{m.sub}</div>
                </div>
              ))}
            </div>

            {/* Horizontal bar chart — all agents + user + B&H */}
            <div className="bg-white border border-[var(--border)] rounded-md p-4 mb-6">
              <div className="text-[0.72rem] uppercase tracking-wider text-[var(--muted)] font-bold mb-3">
                Final standings
              </div>
              {bars.map((b) => {
                const pct = (Math.abs(b.pnl) / maxAbsPnl) * 100;
                const isPos = b.pnl > 0;
                return (
                  <div key={b.name} className="grid grid-cols-[140px_1fr_60px] gap-2 items-center py-1 text-sm">
                    <span className={`truncate ${b.you ? "font-bold" : ""}`}>{b.name}</span>
                    <div className="relative h-5 bg-[var(--bg-soft)] rounded overflow-hidden">
                      <div
                        className="absolute h-full"
                        style={{
                          left: isPos ? "50%" : `${50 - pct / 2}%`,
                          width: `${pct / 2}%`,
                          background: b.you ? "#f59e0b" : isPos ? "var(--gain)" : "var(--loss)",
                          opacity: 0.85,
                        }}
                      />
                      <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[var(--border)]" />
                    </div>
                    <span
                      className="text-right num font-semibold text-xs"
                      style={{ color: b.pnl > 0 ? "var(--gain)" : b.pnl < 0 ? "var(--loss)" : "var(--muted)" }}
                    >
                      {b.pnl >= 0 ? "+" : ""}{b.pnl.toFixed(2)}%
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Per-agent breakdown — actions + deception + conviction */}
            <div className="bg-white border border-[var(--border)] rounded-md p-4 mb-6">
              <div className="flex items-baseline justify-between mb-3">
                <div className="text-[0.72rem] uppercase tracking-wider text-[var(--muted)] font-bold">
                  Per-agent recap · all {sums.length} days
                </div>
                <div className="text-[11px] text-[var(--muted)]">
                  🎭 {totalDeceptions} total deceptions across the hive
                  {mostDeceptive && mostDeceptive.deceptions > 0 && (
                    <span> · most deceptive: <strong>{mostDeceptive.name}</strong> ({mostDeceptive.deceptions}×)</span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-[1fr_60px_60px_60px_60px_60px_60px_80px_70px] gap-1 text-[10px] uppercase tracking-wider text-[var(--muted)] font-bold pb-1 border-b border-[var(--border)]">
                <span>Agent</span>
                <span className="text-center text-[var(--gain)]">Buy max</span>
                <span className="text-center text-[var(--gain)]">Buy</span>
                <span className="text-center">Hold</span>
                <span className="text-center text-[var(--loss)]">Sell</span>
                <span className="text-center text-[var(--loss)]">Sell all</span>
                <span className="text-center" title="days where public lean differed from private">🎭 Lied</span>
                <span className="text-center" title="your 🚩 calls: correct / total flags">🚩 You</span>
                <span className="text-right">Avg conv</span>
              </div>
              {agentsList.map((a) => {
                const det = detectionPerAgent[a.aid];
                const youCellText = det && det.flags > 0
                  ? `${det.tp}/${det.flags}`
                  : "—";
                const youCellColor = det && det.flags > 0
                  ? det.tp === det.flags
                    ? "var(--gain)"
                    : det.tp === 0
                      ? "var(--loss)"
                      : "var(--ink)"
                  : "var(--faint)";
                return (
                  <div
                    key={a.aid}
                    className="grid grid-cols-[1fr_60px_60px_60px_60px_60px_60px_80px_70px] gap-1 py-1.5 text-xs border-b border-[var(--grid)] items-baseline"
                  >
                    <span className="truncate">
                      <strong>{a.name}</strong>
                      <span className="text-[10px] text-[var(--faint)] ml-1.5">{a.role}</span>
                    </span>
                    <span className="text-center num">{a.actions.buy_strong || "·"}</span>
                    <span className="text-center num">{a.actions.buy_lite || "·"}</span>
                    <span className="text-center num">{a.actions.hold || "·"}</span>
                    <span className="text-center num">{a.actions.sell_lite || "·"}</span>
                    <span className="text-center num">{a.actions.sell_strong || "·"}</span>
                    <span className="text-center num" style={{ color: a.deceptions > 0 ? "var(--loss)" : "var(--muted)" }}>
                      {a.deceptions > 0 ? `${a.deceptions}/${sums.length}` : "0"}
                    </span>
                    <span
                      className="text-center num font-semibold"
                      style={{ color: youCellColor }}
                      title={
                        det && det.flags > 0
                          ? `You flagged ${det.flags}× · ${det.tp} were real lies · ${det.fp} were false flags`
                          : "You never flagged this agent."
                      }
                    >
                      {youCellText}
                    </span>
                    <span className="text-right num text-[11px]">
                      pub <strong>{Math.round(a.avgPublicConv * 100)}%</strong>
                      {a.avgPrivateConv > 0 && (
                        <span className="text-[var(--faint)]"> / priv {Math.round(a.avgPrivateConv * 100)}%</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Per-day per-agent action heatmap — hover for details */}
            <div className="bg-white border border-[var(--border)] rounded-md p-4 mb-6 overflow-x-auto">
              <div className="flex items-baseline justify-between mb-3">
                <div className="text-[0.72rem] uppercase tracking-wider text-[var(--muted)] font-bold">
                  Daily actions · {sums.length} days × {agentsList.length} agents
                </div>
                <div className="text-[10px] text-[var(--muted)] flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded-sm bg-[var(--gain)]" /> Buy
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded-sm bg-[var(--gain)] opacity-50" /> Buy lite
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded-sm bg-[var(--bg-soft)] border border-[var(--border)]" /> Hold
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded-sm bg-[var(--loss)] opacity-50" /> Sell lite
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="inline-block w-3 h-3 rounded-sm bg-[var(--loss)]" /> Sell
                  </span>
                  <span className="inline-flex items-center gap-1">
                    🎭 deception
                  </span>
                </div>
              </div>
              {(() => {
                const cellColor = (a: ActionType): { bg: string; opacity: number } => {
                  if (a === "buy_strong") return { bg: "var(--gain)", opacity: 1 };
                  if (a === "buy_lite") return { bg: "var(--gain)", opacity: 0.5 };
                  if (a === "sell_lite") return { bg: "var(--loss)", opacity: 0.5 };
                  if (a === "sell_strong") return { bg: "var(--loss)", opacity: 1 };
                  return { bg: "var(--bg-soft)", opacity: 1 };
                };
                const cellSize = 18;
                const colHeader = (
                  <div className="grid sticky top-0 bg-white z-10" style={{ gridTemplateColumns: `170px repeat(${sums.length}, ${cellSize}px)`, gap: 2 }}>
                    <div />
                    {sums.map((s, i) => (
                      <div
                        key={s.date}
                        className="text-[8px] text-[var(--faint)] font-mono text-center leading-none origin-bottom-left"
                        style={{ transform: "rotate(-60deg) translateY(8px)", height: 30 }}
                        title={s.date}
                      >
                        {i + 1}
                      </div>
                    ))}
                  </div>
                );
                return (
                  <div style={{ minWidth: 170 + (cellSize + 2) * sums.length }}>
                    {colHeader}
                    {agentsList.map((a) => (
                      <div
                        key={a.aid}
                        className="grid items-center"
                        style={{ gridTemplateColumns: `170px repeat(${sums.length}, ${cellSize}px)`, gap: 2, marginTop: 2 }}
                      >
                        <div className="text-xs truncate pr-2">
                          <span className="font-semibold">{a.name}</span>
                          <span className="text-[10px] text-[var(--faint)] ml-1">{a.role}</span>
                        </div>
                        {sums.map((s) => {
                          const entry = s.agents.find((x) => x.agentId === a.aid);
                          if (!entry) {
                            return (
                              <div
                                key={s.date}
                                style={{ width: cellSize, height: cellSize, background: "var(--bg-soft)", borderRadius: 3 }}
                                title={`${s.date}: no data`}
                              />
                            );
                          }
                          const { bg, opacity } = cellColor(entry.action);
                          const actLabel = {
                            buy_strong: "Buy max",
                            buy_lite: "Buy",
                            hold: "Hold",
                            sell_lite: "Sell",
                            sell_strong: "Sell all",
                          }[entry.action];
                          const tip = `${s.date} · ${actLabel}
public: ${entry.publicLean} ${Math.round(entry.publicConv * 100)}%
private: ${entry.privateLean} ${Math.round(entry.privateConv * 100)}%${entry.deception ? "\n🎭 DECEPTION — said public ≠ truth" : ""}`;
                          return (
                            <div
                              key={s.date}
                              style={{
                                width: cellSize,
                                height: cellSize,
                                background: bg,
                                opacity,
                                borderRadius: 3,
                                border: entry.deception ? "1.5px solid #d97706" : entry.action === "hold" ? "1px solid var(--border)" : "none",
                                position: "relative",
                                cursor: "help",
                              }}
                              title={tip}
                            >
                              {entry.deception && (
                                <span
                                  style={{
                                    position: "absolute",
                                    top: -3,
                                    right: -3,
                                    fontSize: 10,
                                    lineHeight: 1,
                                    pointerEvents: "none",
                                  }}
                                >
                                  🎭
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                );
              })()}
              <div className="text-[10px] text-[var(--muted)] mt-2 italic">
                Hover any cell for the agent&apos;s action, public &amp; private lean, and conviction.
                Skip-day cells are deterministic projections (based on personality + price move),
                not real LLM calls.
              </div>
            </div>

            {/* Your activity */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
              <div className="bg-white border border-[var(--border)] rounded-md p-4">
                <div className="text-[0.72rem] uppercase tracking-wider text-[var(--muted)] font-bold mb-2">
                  Your activity
                </div>
                <div className="text-sm space-y-1">
                  <div>Peeked private thoughts <strong>{totalPeeks}×</strong> across <strong>{peekDays}</strong> days
                    {peekDays > 0 && <span className="text-[var(--muted)]"> (avg {(totalPeeks / peekDays).toFixed(1)} / peek day)</span>}
                  </div>
                  <div>Traded on <strong>{tradeDays}</strong> days · held on <strong>{holdDays}</strong> days</div>
                  {activeTrades.length > 0 ? (
                    <div>
                      Best trade day{" "}
                      <span style={{ color: "var(--gain)" }} className="font-semibold">
                        {Math.max(...activeTrades.map((t) => t.dayReturnPct)).toFixed(2)}%
                      </span>{" "}
                      · Worst{" "}
                      <span style={{ color: "var(--loss)" }} className="font-semibold">
                        {Math.min(...activeTrades.map((t) => t.dayReturnPct)).toFixed(2)}%
                      </span>
                    </div>
                  ) : (
                    <div className="text-[var(--muted)] italic">No trades made — pure hold session.</div>
                  )}
                </div>
              </div>

              <div className="bg-white border border-[var(--border)] rounded-md p-4">
                <div className="text-[0.72rem] uppercase tracking-wider text-[var(--muted)] font-bold mb-2">
                  Hive net pressure
                </div>
                <div className="text-sm">
                  Average net pressure over the run:{" "}
                  <strong className="num">
                    {sums.length > 0
                      ? ((sums.reduce((s, x) => s + (x.netPressure || 0), 0) / sums.length) * 100).toFixed(1)
                      : "0.0"}%
                  </strong>{" "}
                  (positive = buy pressure)
                </div>
                <div className="text-xs text-[var(--muted)] mt-1">
                  Pressure spike days:{" "}
                  {sums
                    .map((s, i) => ({ s, i }))
                    .filter((x) => Math.abs(x.s.netPressure) > 0.3)
                    .slice(0, 3)
                    .map((x) => `${x.s.date} (${(x.s.netPressure * 100).toFixed(0)}%)`)
                    .join(" · ") || "none"}
                </div>
              </div>
            </div>

            {(() => {
              const shareParams = new URLSearchParams({
                tp: String(dTp),
                fp: String(dFp),
                fn: String(dFn),
                pnl: pnlPct.toFixed(2),
                beat: String(agentsBeaten),
                total: String(totalAgents),
                days: String(daysPlayed),
              });
              const shareRelative = `/share?${shareParams.toString()}`;
              const shareAbsolute =
                typeof window !== "undefined"
                  ? `${window.location.origin}${shareRelative}`
                  : shareRelative;
              const tweetText =
                totalFlags > 0
                  ? `I caught ${dTp} liars in Hivemind 🕵️ (net ${netDetection >= 0 ? "+" : ""}${netDetection}). Beat ${agentsBeaten}/${totalAgents} AI traders in ${daysPlayed} days.`
                  : `Played Hivemind: beat ${agentsBeaten}/${totalAgents} AI traders in ${daysPlayed} days. ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}% return.`;
              const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(shareAbsolute)}`;

              return (
                <>
                  <div className="text-center text-[11px] uppercase tracking-[0.1em] text-[var(--muted)] font-bold mb-2">
                    Share your run
                  </div>
                  <div className="flex justify-center gap-2 flex-wrap mb-3">
                    <a
                      href={tweetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 bg-white border border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)] px-4 py-2 rounded-md text-sm font-semibold transition-colors"
                    >
                      𝕏 Share on X
                    </a>
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(shareAbsolute);
                          const el = document.getElementById("copy-feedback");
                          if (el) {
                            el.textContent = "Link copied ✓";
                            setTimeout(() => {
                              if (el) el.textContent = "";
                            }, 1800);
                          }
                        } catch {
                          window.prompt("Copy this link:", shareAbsolute);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 bg-white border border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)] px-4 py-2 rounded-md text-sm font-semibold transition-colors"
                    >
                      🔗 Copy link
                    </button>
                    <a
                      href={shareRelative}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 bg-white border border-[var(--border)] hover:border-[var(--ink)] text-[var(--ink)] px-4 py-2 rounded-md text-sm font-semibold transition-colors"
                      title="Preview the share card"
                    >
                      👁 Preview card
                    </a>
                  </div>
                  <div
                    id="copy-feedback"
                    className="text-center text-xs text-[var(--gain)] mb-3 h-4 font-semibold"
                  />
                  <div className="flex justify-center gap-2">
                    <button
                      onClick={reset}
                      className="bg-[var(--ink)] text-white px-6 py-2.5 rounded-md text-sm font-semibold hover:opacity-90"
                    >
                      ↻ Play again
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        );
      })()}

      {!isDone && (
        <>
          {/* ── §1 Market chart + §2 News & voices (side-by-side grid) ───── */}
          <div className="grid grid-cols-1 md:grid-cols-[1.8fr_1fr] gap-6">
            <div ref={chartRef}>
              <SectionLabel n={1}>📈 Market chart</SectionLabel>
              {/* Range + overlay controls (inline above chart) */}
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <RangePills value={range} onChange={setRange} />
                <OverlayChips value={overlays} onChange={setOverlays} />
              </div>

              {allPrices && todayBar ? (
                <StreamlitChart
                  fullHistory={allPrices}
                  simStartDate={simStart || todayBar.date}
                  simEndDate={simEnd || todayBar.date}
                  todayDate={todayBar.date}
                  todayOpen={fill > 0 ? fill : null}
                  range={range}
                  overlays={overlays}
                  userTrades={userTradeMarks}
                />
              ) : (
                <div className="bg-white border border-[var(--grid)] rounded-md p-12 text-center text-xs text-[var(--faint)] font-mono">
                  loading market data…
                </div>
              )}

              {/* Indicator pills */}
              {indicatorRow && indicatorRow.sma20 != null && (
                <div className="mt-2 flex flex-wrap">
                  {indicatorRow.rsi14 != null && (
                    <Pill
                      label="RSI(14)"
                      value={indicatorRow.rsi14.toFixed(0)}
                      tip={INDICATOR_TIPS.RSI}
                      color={
                        indicatorRow.rsi14 > 70
                          ? "var(--loss)"
                          : indicatorRow.rsi14 < 30
                            ? "var(--gain)"
                            : "var(--ink)"
                      }
                    />
                  )}
                  {indicatorRow.macdHist != null && (
                    <Pill
                      label="MACD hist"
                      value={`${indicatorRow.macdHist >= 0 ? "+" : ""}${indicatorRow.macdHist.toFixed(2)}`}
                      sub={indicatorRow.macdDir === "bull" ? "▲" : indicatorRow.macdDir === "bear" ? "▼" : "—"}
                      color={indicatorRow.macdHist > 0 ? "var(--gain)" : "var(--loss)"}
                      tip={INDICATOR_TIPS.MACD}
                    />
                  )}
                  {indicatorRow.sma20 != null && (
                    <Pill label="SMA20" value={`$${indicatorRow.sma20.toFixed(2)}`} tip={INDICATOR_TIPS.SMA20} />
                  )}
                  {indicatorRow.mom5d != null && (
                    <Pill
                      label="5d mom"
                      value={`${indicatorRow.mom5d >= 0 ? "+" : ""}${indicatorRow.mom5d.toFixed(2)}%`}
                      color={indicatorRow.mom5d > 0 ? "var(--gain)" : "var(--loss)"}
                      tip="5-day momentum: how much the stock has moved over the last 5 trading days. Positive = up trend, negative = down."
                    />
                  )}
                  {indicatorRow.vol_ann != null && (
                    <Pill
                      label="Ann vol"
                      value={`${indicatorRow.vol_ann.toFixed(1)}%`}
                      tip="Annualized volatility: standard deviation of daily returns scaled to one year. 15–20% is normal for large caps; 40%+ is wild."
                    />
                  )}
                  {indicatorRow.bbUpper != null && indicatorRow.bbLower != null &&
                    indicatorRow.bbUpper !== indicatorRow.bbLower && fill > 0 && (
                      <Pill
                        label="BB"
                        value={`${(((fill - indicatorRow.bbLower) / (indicatorRow.bbUpper - indicatorRow.bbLower)) * 100).toFixed(0)}% band`}
                        tip={INDICATOR_TIPS.BB + " The % value shows where today's price sits inside the band: 0% = lower band, 100% = upper, 50% = midline."}
                      />
                    )}
                </div>
              )}

              {pricesError && (
                <div className="text-xs text-[var(--loss)] mt-2">⚠ {pricesError}</div>
              )}
              {agentStatus && (
                <div className="text-xs text-[var(--muted)] mt-2 font-mono">
                  {streamingDecisions.length > 0
                    ? `${streamingDecisions.length}/11 agents posted…`
                    : agentStatus}
                </div>
              )}
            </div>

            <div ref={voicesRef}>
              <SectionLabel n={2}>💬 News &amp; voices</SectionLabel>
              {/* Today's headlines (fed into agent prompts) */}
              <div className="text-[0.7rem] uppercase tracking-[0.08em] font-bold text-[var(--faint)] mb-2">
                Today&apos;s headlines
              </div>
              <div className="mb-5">
                {todayNews.length === 0 ? (
                  <div className="text-sm text-[var(--faint)] italic py-1">Quiet trading day</div>
                ) : (
                  todayNews.slice(0, 4).map((h, i) => (
                    <div
                      key={i}
                      className="text-[0.92rem] text-[#262626] leading-snug py-1.5 border-t border-[var(--bg-soft)] first:border-t-0"
                    >
                      {h}
                    </div>
                  ))
                )}
              </div>

              <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
                <div className="flex items-baseline gap-2">
                  <div className="text-[0.7rem] uppercase tracking-[0.08em] font-bold text-[var(--muted)]">
                    Voices today · all 11 agents
                  </div>
                  {todayLiarCount !== null && (
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{
                        color: todayLiarCount > 0 ? "#92400e" : "var(--muted)",
                        background: todayLiarCount > 0 ? "#fef3c7" : "var(--bg-soft)",
                        border: `1px solid ${todayLiarCount > 0 ? "#fcd34d" : "var(--border)"}`,
                      }}
                    >
                      🎭 {todayLiarCount} {todayLiarCount === 1 ? "liar" : "liars"} hiding today
                    </span>
                  )}
                  {detectionStreak >= 2 && (
                    <span className="text-[10px] font-bold text-amber-600">
                      🔥 {detectionStreak}-day streak
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-3 text-[10px] uppercase tracking-wider font-semibold">
                  <span className="text-[var(--muted)]">
                    👁 Peeks <span className="num text-[var(--ink)]">{peeksToday.length}/3</span>
                  </span>
                  <span className="text-[var(--muted)]">
                    🚩 Flagged{" "}
                    <span
                      className="num"
                      style={{
                        color: accusationsToday.length > 0 ? "var(--loss)" : "var(--ink)",
                      }}
                    >
                      {accusationsToday.length}
                    </span>
                  </span>
                </div>
                {agentErrors.length > 0 && (
                  <details className="text-[10px] text-[var(--loss)]">
                    <summary className="cursor-pointer">
                      ⚠ {agentErrors.length} LLM fallback{agentErrors.length === 1 ? "" : "s"}
                    </summary>
                    <div className="mt-1 p-2 bg-red-50 border border-red-200 rounded max-w-xs max-h-32 overflow-y-auto font-mono leading-tight">
                      {agentErrors.map((e) => (
                        <div key={e.agentId} className="mb-1">
                          <strong>{e.agentId}:</strong> {e.error.slice(0, 80)}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
              {rankedDecisions.length === 0 && streamingDecisions.length === 0 ? (
                <div className="text-sm text-[var(--muted)] py-8 text-center italic">
                  {agentStatus ? "agents deliberating…" : "agents forming their views…"}
                </div>
              ) : (
                <div className="max-h-[520px] overflow-y-auto pr-2 -mr-2">
                  {/* Show fully-loaded decisions if available, else streaming preview */}
                  {(rankedDecisions.length > 0 ? rankedDecisions : streamingDecisions).map((d) => (
                    <VoiceCard
                      key={d.agentId}
                      decision={d}
                      peeked={peeksToday.includes(d.agentId)}
                      peeksLeft={peeksLeft}
                      accused={accusationsToday.includes(d.agentId)}
                      onProbe={() => peek(d.agentId)}
                      onAccuse={() => toggleAccusation(d.agentId)}
                    />
                  ))}
                  {/* Skeleton placeholder for remaining streaming agents */}
                  {rankedDecisions.length === 0 && streamingDecisions.length < 11 &&
                    Array.from({ length: Math.min(11 - streamingDecisions.length, 3) }).map((_, i) => {
                      const placeholderAgent = ALL_AGENTS.filter(a => a.role !== "cta_forced")[
                        streamingDecisions.length + i
                      ];
                      const meta = placeholderAgent ? HIVE_AGENTS_BY_ID[placeholderAgent.id] : null;
                      return (
                        <div
                          key={`skeleton-${i}`}
                          className="py-3 border-t border-[var(--grid)] first:border-t-0 animate-pulse"
                        >
                          <div className="flex items-center gap-2">
                            {meta ? (
                              <AgentAvatar agentId={placeholderAgent!.id} size={40} />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-[var(--bg-soft)]" />
                            )}
                            <div className="flex-1">
                              <div className="h-3 bg-[var(--bg-soft)] rounded w-24 mb-1.5" />
                              <div className="h-2 bg-[var(--bg-soft)] rounded w-40" />
                            </div>
                            <div className="h-3 bg-[var(--bg-soft)] rounded w-12" />
                          </div>
                          <div className="mt-2 h-2.5 bg-[var(--bg-soft)] rounded w-full" />
                          <div className="mt-1 h-2.5 bg-[var(--bg-soft)] rounded w-4/5" />
                        </div>
                      );
                    })
                  }
                </div>
              )}
            </div>
          </div>

          {/* ── §2 Power-ups (optional) ────────────────────────────────────── */}
          <SectionLabel n={3} muted>
            Power-ups · optional · project a what-if scenario, or skip days
          </SectionLabel>

          <div ref={powerupsRef} className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4 mb-3">
            {/* What-if scenario — chip-style, matches Range/Overlay UI */}
            <div className="bg-[var(--bg-soft)] border border-[var(--border)] rounded-lg p-3">
              <div className="text-[0.72rem] uppercase tracking-wider text-[var(--muted)] font-semibold mb-2">
                🌐 What-if scenario · agents react
              </div>
              {/* Preset chips */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {Object.keys(SCENARIOS).map((k) => {
                  const on = scenarioKey === k && !customEvent;
                  return (
                    <button
                      key={k}
                      onClick={() => {
                        setScenarioKey(k);
                        setCustomEvent("");
                      }}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border transition-colors ${
                        on
                          ? "bg-[var(--ink)] text-white border-[var(--ink)]"
                          : "bg-white text-[var(--muted)] border-[var(--border)] hover:border-[var(--ink)]"
                      }`}
                    >
                      {k}
                    </button>
                  );
                })}
              </div>
              {/* Custom event input */}
              <div className="flex gap-1.5 items-stretch">
                <input
                  type="text"
                  value={customEvent}
                  onChange={(e) => setCustomEvent(e.target.value)}
                  placeholder="Or type your own event: Trump bans iPhone in EU…"
                  className="flex-1 px-2.5 py-1.5 text-[12px] border border-[var(--border)] rounded-md bg-white focus:border-[var(--ink)] outline-none"
                />
                <button
                  onClick={async () => {
                    const ev = customEvent || scenarioKey;
                    setActiveScenario(ev);
                    setLlmReactLoading(true);
                    setLlmReactions([]);
                    try {
                      const shockPct = SCENARIOS[ev]?.shock;
                      const resp = await fetch("/api/agents/scenario-react", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          scenarioText: ev,
                          shockPct,
                          ticker: session.ticker,
                          asOfDate: todayBar?.date ?? "today",
                        }),
                      });
                      const j = await resp.json();
                      setLlmReactions(j.reactions ?? []);
                    } catch {
                      // surface in UI via empty result
                    } finally {
                      setLlmReactLoading(false);
                    }
                  }}
                  disabled={llmReactLoading}
                  className="px-4 py-1.5 bg-[var(--ink)] text-white rounded-md text-[12px] font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-wait"
                  title="Calls Claude Haiku for each agent — takes 10-20s for real reasoning"
                >
                  {llmReactLoading ? "🤖 Thinking…" : "🤖 Run scenario"}
                </button>
                {activeScenario && (
                  <button
                    onClick={() => {
                      setActiveScenario(null);
                      setLlmReactions([]);
                    }}
                    className="px-3 py-1.5 border border-[var(--border)] rounded-md text-[12px] font-semibold hover:border-[var(--ink)]"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="text-[10px] text-[var(--muted)] mt-1.5">
                Calls Claude on each agent in parallel — each one really thinks. ~10-20s.
              </div>
            </div>

            {/* Skip N days — narrow column */}
            <div className="bg-[var(--bg-soft)] border border-[var(--border)] rounded-lg p-3">
              <div className="text-[0.72rem] uppercase tracking-wider text-[var(--muted)] font-semibold mb-2">
                ⏩ Skip days
              </div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {[3, 5, 10].map((n) => {
                  const on = skipN === n;
                  return (
                    <button
                      key={n}
                      onClick={() => setSkipN(n)}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md border transition-colors ${
                        on
                          ? "bg-[var(--ink)] text-white border-[var(--ink)]"
                          : "bg-white text-[var(--muted)] border-[var(--border)] hover:border-[var(--ink)]"
                      }`}
                    >
                      {n}d
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => {
                  const slice = tradingPrices.slice(dayIdx, dayIdx + skipN);
                  skipDays(slice);
                }}
                className="w-full px-3 py-1.5 bg-[var(--ink)] text-white rounded-md text-[12px] font-semibold hover:opacity-90"
              >
                Skip {skipN} days
              </button>
            </div>
          </div>

          {/* Full-width what-if result panel — breaks out of the cards above */}
          {activeScenario && (() => {
            const scen = SCENARIOS[activeScenario];
            const isCustom = !scen;
            const dir: "crash" | "rally" = scen?.dir ?? "crash";
            const accent = dir === "crash" ? "#ea580c" : "#0891b2";
            const bg = dir === "crash" ? "#fff7ed" : "#ecfeff";

            const rows = llmReactions.map((r) => {
              const meta = HIVE_AGENTS_BY_ID[r.agentId];
              const isLong = r.action.toLowerCase().includes("buy");
              const isShort = r.action.toLowerCase().includes("sell");
              return {
                key: r.agentId,
                name: meta?.name ?? r.agentName,
                role: meta?.roleLabel ?? r.agentRole,
                action: r.action,
                color: isLong ? "var(--gain)" : isShort ? "var(--loss)" : "var(--muted)",
                reasoning: r.reasoning,
                conv: r.conviction,
              };
            });

            return (
              <div
                className="rounded-lg p-4 mb-4 border-l-[4px]"
                style={{ background: bg, border: `1px solid ${accent}`, borderLeftWidth: 4 }}
              >
                <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
                  <div className="text-[0.85rem] font-bold uppercase tracking-wider" style={{ color: accent }}>
                    🌐 If &ldquo;{activeScenario}&rdquo;
                  </div>
                  <div className="text-[0.78rem] text-[var(--muted)]">
                    {isCustom ? "Custom event · shock unknown" : `Estimated shock ${scen.shock >= 0 ? "+" : ""}${(scen.shock * 100).toFixed(0)}% · ${scen.blurb}`}
                    {rows.length > 0 && (
                      <span className="font-semibold" style={{ color: accent }}>{" · 🤖 LLM-driven"}</span>
                    )}
                  </div>
                </div>

                {llmReactLoading && (
                  <div className="text-sm text-[var(--muted)] italic py-4 text-center">
                    🤖 10 agents thinking about the scenario… (10-20s)
                  </div>
                )}

                {rows.length > 0 && (
                  <div className="space-y-2">
                    {rows.map((r) => (
                      <div key={r.key} className="bg-white/70 border border-white rounded-md p-2.5">
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="font-bold text-[0.92rem]">{r.name}</span>
                          <span className="text-[11px] text-[var(--faint)]">{r.role}</span>
                          <span className="ml-auto text-[11px] text-[var(--muted)]">
                            conviction {Math.round(r.conv * 100)}%
                          </span>
                          <span className="font-bold text-[0.92rem]" style={{ color: r.color }}>
                            → {r.action}
                          </span>
                        </div>
                        <div className="text-[0.85rem] text-[#374151] leading-snug">{r.reasoning}</div>
                      </div>
                    ))}
                  </div>
                )}

                {rows.length === 0 && !llmReactLoading && (
                  <div className="text-sm text-[var(--muted)] italic py-2">
                    Click 🤖 Run scenario to see how each agent thinks about &ldquo;{activeScenario}&rdquo;.
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── §4 Make your move ─────────────────────────────────────────── */}
          <SectionLabel n={4}>Make your move — Buy, Hold, or Sell, then Confirm</SectionLabel>

          <div ref={yourMoveRef} className="bg-gradient-to-b from-[var(--bg-soft)] to-white border border-[var(--border)] rounded-xl p-4">
            <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
              <span className="text-[0.85rem] uppercase tracking-[0.08em] font-bold text-[var(--ink)]">
                YOUR MOVE · DAY {dayIdx + 1}
              </span>
              <span className="text-xs text-[var(--muted)]">
                Trading at open: <strong className="text-[var(--ink)] num">${fill.toFixed(2)}</strong>
              </span>
            </div>
            <div className="flex gap-6 text-xs text-[var(--muted)] mb-4 flex-wrap">
              <span>Cash: <strong className="text-[var(--ink)] num">{fmtMoney(u.cash)}</strong></span>
              <span>Shares: <strong className="text-[var(--ink)] num">{u.shares >= 0 ? "+" : ""}{u.shares.toLocaleString()}</strong></span>
              <span>Max buy: <strong className="text-[var(--ink)] num">{maxBuyShares.toLocaleString()} sh</strong> ({fmtMoney(maxBuyShares * fill)})</span>
            </div>

            {/* 3 big action buttons */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              {(["buy_lite", "hold", "sell_lite"] as ActionType[]).map((a) => {
                const isOn = pendingAction === a;
                const label = a === "buy_lite" ? "🟢  BUY" : a === "hold" ? "⏸  HOLD" : "🔴  SELL";
                return (
                  <button
                    key={a}
                    onClick={() => setPending(a, pendingAmount)}
                    className={`py-3 rounded-md font-semibold text-sm border-[1.5px] transition-all ${
                      isOn
                        ? "bg-[var(--ink)] text-white border-[var(--ink)]"
                        : "bg-white text-[var(--ink)] border-[var(--border)] hover:border-[var(--ink)]"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Amount input + slider */}
            {pendingAction !== "hold" && maxAvail > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-[2fr_3fr] gap-4 mb-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1 font-medium">
                    Amount in USD · max ${maxAvail.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={maxAvail}
                    step={Math.max(100, Math.round(maxAvail / 100 / 100) * 100)}
                    value={pendingAmount}
                    onChange={(e) => setPending(pendingAction, Number(e.target.value))}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-md font-mono text-sm focus:border-[var(--ink)] outline-none num"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1 font-medium">
                    Percent of {pendingAction === "buy_lite" ? "cash" : "position"} to {pendingAction === "buy_lite" ? "deploy" : "sell"} — {pct}%
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={pct}
                    onChange={(e) =>
                      setPending(pendingAction, Math.round((Number(e.target.value) / 100) * maxAvail))
                    }
                    className="w-full"
                  />
                </div>
              </div>
            )}

            {/* Preview */}
            <div className="bg-white border-l-[3px] border-[var(--ink)] px-3 py-2 rounded text-sm mb-3">
              <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1 font-semibold">
                Trade preview
              </div>
              <div>{preview}</div>
            </div>

            <div className="flex justify-end items-center gap-2 mt-1">
              <span className="text-[11px] text-[var(--muted)] mr-2">
                Locks today&apos;s trade and rolls the market forward one day.
              </span>
              <button
                onClick={handleCommit}
                className="bg-[var(--ink)] text-white px-5 py-2 rounded-md font-semibold text-sm hover:opacity-90 transition-opacity"
              >
                Confirm &amp; advance →
              </button>
            </div>
          </div>

          {/* ── Standings ─────────────────────────────────────────────────── */}
          <SectionLabel n={5} muted>
            Standings · you vs the hive
          </SectionLabel>

          <div ref={standingsRef} className="text-xs">
            <div className="grid grid-cols-[40px_1fr_80px] gap-2 py-1 border-b border-[var(--border)] uppercase tracking-wider text-[var(--muted)] font-bold">
              <span>#</span>
              <span>Trader</span>
              <span className="text-right">P&amp;L</span>
            </div>
            {(() => {
              const liveAgentPnl = (aid: string): number => {
                const p = session.agentPortfolios?.[aid];
                if (!p || p.initialCapital <= 0) return 0;
                const mark = p.cash + p.shares * fill;
                return ((mark - p.initialCapital) / p.initialCapital) * 100;
              };
              const rows = [
                { name: "You", role: "the twelfth trader", pnl: pnlPct, you: true, agentId: null as string | null },
                { name: "Buy & Hold", role: "passive index", pnl: bhPnl, you: false, agentId: null as string | null },
                ...ALL_AGENTS.filter((a) => a.hasPortfolio && a.capital > 0).map((a) => ({
                  name: HIVE_AGENTS_BY_ID[a.id]?.name ?? a.name,
                  role: HIVE_AGENTS_BY_ID[a.id]?.roleLabel ?? a.role,
                  pnl: liveAgentPnl(a.id),
                  you: false,
                  agentId: a.id as string | null,
                })),
              ].sort((a, b) => b.pnl - a.pnl);
              return rows.map((r, i) => (
                <div
                  key={r.name}
                  className={`grid grid-cols-[40px_1fr_80px] gap-2 py-2 border-b border-[var(--grid)] items-center ${
                    r.you ? "bg-[var(--hint)] rounded -mx-1 px-1" : ""
                  }`}
                >
                  <span className="text-[var(--faint)] num">#{i + 1}</span>
                  <span className="flex items-center gap-2 min-w-0">
                    {r.agentId ? (
                      <AgentAvatar agentId={r.agentId} size={24} />
                    ) : (
                      <div
                        className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[10px] font-bold"
                        style={{ background: r.you ? "#f59e0b" : "#94a3b8" }}
                      >
                        {r.you ? "👤" : "📊"}
                      </div>
                    )}
                    <span className="truncate">
                      <span className="font-semibold">{r.name}</span>
                      <span className="text-[var(--faint)] text-[11px] ml-2">{r.role}</span>
                    </span>
                  </span>
                  <span
                    className={`text-right font-mono font-semibold num ${
                      r.pnl > 0 ? "text-[var(--gain)]" : r.pnl < 0 ? "text-[var(--loss)]" : "text-[var(--muted)]"
                    }`}
                  >
                    {r.pnl >= 0 ? "+" : ""}
                    {r.pnl.toFixed(2)}%
                  </span>
                </div>
              ));
            })()}
          </div>
        </>
      )}

      {/* Day reveal modal */}
      {dayResult && !dayResult.isLastDay && (
        <DayResultModal result={dayResult} onClose={() => setDayResult(null)} />
      )}

      {/* Spotlight onboarding tutorial */}
      {showTutorial && (() => {
        const steps: TutorialStep[] = [
          {
            target: chartRef,
            title: "Chart + indicators",
            body:
              "Real AAPL OHLCV. Switch the time window and toggle indicators (hover any chip for an explanation). The blue diamond is today's open — where you trade.",
          },
          {
            target: voicesRef,
            title: "Headlines + agent voices",
            body:
              "Today's real news feeds into every agent's prompt. 11 LLM-driven agents post public takes; click 👁 Peek to see their private thoughts (3 per day). When you think one's lying, click 🚩 Call out — end-game scores your detection.",
          },
          {
            target: powerupsRef,
            title: "Power-ups · what-if & skip",
            body:
              "Run an event (preset or type your own — \"Tim Cook resigns\") and Claude polls all agents in parallel for in-character reactions. Or fast-forward days; the hive keeps trading.",
          },
          {
            target: yourMoveRef,
            title: "Your move",
            body:
              "Pick Buy / Hold / Sell, set USD or %, see the trade preview, click Confirm to lock and advance. You have 32 days to beat the hive and Buy & Hold.",
          },
          {
            target: standingsRef,
            title: "Live standings",
            body:
              "Real-time leaderboard. End-game shows a full recap: bar chart, per-agent action counts, deception flags, and a daily action heatmap.",
          },
        ];
        return <Tutorial steps={steps} onClose={dismissTutorial} />;
      })()}
    </div>
  );
}
