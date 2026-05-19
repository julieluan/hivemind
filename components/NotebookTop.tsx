export function NotebookTop({ ticker, day, total, isDone }: { ticker: string; day: number; total: number; isDone: boolean }) {
  return (
    <div className="notebook-top">
      <div className="brand">
        <span className="glyph">⬡</span>
        <span>Hivemind</span>
        <span style={{ color: "var(--ink-mute)" }}>· Trader Notebook · Vol.01</span>
      </div>
      <div className="crumbs">
        <span>{ticker}</span>
        <span style={{ margin: "0 8px" }}>›</span>
        <span>day {day + 1} / {total}</span>
      </div>
      <div className="ticker-state">
        <span className="pill">
          <span className="dot"></span>
          <span>{isDone ? "session ended" : "live"}</span>
        </span>
      </div>
    </div>
  );
}
