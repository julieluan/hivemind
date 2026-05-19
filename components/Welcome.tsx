"use client";

import { useState } from "react";

export function Welcome({ onStart }: { onStart: (initCapital: number) => void }) {
  const [capital, setCapital] = useState(1_000_000);
  const options = [
    { v: 10_000, lbl: "10k" },
    { v: 100_000, lbl: "100k" },
    { v: 1_000_000, lbl: "1M" },
    { v: 10_000_000, lbl: "10M" },
    { v: 100_000_000, lbl: "100M" },
  ];

  return (
    <div className="welcome">
      <div className="inner">
        <div className="smallcaps" style={{ color: "var(--accent)" }}>
          ⬡ Hivemind · Trader Notebook · Vol.01
        </div>
        <h1>
          You are the<br />
          <span className="it">twelfth</span> trader.
        </h1>
        <p className="lede">
          Eleven AI agents — Cathie, a pod PM, an activist short, three economists, a retail
          FOMO trader, a quant CTA, a perma-bull, a day-trader, and a sell-side analyst — form
          a simulated market for AAPL over 32 days. They each have a private belief and a
          public statement, and they don't always match. Read them, probe them, commit a move.
        </p>
        <dl className="ledger">
          <dt>session</dt><dd>2026 · 32 trading days · AAPL</dd>
          <dt>mode</dt><dd>open-mark · slippage off · short-sell off</dd>
          <dt>probes</dt><dd>3 private-state reveals per day · resets at open</dd>
          <dt>capital</dt>
          <dd>
            <select
              value={capital}
              onChange={(e) => setCapital(Number(e.target.value))}
              style={{
                background: "var(--paper-2)",
                border: "1px solid var(--rule)",
                padding: "4px 8px",
                fontFamily: "var(--mono)",
                fontSize: 11,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "var(--ink)",
              }}
            >
              {options.map((o) => (
                <option key={o.v} value={o.v}>${o.lbl}</option>
              ))}
            </select>
          </dd>
        </dl>
        <button className="start" onClick={() => onStart(capital)}>
          enter the lab <span className="arr">⟶</span>
        </button>
      </div>
    </div>
  );
}
