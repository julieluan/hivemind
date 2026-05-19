// ============================================================================
// Zustand game store, persisted to localStorage.
// All UI components subscribe via `useGameStore(s => s.field)`.
// ============================================================================

"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  GameSession,
  TradeRecord,
  AgentDecision,
  UserPortfolio,
  MarketContext,
  ActionType,
  ForecastEntry,
  AggregateResponse,
} from "./types";

interface DayPayload {
  date: string;
  market: MarketContext;
  decisions: AgentDecision[];
  aggregate: AggregateResponse;
}

interface GameStore {
  // ─── Session ─────────────────────────────────────────────────────────────
  session: GameSession | null;
  // ─── Current-day data (re-fetched as user advances) ─────────────────────
  today: DayPayload | null;
  isLoading: boolean;
  error: string | null;
  // ─── Pending user move ──────────────────────────────────────────────────
  pendingAction: ActionType;
  pendingAmountUsd: number;

  // ─── Actions ────────────────────────────────────────────────────────────
  initSession: (params: {
    ticker: string;
    startDate: string;
    totalDays: number;
    initialCapital: number;
  }) => void;
  loadDay: (date: string, decisions: AgentDecision[], market: MarketContext, aggregate: AggregateResponse) => void;
  setPending: (action: ActionType, amount?: number) => void;
  peek: (agentId: string) => void;
  // The "Next Day" commit. UI calls this AFTER fetching next day's data.
  advanceDay: (commitArgs: {
    fillPrice: number;
    realCloseToday: number;
  }) => void;
  reset: () => void;
}

// ─── Utility: weighted avg cost basis ──────────────────────────────────────
function updateCostBasis(
  oldShares: number,
  oldBasis: number,
  buyShares: number,
  fillPrice: number
): number {
  const newShares = oldShares + buyShares;
  if (newShares <= 0) return 0;
  return (oldShares * oldBasis + buyShares * fillPrice) / newShares;
}

// ─── Store ──────────────────────────────────────────────────────────────────
export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      session: null,
      today: null,
      isLoading: false,
      error: null,
      pendingAction: "hold",
      pendingAmountUsd: 0,

      initSession: ({ ticker, startDate, totalDays, initialCapital }) => {
        const session: GameSession = {
          sessionId: crypto.randomUUID(),
          ticker,
          startDate,
          totalDays,
          currentDayIdx: 0,
          isComplete: false,
          user: {
            cash: initialCapital,
            shares: 0,
            costBasis: 0,
            initialCapital,
          },
          trades: [],
          peeksByDate: {},
        };
        set({ session, today: null, error: null });
      },

      loadDay: (date, decisions, market, aggregate) => {
        set({
          today: { date, market, decisions, aggregate },
          isLoading: false,
          error: null,
        });
      },

      setPending: (action, amount) =>
        set({
          pendingAction: action,
          pendingAmountUsd: amount ?? get().pendingAmountUsd,
        }),

      peek: (agentId) => {
        const session = get().session;
        const today = get().today;
        if (!session || !today) return;
        const dateKey = today.date;
        const revealed = session.peeksByDate[dateKey] ?? [];
        if (revealed.includes(agentId)) return;
        if (revealed.length >= 3) return; // 3/day cap
        set({
          session: {
            ...session,
            peeksByDate: {
              ...session.peeksByDate,
              [dateKey]: [...revealed, agentId],
            },
          },
        });
      },

      advanceDay: ({ fillPrice, realCloseToday }) => {
        const session = get().session;
        const today = get().today;
        if (!session || !today) return;

        const { pendingAction: action, pendingAmountUsd: amount } = get();
        const u = session.user;

        const cashBefore = u.cash;
        const sharesBefore = u.shares;

        let sharesTraded = 0;
        let newCash = u.cash;
        let newShares = u.shares;
        let newBasis = u.costBasis;

        if (action === "buy_lite" && u.cash > 0 && amount > 0) {
          const cashToUse = Math.min(amount, u.cash);
          const shares = Math.floor(cashToUse / fillPrice);
          if (shares > 0) {
            const cost = shares * fillPrice;
            newCash = u.cash - cost;
            newShares = u.shares + shares;
            newBasis = updateCostBasis(u.shares, u.costBasis, shares, fillPrice);
            sharesTraded = shares;
          }
        } else if (action === "sell_lite" && u.shares > 0 && amount > 0) {
          const maxVal = u.shares * fillPrice;
          let shares = Math.floor(amount / fillPrice);
          if (amount >= maxVal - fillPrice) shares = u.shares;
          shares = Math.min(shares, u.shares);
          if (shares > 0) {
            newCash = u.cash + shares * fillPrice;
            newShares = u.shares - shares;
            if (newShares === 0) newBasis = 0;
            sharesTraded = shares;
          }
        }

        // Day return: start-of-day mark vs end-of-day mark
        const startValue = cashBefore + sharesBefore * fillPrice;
        const endValue = newCash + newShares * realCloseToday;
        const dayReturnPct = startValue > 0 ? (endValue / startValue - 1) * 100 : 0;

        const trade: TradeRecord = {
          date: today.date,
          action,
          amountUsd: amount,
          fillPrice,
          sharesTraded,
          cashAfter: newCash,
          sharesAfter: newShares,
          dayReturnPct,
        };

        const nextIdx = session.currentDayIdx + 1;
        const isComplete = nextIdx >= session.totalDays;

        set({
          session: {
            ...session,
            currentDayIdx: nextIdx,
            isComplete,
            user: {
              ...u,
              cash: newCash,
              shares: newShares,
              costBasis: newBasis,
            },
            trades: [...session.trades, trade],
          },
          pendingAction: "hold",
          pendingAmountUsd: 0,
          today: null, // force reload for next day
        });
      },

      reset: () =>
        set({
          session: null,
          today: null,
          pendingAction: "hold",
          pendingAmountUsd: 0,
          error: null,
        }),
    }),
    {
      name: "hivemind-session-v1",
      storage: createJSONStorage(() => localStorage),
      // Only persist session (the slow-changing user state), not today's loaded data
      partialize: (state) => ({ session: state.session }),
    }
  )
);

// ─── Selectors (convenience) ───────────────────────────────────────────────
export const useUser = () =>
  useGameStore((s) => s.session?.user ?? null);

export const useCurrentDate = () => {
  return useGameStore((s) => {
    if (!s.session) return null;
    if (s.session.isComplete) return s.session.startDate; // placeholder
    return s.today?.date ?? null;
  });
};

export const useTotalValue = (markPrice: number) =>
  useGameStore((s) => {
    const u = s.session?.user;
    if (!u) return 0;
    return u.cash + u.shares * markPrice;
  });

export const usePnLPct = (markPrice: number) =>
  useGameStore((s) => {
    const u = s.session?.user;
    if (!u || u.initialCapital === 0) return 0;
    return ((u.cash + u.shares * markPrice - u.initialCapital) / u.initialCapital) * 100;
  });
