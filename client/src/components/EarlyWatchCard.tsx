import React from "react";
import { confirmationLatencyLabel, earlyWatchStageLabel } from "@/lib/earlyWatch";

type EarlyWatchCardWatch = {
  baseAddress: string;
  symbol: string;
  name: string;
  sourceUrl: string;
  firstLiquidityUsd: number;
  firstSeenAt: number;
  stage: "early" | "confirmed";
  confirmedAt: number | null;
};

export function EarlyWatchCard({ watch, formatTime, currency }: { watch: EarlyWatchCardWatch; formatTime: (value: number) => string; currency: Intl.NumberFormat }) {
  return <a className="early-watch-card" href={watch.sourceUrl} target="_blank" rel="noreferrer">
    <span className="token-orb">{watch.symbol.slice(0, 1)}</span>
    <span>
      <strong>{watch.symbol}</strong>
      <small>{watch.name} · سيولة أول رصد {currency.format(watch.firstLiquidityUsd)}</small>
      <small>أول رصد: {formatTime(watch.firstSeenAt)} · {confirmationLatencyLabel(watch.firstSeenAt, watch.confirmedAt)}</small>
    </span>
    <em className={watch.stage === "confirmed" ? "stage-confirmed" : "stage-early"}>{earlyWatchStageLabel(watch.stage)}</em>
  </a>;
}
