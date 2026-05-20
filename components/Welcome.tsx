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
  return (
    <main className="min-h-screen flex items-center justify-center px-6 py-10">
      <div className="max-w-2xl w-full">
        <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted)] font-semibold mb-3 text-center">
          ⬡ Hivemind
        </div>
        <h1 className="text-4xl md:text-5xl font-bold leading-tight tracking-tight text-center mb-3">
          Outsmart the hive.
        </h1>
        <p className="text-base text-[var(--muted)] text-center mb-2 max-w-md mx-auto">
          Eleven AI agents form a market. You&apos;re the twelfth trader.
        </p>
        <p className="text-sm text-[var(--faint)] text-center mb-8 max-w-md mx-auto">
          32 trading days of real AAPL · powered by Claude Haiku
        </p>

        {/* What's inside */}
        <div className="text-sm text-[#374151] space-y-4 mb-8 max-w-lg mx-auto">
          <div className="flex items-start gap-3">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[var(--ink)] text-white text-[11px] font-bold flex-shrink-0 mt-0.5">
              1
            </span>
            <div>
              <div className="font-semibold mb-0.5">Read the market</div>
              <div className="text-[var(--muted)]">
                Real AAPL chart with SMA20 / BB / RSI / MACD / Volume.
                Today&apos;s actual news headlines feed into each agent&apos;s prompt.
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[var(--ink)] text-white text-[11px] font-bold flex-shrink-0 mt-0.5">
              2
            </span>
            <div>
              <div className="font-semibold mb-0.5">Listen to 11 LLM-driven voices</div>
              <div className="text-[var(--muted)]">
                Cathie-style influencer · pod PM · activist short · permabull · retail FOMO · CTA quant ·
                three economists · sell-side analyst · day trader. Each holds their own book and
                posts a public take.
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[var(--ink)] text-white text-[11px] font-bold flex-shrink-0 mt-0.5">
              3
            </span>
            <div>
              <div className="font-semibold mb-0.5">
                Peek private thoughts (3 / day) — agents may lie
              </div>
              <div className="text-[var(--muted)]">
                Some say one thing in public and trade the opposite. 🎭 The peek
                lets you see who&apos;s actually short while shouting &ldquo;long-term thesis intact.&rdquo;
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#0891b2] text-white text-[11px] font-bold flex-shrink-0 mt-0.5">
              ★
            </span>
            <div>
              <div className="font-semibold mb-0.5">
                Trigger a what-if event (preset or custom)
              </div>
              <div className="text-[var(--muted)]">
                &ldquo;War breaks out&rdquo; · &ldquo;AI bubble bursts&rdquo; · &ldquo;Tim Cook resigns&rdquo; · or type
                your own. Claude polls all 10 LLM agents in parallel and shows
                how each one would react in-character.
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#7c3aed] text-white text-[11px] font-bold flex-shrink-0 mt-0.5">
              ⏩
            </span>
            <div>
              <div className="font-semibold mb-0.5">Skip days · agents keep trading</div>
              <div className="text-[var(--muted)]">
                Fast-forward 3 / 5 / 10 days. Each agent still trades + occasionally
                deceives (driven by personality + real price action) — your end-game
                recap stays coherent.
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[var(--ink)] text-white text-[11px] font-bold flex-shrink-0 mt-0.5">
              4
            </span>
            <div>
              <div className="font-semibold mb-0.5">Trade. Beat them by day 32.</div>
              <div className="text-[var(--muted)]">
                Buy / Hold / Sell with USD or %. Live leaderboard vs you, Buy &amp;
                Hold, and 8 agent portfolios. End-game recap with full action
                heatmap and deception breakdown.
              </div>
            </div>
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
            onClick={() => onStart(capital)}
            className="bg-[var(--ink)] text-white px-10 py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity"
          >
            Start →
          </button>
        </div>

        <p className="text-xs text-[var(--faint)] mt-8 text-center">
          A guided tour kicks off on day 1 — you can dismiss it or come back via
          &ldquo;? Take the tour&rdquo; at the top.
        </p>
      </div>
    </main>
  );
}
