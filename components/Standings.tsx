import type { AgentDecision } from "@/lib/types";
import { HIVE_AGENTS, HIVE_AGENTS_BY_ID } from "@/lib/agent-meta";

export function Standings({
  decisions,
  userPnlPct,
  agentPnlByAid,
}: {
  decisions: AgentDecision[];
  userPnlPct: number;
  agentPnlByAid?: Record<string, number>;
}) {
  type Row = {
    aid: string;
    agent: { subj: string; name: string; roleLabel: string };
    pnl: number;
    you: boolean;
    quote: string;
  };

  const rows: Row[] = [
    {
      aid: "user",
      agent: { subj: "S·12", name: "You", roleLabel: "the twelfth trader" },
      pnl: userPnlPct,
      you: true,
      quote: "—",
    },
  ];

  for (const a of HIVE_AGENTS) {
    if (!a.trades || a.capital <= 0) continue;
    const d = decisions.find((x) => x.agentId === a.id);
    rows.push({
      aid: a.id,
      agent: { subj: a.subj, name: a.name, roleLabel: a.roleLabel },
      pnl: agentPnlByAid?.[a.id] ?? 0,
      you: false,
      quote: (d?.publicStatement?.narrative || "").slice(0, 100),
    });
  }
  rows.sort((a, b) => b.pnl - a.pnl);
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.pnl)), 1);

  return (
    <div className="standings">
      <div className="row head">
        <span>rk</span>
        <span></span>
        <span>subject</span>
        <span>P&L %</span>
        <span>distribution</span>
        <span>last public call</span>
      </div>
      {rows.map((r, i) => (
        <div className={`row ${r.you ? "you" : ""}`} key={r.aid}>
          <span className="rank">{String(i + 1).padStart(2, "0")}</span>
          <span className="subj">{r.agent.subj}</span>
          <span className="name serif">
            {r.agent.name}
            <span className="role">{r.agent.roleLabel}</span>
          </span>
          <span className={`pnl ${r.pnl >= 0 ? "bull" : "bear"}`}>
            {r.pnl >= 0 ? "+" : ""}
            {r.pnl.toFixed(2)}%
          </span>
          <span className="bar-cell">
            <div className="bar-track">
              <div className="bar-zero" style={{ left: "50%" }} />
              {r.pnl >= 0 ? (
                <div className="bar" style={{ left: "50%", width: `${(Math.abs(r.pnl) / maxAbs) * 50}%` }} />
              ) : (
                <div className="bar bear" style={{ right: "50%", width: `${(Math.abs(r.pnl) / maxAbs) * 50}%` }} />
              )}
            </div>
          </span>
          <span className="quote">{r.quote}</span>
        </div>
      ))}
    </div>
  );
}
