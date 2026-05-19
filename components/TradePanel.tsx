"use client";

import { useEffect } from "react";
import { fmtMoney } from "@/lib/agent-meta";
import type { ActionType } from "@/lib/types";

export function TradePanel({
  cash,
  shares,
  fill,
  dayIdx,
  totalDays,
  pendingAction,
  pendingAmount,
  setPendingAction,
  setPendingAmount,
  onCommit,
  onSkip,
}: {
  cash: number;
  shares: number;
  fill: number;
  dayIdx: number;
  totalDays: number;
  pendingAction: ActionType;
  pendingAmount: number;
  setPendingAction: (a: ActionType) => void;
  setPendingAmount: (n: number) => void;
  onCommit: () => void;
  onSkip: () => void;
}) {
  const maxBuy = Math.floor(cash / Math.max(fill, 0.01));
  const maxSellValue = shares > 0 ? shares * fill : 0;
  const maxAvail = pendingAction === "buy_lite" ? cash : maxSellValue;
  const pct = maxAvail > 0 ? Math.round((pendingAmount / maxAvail) * 100) : 0;

  // Default 30% when action changes (and not 0)
  useEffect(() => {
    if (pendingAction === "buy_lite") {
      setPendingAmount(Math.round(cash * 0.3 * 100) / 100);
    } else if (pendingAction === "sell_lite") {
      setPendingAmount(Math.round(shares * fill * 0.3 * 100) / 100);
    } else {
      setPendingAmount(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAction, dayIdx]);

  const onPctChange = (p: number) => {
    if (maxAvail <= 0) return;
    setPendingAmount(Math.round((p / 100) * maxAvail * 100) / 100);
  };
  const onDollarChange = (v: number) => {
    setPendingAmount(Math.max(0, Math.min(maxAvail, v)));
  };

  let preview: React.ReactNode = null;
  if (pendingAction === "buy_lite") {
    if (cash <= 0 || pendingAmount <= 0) {
      preview = <span style={{ color: "var(--ink-mute)" }}>Enter an amount above to preview the buy.</span>;
    } else {
      const willBuy = Math.floor(pendingAmount / fill);
      const cost = willBuy * fill;
      preview = (
        <>
          <div>
            buy <span className="v bull">{willBuy.toLocaleString()} sh</span> at ${fill.toFixed(2)} · deploy{" "}
            <span className="v">{fmtMoney(cost, true)}</span>
          </div>
          <div className="meta">cash after: {fmtMoney(cash - cost)} · shares after: {(shares + willBuy).toLocaleString()}</div>
        </>
      );
    }
  } else if (pendingAction === "sell_lite") {
    if (shares <= 0) {
      preview = <span style={{ color: "var(--bear)" }}>No long position to sell.</span>;
    } else if (pendingAmount <= 0) {
      preview = <span style={{ color: "var(--ink-mute)" }}>Enter an amount above to preview the sell.</span>;
    } else {
      let willSell = Math.floor(pendingAmount / fill);
      if (pendingAmount >= maxSellValue - fill) willSell = shares;
      willSell = Math.min(willSell, shares);
      const proceeds = willSell * fill;
      preview = (
        <>
          <div>
            sell <span className="v bear">{willSell.toLocaleString()} sh</span> at ${fill.toFixed(2)} · receive{" "}
            <span className="v">{fmtMoney(proceeds, true)}</span>
          </div>
          <div className="meta">cash after: {fmtMoney(cash + proceeds)} · shares after: {(shares - willSell).toLocaleString()}</div>
        </>
      );
    }
  } else {
    preview = <span style={{ color: "var(--ink-mute)" }}>You&apos;ll hold this session — no execution.</span>;
  }

  return (
    <div className="trade-card">
      <div className="head">
        <div className="title">
          Commit a <span className="it">move.</span>
        </div>
        <span className="smallcaps" style={{ color: "var(--ink-faint)" }}>
          day {dayIdx + 1} · fill @ ${fill.toFixed(2)} · cash {fmtMoney(cash)} · max buy {maxBuy.toLocaleString()} sh
        </span>
      </div>

      <div className="trade-buttons">
        <button className={`buy ${pendingAction === "buy_lite" ? "on" : ""}`} onClick={() => setPendingAction("buy_lite")}>
          <span className="verb">Long</span>
          <span className="desc">add exposure</span>
        </button>
        <button className={`hold ${pendingAction === "hold" ? "on" : ""}`} onClick={() => setPendingAction("hold")}>
          <span className="verb">Hold</span>
          <span className="desc">sit out, observe</span>
        </button>
        <button className={`sell ${pendingAction === "sell_lite" ? "on" : ""}`} onClick={() => setPendingAction("sell_lite")}>
          <span className="verb">Trim</span>
          <span className="desc">close long</span>
        </button>
      </div>

      {pendingAction !== "hold" && maxAvail > 0 && (
        <div className="amount-row">
          <div>
            <label>amount · USD</label>
            <input
              type="number"
              min={0}
              max={maxAvail}
              step={100}
              value={pendingAmount.toFixed(2)}
              onChange={(e) => onDollarChange(parseFloat(e.target.value || "0"))}
            />
          </div>
          <div>
            <label>{pct}% of {pendingAction === "buy_lite" ? "cash" : "long position"}</label>
            <div className="slider-wrap">
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={pct}
                onChange={(e) => onPctChange(parseInt(e.target.value))}
              />
              <div className="slider-ticks">
                <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="trade-preview">{preview}</div>

      <div className="confirm">
        <button className="primary" onClick={onCommit}>
          <span>commit · advance ⟶ day {Math.min(dayIdx + 2, totalDays)}</span>
          <span className="arrow">↪</span>
        </button>
        <button className="skip" onClick={onSkip}>
          skip 5 d ⏩
        </button>
      </div>
    </div>
  );
}
