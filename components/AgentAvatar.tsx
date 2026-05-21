// Stylized monogram avatar — uses each agent's themeColor + initials from
// agent-meta. Renlab-minimal aesthetic: solid color circle with white text.
// No commissioned art, no image assets — pure SVG, scales to any size.

import { HIVE_AGENTS_BY_ID } from "@/lib/agent-meta";

export function AgentAvatar({
  agentId,
  size = 40,
  ring,
  title,
}: {
  agentId: string;
  size?: number;
  ring?: "accuse" | "peek" | null;
  title?: string;
}) {
  const meta = HIVE_AGENTS_BY_ID[agentId];
  if (!meta) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: "#a3a3a3",
        }}
        aria-label="unknown agent"
      />
    );
  }
  const fontSize = Math.round(size * 0.42);
  const ringColor =
    ring === "accuse"
      ? "var(--loss)"
      : ring === "peek"
        ? "#f59e0b"
        : "transparent";

  return (
    <div
      title={title ?? `${meta.name} · ${meta.roleLabel}`}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "50%",
        background: meta.themeColor,
        color: "white",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize,
        letterSpacing: meta.initials.length > 1 ? -0.5 : 0,
        fontFamily:
          "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        boxShadow: ring ? `0 0 0 2px ${ringColor}` : undefined,
        userSelect: "none",
      }}
    >
      {meta.initials}
    </div>
  );
}
