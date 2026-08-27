import type { EarlyWatch, ScoredCandidate } from "./scanner/types";

type TelegramDelivery = { status: "sent" | "skipped" | "failed"; detail: string };
export type TelegramAlertType = "threshold" | "liquidity_pull" | "decision_flip" | "confirmed_alert";

type TelegramPayload = { text: string; imageUrl?: string | null };

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "غير متاح";
  return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(2)}M$` : value >= 1_000 ? `${(value / 1_000).toFixed(1)}K$` : `${value.toFixed(2)}$`;
}

function formatPrice(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "غير متاح";
  return value < 0.000001 ? value.toExponential(3) : value < 1 ? value.toFixed(6) : value.toFixed(4);
}

function formatAlert(candidate: ScoredCandidate, alertType: TelegramAlertType): TelegramPayload {
  const factors = candidate.factors.slice(0, 3).map((factor) => `• ${factor}`).join("\n") || "• لا توجد عوامل إيجابية كافية";
  const warnings = candidate.warnings.slice(0, 3).map((warning) => `• ${warning}`).join("\n") || "• لا توجد تحذيرات آلية إضافية";
  const heading = alertType === "liquidity_pull" ? "تحذير عاجل: احتمال سحب سيولة" : alertType === "decision_flip" ? "تحذير عاجل: انقلاب قرار الإشارة" : alertType === "confirmed_alert" ? "CONFIRMED ALERT — اجتازت بوابات الأمان والسيولة والتسعير" : "جوهرة مرشحة — قراءة فقط";
  const age = candidate.ageHours === null ? "غير متاح" : `${candidate.ageHours.toFixed(1)} ساعة`;
  const security = candidate.security.status === "passed" ? "اجتاز" : candidate.security.status === "flagged" ? "تحذيرات" : "غير متاح";
  const text = [
    heading,
    "━━━━━━━━━━━━━━━━",
    `العملة: ${candidate.name} (${candidate.symbol})`,
    `الفرصة: ${candidate.opportunityScore.toFixed(1)}/100 | المخاطرة: ${candidate.riskScore.toFixed(1)}/100`,
    `السعر: ${formatPrice(candidate.priceUsd)}$ | السيولة: ${formatMoney(candidate.liquidityUsd)}`,
    `حجم الساعة: ${formatMoney(candidate.volumeH1)} | المعاملات: ${candidate.transactionsH1.toLocaleString("en-US")}`,
    `عمر الزوج: ${age} | فحص الأمان: ${security}`,
    "",
    "عوامل داعمة:", factors,
    "",
    "تحذيرات:", warnings,
    "",
    `DEX Screener: ${candidate.sourceUrl}`,
    `العقد: ${candidate.baseAddress}`,
    "",
    "هذه إشارة بيانات آلية عالية المخاطر وليست توصية شراء أو بيع أو ضمان عائد.",
  ].join("\n");
  return { text, imageUrl: candidate.imageUrl ?? null };
}

function formatEarlyWatch(watch: EarlyWatch): TelegramPayload {
  const age = watch.pairCreatedAt ? `${Math.max(0, Math.round((Date.now() - watch.pairCreatedAt) / 60_000))} دقيقة` : "غير متاح";
  return { text: [
    "EARLY WATCH — رصد مبكر ومتابعة أولية فقط",
    "━━━━━━━━━━━━━━━━",
    `العملة: ${watch.name} (${watch.symbol})`,
    `سيولة أول رصد: ${watch.firstLiquidityUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}$ | عمر الزوج: ${age}`,
    `المصدر: ${watch.sourceUrl}`,
    "لم يكتمل فحص الأمان أو التسعير أو السيولة بعد؛ لا تعد هذه رسالة دخول أو توصية شراء أو بيع.",
  ].join("\n") };
}

async function telegramRequest(token: string, method: "sendMessage" | "sendPhoto", body: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json() as { ok?: boolean; description?: string };
  return { response, payload };
}

async function deliverTelegram(payload: TelegramPayload): Promise<TelegramDelivery> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { status: "skipped", detail: "تنبيهات تيليجرام غير مهيأة" };
  try {
    if (payload.imageUrl) {
      const photoResult = await telegramRequest(token, "sendPhoto", { chat_id: chatId, photo: payload.imageUrl, caption: payload.text });
      if (photoResult.response.ok && photoResult.payload.ok) return { status: "sent", detail: "تم إرسال صورة وتنبيه تيليجرام" };
      if (photoResult.response.status !== 400 && photoResult.response.status !== 413) return { status: "failed", detail: `Telegram HTTP ${photoResult.response.status}` };
    }
    const messageResult = await telegramRequest(token, "sendMessage", { chat_id: chatId, text: payload.text, disable_web_page_preview: true });
    if (!messageResult.response.ok) return { status: "failed", detail: `Telegram HTTP ${messageResult.response.status}` };
    return messageResult.payload.ok ? { status: "sent", detail: payload.imageUrl ? "تم إرسال التنبيه نصياً بعد تعذر تحميل الصورة" : "تم إرسال تنبيه تيليجرام" } : { status: "failed", detail: messageResult.payload.description ?? "رفض تيليجرام التنبيه" };
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
