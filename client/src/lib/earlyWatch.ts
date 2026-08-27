export function earlyWatchStageLabel(stage: "early" | "confirmed") {
  return stage === "confirmed" ? "مؤكد" : "رصد أولي";
}

export function confirmationLatencyLabel(firstSeenAt: number, confirmedAt: number | null) {
  if (confirmedAt === null) return "بانتظار التحقق";
  return `تأكيد بعد ${Math.max(0, Math.round((confirmedAt - firstSeenAt) / 60_000))} د`;
}
