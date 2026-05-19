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

// ── Helpers ─────────────────────────────────────────────────────────────────
function StepLabel({ n, children, muted }: { n: number; children: React.ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-center gap-2 mb-3 mt-6 pb-2 border-b border-[var(--border)]">
      <span
        className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
          muted ? "bg-[var(--faint)] text-white" : "bg-[var(--ink)] text-white"
        }`}
      >
        {n}
      </span>
      <span className="text-xs uppercase tracking-[0.08em] font-semibold text-[var(--muted)]">{children}</span>
    </div>
  );
}

function Metric({ label, value, delta, deltaColor }: { label: string; value: string; delta?: string; deltaColor?: string }) {
  return (
    <div className="flex-1 min-w-[110px]">
      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-medium">{label}</div>
      <div className="text-xl font-bold mt-0.5 num">{value}</div>
      {delta && <div className="text-xs mt-0.5 num" style={{ color: deltaColor || "var(--muted)" }}>{delta}</div>}
    </div>
  );
}

// ── Voice card ──────────────────────────────────────────────────────────────
function VoiceCardCompact({
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
    l === "long" ? "text-[var(--gain)]" : l === "short" ? "text-[var(--loss)]" : "text-[var(--muted)]";
  const actColor = act.actionType.includes("buy")
    ? "text-[var(--gain)]"
    : act.actionType.includes("sell")
      ? "text-[var(--loss)]"
      : "text-[var(--muted)]";

  return (
    <div className="border-b border-[var(--grid)] py-3">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-semibold text-sm">{meta.name}</span>
            <span className="text-[11px] text-[var(--faint)]">{meta.roleLabel}</span>
            {deception && peeked && (
              <span className="text-[9px] text-[var(--loss)] border border-[var(--loss)] px-1 py-0.5 rounded uppercase tracking-wider">
                🎭 deception
              </span>
            )}
          </div>
        </div>
        <div className="text-right whitespace-nowrap text-xs">
          <span className={`font-semibold ${leanColor(pub.statedLean)}`}>{pub.statedLean.toUpperCase()}</span>
          <span className="text-[var(--faint)] ml-1">{Math.round(pub.statedConviction * 100)}%</span>
        </div>
      </div>
      <div className="text-[13px] text-[var(--muted)] italic leading-snug">&quot;{pub.narrative}&quot;</div>
      <div className={`text-[11px] mt-1 ${actColor}`}>
        → {act.actionType.replace("_", " ")}
      </div>
      {peeked ? (
        <div className="mt-2 p-2 bg-[var(--hint)] border-l-2 border-[var(--hint-border)] rounded text-[13px]">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-[var(--muted)]">👁 Private</span>
            <span className={`text-xs font-semibold ${leanColor(priv.lean)}`}>{priv.lean.toUpperCase()}</span>
            <span className="text-xs text-[var(--faint)]">{Math.round(priv.conviction * 100)}% conv</span>
          </div>
          <div className="text-[var(--ink)] leading-snug">{priv.actualThesis}</div>
        </div>
      ) : (
        <button
          onClick={onProbe}
          disabled={peeksLeft <= 0}
          className="mt-2 text-[11px] text-blue-600 hover:underline disabled:text-[var(--faint)] disabled:cursor-not-allowed disabled:no-underline"
        >
          👁 Peek private ({peeksLeft} / 3 today)
        </button>
      )}
    </div>
  );
}

// ── Simple SVG chart (only revealed days) ───────────────────────────────────
function SimpleChart({ history, todayOpen }: { history: PriceBar[]; todayOpen?: number }) {
  const W = 720;
  const H = 280;
  const pad = { top: 20, right: 12, bottom: 28, left: 48 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;

  const series = todayOpen ? [...history, { date: "today", open: todayOpen, high: todayOpen, low: todayOpen, close: todayOpen, volume: 0 }] : history;
  if (series.length < 2) {
    return (
      <div className="bg-[var(--bg-soft)] border border-[var(--grid)] rounded-md p-12 text-center text-xs text-[var(--faint)]">
        loading market data…
      </div>
    );
  }
  const ys = series.map((b) => b.close);
  let yMin = Math.min(...ys);
  let yMax = Math.max(...ys);
  const pad2 = (yMax - yMin) * 0.08 || 1;
  yMin -= pad2;
  yMax += pad2;
  const x = (i: number) => pad.left + (i / (series.length - 1)) * innerW;
  const y = (v: number) => pad.top + (1 - (v - yMin) / (yMax - yMin)) * innerH;
  const path = series.map((b, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(b.close).toFixed(1)}`).join(" ");
  const ticks = Array.from({ length: 4 }, (_, i) => yMin + (i / 3) * (yMax - yMin));
  const todayIdx = todayOpen ? series.length - 1 : -1;

  return (
    <div className="bg-white border border-[var(--grid)] rounded-md p-2">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="w-full">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={pad.left} y1={y(t)} x2={pad.left + innerW} y2={y(t)} stroke="var(--grid)" strokeWidth={0.5} />
            <text x={pad.left - 6} y={y(t) + 3} fontSize={10} textAnchor="end" fill="var(--muted)" className="num">${t.toFixed(0)}</text>
          </g>
        ))}
        <path d={path} stroke="var(--ink)" strokeWidth={1.8} fill="none" />
        {todayIdx >= 0 && (
          <>
            <circle cx={x(todayIdx)} cy={y(series[todayIdx].close)} r={5} fill="#3b82f6">
              <animate attributeName="r" values="5;8;5" dur="2s" repeatCount="indefinite" />
            </circle>
            <text x={x(todayIdx) - 10} y={y(series[todayIdx].close) - 10} fontSize={9} fill="#3b82f6" textAnchor="end" className="num">
              today
            </text>
          </>
        )}
      </svg>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────
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
  const [statusMsg, setStatusMsg] = useState<string>("");

  useEffect(() => {
    if (!session) router.replace("/");
  }, [session, router]);

  useEffect(() => {
    if (allPrices || !session) return;
    setStatusMsg("loading market data…");
    fetch(`/api/market/price?ticker=${session.ticker}`)
      .then((r) => r.json())
      .then((d: { prices: PriceBar[] }) => {
        setAllPrices(d.prices);
        setStatusMsg("");
      })
      .catch((e) => setStatusMsg(`load failed: ${e}`));
  }, [allPrices, session]);

  useEffect(() => {
    if (!session || !allPrices || today || session.isComplete) return;
    const tradingPrices = allPrices.filter((p) => p.date >= session.startDate);
    const todayBar = tradingPrices[session.currentDayIdx];
    if (!todayBar) return;
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
    setStatusMsg(`agents thinking for ${todayBar.date}…`);
    fetch("/api/agents/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker: session.ticker, date: todayBar.date, market, user: session.user }),
    })
      .then((r) => r.json())
      .then(async (d: { decisions: AgentDecision[] }) => {
        const totalCap = ALL_AGENTS.filter((a) => a.hasPortfolio).reduce((s, a) => s + a.capital, 0);
        const aggResp = await fetch("/api/game/aggregate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decisions: d.decisions, agents: ALL_AGENTS, totalCapital: totalCap }),
        });
        const agg = (await aggResp.json()) as AggregateResponse;
        loadDay(todayBar.date, d.decisions, market, agg);
        setStatusMsg("");
      })
      .catch((e) => setStatusMsg(`agents unreachable: ${e}`));
  }, [session, allPrices, today, loadDay]);

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

  const visibleHistory = useMemo(() => tradingPrices.slice(0, Math.max(0, dayIdx)), [tradingPrices, dayIdx]);

  const rankedDecisions = useMemo(() => {
    if (!today) return [];
    return [...today.decisions].sort(
      (a, b) => (b.publicStatement.statedConviction || 0) - (a.publicStatement.statedConviction || 0)
    );
  }, [today]);

  const peeksToday = today && session ? session.peeksByDate[today.date] ?? [] : [];
  const peeksLeft = 3 - peeksToday.length;

  // Trade amount state
  const maxAvail = pendingAction === "buy_lite" ? (u?.cash ?? 0) : pendingAction === "sell_lite" ? (u?.shares ?? 0) * fill : 0;
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

  // First-day hint
  const firstDay = dayIdx === 0 && session.trades.length === 0;

  // Trade preview computation
  let preview: React.ReactNode = null;
  if (pendingAction === "buy_lite") {
    if (u.cash <= 0 || pendingAmount <= 0) {
      preview = <span className="text-[var(--muted)]">Enter amount above to preview.</span>;
    } else {
      const willBuy = Math.floor(pendingAmount / fill);
      const cost = willBuy * fill;
      preview = (
        <>
          Buy <span className="text-[var(--gain)] font-semibold">{willBuy.toLocaleString()} shares</span> at ${fill.toFixed(2)} ·{" "}
          <span className="font-semibold">{fmtMoney(cost, true)}</span> deployed
          <div className="text-xs text-[var(--muted)] mt-1">Cash after: {fmtMoney(u.cash - cost)} · Shares after: {(u.shares + willBuy).toLocaleString()}</div>
        </>
      );
    }
  } else if (pendingAction === "sell_lite") {
    if (u.shares <= 0) {
      preview = <span className="text-[var(--loss)]">No long position to sell.</span>;
    } else if (pendingAmount <= 0) {
      preview = <span className="text-[var(--muted)]">Enter amount above to preview.</span>;
    } else {
      let willSell = Math.floor(pendingAmount / fill);
      if (pendingAmount >= u.shares * fill - fill) willSell = u.shares;
      willSell = Math.min(willSell, u.shares);
      const proceeds = willSell * fill;
      preview = (
        <>
          Sell <span className="text-[var(--loss)] font-semibold">{willSell.toLocaleString()} shares</span> at ${fill.toFixed(2)} · receive{" "}
          <span className="font-semibold">{fmtMoney(proceeds, true)}</span>
          <div className="text-xs text-[var(--muted)] mt-1">Cash after: {fmtMoney(u.cash + proceeds)} · Shares after: {(u.shares - willSell).toLocaleString()}</div>
        </>
      );
    }
  } else {
    preview = <span className="text-[var(--muted)]">You&apos;ll hold this day — no trade executes.</span>;
  }

  return (
    <div className="max-w-[1180px] mx-auto px-4 py-4 pb-16">
      {/* ── Top header (sticky) ──────────────────────────────── */}
      <header className="flex items-baseline justify-between mb-2 pb-3 border-b border-[var(--border)]">
        <div>
          <h1 className="text-xl font-bold leading-tight">{session.ticker}</h1>
          <div className="text-xs text-[var(--muted)] mt-0.5">
            {isDone ? `Final · ${todayBar?.date}` : `Day ${dayIdx + 1} of ${total} · ${todayBar?.date ?? "…"}`}
          </div>
        </div>
        <div className="flex gap-5 items-baseline">
          <Metric label="Open" value={`$${fill.toFixed(2)}`} delta={`${todayPct >= 0 ? "+" : ""}${todayPct.toFixed(2)}%`} deltaColor={todayPct >= 0 ? "var(--gain)" : "var(--loss)"} />
          <Metric label="Avg cost" value={u.shares > 0 && u.costBasis > 0 ? `$${u.costBasis.toFixed(2)}` : "—"} delta={u.shares > 0 ? `${unreal >= 0 ? "+" : ""}${unreal.toFixed(2)}%` : "no pos"} deltaColor={u.shares > 0 ? (unreal >= 0 ? "var(--gain)" : "var(--loss)") : "var(--muted)"} />
          <Metric label="Portfolio" value={fmtMoney(totalVal)} delta={`${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%`} deltaColor={pnlPct >= 0 ? "var(--gain)" : "var(--loss)"} />
          <Metric label="Cash" value={fmtMoney(u.cash)} />
          <Metric label="Position" value={u.shares > 0 ? "LONG" : "—"} delta={u.shares > 0 ? `${u.shares.toLocaleString()} sh` : undefined} />
          <Metric label="Alpha" value={`${alpha >= 0 ? "+" : ""}${alpha.toFixed(2)}%`} delta="vs B&H" deltaColor={alpha >= 0 ? "var(--gain)" : "var(--loss)"} />
        </div>
      </header>

      {/* ── First-day hint ──────────────────────────────────── */}
      {firstDay && (
        <div className="bg-[var(--hint)] border border-[var(--hint-border)] rounded-md px-3 py-2 text-sm mb-3">
          👋 <strong>First day.</strong> Each day:&nbsp;
          <strong>①</strong> read market + agent voices →&nbsp;
          <strong>②</strong> optional peek private thoughts →&nbsp;
          <strong>③</strong> scroll to <strong>Your Move</strong>, pick Buy/Hold/Sell, click <strong>Confirm</strong>.
        </div>
      )}

      {isDone && (
        <div className="border-2 border-[var(--ink)] rounded-md p-5 mb-4 bg-[var(--bg-soft)]">
          <div className="text-xs uppercase tracking-wider text-[var(--muted)] mb-2 font-semibold">🏁 Session complete · 32 / 32 days</div>
          <h2 className="text-2xl font-bold mb-2">
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
          {/* Step 1 */}
          <StepLabel n={1}>Review today&apos;s market</StepLabel>

          <div className="grid grid-cols-1 md:grid-cols-[1.55fr_1fr] gap-6">
            <div>
              <SimpleChart history={visibleHistory} todayOpen={fill} />
              {statusMsg && <div className="text-xs text-[var(--muted)] mt-1 font-mono">{statusMsg}</div>}
            </div>

            <div>
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-xs uppercase tracking-wider text-[var(--muted)] font-semibold">Voices today · all 11</span>
                <span className="text-xs text-[var(--muted)]">{peeksLeft} / 3 peeks left</span>
              </div>
              {rankedDecisions.length === 0 ? (
                <div className="text-sm text-[var(--muted)] py-8 text-center">agents forming their views…</div>
              ) : (
                <div className="max-h-[520px] overflow-y-auto pr-2">
                  {rankedDecisions.map((d) => (
                    <VoiceCardCompact
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

          {/* Step 3 — Make move */}
          <StepLabel n={3}>Make your move · Buy / Hold / Sell, then Confirm</StepLabel>

          <div className="bg-[var(--bg-soft)] border border-[var(--border)] rounded-lg p-4">
            <div className="flex items-baseline justify-between mb-3 text-xs">
              <span className="text-[var(--muted)]">
                Cash <strong className="text-[var(--ink)]">{fmtMoney(u.cash)}</strong> · Shares <strong className="text-[var(--ink)]">{u.shares.toLocaleString()}</strong>
              </span>
              <span className="text-[var(--muted)]">
                Trading at open: <strong className="text-[var(--ink)]">${fill.toFixed(2)}</strong>
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3">
              <button
                onClick={() => setPending("buy_lite", pendingAmount)}
                className={`py-3 rounded-md font-semibold text-sm border-2 transition-colors ${
                  pendingAction === "buy_lite"
                    ? "bg-[var(--ink)] text-white border-[var(--ink)]"
                    : "bg-white text-[var(--ink)] border-[var(--border)] hover:border-[var(--ink)]"
                }`}
              >
                🟢 BUY
              </button>
              <button
                onClick={() => setPending("hold", 0)}
                className={`py-3 rounded-md font-semibold text-sm border-2 transition-colors ${
                  pendingAction === "hold"
                    ? "bg-[var(--ink)] text-white border-[var(--ink)]"
                    : "bg-white text-[var(--ink)] border-[var(--border)] hover:border-[var(--ink)]"
                }`}
              >
                ⏸ HOLD
              </button>
              <button
                onClick={() => setPending("sell_lite", pendingAmount)}
                className={`py-3 rounded-md font-semibold text-sm border-2 transition-colors ${
                  pendingAction === "sell_lite"
                    ? "bg-[var(--ink)] text-white border-[var(--ink)]"
                    : "bg-white text-[var(--ink)] border-[var(--border)] hover:border-[var(--ink)]"
                }`}
              >
                🔴 SELL
              </button>
            </div>

            {pendingAction !== "hold" && maxAvail > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-[2fr_3fr] gap-4 mb-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1 font-medium">
                    Amount · USD (max ${maxAvail.toLocaleString(undefined, { maximumFractionDigits: 0 })})
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={maxAvail}
                    step={100}
                    value={pendingAmount}
                    onChange={(e) => setPending(pendingAction, Number(e.target.value))}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-md font-mono text-sm focus:border-[var(--ink)] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1 font-medium">
                    {pct}% of {pendingAction === "buy_lite" ? "cash" : "position"}
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={pct}
                    onChange={(e) => setPending(pendingAction, Math.round((Number(e.target.value) / 100) * maxAvail))}
                    className="w-full"
                  />
                </div>
              </div>
            )}

            <div className="bg-white border-l-2 border-[var(--ink)] p-3 rounded text-sm mb-3">
              <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1 font-semibold">Trade preview</div>
              <div>{preview}</div>
            </div>

            <button
              onClick={handleCommit}
              className="w-full bg-[var(--ink)] text-white py-3 rounded-md font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              Confirm & advance to next day →
            </button>
          </div>

          {/* Standings */}
          <StepLabel n={4} muted>Standings · you vs the hive</StepLabel>

          <div className="text-xs">
            <div className="grid grid-cols-[40px_1fr_80px] gap-2 py-1 border-b border-[var(--border)] uppercase tracking-wider text-[var(--muted)] font-semibold">
              <span>#</span>
              <span>Trader</span>
              <span className="text-right">P&L</span>
            </div>
            {[
              { name: "You", role: "the twelfth trader", pnl: pnlPct, you: true },
              { name: "Buy & Hold", role: "passive index", pnl: bhPnl, you: false },
              ...ALL_AGENTS.filter((a) => a.hasPortfolio && a.capital > 0).map((a) => ({
                name: HIVE_AGENTS_BY_ID[a.id]?.name ?? a.name,
                role: HIVE_AGENTS_BY_ID[a.id]?.roleLabel ?? a.role,
                pnl: 0, // backend doesn't expose per-agent ledger live yet
                you: false,
              })),
            ]
              .sort((a, b) => b.pnl - a.pnl)
              .map((r, i) => (
                <div
                  key={r.name}
                  className={`grid grid-cols-[40px_1fr_80px] gap-2 py-2 border-b border-[var(--grid)] items-baseline ${
                    r.you ? "bg-[var(--hint)]" : ""
                  }`}
                >
                  <span className="text-[var(--faint)] num">#{i + 1}</span>
                  <span>
                    <span className="font-semibold">{r.name}</span>
                    <span className="text-[var(--faint)] text-[11px] ml-2">{r.role}</span>
                  </span>
                  <span className={`text-right font-mono font-semibold ${r.pnl > 0 ? "text-[var(--gain)]" : r.pnl < 0 ? "text-[var(--loss)]" : "text-[var(--muted)]"}`}>
                    {r.pnl >= 0 ? "+" : ""}
                    {r.pnl.toFixed(2)}%
                  </span>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
