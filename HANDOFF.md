# Handoff to Frontend Designer

You're picking up `hivemind-next/` — a Vercel-ready Next.js app for **Hivemind**, a trading game where the user trades AAPL against 11 LLM-driven AI agents over 32 days. Backend is **wired and proven** (real Claude Haiku calls via proxy, verified end-to-end). Your job is to build the actual UI.

## What's ALREADY DONE (don't touch)

| Layer | File | Contract |
|---|---|---|
| Type definitions | `lib/types.ts` | **Single source of truth**. Don't redefine in components. |
| 11 agents | `lib/agents.ts` | Names, roles, system prompts. Reference for avatar designs. |
| LLM provider | `lib/llm-provider.ts` | OpenAI/MiniMax/Anthropic/Mock abstraction, env-driven. |
| Prompt builders | `lib/prompts.ts` | Build user-message, parse 4-layer JSON. |
| Price engine | `lib/price-engine.ts` | β-anchored virtual price, indicators, multi-horizon forecast. |
| Zustand store | `lib/store.ts` | Game session in localStorage. **All UI subscribes via `useGameStore`.** |
| API routes | `app/api/**` | `agents/decide`, `market/price`, `game/aggregate`. Stable contracts. |
| Bundled data | `public/data/AAPL.json` | 5 years AAPL OHLCV. Fallback when no Alpha Vantage key. |
| `.env.local` | already configured | Real Claude Haiku proxy. **Don't commit, don't change values.** |

## What you NEED TO BUILD (replace placeholders)

| File | Current state | Build target |
|---|---|---|
| `app/page.tsx` | Skeleton landing (centered title + button) | Polished marketing landing |
| `app/play/page.tsx` | Functional but ugly debug UI (cards + lists) | **The actual game UI** |
| `components/**` | Empty | All the game components |

## The game UI — what it needs to render

When user is on `/play`, the `useGameStore` exposes:

```typescript
const session = useGameStore(s => s.session);     // user portfolio + day_idx
const today   = useGameStore(s => s.today);        // current day's data
const pending = useGameStore(s => s.pendingAction); // user's draft move
```

`today` shape (from `lib/types.ts`):
```typescript
{
  date: string;                       // "2026-04-28"
  market: MarketContext;              // chart history + indicators + news
  decisions: AgentDecision[];         // 11 agents' 4-layer states
  aggregate: {                        // pressure + multi-horizon forecast
    netPressure, buyUsd, sellUsd,
    forecasts: [{ horizonDays, expectedReturnPct, ciLowPct, ciHighPct, ... }]
  };
}
```

Each `AgentDecision`:
```typescript
{
  agentId: "super_influencer_001",
  privateBelief: { lean: "long", conviction: 0.85, actualThesis: "..." },
  publicStatement: { statedLean: "neutral", statedConviction: 0.55, narrative: "..." },
  personalAction: { actionType: "buy_strong", sizePct: 0.6, rationale: "..." },
  ...
}
```

## Suggested component breakdown

```
components/
├── PortfolioHeader.tsx          // top bar: AAPL price + your cash/shares/PnL
├── PriceChart.tsx               // K-line / candle / line chart
│                                //   plotly.js or recharts or visx
├── AgentCard.tsx                // one agent's avatar + voice bubble
├── AgentTheatre.tsx             // grid of 11 AgentCards or chat thread
├── PeekButton.tsx               // "👁 Reveal private (3/day)"
├── ForecastPanel.tsx            // T+1 / T+5 / T+20 expected return + CI
├── ActionPanel.tsx              // Buy/Hold/Sell + amount input + Next Day
├── Standings.tsx                // user vs 11 agents leaderboard
├── ScenarioSelector.tsx         // "What if war?" projector (optional, post-MVP)
└── FinaleScreen.tsx             // Day 32 results celebration
```

## Visual direction

The team behind this is **Renlab.ai** — they have an established aesthetic to align with:
- Minimalist, technical, math-notation friendly (§ symbols, Greek letters)
- Black/white predominantly, single accent color
- Engineer-first audience
- See https://renlab.ai for reference

But for **this game** specifically, it's allowed to be more **playful** than the rest of Renlab. It's a game, not a research tool. Reference apps:
- Robinhood mobile (clean retail trading)
- Webull (data-rich without being intimidating)
- TradingView (chart-centric)

The agents are CHARACTERS — give them visual identity (avatars, color coding). The 11 agents:

| Agent | Role | Vibe |
|---|---|---|
| Catherine Lin | Super Influencer ($5B fund) | Cathie Wood — bold contrarian |
| David Tang | Hedge Fund Pod PM | Risk-managed, hedged |
| Sarah Klein | Activist Short | Sharp, adversarial |
| Michael Chen | Sell-Side Analyst | Suit, conventional |
| CTA | Quant CTA | Robotic, no personality |
| Alex Park | Retail (WSB) | Young, FOMO-prone |
| Thomas Lin | Permabull PM | Tom Lee — always bullish |
| Devon Wallace | Day Trader | Chart-watcher |
| Ben Brandeis | Macro Economist | Bernanke — academic |
| Paul Kramer | Political Economist | Krugman — opinionated |
| Stan Drucker | Retired Macro Trader | Druckenmiller — blunt |

## Running it

```bash
bun install       # if not already done
bun run dev       # http://localhost:3000
bun run typecheck # strict TS check
```

Dev server is already running on port 3000 right now.

## Things to be careful about

1. **Don't redefine types.** Import from `lib/types.ts`. If something's missing, ADD to that file, don't duplicate inline.
2. **All state via Zustand.** No `useState` for game state. The store handles persistence.
3. **Server actions / API calls** already exist. Don't re-call MiniMax/Claude from the client — go through `/api/agents/decide` etc.
4. **`.env.local` has a real API key.** It's gitignored; don't paste it anywhere public.
5. **Each agent has hand-tuned personality.** Read `lib/agents.ts` — Catherine's voice ≠ Sarah's voice. Visual design should reflect this.
6. **AAPL is currently the only ticker.** Don't add a ticker switcher without first adding more data files to `public/data/`.

## Deliverables (minimum viable polish)

1. Replace `app/page.tsx` — landing with brand "Hivemind" + tagline + Start CTA
2. Replace `app/play/page.tsx` — full game UI per component breakdown
3. Add `components/` with the components listed above
4. Make it Vercel-deployable (it already is — just don't break it)
5. Mobile responsive (Robinhood-style users are on phones)

## Reference: the Streamlit version

There's an older Streamlit prototype at `../toy_v06/viz_app_sim.py` — see what it looks like (currently deployed at https://julieluan-hivemind.hf.space). The Next.js rewrite should:
- Match the same gameplay loop
- But be visually MUCH more polished
- Use real-time LLM (already wired) instead of pre-baked JSON
- Be ready for any-ticker / any-date in the future
