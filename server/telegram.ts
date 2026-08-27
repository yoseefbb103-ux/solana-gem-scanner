import type { ScoredCandidate } from "./scanner/types";

type TelegramDelivery = { status: "sent" | "skipped" | "failed"; detail: string };

function formatAlert(candidate: ScoredCandidate) {
  const factors = candidate.factors.slice(0, 3).map((factor) => `• ${factor}`).join("\n") || "• لا توجد عوامل إيجابية كافية";
  const warnings = candidate.warnings.slice(0, 3).map((warning) => `• ${warning}`).join("\n") || "• لا توجد تحذيرات آلية إضافية";
  return [
    "SOLANA SIGNAL SCANNER — قراءة فقط",
    `${candidate.symbol} | فرصة ${candidate.opportunityScore.toFixed(1)}/100 | مخاطرة ${candidate.riskScore.toFixed(1)}/100`,
    "العوامل:", factors,
    "التحذيرات:", warnings,
    `المصدر: ${candidate.sourceUrl}`,
    "هذه إشارة بيانات آلية عالية المخاطر وليست توصية شراء أو بيع أو ضمان عائد.",
  ].join("\n");
}

export async function sendTelegramAlert(candidate: ScoredCandidate): Promise<TelegramDelivery> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { status: "skipped", detail: "تنبيهات تيليجرام غير مهيأة" };
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: formatAlert(candidate), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { status: "failed", detail: `Telegram HTTP ${response.status}` };
    const payload = await response.json() as { ok?: boolean; description?: string };
    return payload.ok ? { status: "sent", detail: "تم إرسال تنبيه تيليجرام" } : { status: "failed", detail: payload.description ?? "رفض تيليجرام التنبيه" };
  } catch (error) {
    return { status: "failed", detail: error instanceof Error ? error.message : "تعذر إرسال تنبيه تيليجرام" };
  }
}
