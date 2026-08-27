import type { EarlyWatch, ScoredCandidate } from "./scanner/types";

type TelegramDelivery = { status: "sent" | "skipped" | "failed"; detail: string };
export type TelegramAlertType = "threshold" | "liquidity_pull" | "decision_flip" | "confirmed_alert";

function formatAlert(candidate: ScoredCandidate, alertType: TelegramAlertType) {
  const factors = candidate.factors.slice(0, 3).map((factor) => `• ${factor}`).join("\n") || "• لا توجد عوامل إيجابية كافية";
  const warnings = candidate.warnings.slice(0, 3).map((warning) => `• ${warning}`).join("\n") || "• لا توجد تحذيرات آلية إضافية";
  const heading = alertType === "liquidity_pull" ? "تحذير عاجل: احتمال سحب سيولة" : alertType === "decision_flip" ? "تحذير عاجل: انقلاب قرار الإشارة" : alertType === "confirmed_alert" ? "CONFIRMED ALERT — بوابات السيولة والأمان والتسعير اجتازت" : "SOLANA SIGNAL SCANNER — قراءة فقط";
  return [
    heading,
    `${candidate.symbol} | فرصة ${candidate.opportunityScore.toFixed(1)}/100 | مخاطرة ${candidate.riskScore.toFixed(1)}/100`,
    "العوامل:", factors,
    "التحذيرات:", warnings,
    `المصدر: ${candidate.sourceUrl}`,
    "هذه إشارة بيانات آلية عالية المخاطر وليست توصية شراء أو بيع أو ضمان عائد.",
  ].join("\n");
}

function formatEarlyWatch(watch: EarlyWatch) {
  const age = watch.pairCreatedAt ? `${Math.max(0, Math.round((Date.now() - watch.pairCreatedAt) / 60_000))} دقيقة` : "غير متاح";
  return [
    "EARLY WATCH — رصد أولي فقط",
    `${watch.symbol} | سيولة أول رصد ${watch.firstLiquidityUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}$ | عمر الزوج ${age}`,
    `المصدر: ${watch.sourceUrl}`,
    "لم يكتمل فحص الأمان أو التسعير أو السيولة بعد؛ لا تعد هذه رسالة دخول أو توصية شراء أو بيع.",
  ].join("\n");
}

async function deliverTelegram(text: string): Promise<TelegramDelivery> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { status: "skipped", detail: "تنبيهات تيليجرام غير مهيأة" };
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { status: "failed", detail: `Telegram HTTP ${response.status}` };
    const payload = await response.json() as { ok?: boolean; description?: string };
    return payload.ok ? { status: "sent", detail: "تم إرسال تنبيه تيليجرام" } : { status: "failed", detail: payload.description ?? "رفض تيليجرام التنبيه" };
  } catch (error) {
    return { status: "failed", detail: error instanceof Error ? error.message : "تعذر إرسال تنبيه تيليجرام" };
  }
}

export async function sendTelegramAlert(candidate: ScoredCandidate, alertType: TelegramAlertType = "threshold"): Promise<TelegramDelivery> {
  const delivery = await deliverTelegram(formatAlert(candidate, alertType));
  console.info(`[Telegram] ${alertType} ${delivery.status}: ${delivery.detail}`);
  return delivery;
}

export async function sendTelegramEarlyWatch(watch: EarlyWatch): Promise<TelegramDelivery> {
  const delivery = await deliverTelegram(formatEarlyWatch(watch));
  console.info(`[Telegram] early_watch ${delivery.status}: ${delivery.detail}`);
  return delivery;
}
