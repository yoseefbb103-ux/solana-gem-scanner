import type { EarlyWatch, ScoredCandidate } from "./scanner/types";

type TelegramDelivery = { status: "sent" | "skipped" | "failed"; detail: string };
export type TelegramAlertType = "threshold" | "liquidity_pull" | "decision_flip" | "confirmed_alert" | "early_watch";

type TelegramPayload = { text: string; imageUrl?: string | null };

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "غير متاح";
  return value >= 1_000_000 ? `${(value / 1_000_000).toFixed(2)}M$` : value >= 1_000 ? `${(value / 1_000).toFixed(1)}K$` : `${value.toFixed(2)}$`;
}

function formatPrice(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "غير متاح";
  return value < 0.000001 ? value.toExponential(3) : value < 1 ? value.toFixed(6) : value.toFixed(4);
}

export function isTelegramGemCandidate(candidate: ScoredCandidate) {
  return (
    (candidate.signalTier === "strong" || candidate.signalTier === "confirmed") &&
    candidate.decision === "monitor" &&
    candidate.security.status === "passed" &&
    candidate.security.knownRuggedDeployer === false &&
    candidate.security.symbolConflict === false &&
    candidate.liquidityPullDetected === false &&
    candidate.priceUsd !== null && candidate.priceUsd > 0 &&
    candidate.liquidityUsd >= 10_000 &&
    candidate.volumeH1 >= 5_000 &&
    candidate.opportunityScore >= 62 &&
    candidate.riskScore <= 35 &&
    (candidate.confidence?.data ?? 100) >= 65 &&
    (candidate.confidence?.safety ?? 100) >= 70 &&
    (candidate.confidence?.momentum ?? 100) >= 45 &&
    (candidate.confidence?.manipulation ?? 100) >= 70
  );
}

function formatAlert(candidate: ScoredCandidate): TelegramPayload {
  const tier = candidate.signalTier === "confirmed" ? "مؤكدة" : "قوية";
  const topFactors = candidate.factors.slice(0, 2).join(" • ") || "بيانات السوق متماسكة ضمن بوابات الفرز";
  const importantWarning = candidate.warnings.find((warning) => !/عمر الزوج أقل من ساعة|تحقق يدوياً/.test(warning));
  const age = candidate.ageHours === null ? "غير متاح" : `${candidate.ageHours.toFixed(1)}س`;
  const security = candidate.security.deepScanApplied ? "اجتاز الفحص العميق" : "اجتاز الفحص الأولي";
  const lines = [
    "💎 جوهرة منتقاة | قراءة فقط",
    "━━━━━━━━━━━━━━━━",
    `🔹 ${candidate.name} (${candidate.symbol})`,
    `🏷️ الإشارة: ${tier}`,
    `📊 الفرصة ${candidate.opportunityScore.toFixed(1)}/100  |  المخاطرة ${candidate.riskScore.toFixed(1)}/100`,
    `🧭 الثقة: بيانات ${candidate.confidence?.data ?? 0} | أمان ${candidate.confidence?.safety ?? 0} | زخم ${candidate.confidence?.momentum ?? 0}`,
    "",
    `💵 السعر ${formatPrice(candidate.priceUsd)}$  |  💧 السيولة ${formatMoney(candidate.liquidityUsd)}`,
    `📈 حجم 1س ${formatMoney(candidate.volumeH1)}  |  المعاملات ${candidate.transactionsH1.toLocaleString("en-US")}`,
    `⏱️ العمر ${age}  |  🛡️ ${security}`,
    "",
    `✅ ${topFactors}`,
  ];
  if (importantWarning) lines.push(`⚠️ ${importantWarning}`);
  lines.push("", `🔗 ${candidate.sourceUrl}`, `📄 العقد: ${candidate.baseAddress}`, "", "تنبيه آلي عالي المخاطر، وليس توصية شراء أو بيع ولا ضماناً للربح.");
  return { text: lines.join("\n"), imageUrl: candidate.imageUrl ?? null };
}

function earlyAgeMinutes(watch: EarlyWatch) {
  const origin = watch.pairCreatedAt ?? watch.firstSeenAt;
  return Math.max(0, Math.round((Date.now() - origin) / 60_000));
}

export function isEarlyTelegramCandidate(watch: EarlyWatch) {
  const age = earlyAgeMinutes(watch);
  const volume = watch.volumeH1 ?? 0;
  const transactions = watch.transactionsH1 ?? 0;
  const buys = watch.buysH1 ?? 0;
  const sells = watch.sellsH1 ?? 0;
  const priceChangeM5 = watch.priceChangeM5 ?? 0;
  const priceChangeH1 = watch.priceChangeH1 ?? 0;
  return age <= 5 && watch.firstLiquidityUsd >= 5_000 && volume >= 2_500 && transactions >= 40 && buys >= sells && priceChangeM5 <= 35 && priceChangeH1 <= 120;
}

function formatEarlyWatch(watch: EarlyWatch): TelegramPayload {
  const age = `${earlyAgeMinutes(watch)} دقيقة`;
  const buyRatio = (watch.buysH1 ?? 0) + (watch.sellsH1 ?? 0) > 0 ? Math.round(((watch.buysH1 ?? 0) / ((watch.buysH1 ?? 0) + (watch.sellsH1 ?? 0))) * 100) : 0;
  const lines = [
    "🔎 رصد مبكر | مراقبة فقط",
    "━━━━━━━━━━━━━━━━",
    `🔹 ${watch.name} (${watch.symbol})`,
    `⏱️ العمر: ${age}  |  💧 السيولة: ${formatMoney(watch.firstLiquidityUsd)}`,
    `📈 حجم 1س: ${formatMoney(watch.volumeH1)}  |  المعاملات: ${(watch.transactionsH1 ?? 0).toLocaleString("en-US")}`,
    `🟢 نسبة الشراء التقريبية: ${buyRatio}%`,
    "",
    "✅ اجتاز بوابة الرصد المبكر: سيولة وحركة أولية دون قفزة سعرية مفرطة.",
    "⚠️ لم يكتمل التأكيد؛ قد تكون البيانات قليلة وقد يخسر التوكن السيولة سريعاً.",
    "",
    `🔗 ${watch.sourceUrl}`,
    `📄 العقد: ${watch.baseAddress}`,
    "",
    "تنبيه مراقبة آلي عالي المخاطر، ليس توصية شراء أو ضماناً للربح."
  ];
  return { text: lines.join("\n"), imageUrl: watch.imageUrl ?? null };
}

async function telegramRequest(token: string, method: "sendMessage" | "sendPhoto", body: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
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
      if (photoResult.response.ok && photoResult.payload.ok) return { status: "sent", detail: "تم إرسال جوهرة بصورة" };
      if (photoResult.response.status !== 400 && photoResult.response.status !== 413) return { status: "failed", detail: `Telegram HTTP ${photoResult.response.status}` };
    }
    const messageResult = await telegramRequest(token, "sendMessage", { chat_id: chatId, text: payload.text, disable_web_page_preview: true });
    if (!messageResult.response.ok) return { status: "failed", detail: `Telegram HTTP ${messageResult.response.status}` };
    return messageResult.payload.ok ? { status: "sent", detail: payload.imageUrl ? "تم إرسال الجوهرة نصياً بعد تعذر الصورة" : "تم إرسال جوهرة" } : { status: "failed", detail: messageResult.payload.description ?? "رفض تيليجرام التنبيه" };
  } catch (error) {
    return { status: "failed", detail: error instanceof Error ? error.message : "تعذر إرسال تنبيه تيليجرام" };
  }
}

export async function sendTelegramAlert(candidate: ScoredCandidate, alertType: TelegramAlertType = "threshold"): Promise<TelegramDelivery> {
  if (alertType === "liquidity_pull" || alertType === "decision_flip" || !isTelegramGemCandidate(candidate)) {
    return { status: "skipped", detail: "تم استبعاد التنبيه: ليس جوهرة مؤهلة لـ Telegram" };
  }
  const delivery = await deliverTelegram(formatAlert(candidate));
  console.info(`[Telegram] gem ${delivery.status}: ${delivery.detail}`);
  return delivery;
}

export async function sendTelegramEarlyWatch(watch: EarlyWatch): Promise<TelegramDelivery> {
  if (!isEarlyTelegramCandidate(watch)) return { status: "skipped", detail: "تم استبعاد الرصد المبكر: العمر أو السيولة أو النشاط أو تغير السعر خارج البوابة" };
  const delivery = await deliverTelegram(formatEarlyWatch(watch));
  console.info(`[Telegram] early gem ${delivery.status}: ${delivery.detail}`);
  return delivery;
}
