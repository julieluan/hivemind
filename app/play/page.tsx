// ============================================================================
// Play page — Lab Notebook · Vol.01 layout.
// §00 Front matter · §01 Market state · §02 Hive speaks
// §03 Counterfactual · §04 Commit · §05 Standings
// ============================================================================

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
import { fmtMoney, HIVE_AGENTS } from "@/lib/agent-meta";

import { NotebookTop } from "@/components/NotebookTop";
import { FrontMatter } from "@/components/FrontMatter";
import { KPIStrip } from "@/components/KPIStrip";
import { PriceChart } from "@/components/PriceChart";
import { VoiceCard } from "@/components/VoiceCard";
import { TradePanel } from "@/components/TradePanel";
import { Standings } from "@/components/Standings";

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

  // Redirect to landing if no session
  useEffect(() => {
    if (!session) router.replace("/");
  }, [session, router]);

  // Fetch price history once
  useEffect(() => {
    if (allPrices || !session) return;
    setStatusMsg("loading price history…");
    fetch(`/api/market/price?ticker=${session.ticker}`)
      .then((r) => r.json())
      .then((d: { prices: PriceBar[] }) => {
        setAllPrices(d.prices);
        setStatusMsg("");
      })
      .catch((e) => setStatusMsg(`price load failed: ${e}`));
  }, [allPrices, session]);

  // Per-day fetch of agent decisions
  useEffect(() => {
    if (!session || !allPrices || today || session.isComplete) return;

    const tradingPrices = allPrices.filter((p) => p.date >= session.startDate);
    const todayBar = tradingPrices[session.currentDayIdx];
    if (!todayBar) {
      setStatusMsg("end of available data");
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

    setStatusMsg(`probing 11 subjects for ${todayBar.date}…`);
    fetch("/api/agents/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker: session.ticker,
        date: todayBar.date,
        market,
        user: session.user,
      }),
    })
      .then((r) => r.json())
      .then(async (decideResp: { decisions: AgentDecision[]; errors?: Array<{ agentId: string; error: string }> }) => {
        const decisions = decideResp.decisions;
        const totalCap = ALL_AGENTS.filter((a) => a.hasPortfolio).reduce((s, a) => s + a.capital, 0);
        const aggResp = await fetch("/api/game/aggregate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decisions, agents: ALL_AGENTS, totalCapital: totalCap }),
        });
        const agg = (await aggResp.json()) as AggregateResponse;
        loadDay(todayBar.date, decisions, market, agg);
        setStatusMsg(decideResp.errors?.length ? `${decisions.length}/11 subjects responded` : "");
      })
      .catch((e) => setStatusMsg(`subjects unreachable: ${e}`));
  }, [session, allPrices, today, loadDay]);

  // Derived values
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
  const bhShares = u ? Math.floor(u.initialCapital / (tradingPrices[0]?.open || fill || 1)) : 0;
  const bhCash = u ? u.initialCapital - bhShares * (tradingPrices[0]?.open || fill || 1) : 0;
  const bhVal = bhCash + bhShares * fill;

  // Visible history for chart — closes through yesterday + today's open marker
  const visibleHistory = useMemo(
    () => tradingPrices.slice(0, Math.max(0, dayIdx)),
    [tradingPrices, dayIdx]
  );

  const userTradesForChart = useMemo(() => {
    if (!session) return [];
    return session.trades.map((t) => ({
      day: t.date,
      fillPrice: t.fillPrice,
      userBuyUsd: t.action === "buy_lite" ? t.amountUsd : 0,
      userSellUsd: t.action === "sell_lite" ? t.amountUsd : 0,
    }));
  }, [session]);

  // Rank voices by stated_conviction
  const rankedDecisions = useMemo(() => {
    if (!today) return [];
    return [...today.decisions].sort(
      (a, b) => (b.publicStatement.statedConviction || 0) - (a.publicStatement.statedConviction || 0)
    );
  }, [today]);

  // Peeks left
  const peeksToday = today && session ? session.peeksByDate[today.date] ?? [] : [];
  const peeksLeft = 3 - peeksToday.length;

  const handleCommit = () => {
    if (!today || !todayBar) return;
    const realClose = todayBar.close;
    advanceDay({ fillPrice: todayBar.open, realCloseToday: realClose });
  };

  const handleSkip = () => {
    // Advance up to 5 days with hold trades
    if (!session) return;
    for (let s = 0; s < 5; s++) {
      const idx = session.currentDayIdx + s;
      const bar = tradingPrices[idx];
      if (!bar) break;
      advanceDay({ fillPrice: bar.open, realCloseToday: bar.close });
    }
  };

  if (!session) {
    return <div style={{ padding: 60, textAlign: "center", color: "var(--ink-mute)" }}>redirecting…</div>;
  }

  return (
    <>
      <NotebookTop ticker={session.ticker} day={dayIdx} total={total} isDone={isDone} />

      <main className="notebook">
        <FrontMatter ticker={session.ticker} day={dayIdx} total={total} todayBar={todayBar} prevBar={prevBar} />

        {u && (
          <KPIStrip
            initCash={u.initialCapital}
            cash={u.cash}
            shares={u.shares}
            totalVal={totalVal}
            avgBasis={u.costBasis}
            fillPrice={fill}
            bhVal={bhVal}
          />
        )}

        {isDone && (
          <EndOfSession totalVal={totalVal} initCash={u?.initialCapital ?? 0} bhVal={bhVal} onReplay={reset} />
        )}

        {!isDone && (
          <>
            {/* §01 / §02 — Market state + Hive */}
            <div className="section-mark">
              <span className="num">§ 01 / 05</span>
              <span className="title">Market state · the tape</span>
              <span className="meta">FIG·01 · {todayBar?.date}</span>
            </div>

            <div className="lab-grid">
              <div>
                <div className="figcap">
                  <span className="tag">FIG·01</span>
                  <span className="desc">{session.ticker} daily · session window</span>
                  <span className="meta">N = {Math.min(dayIdx + 1, total)} / {total}</span>
                </div>
                <PriceChart history={visibleHistory} todayBar={todayBar} userTrades={userTradesForChart} />
                {statusMsg && (
                  <div className="figcap" style={{ marginTop: 8 }}>
                    <span className="tag">STATUS</span>
                    <span className="desc">{statusMsg}</span>
                  </div>
                )}
              </div>

              <aside>
                <div className="section-mark" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
                  <span className="num">§ 02 / 05</span>
                  <span className="title">The hive speaks</span>
                  <span className="meta">11 subjects · ranked by conviction</span>
                </div>
                <div className="figcap" style={{ marginTop: 0 }}>
                  <span className="tag">PROBES</span>
                  <span className="desc">{peeksLeft} / 3 private-state probes remain · regenerated tomorrow</span>
                </div>

                {rankedDecisions.length === 0 && (
                  <div className="figcap" style={{ marginTop: 24 }}>
                    <span className="tag">…</span>
                    <span className="desc">subjects forming their views</span>
                  </div>
                )}

                {rankedDecisions.map((d) => (
                  <VoiceCard
                    key={d.agentId}
                    decision={d}
                    peeked={peeksToday.includes(d.agentId)}
                    peeksLeft={peeksLeft}
                    onProbe={() => peek(d.agentId)}
                    onOpen={() => {}}
                  />
                ))}
              </aside>
            </div>

            {/* §04 — Commit */}
            <div className="section-mark">
              <span className="num">§ 04 / 05</span>
              <span className="title">Commit your move · day advances</span>
              <span className="meta">execution @ open · slippage off</span>
            </div>
            {u && todayBar && (
              <TradePanel
                cash={u.cash}
                shares={u.shares}
                fill={fill}
                dayIdx={dayIdx}
                totalDays={total}
                pendingAction={pendingAction as ActionType}
                pendingAmount={pendingAmount}
                setPendingAction={(a) => setPending(a, pendingAmount)}
                setPendingAmount={(n) => setPending(pendingAction, n)}
                onCommit={handleCommit}
                onSkip={handleSkip}
              />
            )}

            {/* §05 — Standings */}
            <div className="section-mark">
              <span className="num">§ 05 / 05</span>
              <span className="title">Standings · session P&L</span>
              <span className="meta">TAB·02 · you vs the hive · open-mark</span>
            </div>
            {u && (
              <Standings
                decisions={today?.decisions || []}
                userPnlPct={u.initialCapital > 0 ? ((totalVal - u.initialCapital) / u.initialCapital) * 100 : 0}
                agentPnlByAid={{}}
              />
            )}
          </>
        )}

        <footer
          style={{
            marginTop: 64,
            paddingTop: 18,
            borderTop: "1px solid var(--rule)",
            fontFamily: "var(--mono)",
            fontSize: 10,
            letterSpacing: "0.16em",
            color: "var(--ink-faint)",
            textTransform: "uppercase",
            display: "flex",
            gap: 18,
            flexWrap: "wrap",
          }}
        >
          <span>hivemind · trader notebook · vol.01</span>
          <span>2026 · β-anchored · λ 0.07</span>
          <span>data · live Claude · uyilink proxy</span>
          <span style={{ marginLeft: "auto" }}>end §</span>
        </footer>
      </main>
    </>
  );
}

function EndOfSession({
  totalVal,
  initCash,
  bhVal,
  onReplay,
}: {
  totalVal: number;
  initCash: number;
  bhVal: number;
  onReplay: () => void;
}) {
  const pnl = initCash > 0 ? ((totalVal - initCash) / initCash) * 100 : 0;
  const bhPnl = initCash > 0 ? ((bhVal - initCash) / initCash) * 100 : 0;
  const alpha = pnl - bhPnl;
  const verdict = alpha >= 0 ? "You outsmarted the buy-and-hold benchmark" : "The hive (and the index) won this round";
  return (
    <div className="eos">
      <div className="meta">end of session · session complete</div>
      <h2>
        {verdict}<span className="it">.</span>
      </h2>
      <p style={{ fontFamily: "var(--display)", fontStyle: "italic", color: "var(--ink-mute)", marginTop: 8 }}>
        Final NAV {fmtMoney(totalVal)} · session {pnl.toFixed(2)}% · B&H {bhPnl.toFixed(2)}% · alpha {alpha.toFixed(2)}%.
      </p>
      <button
        onClick={onReplay}
        style={{
          background: "var(--ink)",
          color: "var(--paper)",
          border: "none",
          padding: "12px 18px",
          fontFamily: "var(--mono)",
          fontSize: 11,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          cursor: "pointer",
          marginTop: 14,
        }}
      >
        ↺ replay session
      </button>
    </div>
  );
}
