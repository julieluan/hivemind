import { fmtMoney } from "@/lib/agent-meta";

export function KPIStrip({
  initCash,
  cash,
  shares,
  totalVal,
  avgBasis,
  fillPrice,
  bhVal,
}: {
  initCash: number;
  cash: number;
  shares: number;
  totalVal: number;
  avgBasis: number;
  fillPrice: number;
  bhVal: number;
}) {
  const pnlPct = initCash > 0 ? ((totalVal - initCash) / initCash) * 100 : 0;
  const unreal = shares > 0 && avgBasis > 0 ? ((fillPrice / avgBasis) - 1) * 100 : 0;
  const bhPnl = initCash > 0 ? ((bhVal - initCash) / initCash) * 100 : 0;
  const alpha = pnlPct - bhPnl;

  const kpi = (lbl: string, val: string, delta?: string, dir?: "bull" | "bear") => (
    <div className="kpi">
      <div className="lbl">{lbl}</div>
      <div className="val">{val}</div>
      {delta && <div className={`delta ${dir || ""}`}>{delta}</div>}
    </div>
  );

  return (
    <div className="kpi-strip">
      {kpi("session NAV", fmtMoney(totalVal), `${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%`, pnlPct >= 0 ? "bull" : "bear")}
      {kpi("cash", fmtMoney(cash))}
      {kpi("shares", shares.toLocaleString(), shares > 0 ? `avg ${fmtMoney(avgBasis, true)}` : undefined)}
      {kpi("unrealized", shares > 0 ? `${unreal >= 0 ? "+" : ""}${unreal.toFixed(2)}%` : "—", undefined)}
      {kpi("vs B&H", `${bhPnl >= 0 ? "+" : ""}${bhPnl.toFixed(2)}%`, `α ${alpha >= 0 ? "+" : ""}${alpha.toFixed(2)}%`, alpha >= 0 ? "bull" : "bear")}
      {kpi("fill", `$${fillPrice.toFixed(2)}`, "open mark")}
    </div>
  );
}
