"use client";

import { useMemo } from "react";
import type { PriceBar } from "@/lib/types";

// Pure-SVG chart, lab-figure styling (no external deps).
export function PriceChart({
  history,
  todayBar,
  userTrades,
  width = 720,
  height = 320,
}: {
  history: PriceBar[];
  todayBar?: PriceBar | null;
  userTrades?: { day: string; fillPrice: number; userBuyUsd: number; userSellUsd: number }[];
  width?: number;
  height?: number;
}) {
  const padding = { top: 24, right: 18, bottom: 32, left: 50 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const data = useMemo(() => {
    const series = todayBar ? [...history, todayBar] : history;
    if (series.length === 0) return null;
    const ys = series.map((b) => b.close).concat(todayBar ? [todayBar.open] : []);
    let yMin = Math.min(...ys);
    let yMax = Math.max(...ys);
    const pad = (yMax - yMin) * 0.08 || 1;
    yMin -= pad;
    yMax += pad;
    return { series, yMin, yMax };
  }, [history, todayBar]);

  if (!data) {
    return (
      <div className="chart-wrap">
        <div style={{ padding: 60, textAlign: "center", color: "var(--ink-faint)", fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          awaiting market data…
        </div>
      </div>
    );
  }

  const { series, yMin, yMax } = data;
  const x = (i: number) => padding.left + (i / Math.max(series.length - 1, 1)) * innerW;
  const y = (v: number) => padding.top + (1 - (v - yMin) / (yMax - yMin)) * innerH;

  // Build smooth polyline path
  const linePath = series
    .map((b, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(b.close).toFixed(1)}`)
    .join(" ");

  // Y ticks (4 ticks)
  const ticks = Array.from({ length: 5 }, (_, i) => yMin + (i / 4) * (yMax - yMin));

  // X labels (first, mid, last)
  const xLabels = series.length > 1 ? [0, Math.floor(series.length / 2), series.length - 1] : [0];

  // Today's open marker
  const todayIdx = todayBar ? series.length - 1 : -1;
  const todayMark = todayIdx >= 0 ? { x: x(todayIdx), y: y(series[todayIdx].open) } : null;

  // User trade markers — match trades to dates
  const tradeMarks = (userTrades || [])
    .map((t) => {
      const idx = series.findIndex((s) => s.date === t.day);
      if (idx < 0) return null;
      const dir: "buy" | "sell" = t.userBuyUsd > 0 ? "buy" : "sell";
      return { x: x(idx), y: y(t.fillPrice), dir };
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        {/* axes */}
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + innerH} stroke="var(--rule)" strokeWidth={0.5} />
        <line x1={padding.left} y1={padding.top + innerH} x2={padding.left + innerW} y2={padding.top + innerH} stroke="var(--rule)" strokeWidth={0.5} />
        {/* y ticks */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padding.left - 4} y1={y(t)} x2={padding.left + innerW} y2={y(t)} stroke="var(--rule-soft)" strokeWidth={0.5} strokeDasharray={i === 0 || i === ticks.length - 1 ? "" : "2 4"} />
            <text x={padding.left - 8} y={y(t) + 3} fontSize={10} textAnchor="end" fontFamily="var(--mono)" fill="var(--ink-faint)" letterSpacing="0.04em">
              ${t.toFixed(0)}
            </text>
          </g>
        ))}
        {/* x labels */}
        {xLabels.map((i) => (
          <text key={i} x={x(i)} y={padding.top + innerH + 18} fontSize={10} textAnchor="middle" fontFamily="var(--mono)" fill="var(--ink-faint)" letterSpacing="0.06em">
            {series[i].date}
          </text>
        ))}
        {/* main line */}
        <path d={linePath} stroke="var(--ink)" strokeWidth={1.5} fill="none" />
        {/* today's open marker */}
        {todayMark && (
          <g>
            <circle cx={todayMark.x} cy={todayMark.y} r={5} fill="var(--accent)">
              <animate attributeName="r" values="5;9;5" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx={todayMark.x} cy={todayMark.y} r={3} fill="var(--accent)" />
            <text x={todayMark.x + 10} y={todayMark.y - 8} fontSize={10} fontFamily="var(--mono)" letterSpacing="0.06em" fill="var(--accent)">
              OPEN
            </text>
          </g>
        )}
        {/* user trade markers */}
        {tradeMarks.map((m, i) => (
          <g key={i}>
            <polygon
              points={
                m.dir === "buy"
                  ? `${m.x - 5},${m.y + 9} ${m.x + 5},${m.y + 9} ${m.x},${m.y + 2}`
                  : `${m.x - 5},${m.y - 9} ${m.x + 5},${m.y - 9} ${m.x},${m.y - 2}`
              }
              fill={m.dir === "buy" ? "var(--bull)" : "var(--bear)"}
              stroke="var(--paper)"
              strokeWidth={1}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}
