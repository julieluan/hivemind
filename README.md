# Hivemind — Next.js architecture (Vercel-native)

This is the **with-key** version of Hivemind, designed for Vercel deployment with real-time LLM agents. The existing Streamlit version (`../toy_v06/`) keeps running independently — this is a parallel rewrite that swaps in once we have the LLM endpoint figured out.

**Status**: architecture complete · frontend skeleton placeholder · waiting on real LLM endpoint URL.

## What's wired up

```
hivemind-next/
├── lib/
│   ├── types.ts            ← Single source of truth for all data contracts
│   ├── agents.ts           ← 11 agent system prompts (port from toy_v06/agents.py)
│   ├── llm-provider.ts     ← MiniMax/OpenAI/Anthropic/Mock — swap via env
│   ├── prompts.ts          ← Build per-tier market view + parse 4-layer JSON
│   ├── price-engine.ts     ← β-anchored virtual price + indicators + forecast
│   └── store.ts            ← Zustand + localStorage persistence
├── app/
│   ├── api/
│   │   ├── agents/decide   ← POST: run N agents in parallel, return decisions
│   │   ├── market/price    ← GET: OHLCV (Alpha Vantage or bundled fallback)
│   │   └── game/aggregate  ← POST: net pressure + multi-horizon forecast
│   ├── page.tsx            ← landing (skeleton — designer to replace)
│   └── play/page.tsx       ← minimal working game UI (proves data flow)
├── .env.example
└── package.json
```

## Status of each piece

| Layer | State | Owner |
|---|---|---|
| Type contracts (`types.ts`) | ✅ done — types are the single source of truth | locked |
| 11 agents (`agents.ts`) | ✅ ported from `toy_v06/agents.py`, prompts identical | locked |
| LLM provider abstraction | ✅ supports MiniMax / OpenAI / Anthropic / Mock | locked |
| `/api/agents/decide` | ✅ runs 11 agents in parallel via `Promise.allSettled` | locked |
| `/api/game/aggregate` | ✅ pressure + multi-horizon forecast | locked |
| `/api/market/price` | ✅ Alpha Vantage with bundled JSON fallback | need to drop AAPL.json |
| Zustand store + persist | ✅ session lives in localStorage | locked |
| Skeleton UI (`/play`) | ✅ verifies all 5 layers work end-to-end | **designer to replace** |
| Landing page | ✅ placeholder | **designer to replace** |
| 11-agent chat UI / animations | ⚪ not built | **designer to build** |

## Setup (post-install)

```bash
cd hivemind-next
bun install            # or pnpm install / npm install
cp .env.example .env.local
# edit .env.local — see "Hooking up the LLM" below
bun run dev            # → http://localhost:3000
bun run typecheck      # full TS strict check
```

## Hooking up the LLM (when you have a working endpoint)

The provider is **fully env-driven**. To switch providers, change `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` and (optionally) `LLM_PROVIDER`. No code changes.

`.env.local` example:

```bash
LLM_PROVIDER=minimax           # or "openai" / "anthropic" / "mock"
LLM_API_KEY=<your key>
LLM_BASE_URL=<endpoint root>   # e.g. https://api.minimax.io/v1
LLM_MODEL=MiniMax-M2
```

If `LLM_API_KEY` is empty OR `LLM_PROVIDER=mock`, the system falls back to a deterministic mock provider (zero cost, canned outputs per agent) — useful for frontend development without burning credits.

### Where to find the right endpoint
The two `sk-cp-…` / `sk-EqTb…` keys I tested don't match any public LLM provider's auth (tried MiniMax international/China, OpenAI, Anthropic, DeepSeek, Moonshot, Zhipu, Aliyun, Volcengine, OpenRouter, 302.AI, Stepfun, Together, DeepInfra, xAI, Fireworks, Groq, Yi/LingYi). They're almost certainly for an **internal Renlab gateway** with a private DNS / VPN-gated endpoint. To verify:

> Ask whoever issued the key: **"what's the `base_url` for this key? Got a working curl example?"**

Once you have the URL, drop it into `LLM_BASE_URL` in `.env.local` and `/api/agents/decide` will work without any code change.

## Architecture rationale

### Why Next.js App Router + serverless
- Vercel-native deploy (zero-config)
- Custom domain works on free tier
- Each user action = 1 HTTP request, no WebSocket needed
- Stateless serverless functions scale infinitely

### Why Zustand + localStorage
- Game state is per-user, doesn't need a DB
- Save/share/replay via session export (future feature)
- No auth complexity for v1
- When we add multi-player leaderboards, upgrade to Vercel KV (~5 lines change in `store.ts`)

### Why 11 agents in parallel via `Promise.allSettled`
- Worst case 11 sequential LLM calls = 11 × 5s = 55s (Vercel timeout)
- Parallel = max(5s) ≈ 5-8s
- One agent fails → other 10 still return; we surface `errors[]` in the response

### Why a Mock provider
- Frontend designer can build/iterate without burning LLM credits
- CI tests can run without an LLM key
- Demo days can fall back if real LLM is down

## Data flow (one Next Day click)

```
[Browser]
   ↓ user clicks "Confirm & advance"
[Frontend: store.ts]
   ↓ advanceDay({fillPrice, realCloseToday}) updates state
   ↓ today = null  (force re-fetch)
[Frontend: play/page.tsx useEffect]
   ↓ POST /api/agents/decide  { date, market, user }
[Serverless: agents/decide]
   ↓ Promise.allSettled(11 × provider.call(systemPrompt, userMessage))
   ↓ parseAgentDecision(raw) for each
   ↓ → decisions: AgentDecision[]
[Serverless: game/aggregate]
   ↓ buy_usd, sell_usd, net_pressure, multi-horizon forecasts
[Frontend: store.loadDay()]
   ↓ today = { date, decisions, market, aggregate }
[UI re-renders with new day's data]
```

## What's next (after LLM key)

1. Test `/api/agents/decide` returns real 4-layer JSON for 1 agent
2. Smoke-test all 11 agents in parallel; verify <10s total latency
3. Test end-to-end "Next Day" round trip in browser
4. Hand off to frontend designer (Claude or human) — types are the contract
5. Polish: agent avatar visuals, animated discussion thread, finale page

## Deploy to Vercel

After endpoint is wired:

```bash
# from this folder
vercel link          # or use Vercel dashboard
vercel env add LLM_API_KEY  production
vercel env add LLM_BASE_URL production
vercel env add LLM_MODEL    production
vercel --prod
```

Then add custom domain in Vercel dashboard → DNS at registrar → done.
