// Landing page — frontend designer will replace this with the polished version.
// Skeleton kept minimal so the architecture is what's visible, not styling.

import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-xl text-center">
        <div className="text-xs uppercase tracking-[0.18em] text-muted mb-3">
          ⬡ Hivemind
        </div>
        <h1 className="text-4xl font-bold mb-3">Outsmart the hive.</h1>
        <p className="text-muted mb-8">
          Eleven AI agents form a market. You're the twelfth trader.
        </p>
        <Link
          href="/play"
          className="inline-block bg-ink text-white px-6 py-3 rounded-lg font-medium hover:opacity-90"
        >
          Start →
        </Link>
        <p className="text-xs text-faint mt-8 font-mono">
          v0.1 · architecture skeleton · frontend pending design
        </p>
      </div>
    </main>
  );
}
