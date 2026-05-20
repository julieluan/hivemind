"use client";

import { useEffect, useState, useMemo } from "react";
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
  onProbe,
}: {
  decision: AgentDecision;
  peeked: boolean;
  peeksLeft: number;
  onProbe: () => void;
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
    <div className="py-3 border-t border-[var(--grid)] first:border-t-0">
      <div className="flex items-baseline gap-2 flex-wrap mb-1">
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

      {peeked ? (
        <div className="mt-2 px-3 py-2 bg-[var(--hint)] border-l-[3px] border-[var(--hint-border)] rounded-r-md">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-[#92400e] mb-1">
            👁 Private thoughts revealed
          </div>
          <div className="text-[0.85rem] text-[var(--ink)] leading-snug">
            <strong style={{ color: leanColor(priv.lean) }}>{priv.lean}</strong>{" "}
            <span className="text-[var(--muted)]">(conviction {Math.round(priv.conviction * 100)}%)</span>{" "}
            — <em>{priv.actualThesis}</em>
          </div>
        </div>
      ) : (
        <button
          onClick={onProbe}
          disabled={peeksLeft <= 0}
          className="mt-1 text-[11px] text-blue-600 hover:underline disabled:text-[var(--faint)] disabled:cursor-not-allowed disabled:no-underline"
        >
          👁 Peek private thoughts ({peeksLeft}/3 today)
        </button>
      )}
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
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5 px-2.5 py-1 mr-1.5 mb-1.5 bg-[var(--bg-soft)] border border-[var(--grid)] rounded-md text-[0.82rem]">
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
  const peek = useGameStore((s) => s.peek);
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

  useEffect(() => {
    if (!session) router.replace("/");
  }, [session, router]);

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
    const market: MarketContext = {
      ticker: session.ticker,
      asOfDate: todayBar.date,
      history,
      newsHeadlines: [],
      sma20: inds.sma20 ?? undefined,
      rsi14: inds.rsi14 ?? undefined,
      macdHist: inds.macdHist ?? undefined,
      bbUpper: inds.bbUpper ?? undefined,
      bbLower: inds.bbLower ?? undefined,
      mom5d: inds.mom5d ?? undefined,
    };
    setAgentStatus(`11 agents thinking… (${todayBar.date})`);
    fetch("/api/agents/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker: session.ticker, date: todayBar.date, market, user: session.user }),
    })
      .then((r) => r.json())
      .then(async (d: { decisions: AgentDecision[]; errors?: { agentId: string; error: string }[] }) => {
        const totalCap = ALL_AGENTS.filter((a) => a.hasPortfolio).reduce((s, a) => s + a.capital, 0);
        const aggResp = await fetch("/api/game/aggregate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decisions: d.decisions, agents: ALL_AGENTS, totalCapital: totalCap }),
        });
        const agg = (await aggResp.json()) as AggregateResponse;
        loadDay(todayBar.date, d.decisions, market, agg);
        setAgentStatus("");
        setAgentErrors(d.errors ?? []);
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
    if (!todayBar) return;
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

      {/* ── First-day hint ──────────────────────────────────────────────── */}
      {firstDay && (
        <div className="bg-[var(--hint)] border border-[var(--hint-border)] rounded-lg px-4 py-3 text-[0.92rem] text-[#422006] leading-relaxed mb-4">
          👋 <strong>First day.</strong> Each day follows this flow:{" "}
          <strong>①</strong> review today&apos;s market (chart + agent voices) →{" "}
          <strong>②</strong> optionally peek private thoughts →{" "}
          <strong>③</strong> scroll down to <strong>Your Move</strong>, pick Buy/Hold/Sell, click <strong>Confirm</strong>.{" "}
          <em>This hint disappears after your first trade.</em>
        </div>
      )}

      {/* ── End-of-session ──────────────────────────────────────────────── */}
      {isDone && (
        <div className="border-2 border-[var(--ink)] rounded-lg p-5 mb-4 bg-[var(--bg-soft)]">
          <div className="text-xs uppercase tracking-wider text-[var(--muted)] mb-2 font-bold">
            🏁 Session complete · 32 / 32 days
          </div>
          <h2 className="text-2xl font-bold mb-2 tracking-tight">
            {alpha >= 0 ? "You beat Buy & Hold." : "The hive won this round."}
          </h2>
          <p className="text-sm text-[var(--muted)]">
            Final NAV {fmtMoney(totalVal)} · session {pnlPct.toFixed(2)}% · B&H {bhPnl.toFixed(2)}% · alpha {alpha.toFixed(2)}%
          </p>
          <button onClick={reset} className="mt-4 bg-[var(--ink)] text-white px-5 py-2 rounded-md text-sm font-semibold">
            ↺ Reset
          </button>
        </div>
      )}

      {!isDone && (
        <>
          {/* ── §1 Review market ──────────────────────────────────────────── */}
          <SectionLabel n={1}>Review today&apos;s market</SectionLabel>

          <div className="grid grid-cols-1 md:grid-cols-[1.55fr_1fr] gap-6">
            <div>
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
                    />
                  )}
                  {indicatorRow.sma20 != null && (
                    <Pill label="SMA20" value={`$${indicatorRow.sma20.toFixed(2)}`} />
                  )}
                  {indicatorRow.mom5d != null && (
                    <Pill
                      label="5d mom"
                      value={`${indicatorRow.mom5d >= 0 ? "+" : ""}${indicatorRow.mom5d.toFixed(2)}%`}
                      color={indicatorRow.mom5d > 0 ? "var(--gain)" : "var(--loss)"}
                    />
                  )}
                  {indicatorRow.vol_ann != null && (
                    <Pill label="Ann vol" value={`${indicatorRow.vol_ann.toFixed(1)}%`} />
                  )}
                  {indicatorRow.bbUpper != null && indicatorRow.bbLower != null &&
                    indicatorRow.bbUpper !== indicatorRow.bbLower && fill > 0 && (
                      <Pill
                        label="BB"
                        value={`${(((fill - indicatorRow.bbLower) / (indicatorRow.bbUpper - indicatorRow.bbLower)) * 100).toFixed(0)}% band`}
                      />
                    )}
                </div>
              )}

              {pricesError && (
                <div className="text-xs text-[var(--loss)] mt-2">⚠ {pricesError}</div>
              )}
              {agentStatus && (
                <div className="text-xs text-[var(--muted)] mt-2 font-mono">{agentStatus}</div>
              )}
            </div>

            <div>
              <div className="flex items-baseline justify-between mb-2">
                <div className="text-[0.7rem] uppercase tracking-[0.08em] font-bold text-[var(--muted)]">
                  Voices today · all 11 agents
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
              {rankedDecisions.length === 0 ? (
                <div className="text-sm text-[var(--muted)] py-8 text-center italic">
                  agents forming their views…
                </div>
              ) : (
                <div className="max-h-[520px] overflow-y-auto pr-2 -mr-2">
                  {rankedDecisions.map((d) => (
                    <VoiceCard
                      key={d.agentId}
                      decision={d}
                      peeked={peeksToday.includes(d.agentId)}
                      peeksLeft={peeksLeft}
                      onProbe={() => peek(d.agentId)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── §3 Make your move ─────────────────────────────────────────── */}
          <SectionLabel n={3}>Make your move — Buy, Hold, or Sell, then Confirm</SectionLabel>

          <div className="bg-gradient-to-b from-[var(--bg-soft)] to-white border border-[var(--border)] rounded-xl p-4">
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

            <button
              onClick={handleCommit}
              className="w-full bg-[var(--ink)] text-white py-3 rounded-md font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              Confirm &amp; advance to next day →
            </button>
          </div>

          {/* ── Standings ─────────────────────────────────────────────────── */}
          <SectionLabel n={4} muted>
            Standings · you vs the hive
          </SectionLabel>

          <div className="text-xs">
            <div className="grid grid-cols-[40px_1fr_80px] gap-2 py-1 border-b border-[var(--border)] uppercase tracking-wider text-[var(--muted)] font-bold">
              <span>#</span>
              <span>Trader</span>
              <span className="text-right">P&amp;L</span>
            </div>
            {(() => {
              const rows = [
                { name: "You", role: "the twelfth trader", pnl: pnlPct, you: true },
                { name: "Buy & Hold", role: "passive index", pnl: bhPnl, you: false },
                ...ALL_AGENTS.filter((a) => a.hasPortfolio && a.capital > 0).map((a) => ({
                  name: HIVE_AGENTS_BY_ID[a.id]?.name ?? a.name,
                  role: HIVE_AGENTS_BY_ID[a.id]?.roleLabel ?? a.role,
                  pnl: 0,
                  you: false,
                })),
              ].sort((a, b) => b.pnl - a.pnl);
              return rows.map((r, i) => (
                <div
                  key={r.name}
                  className={`grid grid-cols-[40px_1fr_80px] gap-2 py-2 border-b border-[var(--grid)] items-baseline ${
                    r.you ? "bg-[var(--hint)] rounded -mx-1 px-1" : ""
                  }`}
                >
                  <span className="text-[var(--faint)] num">#{i + 1}</span>
                  <span>
                    <span className="font-semibold">{r.name}</span>
                    <span className="text-[var(--faint)] text-[11px] ml-2">{r.role}</span>
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
    </div>
  );
}
