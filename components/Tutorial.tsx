"use client";

import { useEffect, useState, useLayoutEffect, type RefObject } from "react";

// ────────────────────────────────────────────────────────────────────────────
// Tutorial — full-screen dim overlay with a spotlight cutout that highlights
// one ref'd section at a time and shows a callout next to it.
//
// Usage:
//   const refs = { chart: useRef(null), powerups: useRef(null), ... };
//   <Tutorial
//     steps={[
//       { target: refs.chart, title: "...", body: "..." },
//       ...
//     ]}
//     onClose={() => setShowTutorial(false)}
//   />
// ────────────────────────────────────────────────────────────────────────────

export interface TutorialStep {
  target: RefObject<HTMLElement>;
  title: string;
  body: string;
}

export function Tutorial({
  steps,
  onClose,
}: {
  steps: TutorialStep[];
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [vp, setVp] = useState({ w: 0, h: 0 });

  const step = steps[idx];

  // Compute target bounding box on mount + on step change + on resize/scroll
  useLayoutEffect(() => {
    const compute = () => {
      const el = step?.target.current;
      if (!el) {
        setRect(null);
        return;
      }
      // Scroll the element into view first
      const r = el.getBoundingClientRect();
      const offscreen = r.top < 60 || r.bottom > window.innerHeight - 60;
      if (offscreen) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        // Wait a frame for the scroll to settle, then re-measure
        requestAnimationFrame(() => {
          const r2 = el.getBoundingClientRect();
          setRect(r2);
          setVp({ w: window.innerWidth, h: window.innerHeight });
        });
        return;
      }
      setRect(r);
      setVp({ w: window.innerWidth, h: window.innerHeight });
    };
    compute();
    const handler = () => compute();
    window.addEventListener("resize", handler);
    window.addEventListener("scroll", handler, { passive: true });
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("scroll", handler);
    };
  }, [step]);

  // Esc to dismiss
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" || e.key === "Enter") {
        if (idx < steps.length - 1) setIdx(idx + 1);
        else onClose();
      }
      if (e.key === "ArrowLeft") {
        if (idx > 0) setIdx(idx - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, steps.length, onClose]);

  if (!step) return null;
  const pad = 10;
  const radius = 10;

  // If we don't have the rect yet, render a centered notice
  if (!rect) {
    return (
      <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center">
        <div className="bg-white rounded-xl p-6 max-w-sm">
          <div className="text-sm text-[var(--muted)]">Loading tutorial…</div>
        </div>
      </div>
    );
  }

  // Callout positioning: prefer below the cutout; fall back to above if no room
  const calloutW = 360;
  const calloutH = 180;
  const belowSpace = vp.h - rect.bottom - pad;
  const placeBelow = belowSpace >= calloutH + 24;
  const calloutTop = placeBelow ? rect.bottom + pad + 8 : rect.top - calloutH - pad - 8;
  // Horizontal: clamp inside viewport
  const desiredLeft = rect.left + rect.width / 2 - calloutW / 2;
  const calloutLeft = Math.max(16, Math.min(vp.w - calloutW - 16, desiredLeft));

  return (
    <div className="fixed inset-0 z-[100] pointer-events-auto">
      {/* SVG dim layer with a rounded cutout */}
      <svg className="absolute inset-0 w-full h-full">
        <defs>
          <mask id="hivemind-tutorial-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect
              x={rect.left - pad}
              y={rect.top - pad}
              width={rect.width + pad * 2}
              height={rect.height + pad * 2}
              rx={radius}
              fill="black"
            />
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(10,10,10,0.72)"
          mask="url(#hivemind-tutorial-mask)"
          onClick={onClose}
          style={{ cursor: "pointer" }}
        />
        {/* Animated outline ring on the cutout */}
        <rect
          x={rect.left - pad}
          y={rect.top - pad}
          width={rect.width + pad * 2}
          height={rect.height + pad * 2}
          rx={radius}
          fill="none"
          stroke="#fde047"
          strokeWidth={2.5}
          strokeDasharray="6 4"
          style={{ pointerEvents: "none" }}
        >
          <animate attributeName="stroke-dashoffset" values="0;-10" dur="0.8s" repeatCount="indefinite" />
        </rect>
      </svg>

      {/* Skip link top-right */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-xs uppercase tracking-wider text-white/80 hover:text-white px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-md backdrop-blur transition-colors"
      >
        Skip tutorial · esc
      </button>

      {/* Callout */}
      <div
        style={{
          position: "fixed",
          top: calloutTop,
          left: calloutLeft,
          width: calloutW,
        }}
        className="bg-white rounded-xl shadow-2xl border border-[var(--border)] p-4"
      >
        <div className="flex items-baseline justify-between mb-2">
          <div className="inline-flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[var(--ink)] text-white text-xs font-bold">
              {idx + 1}
            </span>
            <span className="text-[0.95rem] font-bold tracking-tight">{step.title}</span>
          </div>
          <span className="text-[10px] text-[var(--faint)] uppercase tracking-wider">
            {idx + 1} / {steps.length}
          </span>
        </div>
        <div className="text-[0.85rem] text-[#374151] leading-snug mb-3">
          {step.body}
        </div>
        <div className="flex items-center justify-between">
          <button
            onClick={() => idx > 0 && setIdx(idx - 1)}
            disabled={idx === 0}
            className="text-xs text-[var(--muted)] hover:text-[var(--ink)] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ← Back
          </button>
          <button
            onClick={() => {
              if (idx < steps.length - 1) setIdx(idx + 1);
              else onClose();
            }}
            className="bg-[var(--ink)] text-white px-4 py-1.5 rounded-md text-xs font-semibold hover:opacity-90"
          >
            {idx < steps.length - 1 ? "Next →" : "Got it · let's trade"}
          </button>
        </div>
      </div>
    </div>
  );
}
