// Static landing page used by shared endgame links. URL params encode the
// player's stats so the OG image and on-page summary stay in sync.
//
// Example: /share?tp=7&fp=3&fn=4&pnl=12.5&beat=8&total=11&days=32

import type { Metadata } from "next";
import Link from "next/link";

type SP = Record<string, string | string[] | undefined>;

function param(sp: SP, key: string, def = 0): number {
  const v = sp[key];
  const s = Array.isArray(v) ? v[0] : v;
  const n = Number(s);
  return Number.isFinite(n) ? n : def;
}

function ogUrl(sp: SP): string {
  const qs = new URLSearchParams();
  for (const k of ["tp", "fp", "fn", "pnl", "beat", "total", "days"]) {
    const v = sp[k];
    if (typeof v === "string") qs.set(k, v);
  }
  return `/api/og/endgame?${qs.toString()}`;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SP;
}): Promise<Metadata> {
  const tp = param(searchParams, "tp");
  const fp = param(searchParams, "fp");
  const net = tp - fp;
  const beat = param(searchParams, "beat");
  const total = param(searchParams, "total", 11);

  const title =
    net > 0
      ? `🕵️ Caught ${tp} liars in Hivemind (net +${net})`
      : tp + fp === 0
        ? `Played Hivemind — beat ${beat}/${total} AI traders`
        : `🎲 Hivemind run — ${tp} caught, ${fp} false flags`;

  const description =
    `32 days. 11 AI traders. ${tp} caught, ${fp} false flags, ${param(searchParams, "fn")} missed. ` +
    `Beat ${beat}/${total} AI traders. Play your own at hivemind.app.`;

  const image = ogUrl(searchParams);

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default function SharePage({ searchParams }: { searchParams: SP }) {
  const tp = param(searchParams, "tp");
  const fp = param(searchParams, "fp");
  const fn = param(searchParams, "fn");
  const pnl = param(searchParams, "pnl");
  const beat = param(searchParams, "beat");
  const total = param(searchParams, "total", 11);
  const days = param(searchParams, "days", 32);
  const net = tp - fp;
  const totalFlags = tp + fp;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-white">
      <div className="max-w-2xl w-full text-center">
        <div className="text-xs uppercase tracking-[0.2em] text-[var(--muted)] font-bold mb-2">
          ○ Hivemind · {days}-day run
        </div>

        <h1 className="text-2xl font-bold mb-6">
          {totalFlags === 0
            ? "Played Hivemind without flagging anyone."
            : `Caught ${tp} liars · ${fp} false flags · ${fn} missed.`}
        </h1>

        {totalFlags > 0 && (
          <div
            className="text-7xl font-extrabold mb-2 num"
            style={{
              color: net > 0 ? "var(--gain)" : net < 0 ? "var(--loss)" : "var(--muted)",
            }}
          >
            {net >= 0 ? "+" : ""}
            {net}
          </div>
        )}

        <div className="text-sm text-[var(--muted)] mb-8">
          Beat <strong className="text-[var(--ink)]">{beat}/{total}</strong> AI traders ·{" "}
          PnL{" "}
          <strong style={{ color: pnl > 0 ? "var(--gain)" : pnl < 0 ? "var(--loss)" : "var(--muted)" }}>
            {pnl >= 0 ? "+" : ""}
            {pnl.toFixed(2)}%
          </strong>
        </div>

        <Link
          href="/"
          className="inline-block bg-[var(--ink)] text-white px-8 py-3 rounded-md font-semibold text-base hover:opacity-90"
        >
          Play your own →
        </Link>

        <div className="text-xs text-[var(--muted)] mt-8 italic">
          Among Us × Wall Street. 11 LLM agents lie to you. You have 32 days.
        </div>
      </div>
    </main>
  );
}
