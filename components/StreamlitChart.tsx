"use client";

import { useMemo } from "react";
import type { PriceBar } from "@/lib/types";

// ────────────────────────────────────────────────────────────────────────────
// StreamlitChart — port of the Streamlit Plotly chart.
//   • 1M / 3M / 1Y / 5Y / Sim x-axis window
//   • Optional overlays: SMA20, BB
//   • Optional subplots: Volume bars, RSI(14), MACD histogram + signal line
//   • Sim-start vertical dashed line, today's open diamond, buy/sell triangles
// ────────────────────────────────────────────────────────────────────────────

export type RangeKey = "1M" | "3M" | "1Y" | "5Y" | "Sim";
export type Overlay = "SMA20" | "BB" | "RSI" | "MACD" | "Volume";

const INK = "#0a0a0a";
const MUTED = "#737373";
const FAINT = "#a3a3a3";
const GRID = "#f1f5f9";
const GREEN = "#16a34a";
const RED = "#dc2626";
const HISTORY_TINT = "#cbd5e1";

function daysBetween(a: Date, b: Date): number {
  return (a.getTime() - b.getTime()) / 86_400_000;
}
function parseDate(d: string): Date {
  return new Date(d + "T00:00:00Z");
}
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface Trade {
  day: string;
  fillPrice: number;
  userBuyUsd: number;
  userSellUsd: number;
}

export function StreamlitChart({
  fullHistory,
  simStartDate,
  simEndDate,
  todayDate,
  todayOpen,
  range,
  overlays,
  userTrades = [],
  width = 760,
  baseHeight = 360,
  subHeight = 110,
}: {
  fullHistory: PriceBar[];
  simStartDate: string;
  simEndDate: string;
  todayDate: string;
  todayOpen: number | null;
  range: RangeKey;
  overlays: Overlay[];
  userTrades?: Trade[];
  width?: number;
  baseHeight?: number;
  subHeight?: number;
}) {
  const showSMA = overlays.includes("SMA20");
  const showBB = overlays.includes("BB");
  const showVol = overlays.includes("Volume");
  const showRSI = overlays.includes("RSI");
  const showMACD = overlays.includes("MACD");

  const panels: ("price" | "volume" | "rsi" | "macd")[] = ["price"];
  if (showVol) panels.push("volume");
  if (showRSI) panels.push("rsi");
  if (showMACD) panels.push("macd");

  // Visible history = bars strictly before todayDate (matches Streamlit `< cur_date`)
  const visible = useMemo(
    () => fullHistory.filter((b) => b.date < todayDate),
    [fullHistory, todayDate]
  );
  const closes = useMemo(() => visible.map((b) => b.close), [visible]);

  // Compute x window
  const xWindow = useMemo(() => {
    const cur = parseDate(todayDate);
    const simStart = parseDate(simStartDate);
    const simEnd = parseDate(simEndDate);
    let xFrom: Date;
    let xTo: Date;
    if (range === "1M") {
      xFrom = new Date(cur.getTime() - 30 * 86_400_000);
      xTo = new Date(cur.getTime() + 2 * 86_400_000);
    } else if (range === "3M") {
      xFrom = new Date(cur.getTime() - 90 * 86_400_000);
      xTo = new Date(cur.getTime() + 2 * 86_400_000);
    } else if (range === "1Y") {
      xFrom = new Date(cur.getTime() - 365 * 86_400_000);
      xTo = new Date(cur.getTime() + 2 * 86_400_000);
    } else if (range === "5Y") {
      const earliest = fullHistory[0] ? parseDate(fullHistory[0].date) : cur;
      const fiveY = new Date(cur.getTime() - 5 * 365 * 86_400_000);
      xFrom = fiveY > earliest ? fiveY : earliest;
      xTo = new Date(cur.getTime() + 2 * 86_400_000);
    } else {
      xFrom = new Date(simStart.getTime() - 2 * 86_400_000);
      xTo = new Date(simEnd.getTime() + 2 * 86_400_000);
    }
    return { xFrom, xTo };
  }, [range, todayDate, simStartDate, simEndDate, fullHistory]);

  // Bars in x window (price subset)
  const barsInWindow = useMemo(() => {
    return visible.filter((b) => {
      const t = parseDate(b.date);
      return t >= xWindow.xFrom && t <= xWindow.xTo;
    });
  }, [visible, xWindow]);

  // Rolling SMA20 over the full visible series (so window edges still align)
  const sma20 = useMemo(() => roll(closes, 20, (s) => avg(s)), [closes]);
  const bbUpper = useMemo(() => roll(closes, 20, (s) => avg(s) + 2 * std(s)), [closes]);
  const bbLower = useMemo(() => roll(closes, 20, (s) => avg(s) - 2 * std(s)), [closes]);
  const rsi14 = useMemo(() => rsiSeries(closes, 14), [closes]);
  const macd = useMemo(() => macdSeries(closes), [closes]);

  // Layout
  const n_rows = panels.length;
  let row_heights: number[];
  if (n_rows === 1) row_heights = [1];
  else if (n_rows === 2) row_heights = [0.75, 0.25];
  else if (n_rows === 3) row_heights = [0.62, 0.19, 0.19];
  else row_heights = [0.55, 0.15, 0.15, 0.15];

  const totalH = baseHeight + subHeight * (n_rows - 1);
  const pad = { top: 14, right: 14, bottom: 32, left: 64 };
  const innerW = width - pad.left - pad.right;
  const innerH = totalH - pad.top - pad.bottom;
  const gap = 6;
  // Compute row top/bottom in svg coords
  const rowEdges: { top: number; bottom: number }[] = [];
  let cursor = pad.top;
  for (let i = 0; i < n_rows; i++) {
    const h = row_heights[i] * (innerH - gap * (n_rows - 1));
    rowEdges.push({ top: cursor, bottom: cursor + h });
    cursor += h + gap;
  }

  // X scale (time → pixel)
  const x0 = xWindow.xFrom.getTime();
  const x1 = xWindow.xTo.getTime();
  const xOf = (ts: number) => pad.left + ((ts - x0) / (x1 - x0)) * innerW;
  const xOfDate = (d: string) => xOf(parseDate(d).getTime());

  // Empty state
  if (barsInWindow.length < 2 && !todayOpen) {
    return (
      <div className="bg-white border border-[var(--grid)] rounded-md p-12 text-center text-xs text-[var(--faint)] font-mono">
        loading market data…
      </div>
    );
  }

  // ── Row 1: price y-range (auto-fit to values in window) ────────────────
  const priceYVals: number[] = [];
  for (const b of barsInWindow) priceYVals.push(b.close);
  if (todayOpen != null) priceYVals.push(todayOpen);
  if (showBB) {
    for (let i = 0; i < visible.length; i++) {
      if (bbUpper[i] == null || bbLower[i] == null) continue;
      const t = parseDate(visible[i].date);
      if (t < xWindow.xFrom || t > xWindow.xTo) continue;
      priceYVals.push(bbUpper[i] as number);
      priceYVals.push(bbLower[i] as number);
    }
  }
  let pyMin = Math.min(...priceYVals);
  let pyMax = Math.max(...priceYVals);
  const pyPad = Math.max(0.5, (pyMax - pyMin) * 0.08);
  pyMin -= pyPad;
  pyMax += pyPad;
  const yPrice = (v: number) => {
    const { top, bottom } = rowEdges[0];
    return top + (1 - (v - pyMin) / (pyMax - pyMin)) * (bottom - top);
  };

  // ── Build price line path (history vs in-sim styling) ──────────────────
  const simStart = parseDate(simStartDate);
  const preSimSeg: { d: string; close: number }[] = [];
  const inSimSeg: { d: string; close: number }[] = [];
  for (const b of barsInWindow) {
    const t = parseDate(b.date);
    if (t < simStart) preSimSeg.push({ d: b.date, close: b.close });
    else inSimSeg.push({ d: b.date, close: b.close });
  }
  const preSimPath = preSimSeg
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xOfDate(p.d).toFixed(1)} ${yPrice(p.close).toFixed(1)}`)
    .join(" ");
  const inSimPath = inSimSeg
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xOfDate(p.d).toFixed(1)} ${yPrice(p.close).toFixed(1)}`)
    .join(" ");
  let bridgePath = "";
  if (preSimSeg.length > 0 && inSimSeg.length > 0) {
    const a = preSimSeg[preSimSeg.length - 1];
    const b = inSimSeg[0];
    bridgePath = `M ${xOfDate(a.d).toFixed(1)} ${yPrice(a.close).toFixed(1)} L ${xOfDate(b.d).toFixed(1)} ${yPrice(b.close).toFixed(1)}`;
  }

  // Bridge from last visible close → today open
  let openBridge = "";
  if (todayOpen != null && visible.length > 0) {
    const lastVis = visible[visible.length - 1];
    const t = parseDate(lastVis.date);
    if (t >= xWindow.xFrom && t <= xWindow.xTo) {
      openBridge = `M ${xOfDate(lastVis.date).toFixed(1)} ${yPrice(lastVis.close).toFixed(1)} L ${xOfDate(todayDate).toFixed(1)} ${yPrice(todayOpen).toFixed(1)}`;
    }
  }

  // SMA20 path
  let smaPath = "";
  if (showSMA) {
    const pts: string[] = [];
    let started = false;
    for (let i = 0; i < visible.length; i++) {
      const v = sma20[i];
      if (v == null) continue;
      const t = parseDate(visible[i].date);
      if (t < xWindow.xFrom || t > xWindow.xTo) continue;
      pts.push(`${started ? "L" : "M"} ${xOfDate(visible[i].date).toFixed(1)} ${yPrice(v).toFixed(1)}`);
      started = true;
    }
    smaPath = pts.join(" ");
  }

  // BB upper/lower path
  let bbUpperPath = "";
  let bbLowerPath = "";
  if (showBB) {
    const ups: string[] = [];
    const los: string[] = [];
    let sU = false;
    let sL = false;
    for (let i = 0; i < visible.length; i++) {
      const u = bbUpper[i];
      const l = bbLower[i];
      if (u == null || l == null) continue;
      const t = parseDate(visible[i].date);
      if (t < xWindow.xFrom || t > xWindow.xTo) continue;
      const xx = xOfDate(visible[i].date).toFixed(1);
      ups.push(`${sU ? "L" : "M"} ${xx} ${yPrice(u).toFixed(1)}`);
      los.push(`${sL ? "L" : "M"} ${xx} ${yPrice(l).toFixed(1)}`);
      sU = true;
      sL = true;
    }
    bbUpperPath = ups.join(" ");
    bbLowerPath = los.join(" ");
  }

  // Y ticks (price row)
  const priceTicks = Array.from({ length: 5 }, (_, i) => pyMin + (i / 4) * (pyMax - pyMin));

  // X labels — first / mid / right-edge, with per-label anchoring so text
  // never overflows the SVG. We drop the "last visible bar" label whenever
  // today's marker is shown (they're adjacent and overlap visually).
  const xLabels: { x: number; text: string; anchor: "start" | "middle" | "end" }[] = [];
  if (barsInWindow.length > 0) {
    const first = barsInWindow[0];
    xLabels.push({ x: xOfDate(first.date), text: first.date, anchor: "start" });
    if (barsInWindow.length > 4) {
      const mid = barsInWindow[Math.floor(barsInWindow.length / 2)];
      xLabels.push({ x: xOfDate(mid.date), text: mid.date, anchor: "middle" });
    }
  }
  if (todayOpen != null) {
    // Right-edge label = today; never show last visible bar (would collide)
    xLabels.push({ x: xOfDate(todayDate), text: todayDate, anchor: "end" });
  } else if (barsInWindow.length > 1) {
    const last = barsInWindow[barsInWindow.length - 1];
    xLabels.push({ x: xOfDate(last.date), text: last.date, anchor: "end" });
  }

  // ── Volume row ──────────────────────────────────────────────────────────
  let volMax = 0;
  const volBars: { x: number; y0: number; y1: number; up: boolean }[] = [];
  if (showVol) {
    const inWin = visible.filter((b) => {
      const t = parseDate(b.date);
      return t >= xWindow.xFrom && t <= xWindow.xTo;
    });
    volMax = Math.max(1, ...inWin.map((b) => b.volume || 0));
    const row = rowEdges[panels.indexOf("volume")];
    const barW = Math.max(1.5, innerW / Math.max(inWin.length, 1) * 0.7);
    for (let i = 0; i < inWin.length; i++) {
      const b = inWin[i];
      const prevClose = i === 0 ? b.close : inWin[i - 1].close;
      const up = b.close >= prevClose;
      const yTop = row.top + (1 - (b.volume || 0) / volMax) * (row.bottom - row.top);
      volBars.push({
        x: xOfDate(b.date) - barW / 2,
        y0: yTop,
        y1: row.bottom,
        up,
      });
    }
    void barW;
  }

  // ── RSI row ─────────────────────────────────────────────────────────────
  let rsiPath = "";
  let rsiRow: { top: number; bottom: number } | null = null;
  if (showRSI) {
    rsiRow = rowEdges[panels.indexOf("rsi")];
    const yR = (v: number) => rsiRow!.top + (1 - v / 100) * (rsiRow!.bottom - rsiRow!.top);
    const pts: string[] = [];
    let started = false;
    for (let i = 0; i < visible.length; i++) {
      const v = rsi14[i];
      if (v == null) continue;
      const t = parseDate(visible[i].date);
      if (t < xWindow.xFrom || t > xWindow.xTo) continue;
      pts.push(`${started ? "L" : "M"} ${xOfDate(visible[i].date).toFixed(1)} ${yR(v).toFixed(1)}`);
      started = true;
    }
    rsiPath = pts.join(" ");
  }

  // ── MACD row ────────────────────────────────────────────────────────────
  let macdRow: { top: number; bottom: number } | null = null;
  const macdBars: { x: number; y0: number; y1: number; up: boolean }[] = [];
  let macdLinePath = "";
  let macdSignalPath = "";
  if (showMACD) {
    macdRow = rowEdges[panels.indexOf("macd")];
    // y range from values in window
    const vals: number[] = [];
    for (let i = 0; i < visible.length; i++) {
      if (macd.hist[i] == null) continue;
      const t = parseDate(visible[i].date);
      if (t < xWindow.xFrom || t > xWindow.xTo) continue;
      vals.push(macd.hist[i] as number, macd.line[i] as number, macd.signal[i] as number);
    }
    const mMin = vals.length ? Math.min(...vals, 0) : -1;
    const mMax = vals.length ? Math.max(...vals, 0) : 1;
    const mPad = Math.max(0.01, (mMax - mMin) * 0.1);
    const lo = mMin - mPad;
    const hi = mMax + mPad;
    const yM = (v: number) => macdRow!.top + (1 - (v - lo) / (hi - lo)) * (macdRow!.bottom - macdRow!.top);
    const zero = yM(0);
    const barW = Math.max(1.5, (innerW / Math.max(barsInWindow.length, 1)) * 0.7);
    for (let i = 0; i < visible.length; i++) {
      const h = macd.hist[i];
      if (h == null) continue;
      const t = parseDate(visible[i].date);
      if (t < xWindow.xFrom || t > xWindow.xTo) continue;
      const yh = yM(h);
      macdBars.push({
        x: xOfDate(visible[i].date) - barW / 2,
        y0: Math.min(yh, zero),
        y1: Math.max(yh, zero),
        up: h >= 0,
      });
    }
    const lPts: string[] = [];
    const sPts: string[] = [];
    let sL = false;
    let sS = false;
    for (let i = 0; i < visible.length; i++) {
      if (macd.line[i] == null) continue;
      const t = parseDate(visible[i].date);
      if (t < xWindow.xFrom || t > xWindow.xTo) continue;
      const xx = xOfDate(visible[i].date).toFixed(1);
      lPts.push(`${sL ? "L" : "M"} ${xx} ${yM(macd.line[i] as number).toFixed(1)}`);
      sPts.push(`${sS ? "L" : "M"} ${xx} ${yM(macd.signal[i] as number).toFixed(1)}`);
      sL = true;
      sS = true;
    }
    macdLinePath = lPts.join(" ");
    macdSignalPath = sPts.join(" ");
    void barW;
  }

  // Sim-start vertical line
  const simStartX = xOfDate(simStartDate);
  const simStartInWindow = simStart >= xWindow.xFrom && simStart <= xWindow.xTo;

  // User trade markers
  const tradeMarks = userTrades
    .map((t) => {
      const td = parseDate(t.day);
      if (td < xWindow.xFrom || td > xWindow.xTo) return null;
      const dir: "buy" | "sell" = t.userBuyUsd > 0 ? "buy" : "sell";
      return { x: xOfDate(t.day), y: yPrice(t.fillPrice), dir };
    })
    .filter((m): m is { x: number; y: number; dir: "buy" | "sell" } => m !== null);

  return (
    <div className="bg-white border border-[var(--grid)] rounded-md p-2">
      <svg viewBox={`0 0 ${width} ${totalH}`} preserveAspectRatio="xMidYMid meet" className="w-full">
        {/* Price grid lines + ticks */}
        {priceTicks.map((t, i) => (
          <g key={`pt${i}`}>
            <line
              x1={pad.left}
              y1={yPrice(t)}
              x2={pad.left + innerW}
              y2={yPrice(t)}
              stroke={GRID}
              strokeWidth={0.5}
            />
            <text
              x={pad.left - 6}
              y={yPrice(t) + 3}
              fontSize={10}
              textAnchor="end"
              fill={MUTED}
              fontFamily="-apple-system, sans-serif"
            >
              ${t.toFixed(0)}
            </text>
          </g>
        ))}

        {/* BB shaded band */}
        {showBB && bbUpperPath && bbLowerPath && (
          <>
            <path d={bbUpperPath} stroke="#94a3b8" strokeDasharray="3 3" strokeWidth={1} fill="none" />
            <path d={bbLowerPath} stroke="#94a3b8" strokeDasharray="3 3" strokeWidth={1} fill="none" />
          </>
        )}

        {/* Pre-sim history line (faint) */}
        {preSimPath && <path d={preSimPath} stroke={HISTORY_TINT} strokeWidth={1.6} fill="none" />}
        {/* Sim-window line (bold) */}
        {inSimPath && <path d={inSimPath} stroke={INK} strokeWidth={2.2} fill="none" />}
        {/* Bridge between pre-sim and in-sim */}
        {bridgePath && <path d={bridgePath} stroke={INK} strokeWidth={2.2} fill="none" />}
        {/* Bridge from last close → today open */}
        {openBridge && <path d={openBridge} stroke={INK} strokeWidth={2.2} fill="none" />}

        {/* SMA20 overlay */}
        {showSMA && smaPath && <path d={smaPath} stroke="#f59e0b" strokeWidth={1.4} fill="none" />}

        {/* Sim-start vertical dashed line */}
        {simStartInWindow && (
          <line
            x1={simStartX}
            y1={pad.top}
            x2={simStartX}
            y2={pad.top + innerH}
            stroke="#cbd5e1"
            strokeDasharray="4 4"
            strokeWidth={1}
          />
        )}

        {/* Today's open diamond + label (auto-flips left of marker near right edge) */}
        {todayOpen != null && (() => {
          const cx = xOfDate(todayDate);
          const cy = yPrice(todayOpen);
          const s = 7;
          const labelText = `OPEN $${todayOpen.toFixed(2)}`;
          const approxLabelW = labelText.length * 6.2 + 6;
          // If diamond is in the right 30% of plot, render label to its LEFT
          const flipLeft = cx > pad.left + innerW * 0.7;
          const labelX = flipLeft ? cx - s - 4 : cx + s + 4;
          const labelAnchor = flipLeft ? "end" : "start";
          // Also clamp label so it never overflows the inner plot area
          const labelXClamped = Math.max(
            pad.left + 2,
            Math.min(pad.left + innerW - 2, labelX)
          );
          void approxLabelW;
          return (
            <g>
              {/* Horizontal price guide line from y-axis to the diamond */}
              <line
                x1={pad.left}
                y1={cy}
                x2={cx}
                y2={cy}
                stroke="#3b82f6"
                strokeDasharray="2 3"
                strokeWidth={0.8}
                opacity={0.5}
              />
              {/* Price label on the LEFT y-axis */}
              <rect
                x={pad.left - 46}
                y={cy - 8}
                width={44}
                height={16}
                rx={2}
                fill="#3b82f6"
              />
              <text
                x={pad.left - 24}
                y={cy + 4}
                fontSize={10}
                textAnchor="middle"
                fill="white"
                fontFamily="-apple-system, sans-serif"
                fontWeight={700}
              >
                ${todayOpen.toFixed(2)}
              </text>
              <polygon
                points={`${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}`}
                fill="#3b82f6"
                stroke="white"
                strokeWidth={2}
              >
                <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite" />
              </polygon>
              <text
                x={labelXClamped}
                y={cy - 10}
                fontSize={10}
                textAnchor={labelAnchor}
                fill="#3b82f6"
                fontFamily="-apple-system, sans-serif"
                fontWeight={700}
              >
                {labelText}
              </text>
            </g>
          );
        })()}

        {/* User trades */}
        {tradeMarks.map((m, i) => (
          <polygon
            key={`tm${i}`}
            points={
              m.dir === "buy"
                ? `${m.x - 5},${m.y + 9} ${m.x + 5},${m.y + 9} ${m.x},${m.y + 2}`
                : `${m.x - 5},${m.y - 9} ${m.x + 5},${m.y - 9} ${m.x},${m.y - 2}`
            }
            fill={m.dir === "buy" ? GREEN : RED}
            stroke="white"
            strokeWidth={1.2}
          />
        ))}

        {/* X axis labels — per-label anchoring to avoid right-edge overflow */}
        {xLabels.map((l, i) => (
          <text
            key={`xl${i}`}
            x={l.x}
            y={pad.top + innerH + 18}
            fontSize={10}
            textAnchor={l.anchor}
            fill={MUTED}
            fontFamily="-apple-system, sans-serif"
          >
            {l.text}
          </text>
        ))}

        {/* ── Volume subplot ────────────────────────────────────────── */}
        {showVol &&
          (() => {
            const row = rowEdges[panels.indexOf("volume")];
            return (
              <g>
                <line
                  x1={pad.left}
                  y1={row.bottom}
                  x2={pad.left + innerW}
                  y2={row.bottom}
                  stroke={GRID}
                  strokeWidth={0.5}
                />
                <text
                  x={pad.left - 6}
                  y={row.top + 10}
                  fontSize={10}
                  textAnchor="end"
                  fill={MUTED}
                  fontFamily="-apple-system, sans-serif"
                >
                  Vol
                </text>
                {volBars.map((b, i) => (
                  <rect
                    key={`vb${i}`}
                    x={b.x}
                    y={b.y0}
                    width={Math.max(1.5, (innerW / Math.max(volBars.length, 1)) * 0.7)}
                    height={Math.max(0.5, b.y1 - b.y0)}
                    fill={b.up ? GREEN : RED}
                    opacity={0.55}
                  />
                ))}
                {simStartInWindow && (
                  <line
                    x1={simStartX}
                    y1={row.top}
                    x2={simStartX}
                    y2={row.bottom}
                    stroke="#cbd5e1"
                    strokeDasharray="4 4"
                    strokeWidth={1}
                  />
                )}
              </g>
            );
          })()}

        {/* ── RSI subplot ───────────────────────────────────────────── */}
        {showRSI && rsiRow && (
          <g>
            <line
              x1={pad.left}
              y1={rsiRow.bottom}
              x2={pad.left + innerW}
              y2={rsiRow.bottom}
              stroke={GRID}
              strokeWidth={0.5}
            />
            <line
              x1={pad.left}
              y1={rsiRow.top + (1 - 70 / 100) * (rsiRow.bottom - rsiRow.top)}
              x2={pad.left + innerW}
              y2={rsiRow.top + (1 - 70 / 100) * (rsiRow.bottom - rsiRow.top)}
              stroke="#fca5a5"
              strokeDasharray="3 4"
              strokeWidth={1}
            />
            <line
              x1={pad.left}
              y1={rsiRow.top + (1 - 30 / 100) * (rsiRow.bottom - rsiRow.top)}
              x2={pad.left + innerW}
              y2={rsiRow.top + (1 - 30 / 100) * (rsiRow.bottom - rsiRow.top)}
              stroke="#86efac"
              strokeDasharray="3 4"
              strokeWidth={1}
            />
            {[30, 50, 70].map((v) => (
              <text
                key={`rt${v}`}
                x={pad.left - 6}
                y={rsiRow!.top + (1 - v / 100) * (rsiRow!.bottom - rsiRow!.top) + 3}
                fontSize={9}
                textAnchor="end"
                fill={FAINT}
                fontFamily="-apple-system, sans-serif"
              >
                {v}
              </text>
            ))}
            <text
              x={pad.left - 6}
              y={rsiRow.top + 10}
              fontSize={10}
              textAnchor="end"
              fill={MUTED}
              fontFamily="-apple-system, sans-serif"
            >
              RSI
            </text>
            {rsiPath && <path d={rsiPath} stroke="#7c3aed" strokeWidth={1.6} fill="none" />}
            {simStartInWindow && (
              <line
                x1={simStartX}
                y1={rsiRow.top}
                x2={simStartX}
                y2={rsiRow.bottom}
                stroke="#cbd5e1"
                strokeDasharray="4 4"
                strokeWidth={1}
              />
            )}
          </g>
        )}

        {/* ── MACD subplot ──────────────────────────────────────────── */}
        {showMACD && macdRow && (
          <g>
            <line
              x1={pad.left}
              y1={macdRow.bottom}
              x2={pad.left + innerW}
              y2={macdRow.bottom}
              stroke={GRID}
              strokeWidth={0.5}
            />
            <text
              x={pad.left - 6}
              y={macdRow.top + 10}
              fontSize={10}
              textAnchor="end"
              fill={MUTED}
              fontFamily="-apple-system, sans-serif"
            >
              MACD
            </text>
            {macdBars.map((b, i) => (
              <rect
                key={`mb${i}`}
                x={b.x}
                y={b.y0}
                width={Math.max(1.5, (innerW / Math.max(macdBars.length, 1)) * 0.7)}
                height={Math.max(0.5, b.y1 - b.y0)}
                fill={b.up ? GREEN : RED}
                opacity={0.55}
              />
            ))}
            {macdLinePath && <path d={macdLinePath} stroke={INK} strokeWidth={1.4} fill="none" />}
            {macdSignalPath && (
              <path d={macdSignalPath} stroke="#f59e0b" strokeWidth={1.2} strokeDasharray="3 3" fill="none" />
            )}
            {simStartInWindow && (
              <line
                x1={simStartX}
                y1={macdRow.top}
                x2={simStartX}
                y2={macdRow.bottom}
                stroke="#cbd5e1"
                strokeDasharray="4 4"
                strokeWidth={1}
              />
            )}
          </g>
        )}
      </svg>
    </div>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────
function avg(s: number[]): number {
  let sum = 0;
  for (const v of s) sum += v;
  return sum / s.length;
}
function std(s: number[]): number {
  if (s.length < 2) return 0;
  const m = avg(s);
  let v = 0;
  for (const x of s) v += (x - m) ** 2;
  return Math.sqrt(v / (s.length - 1));
}
function roll(arr: number[], n: number, fn: (s: number[]) => number): (number | null)[] {
  const out: (number | null)[] = arr.map(() => null);
  for (let i = n - 1; i < arr.length; i++) {
    out[i] = fn(arr.slice(i - n + 1, i + 1));
  }
  return out;
}
function rsiSeries(closes: number[], n: number): (number | null)[] {
  const out: (number | null)[] = closes.map(() => null);
  for (let i = n; i < closes.length; i++) {
    let gain = 0;
    let loss = 0;
    for (let j = i - n + 1; j <= i; j++) {
      const d = closes[j] - closes[j - 1];
      if (d > 0) gain += d;
      else loss += -d;
    }
    const g = gain / n;
    const l = loss / n;
    if (l > 0) {
      const rs = g / l;
      out[i] = 100 - 100 / (1 + rs);
    } else {
      out[i] = 100;
    }
  }
  return out;
}
function emaSeries(arr: number[], span: number): (number | null)[] {
  const out: (number | null)[] = arr.map(() => null);
  if (arr.length === 0) return out;
  const k = 2 / (span + 1);
  out[0] = arr[0];
  for (let i = 1; i < arr.length; i++) {
    out[i] = arr[i] * k + (out[i - 1] as number) * (1 - k);
  }
  return out;
}
function macdSeries(closes: number[]): {
  line: (number | null)[];
  signal: (number | null)[];
  hist: (number | null)[];
} {
  const ema12 = emaSeries(closes, 12);
  const ema26 = emaSeries(closes, 26);
  const line: (number | null)[] = closes.map(() => null);
  for (let i = 0; i < closes.length; i++) {
    if (ema12[i] != null && ema26[i] != null) line[i] = (ema12[i] as number) - (ema26[i] as number);
  }
  // signal = 9-period EMA over MACD line — only valid where line is non-null and i>=26
  const lineForSignal: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i >= 26 && line[i] != null) lineForSignal.push(line[i] as number);
  }
  const sigVals = emaSeries(lineForSignal, 9);
  const signal: (number | null)[] = closes.map(() => null);
  let k = 0;
  for (let i = 0; i < closes.length; i++) {
    if (i >= 26 && line[i] != null) {
      signal[i] = sigVals[k] ?? null;
      k++;
    }
  }
  const hist: (number | null)[] = closes.map(() => null);
  for (let i = 0; i < closes.length; i++) {
    if (line[i] != null && signal[i] != null) hist[i] = (line[i] as number) - (signal[i] as number);
  }
  return { line, signal, hist };
}
