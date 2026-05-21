"use client";

import { useState } from "react";
import { SCENARIOS, DEFAULT_SCENARIO, type Scenario } from "@/lib/scenarios";

export function Welcome({
  onStart,
}: {
  onStart: (initCapital: number, scenario: Scenario) => void;
}) {
  const [capital, setCapital] = useState(1_000_000);
  const [scenarioId, setScenarioId] = useState(DEFAULT_SCENARIO.id);
  const scenario =
    SCENARIOS.find((s) => s.id === scenarioId) ?? DEFAULT_SCENARIO;

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
      body: "Real AAPL chart, toggleable indicators (SMA / BB / RSI / MACD / Volume), and real news headlines fed into every agent's prompt.",
    },
    {
      icon: "2",
      iconBg: "bg-[var(--ink)]",
      title: "11 LLM voices · peek their truth",
      body: "Influencer, pod PM, activist short, permabull, retail FOMO, CTA, economists, day trader. Each holds a book + posts publicly. Peek 3× per day to see what they actually believe — many lie 🎭.",
    },
    {
      icon: "3",
      iconBg: "bg-[var(--ink)]",
      title: "Call out the liars · detection is the score",
      body: "🚩 Flag any agent you think is lying that day. End-game tallies your catches, false flags, and misses. PnL is secondary; detection is the score that matters.",
    },
    {
      icon: "4",
      iconBg: "bg-[var(--ink)]",
      title: "Manipulate the world · run events or skip time",
      body: "Trigger preset or custom events (\"War breaks out\", \"Tim Cook resigns\") — Claude polls all agents in parallel for live reactions. Or ⏩ skip 3 / 5 / 10 days; the hive keeps trading and lying without you.",
    },
  ];

  const badgeColor: Record<Scenario["badge"], string> = {
    bull: "var(--gain)",
    bear: "var(--loss)",
    chop: "#ea580c",
  };
  const badgeLabel: Record<Scenario["badge"], string> = {
    bull: "BULL",
    bear: "BEAR",
    chop: "CHOP",
  };

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
          32 trading days · powered by Claude Haiku
        </p>

        {/* Feature cards */}
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

        {/* Scenario picker */}
        <div className="mb-8">
          <div className="text-xs uppercase tracking-wider text-[var(--muted)] mb-2 font-medium text-center">
            Scenario · pick your 32-day regime
          </div>
          <div className="flex flex-col gap-1.5">
            {SCENARIOS.map((s) => {
              const on = scenarioId === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setScenarioId(s.id)}
                  className={`text-left px-3 py-2 rounded-md border transition-colors ${
                    on
                      ? "border-[var(--ink)] bg-[var(--bg-soft)]"
                      : "border-[var(--border)] hover:border-[var(--ink)]"
                  }`}
                >
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span
                      className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded"
                      style={{
                        color: badgeColor[s.badge],
                        border: `1px solid ${badgeColor[s.badge]}`,
                      }}
                    >
                      {badgeLabel[s.badge]}
                    </span>
                    <span className="font-semibold text-[0.9rem]">{s.label}</span>
                    <span
                      className="text-[10px] num font-semibold ml-auto"
                      style={{ color: badgeColor[s.badge] }}
                    >
                      B&amp;H {s.bhReturnPct >= 0 ? "+" : ""}
                      {s.bhReturnPct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="text-[12px] text-[var(--muted)] leading-snug mt-0.5">
                    {s.blurb}
                    <span className="text-[var(--faint)] ml-1">
                      · news {s.newsCoverage}/32 days
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
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
            onClick={() => onStart(capital, scenario)}
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
