import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

export const runtime = "edge";

// Clamp helper — share images get user-controlled URL params, so we
// guard every numeric input even though the writer is our own UI.
function num(v: string | null, def: number, min = -1e6, max = 1e6): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

export async function GET(req: NextRequest) {
  const { searchParams: sp } = new URL(req.url);
  const tp = Math.round(num(sp.get("tp"), 0, 0, 9999));
  const fp = Math.round(num(sp.get("fp"), 0, 0, 9999));
  const fn = Math.round(num(sp.get("fn"), 0, 0, 9999));
  const pnlPct = num(sp.get("pnl"), 0, -100, 100000);
  const beat = Math.round(num(sp.get("beat"), 0, 0, 50));
  const totalAgents = Math.round(num(sp.get("total"), 11, 1, 50));
  const days = Math.round(num(sp.get("days"), 32, 0, 999));

  const net = tp - fp;
  const totalFlags = tp + fp;

  // Verdict mirrors the in-app verdict ladder
  let verdict: string;
  let verdictColor: string;
  if (totalFlags === 0) {
    verdict = "Played the tape, not the people.";
    verdictColor = "#737373";
  } else if (net >= 5) {
    verdict = "🎯 Sharp eye — read the hive.";
    verdictColor = "#16a34a";
  } else if (net >= 1) {
    verdict = "👁 Decent reads — more right than wrong.";
    verdictColor = "#16a34a";
  } else if (net === 0) {
    verdict = "🤝 Even split — coin flip on the calls.";
    verdictColor = "#737373";
  } else if (net >= -3) {
    verdict = "🎲 Mixed signals — close but not quite.";
    verdictColor = "#dc2626";
  } else {
    verdict = "😅 Trigger happy — too many false flags.";
    verdictColor = "#dc2626";
  }

  const netDisplay = `${net >= 0 ? "+" : ""}${net}`;
  const pnlDisplay = `${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%`;
  const pnlColor = pnlPct > 0 ? "#16a34a" : pnlPct < 0 ? "#dc2626" : "#737373";

  // Reusable stat block — Satori needs display:flex on every node + explicit
  // sizing on children. No marginTop:auto (unreliable in Satori).
  const stat = (
    label: string,
    value: string,
    color: string,
    sub: string,
    alignRight = false,
  ) => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: alignRight ? "flex-end" : "flex-start",
        ...(alignRight ? { marginLeft: "auto" } : {}),
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 16,
          color: "#737373",
          textTransform: "uppercase",
          letterSpacing: 2,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 64,
          fontWeight: 800,
          color,
          lineHeight: 1,
          marginTop: 6,
        }}
      >
        {value}
      </div>
      <div style={{ display: "flex", fontSize: 14, color: "#a3a3a3", marginTop: 4 }}>
        {sub}
      </div>
    </div>
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#ffffff",
          padding: "60px 70px",
          fontFamily: "ui-sans-serif, system-ui",
          color: "#0a0a0a",
        }}
      >
        {/* Header row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 22,
            letterSpacing: 4,
            fontWeight: 700,
            color: "#525252",
            textTransform: "uppercase",
          }}
        >
          <div style={{ display: "flex" }}>HIVEMIND</div>
          <div style={{ display: "flex", fontSize: 18 }}>
            {days}-day run · AAPL
          </div>
        </div>

        {/* Detection hero */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 26,
              fontWeight: 600,
              color: "#525252",
              textTransform: "uppercase",
              letterSpacing: 3,
            }}
          >
            Detection score
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 180,
              fontWeight: 900,
              lineHeight: 1,
              color: net > 0 ? "#16a34a" : net < 0 ? "#dc2626" : "#737373",
              marginTop: 8,
            }}
          >
            {netDisplay}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 26,
              fontWeight: 600,
              color: verdictColor,
              marginTop: 12,
            }}
          >
            {verdict}
          </div>
        </div>

        {/* Stats row — pinned bottom via parent justify-content:space-between */}
        <div
          style={{
            display: "flex",
            gap: 50,
            paddingTop: 24,
            borderTop: "1px solid #e5e5e5",
          }}
        >
          {stat("Caught", String(tp), "#16a34a", "true liars")}
          {stat("Missed", String(fn), "#737373", "lies passed")}
          {stat("False", String(fp), "#dc2626", "wrongly flagged")}
          {stat(
            "PnL · Beat",
            pnlDisplay,
            pnlColor,
            `${beat}/${totalAgents} AI traders`,
            true,
          )}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
