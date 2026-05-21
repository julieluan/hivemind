#!/usr/bin/env node
// Fetch DiceBear SVG portraits for all 11 agents and cache them as static
// assets under public/agents/. Each agent's style + seed is chosen to fit
// the character (Cathie-style influencer = notionists with pink bg, CTA =
// robot, retail FOMO = avataaars hoodie, etc.).
//
// Usage:  node scripts/fetch-avatars.mjs

import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "public", "agents");

mkdirSync(OUT, { recursive: true });

// agentId → { style, seed, bg (hex, no #), extra params }
const AGENTS = [
  {
    id: "super_influencer_001",
    style: "notionists",
    seed: "Catherine-Lin-CW",
    bg: "fce7f3",
    extra: "",
  },
  {
    id: "pod_pm_001",
    style: "personas",
    seed: "David-Tang-Citadel",
    bg: "e2e8f0",
    extra: "",
  },
  {
    id: "activist_short_001",
    style: "lorelei",
    seed: "Sarah-Klein-Hindenburg",
    bg: "fee2e2",
    extra: "",
  },
  {
    id: "sell_side_001",
    style: "personas",
    seed: "Michael-Chen-MS-Analyst",
    bg: "dbeafe",
    extra: "",
  },
  {
    id: "cta_forced_001",
    style: "bottts",
    seed: "ManCo-CTA-Trend",
    bg: "1f2937",
    extra: "",
  },
  {
    id: "retail_fomo_001",
    style: "avataaars",
    seed: "Alex-Park-WSB",
    bg: "ede9fe",
    extra: "&clothing=hoodie",
  },
  {
    id: "permabull_001",
    style: "notionists",
    seed: "Thomas-Lin-Fundstrat",
    bg: "dcfce7",
    extra: "",
  },
  {
    id: "day_trader_001",
    style: "avataaars",
    seed: "Devon-Wallace-DayTrader",
    bg: "ffedd5",
    extra: "&clothing=blazerAndShirt&accessoriesProbability=100",
  },
  {
    id: "economist_macro_001",
    style: "notionists",
    seed: "Ben-Brandeis-Fed-Governor",
    bg: "ecfccb",
    extra: "",
  },
  {
    id: "economist_political_001",
    style: "notionists",
    seed: "Paul-Kramer-NYT-MIT",
    bg: "fee2e2",
    extra: "",
  },
  {
    id: "economist_trader_001",
    style: "notionists",
    seed: "Stan-Drucker-FamilyOffice",
    bg: "cffafe",
    extra: "",
  },
];

let ok = 0;
let fail = 0;

for (const a of AGENTS) {
  const url = `https://api.dicebear.com/9.x/${a.style}/svg?seed=${encodeURIComponent(a.seed)}&backgroundColor=${a.bg}${a.extra}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    const svg = await resp.text();
    if (!svg.includes("<svg")) {
      throw new Error("not an SVG");
    }
    writeFileSync(path.join(OUT, `${a.id}.svg`), svg);
    console.log(`✓ ${a.id} · ${a.style} · ${(svg.length / 1024).toFixed(1)}KB`);
    ok += 1;
  } catch (e) {
    console.error(`✗ ${a.id} · ${e.message}`);
    fail += 1;
  }
}

console.log(`\nFetched ${ok}/${AGENTS.length} avatars to public/agents/.`);
if (fail > 0) process.exit(1);
