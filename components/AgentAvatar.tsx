// Character portrait avatar. Loads a per-agent SVG portrait from
// public/agents/<agentId>.svg (generated once via scripts/fetch-avatars.sh
// from the free DiceBear service). Falls back to a colored monogram if
// the image fails to load, so this component is safe even if the static
// assets haven't been regenerated.

"use client";

import { useState } from "react";
import Image from "next/image";
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
  const [imgFailed, setImgFailed] = useState(false);

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

  const ringColor =
    ring === "accuse"
      ? "var(--loss)"
      : ring === "peek"
        ? "#f59e0b"
        : "transparent";

  const wrapStyle: React.CSSProperties = {
    width: size,
    height: size,
    flexShrink: 0,
    borderRadius: "50%",
    overflow: "hidden",
    boxShadow: ring ? `0 0 0 2px ${ringColor}` : undefined,
    background: meta.themeColor,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    userSelect: "none",
  };

  if (imgFailed) {
    // Monogram fallback
    return (
      <div
        title={title ?? `${meta.name} · ${meta.roleLabel}`}
        style={{
          ...wrapStyle,
          color: "white",
          fontWeight: 700,
          fontSize: Math.round(size * 0.42),
          letterSpacing: meta.initials.length > 1 ? -0.5 : 0,
          fontFamily:
            "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        {meta.initials}
      </div>
    );
  }

  return (
    <div title={title ?? `${meta.name} · ${meta.roleLabel}`} style={wrapStyle}>
      <Image
        src={`/agents/${agentId}.svg`}
        alt={meta.name}
        width={size}
        height={size}
        unoptimized
        onError={() => setImgFailed(true)}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </div>
  );
}
