import type { PriceBar } from "@/lib/types";

export function FrontMatter({
  ticker,
  day,
  total,
  todayBar,
  prevBar,
}: {
  ticker: string;
  day: number;
  total: number;
  todayBar?: PriceBar | null;
  prevBar?: PriceBar | null;
}) {
  const sessionDelta = todayBar && prevBar
    ? ((todayBar.open - prevBar.close) / prevBar.close) * 100
    : 0;
  const direction = sessionDelta >= 0 ? "bull" : "bear";

  return (
    <section className="front-matter">
      <div>
        <div className="smallcaps" style={{ color: "var(--accent)" }}>
          §00 · front matter · the lab opens
        </div>
        <h1>
          The <span className="it">hive</span> speaks; <br />
          you decide.
        </h1>
        <p
          style={{
            fontFamily: "var(--display)",
            fontSize: 17,
            color: "var(--ink-mute)",
            fontStyle: "italic",
            marginTop: 6,
            maxWidth: "52ch",
          }}
        >
          Eleven LLM agents form a market. They post public statements,
          but their private beliefs may differ. Each day you read their
          tape, optionally probe their private state (3 reveals/day),
          rehearse a counterfactual, and commit your move.
        </p>
        <div className="eq">
          <span className="lbl">EQ·01</span>
          <span className="body">P<sub>t</sub> ≔ P<sub>t-1</sub> · (1 + r<sub>real</sub>) · (1 + s · π<sub>hive</sub>) · (1 − λ · δ)</span>
        </div>
      </div>

      <dl className="colophon">
        <dt>ticker</dt><dd>{ticker} · NASDAQ</dd>
        <dt>session</dt><dd>day {day + 1} / {total} · open-mark</dd>
        <dt>last close</dt><dd>{prevBar ? `$${prevBar.close.toFixed(2)}` : "—"}</dd>
        <dt>today open</dt>
        <dd>
          {todayBar ? (
            <>
              ${todayBar.open.toFixed(2)}
              {prevBar && (
                <span style={{ color: direction === "bull" ? "var(--bull)" : "var(--bear)", marginLeft: 8 }}>
                  {sessionDelta >= 0 ? "+" : ""}{sessionDelta.toFixed(2)}%
                </span>
              )}
            </>
          ) : "—"}
        </dd>
        <dt>sensitivity</dt><dd>s = 0.30 · λ = 0.07</dd>
      </dl>
    </section>
  );
}
