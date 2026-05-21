#!/usr/bin/env node
// Generate the canonical 32-day cache by walking the AAPL price data and
// hitting the dev /api/agents/decide for each trading day. Writes results
// to public/data/cached-decisions/AAPL/<date>.json.
//
// Usage:
//   bun run dev   # in one terminal — needs a working LLM key in .env.local
//   bun scripts/generate-cache.mjs --start=2026-03-30 --days=32
//
// Cost: one full 11-agent decide call per day. For Claude Haiku ≈ $0.10/day,
// $3-4 per 32-day run. Commit the cached JSON to ship the saved cost to prod.

import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

function arg(name, def) {
  const m = process.argv.find((a) => a.startsWith(`--${name}=`));
  return m ? m.slice(name.length + 3) : def;
}

const TICKER = arg("ticker", "AAPL");
const START = arg("start", "2026-03-30");
const DAYS = Number(arg("days", "32"));
const BASE = arg("base", "http://localhost:3000");

const pricesPath = path.join(ROOT, "public", "data", `${TICKER}.json`);
let prices;
try {
  prices = JSON.parse(readFileSync(pricesPath, "utf-8")).prices;
} catch (e) {
  console.error(`Cannot read ${pricesPath} — ${e.message}`);
  process.exit(1);
}

const tradingFrom = prices.filter((p) => p.date >= START);
const window = tradingFrom.slice(0, DAYS);
if (window.length < DAYS) {
  console.warn(`Only ${window.length} trading days available from ${START}`);
}

function computeIndicators(closes) {
  if (closes.length < 20) return {};
  const sma20 =
    closes.slice(-20).reduce((s, c) => s + c, 0) / 20;
  return { sma20 };
}

let totalLatency = 0;
let cacheHits = 0;
let liveCalls = 0;

for (let i = 0; i < window.length; i++) {
  const todayBar = window[i];
  const histEndIdx = prices.findIndex((p) => p.date === todayBar.date);
  const history = prices.slice(Math.max(0, histEndIdx - 30), histEndIdx + 1);
  const closes = history.map((b) => b.close);
  const inds = computeIndicators(closes);

  // Try to load today's news so cached agents reason against real headlines
  let newsHeadlines = [];
  try {
    const newsPath = path.join(
      ROOT,
      "public",
      "data",
      "news",
      `${TICKER}_${todayBar.date}.json`,
    );
    const raw = JSON.parse(readFileSync(newsPath, "utf-8"));
    newsHeadlines = (Array.isArray(raw) ? raw : [])
      .map((n) => (n?.title ?? "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 6);
  } catch {
    newsHeadlines = [];
  }

  const t0 = Date.now();
  const resp = await fetch(`${BASE}/api/agents/decide`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ticker: TICKER,
      date: todayBar.date,
      market: {
        ticker: TICKER,
        asOfDate: todayBar.date,
        history,
        newsHeadlines,
        sma20: inds.sma20,
      },
      user: {
        cash: 1_000_000,
        shares: 0,
        costBasis: 0,
        initialCapital: 1_000_000,
      },
    }),
  });
  const json = await resp.json();
  const dt = Date.now() - t0;
  totalLatency += dt;

  if (dt < 200) {
    cacheHits += 1;
    console.log(
      `[${i + 1}/${window.length}] ${todayBar.date} · cache hit · ${dt}ms`,
    );
  } else {
    liveCalls += 1;
    console.log(
      `[${i + 1}/${window.length}] ${todayBar.date} · live · ${dt}ms · ${json.decisions?.length ?? 0} agents` +
        (json.errors?.length ? ` · ${json.errors.length} errors` : ""),
    );
  }
}

console.log("");
console.log(
  `Done. ${cacheHits} cache hits + ${liveCalls} live calls · total ${(totalLatency / 1000).toFixed(1)}s`,
);
console.log(
  `Cache files: public/data/cached-decisions/${TICKER}/*.json — review and commit.`,
);
