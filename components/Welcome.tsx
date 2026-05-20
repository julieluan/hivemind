"use client";

import { useState } from "react";

export function Welcome({ onStart }: { onStart: (initCapital: number) => void }) {
  const [capital, setCapital] = useState(1_000_000);
  const options = [
    { v: 10_000, lbl: "$10k" },
    { v: 100_000, lbl: "$100k" },
    { v: 1_000_000, lbl: "$1M" },
    { v: 10_000_000, lbl: "$10M" },
    { v: 100_000_000, lbl: "$100M" },
  ];

  const cards: Array<{ icon: string; iconBg: string; title: string; body: string }> = [
    {
      icon: "1",
      iconBg: "bg-[var(--ink)]",
      title: "Read the market",
      body: "Real AAPL chart with toggleable indicators (SMA / BB / RSI / MACD / Volume) and real news headlines fed into every agent's prompt.",
    },
    {
      icon: "2",
      iconBg: "bg-[var(--ink)]",
      title: "11 LLM voices",
      body: "Influencer, pod PM, activist short, permabull, retail FOMO, CTA quant, economists, day trader. Each holds a book and posts a public take.",
    },
    {
      icon: "3",
      iconBg: "bg-[var(--ink)]",
      title: "Peek private thoughts · 3/day",
      body: "Some say one thing in public, trade the opposite. 🎭 See who's really short while shouting \"long-term thesis intact.\"",
    },
    {
      icon: "★",
      iconBg: "bg-[#0891b2]",
      title: "Trigger what-if events",
      body: "\"War breaks out\" · \"AI bubble bursts\" · or type your own. Claude polls all 10 agents in parallel for live in-character reactions.",
    },
    {
      icon: "⏩",
      iconBg: "bg-[#7c3aed]",
      title: "Skip days — hive keeps moving",
      body: "Fast-forward 3 / 5 / 10 days. Agents still trade and lie based on real price action, so the recap stays whole.",
    },
    {
      icon: "4",
      iconBg: "bg-[var(--ink)]",
      title: "Beat them by day 32",
      body: "Live leaderboard vs you, Buy & Hold, and 8 agent books. End-game shows a heatmap of every action and every 🎭.",
    },
  ];

  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-10">
      <div className="max-w-2xl w-full">
        <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted)] font-semibold mb-3 text-center">
          ⬡ Hivemind
        </div>
        <h1 className="text-4xl md:text-5xl font-bold leading-tight tracking-tight text-center mb-3">
          Outsmart the hive.
        </h1>
        <p className="text-base text-[var(--muted)] text-center mb-1">
          Eleven AI agents form a market. You&apos;re the twelfth trader.
        </p>
        <p className="text-sm text-[var(--faint)] text-center mb-10">
          32 trading days of real AAPL · powered by Claude Haiku
        </p>

        {/* Single column of feature cards */}
        <div className="flex flex-col gap-4 mb-10">
          {cards.map((c) => (
            <div key={c.title} className="flex items-start gap-3">
              <span
                className={`inline-flex items-center justify-center w-7 h-7 rounded-full ${c.iconBg} text-white text-xs font-bold flex-shrink-0 mt-0.5`}
              >
                {c.icon}
              </span>
              <div>
                <div className="font-semibold text-[0.95rem] mb-0.5">{c.title}</div>
                <div className="text-sm text-[var(--muted)] leading-snug">{c.body}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Starting capital + Start */}
        <div className="mb-6">
          <div className="text-xs uppercase tracking-wider text-[var(--muted)] mb-2 font-medium text-center">
            Starting capital
          </div>
          <div className="flex gap-2 justify-center flex-wrap">
            {options.map((o) => (
              <button
                key={o.v}
                onClick={() => setCapital(o.v)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                  capital === o.v
                    ? "bg-[var(--ink)] text-white border-[var(--ink)]"
                    : "bg-white text-[var(--ink)] border-[var(--border)] hover:border-[var(--ink)]"
                }`}
              >
                {o.lbl}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-center">
          <button
            onClick={() => onStart(capital)}
            className="bg-[var(--ink)] text-white px-10 py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity"
          >
            Start →
          </button>
        </div>

        <p className="text-xs text-[var(--faint)] mt-6 text-center">
          A 5-step tour kicks off on day 1 — dismiss it or replay via &ldquo;? Take the tour&rdquo;.
        </p>
      </div>
    </main>
  );
}
