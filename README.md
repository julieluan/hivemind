# Hivemind — Outsmart the hive.

**A social deduction game where 11 AI traders lie to you. Catch the liars. Beat them in 32 days.**

> Among Us × Wall Street. You're the 12th trader. The other 11 are LLMs with hidden agendas.

[Roadmap](./ROADMAP.md) · [Handoff notes](./HANDOFF.md)

---

## What you do

You're trader #12 in a market run by 11 AI agents — a Cathie-Wood-style influencer, an activist short seller, a hedge fund pod PM, retail FOMO, three economists, and more. Each one has:

- A **public statement** — what they tell the world
- A **private belief** — what they actually think

Sometimes those match. Sometimes they don't. 🎭

**Each day**, you read their tape, peek their private thoughts (3 reveals/day), and place your AAPL trade. **At the end of 32 days**, you see who lied when — and how many liars you caught.

PnL is a side effect. The score that matters is detection.

---

## The 11 agents

| Agent | Role | Vibe |
|---|---|---|
| Catherine Lin | Super Influencer ($5B fund) | Cathie Wood — bold contrarian |
| David Tang | Hedge Fund Pod PM | Risk-managed, hedged |
| Sarah Klein | Activist Short | Sharp, adversarial |
| Michael Chen | Sell-Side Analyst | Suit, conventional |
| CTA | Quant CTA | Robotic, momentum-only |
| Alex Park | Retail (WSB) | Young, FOMO-prone |
| Thomas Lin | Permabull PM | Tom Lee — always bullish |
| Devon Wallace | Day Trader | Chart-watcher |
| Ben Brandeis | Macro Economist | Bernanke — academic |
| Paul Kramer | Political Economist | Krugman — opinionated |
| Stan Drucker | Retired Macro Trader | Druckenmiller — blunt |

Full system prompts: `lib/agents.ts`.

---

## Play locally

```bash
cd hivemind
bun install                # or pnpm / npm install
cp .env.example .env.local # add your LLM key
bun run dev                # http://localhost:3000
```

**No LLM key?** It falls back to a mock provider — playable for free, just with canned outputs. Set `LLM_PROVIDER=mock` or leave `LLM_API_KEY` empty.

**Providers supported** (swap with env vars, no code change): Claude · OpenAI · MiniMax · mock.

---

## Architecture

- **Next.js App Router** on Vercel — serverless, custom-domain on free tier
- **11 agents in parallel** via `Promise.allSettled` — full hive responds in 5–8s
- **Pluggable LLM provider** — `lib/llm-provider.ts`, env-driven
- **β-anchored price engine** — `lib/price-engine.ts`, hive's net pressure deforms virtual price
- **Zustand + localStorage** — single-player, no auth, no DB

### Layout

```
hivemind/
├── app/
│   ├── api/                # decide · aggregate · scenario-react · market/price
│   ├── play/page.tsx       # the game
│   └── page.tsx            # landing
├── components/             # VoiceCard, Tutorial, StreamlitChart, ...
├── lib/
│   ├── types.ts            # type contracts (single source of truth)
│   ├── agents.ts           # 11 system prompts
│   ├── llm-provider.ts     # provider abstraction
│   ├── price-engine.ts     # β-anchored virtual price
│   └── store.ts            # Zustand session
└── public/data/            # bundled AAPL OHLCV + cached news
```

---

## Cost control · canonical run cache

`/api/agents/decide` reads through a per-day cache at
`public/data/cached-decisions/<TICKER>/<DATE>.json`. The default 32-day
AAPL run is cacheable; what-if scenarios and multi-round calls bypass
the cache automatically.

Populate the cache once locally, then commit it so every player on
production plays for free:

```bash
bun run dev                      # in one terminal, with a real LLM key
bun run generate-cache --start=2026-03-30 --days=32
git add public/data/cached-decisions
git commit -m "Cache canonical AAPL 32-day run"
```

The script costs roughly $3-4 in Claude Haiku for one 32-day run. Pass
`?cache=skip` on a single API call to force a live regeneration of one
day.

## Deploy

```bash
vercel link
vercel env add LLM_API_KEY    production
vercel env add LLM_BASE_URL   production
vercel env add LLM_MODEL      production
vercel --prod
```

Custom domain → Vercel dashboard → DNS at registrar.

---

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for the game-focused product plan: Now / Next / Later phases, kill criteria, and what we're explicitly **not** doing (no multiplayer, no real money, no "learn to trade" pivot).

## License

MIT.
