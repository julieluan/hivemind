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
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-xl w-full">
        <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted)] font-semibold mb-3 text-center">
          ⬡ Hivemind
        </div>
        <h1 className="text-4xl md:text-5xl font-bold leading-tight tracking-tight text-center mb-4">
          Outsmart the hive.
        </h1>
        <p className="text-base text-[var(--muted)] text-center mb-10 max-w-md mx-auto">
          Eleven AI agents form a market. You&apos;re the twelfth trader.
        </p>

        <div className="text-sm text-[var(--muted)] space-y-3 mb-10 max-w-md mx-auto">
          <div className="flex items-start gap-3">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--ink)] text-white text-[10px] font-bold flex-shrink-0 mt-0.5">1</span>
            <span>Read today&apos;s headlines and what the agents are saying publicly.</span>
          </div>
          <div className="flex items-start gap-3">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--ink)] text-white text-[10px] font-bold flex-shrink-0 mt-0.5">2</span>
            <span>Optionally peek private thoughts (3 / day) — agents may say one thing in public, mean another.</span>
          </div>
          <div className="flex items-start gap-3">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--ink)] text-white text-[10px] font-bold flex-shrink-0 mt-0.5">3</span>
            <span>Pick Buy / Hold / Sell, set the amount, click Next day. Beat them by day 32.</span>
          </div>
        </div>

        <div className="mb-6">
          <div className="text-xs uppercase tracking-wider text-[var(--muted)] mb-2 font-medium text-center">Starting capital</div>
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

        <p className="text-xs text-[var(--faint)] mt-10 text-center">
          AAPL · 32 trading days · powered by Claude Haiku
        </p>
      </div>
    </main>
  );
}
