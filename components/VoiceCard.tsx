"use client";

import type { AgentDecision } from "@/lib/types";
import { HIVE_AGENTS_BY_ID, HIVE_ACT_LABEL, isDeception } from "@/lib/agent-meta";

export function VoiceCard({
  decision,
  peeked,
  peeksLeft,
  onProbe,
  onOpen,
  showDeception = true,
}: {
  decision: AgentDecision;
  peeked: boolean;
  peeksLeft: number;
  onProbe: () => void;
  onOpen: () => void;
  showDeception?: boolean;
}) {
  const agent = HIVE_AGENTS_BY_ID[decision.agentId];
  if (!agent) return null;

  const pub = decision.publicStatement;
  const priv = decision.privateBelief;
  const act = decision.personalAction;
  const deception = isDeception(pub.statedLean, pub.statedConviction, priv.lean, priv.conviction);

  const leanClass = (l: string) => l || "neutral";
  const leanLabel = (l: string) => (l || "—").toUpperCase();

  return (
    <article className="voice">
      <header className="head">
        <span className="subj">{agent.subj}</span>
        <span className="name-wrap">
          <span className="name serif">{agent.name}</span>
          <span className="role">{agent.roleLabel}</span>
        </span>
        <span className="stance">
          <span className={`lean ${leanClass(pub.statedLean)}`}>{leanLabel(pub.statedLean)}</span>
          <span className="conv">{Math.round((pub.statedConviction || 0) * 100)}%</span>
        </span>
        {deception && peeked && showDeception && (
          <span className="deception-stamp" title="Public statement diverges from private belief">⚑ deception</span>
        )}
      </header>

      <p className="narrative">{pub.narrative}</p>

      <div className="actions">
        {peeked ? (
          <span className="smallcaps" style={{ color: "var(--probe)" }}>● private state revealed</span>
        ) : (
          <button className="probe-btn" onClick={onProbe} disabled={peeksLeft <= 0}>
            ▸ probe private state · {peeksLeft}/3
          </button>
        )}
        <button className="open-btn" onClick={onOpen}>↳ subject dossier</button>
      </div>

      {peeked && (
        <div className="private-reveal">
          <div className="reveal-label">
            <span>⌖ PRIVATE BELIEF · subject {agent.subj}</span>
            <span style={{ marginLeft: "auto", color: "var(--ink-mute)" }}>tier·{agent.infoTier}</span>
          </div>
          <div className="row">
            <span className="k">lean</span>
            <span className={`v ${leanClass(priv.lean)}`}>{leanLabel(priv.lean)}</span>
            <span className="k" style={{ marginLeft: 8 }}>conv</span>
            <span className="v" style={{ fontFamily: "var(--mono)", fontStyle: "normal" }}>
              {Math.round((priv.conviction || 0) * 100)}%
            </span>
            <span className="k" style={{ marginLeft: 8 }}>commits</span>
            <span
              className="v"
              style={{
                fontFamily: "var(--mono)",
                fontStyle: "normal",
                color: act.actionType?.includes("buy") ? "var(--bull)" : act.actionType?.includes("sell") ? "var(--bear)" : "var(--ink-mute)",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                fontSize: "12px",
              }}
            >
              {HIVE_ACT_LABEL[act.actionType] || act.actionType} {act.sizePct ? `· ${Math.round((act.sizePct || 0) * 100)}%` : ""}
            </span>
          </div>
          <p className="thesis">{priv.actualThesis}</p>
          {decision.desiredMarketReaction && decision.desiredMarketReaction !== "n/a" && (
            <p style={{ fontFamily: "var(--mono)", fontSize: "10.5px", color: "var(--ink-mute)", letterSpacing: "0.04em", marginTop: 8, marginBottom: 0 }}>
              <span style={{ color: "var(--accent)", letterSpacing: "0.16em" }}>DESIRED RESPONSE ↳ </span>
              <span style={{ fontStyle: "italic", color: "var(--ink-2)", fontFamily: "var(--display)", fontSize: "13px" }}>
                {decision.desiredMarketReaction}
              </span>
            </p>
          )}
        </div>
      )}
    </article>
  );
}
