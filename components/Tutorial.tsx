"use client";

import { useEffect, useState, useLayoutEffect, type RefObject } from "react";

// ────────────────────────────────────────────────────────────────────────────
// Tutorial — full-screen dim overlay with a spotlight cutout that highlights
// one ref'd section at a time and shows a callout next to it.
//
// Scroll behavior: the body is scroll-locked while the tutorial is open. On
// each step change we scroll the target into view ONCE, then both the
// spotlight cutout and the callout stay still until the user clicks Next.
// (Previously we re-measured on every scroll event which made the cutout
// jitter against the scroll input — felt buggy.)
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

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Measure target ONCE per step (after scrolling it into view)
  useLayoutEffect(() => {
    const el = step?.target.current;
    if (!el) {
      setRect(null);
      return;
    }
    // Scroll into view first
    el.scrollIntoView({ behavior: "instant" as ScrollBehavior, block: "center" });
    // Then measure
    requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      setRect(r);
      setVp({ w: window.innerWidth, h: window.innerHeight });
    });
    // Re-measure only on window resize (not scroll)
    const onResize = () => {
      if (!step?.target.current) return;
      const r = step.target.current.getBoundingClientRect();
      setRect(r);
      setVp({ w: window.innerWidth, h: window.innerHeight });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [step]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" || e.key === "Enter") {
        if (idx < steps.length - 1) setIdx(idx + 1);
        else onClose();
      }
      if (e.key === "ArrowLeft" && idx > 0) setIdx(idx - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, steps.length, onClose]);

  if (!step) return null;
  const pad = 12;
  const radius = 12;

  if (!rect) {
    return (
      <div className="fixed inset-0 z-[100] bg-black/65 flex items-center justify-center">
        <div className="bg-white rounded-xl p-6 max-w-sm">
          <div className="text-sm text-[var(--muted)]">Loading tutorial…</div>
        </div>
      </div>
    );
  }

  // Callout positioning
  const calloutW = 400;
  const calloutH = 160;
  const belowSpace = vp.h - rect.bottom - pad;
  const placeBelow = belowSpace >= calloutH + 20;
  const calloutTop = placeBelow
    ? rect.bottom + pad + 12
    : Math.max(12, rect.top - calloutH - pad - 12);
  const desiredLeft = rect.left + rect.width / 2 - calloutW / 2;
  const calloutLeft = Math.max(16, Math.min(vp.w - calloutW - 16, desiredLeft));

  return (
    <div className="fixed inset-0 z-[100] pointer-events-auto" onWheel={(e) => e.preventDefault()}>
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
          strokeWidth={3}
          strokeDasharray="6 4"
          style={{ pointerEvents: "none" }}
        >
          <animate attributeName="stroke-dashoffset" values="0;-10" dur="0.8s" repeatCount="indefinite" />
        </rect>
      </svg>

      {/* Skip link top-right */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-sm uppercase tracking-wider text-white/90 hover:text-white px-3 py-2 bg-white/10 hover:bg-white/20 rounded-md backdrop-blur transition-colors"
      >
        Skip · esc
      </button>

      {/* Callout */}
      <div
        style={{
          position: "fixed",
          top: calloutTop,
          left: calloutLeft,
          width: calloutW,
        }}
        className="bg-white rounded-xl shadow-2xl border border-[var(--border)] p-5"
      >
        <div className="flex items-baseline justify-between mb-2.5">
          <div className="inline-flex items-center gap-2.5">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--ink)] text-white text-sm font-bold">
              {idx + 1}
            </span>
            <span className="text-base font-bold tracking-tight">{step.title}</span>
          </div>
          <span className="text-[11px] text-[var(--faint)] uppercase tracking-wider">
            {idx + 1} / {steps.length}
          </span>
        </div>
        <div className="text-[0.95rem] text-[#374151] leading-relaxed mb-4">
          {step.body}
        </div>
        <div className="flex items-center justify-between">
          <button
            onClick={() => idx > 0 && setIdx(idx - 1)}
            disabled={idx === 0}
            className="text-sm text-[var(--muted)] hover:text-[var(--ink)] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ← Back
          </button>
          <button
            onClick={() => {
              if (idx < steps.length - 1) setIdx(idx + 1);
              else onClose();
            }}
            className="bg-[var(--ink)] text-white px-5 py-2 rounded-md text-sm font-semibold hover:opacity-90"
          >
            {idx < steps.length - 1 ? "Next →" : "Got it"}
          </button>
        </div>
      </div>
    </div>
  );
}
