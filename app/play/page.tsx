// ============================================================================
// Play page — minimal functional UI to prove the data-flow.
// Frontend designer will replace this entirely.
//
// What this verifies:
//   1. localStorage session bootstraps
//   2. /api/market/price returns OHLCV
//   3. /api/agents/decide returns 4-layer decisions (mock or real LLM)
//   4. /api/game/aggregate computes net pressure + forecasts
//   5. advanceDay() commits a trade + advances day_idx
// ============================================================================

"use client";

import { useEffect, useState } from "react";
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

const DEFAULT_TICKER = "AAPL";
const DEFAULT_START = "2026-03-30";
const DEFAULT_TOTAL_DAYS = 32;
const DEFAULT_CAPITAL = 1_000_000;

export default function PlayPage() {
  const session = useGameStore((s) => s.session);
  const today = useGameStore((s) => s.today);
  const isLoading = useGameStore((s) => s.isLoading);
  const error = useGameStore((s) => s.error);
  const pendingAction = useGameStore((s) => s.pendingAction);
  const pendingAmount = useGameStore((s) => s.pendingAmountUsd);

  const initSession = useGameStore((s) => s.initSession);
  const loadDay = useGameStore((s) => s.loadDay);
  const setPending = useGameStore((s) => s.setPending);
  const advanceDay = useGameStore((s) => s.advanceDay);
  const reset = useGameStore((s) => s.reset);
  const peek = useGameStore((s) => s.peek);

  const [allPrices, setAllPrices] = useState<PriceBar[] | null>(null);
  const [statusMsg, setStatusMsg] = useState<string>("");

  // ── Init session on first visit ────────────────────────────────────────
  useEffect(() => {
    if (!session) {
      initSession({
        ticker: DEFAULT_TICKER,
        startDate: DEFAULT_START,
        totalDays: DEFAULT_TOTAL_DAYS,
        initialCapital: DEFAULT_CAPITAL,
      });
    }
  }, [session, initSession]);

  // ── Fetch full price history once ──────────────────────────────────────
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

  // ── For the current day, fetch agent decisions ─────────────────────────
  useEffect(() => {
    if (!session || !allPrices || today || session.isComplete) return;

    const dayIdx = session.currentDayIdx;
    const tradingPrices = allPrices.filter((p) => p.date >= session.startDate);
    const todayBar = tradingPrices[dayIdx];
    if (!todayBar) {
      setStatusMsg("no data for current day");
      return;
    }

    // Build market context from last 30 days of history before today
    const histEndIdx = allPrices.findIndex((p) => p.date === todayBar.date);
    const history = allPrices.slice(Math.max(0, histEndIdx - 30), histEndIdx + 1);
    const closes = history.map((b) => b.close);
    const inds = computeIndicators(closes);

    const market: MarketContext = {
      ticker: session.ticker,
      asOfDate: todayBar.date,
      history,
      newsHeadlines: [], // TODO: hook up news API
      sma20: inds.sma20 ?? undefined,
      rsi14: inds.rsi14 ?? undefined,
      macdHist: inds.macdHist ?? undefined,
      bbUpper: inds.bbUpper ?? undefined,
      bbLower: inds.bbLower ?? undefined,
      mom5d: inds.mom5d ?? undefined,
    };

    setStatusMsg(`fetching agent decisions for ${todayBar.date}…`);
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
        const totalCap = ALL_AGENTS.filter((a) => a.hasPortfolio).reduce(
          (s, a) => s + a.capital,
          0
        );
        const aggResp = await fetch("/api/game/aggregate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decisions, agents: ALL_AGENTS, totalCapital: totalCap }),
        });
        const agg = (await aggResp.json()) as AggregateResponse;
        loadDay(todayBar.date, decisions, market, agg);
        setStatusMsg(
          decideResp.errors?.length
            ? `loaded with ${decideResp.errors.length} agent error(s)`
            : "ready"
        );
      })
      .catch((e) => setStatusMsg(`decide failed: ${e}`));
  }, [session, allPrices, today, loadDay]);

  if (!session) return <main className="p-8">initializing…</main>;
  if (session.isComplete) {
    return (
      <main className="p-8 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">🏁 Session complete</h1>
        <pre className="text-xs bg-grid p-4 overflow-auto">
          {JSON.stringify(
            { trades: session.trades.length, final: session.user },
            null,
            2
          )}
        </pre>
        <button onClick={reset} className="mt-4 bg-ink text-white px-4 py-2 rounded">
          Reset
        </button>
      </main>
    );
  }

  return (
    <main className="p-6 max-w-5xl mx-auto font-sans">
      <header className="border-b border-grid pb-4 mb-6 flex justify-between items-baseline">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted">Hivemind · Day {session.currentDayIdx + 1} / {session.totalDays}</div>
          <h1 className="text-2xl font-bold">{session.ticker} · {today?.date ?? "…"}</h1>
        </div>
        <div className="text-right font-mono text-sm">
          <div>cash <strong>${session.user.cash.toLocaleString()}</strong></div>
          <div>shares <strong>{session.user.shares.toLocaleString()}</strong></div>
        </div>
      </header>

      {error && (
        <div className="bg-red-50 border-l-4 border-loss p-3 mb-4 text-sm">{error}</div>
      )}
      {statusMsg && (
        <div className="text-xs text-muted mb-4 font-mono">{statusMsg}</div>
      )}

      {today && (
        <>
          <section className="mb-6">
            <h2 className="text-xs uppercase tracking-wider text-muted mb-2">Agent decisions ({today.decisions.length}/11)</h2>
            <div className="grid grid-cols-1 gap-2 text-sm">
              {today.decisions.map((d) => {
                const agent = ALL_AGENTS.find((a) => a.id === d.agentId);
                const revealed = session.peeksByDate[today.date]?.includes(d.agentId);
                const peeksLeft = 3 - (session.peeksByDate[today.date]?.length ?? 0);
                return (
                  <div key={d.agentId} className="border border-grid p-3 rounded">
                    <div className="flex justify-between items-baseline mb-1">
                      <strong>{agent?.name ?? d.agentId}</strong>
                      <span className="text-xs text-muted">
                        public: {d.publicStatement.statedLean} · {d.publicStatement.statedConviction.toFixed(2)}
                      </span>
                    </div>
                    <div className="text-xs text-muted italic">{d.publicStatement.narrative.slice(0, 200)}</div>
                    {revealed ? (
                      <div className="mt-2 bg-yellow-50 border-l-2 border-yellow-500 p-2 text-xs">
                        <strong>private:</strong> {d.privateBelief.lean} · {d.privateBelief.conviction.toFixed(2)} —{" "}
                        <em>{d.privateBelief.actualThesis}</em>
                      </div>
                    ) : (
                      <button
                        onClick={() => peek(d.agentId)}
                        disabled={peeksLeft === 0}
                        className="mt-1 text-xs text-blue-600 disabled:text-faint"
                      >
                        👁 peek private ({peeksLeft} left today)
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="mb-6">
            <h2 className="text-xs uppercase tracking-wider text-muted mb-2">Forecasts</h2>
            <div className="grid grid-cols-3 gap-3 text-sm font-mono">
              {today.aggregate.forecasts.map((f) => (
                <div key={f.horizonDays} className="border border-grid p-3 rounded">
                  <div className="text-xs text-muted">T+{f.horizonDays}</div>
                  <div
                    className={`text-xl font-bold ${
                      f.expectedReturnPct > 0
                        ? "text-gain"
                        : f.expectedReturnPct < 0
                          ? "text-loss"
                          : ""
                    }`}
                  >
                    {f.expectedReturnPct > 0 ? "+" : ""}
                    {f.expectedReturnPct.toFixed(2)}%
                  </div>
                  <div className="text-xs text-muted">
                    CI [{f.ciLowPct.toFixed(2)}%, {f.ciHighPct.toFixed(2)}%]
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="border-t border-grid pt-4">
            <h2 className="text-xs uppercase tracking-wider text-muted mb-3">Your move</h2>
            <div className="flex gap-2 mb-3">
              {(["buy_lite", "hold", "sell_lite"] as ActionType[]).map((a) => (
                <button
                  key={a}
                  onClick={() => setPending(a)}
                  className={`px-4 py-2 rounded border ${
                    pendingAction === a
                      ? "bg-ink text-white border-ink"
                      : "border-grid hover:border-ink"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
            {pendingAction !== "hold" && (
              <input
                type="number"
                value={pendingAmount}
                onChange={(e) => setPending(pendingAction, Number(e.target.value))}
                placeholder="amount USD"
                className="border border-grid p-2 rounded font-mono w-48 mb-3"
              />
            )}
            <div>
              <button
                onClick={() => {
                  if (!today || !allPrices) return;
                  const realClose = today.market.history.at(-1)?.close ?? 0;
                  const fill = today.market.history.at(-1)?.open ?? realClose;
                  advanceDay({ fillPrice: fill, realCloseToday: realClose });
                }}
                className="bg-ink text-white px-6 py-3 rounded font-medium"
              >
                Confirm & advance →
              </button>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
