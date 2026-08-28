import type { InferInsertModel } from "drizzle-orm";
import { signalObservations } from "../../drizzle/schema";

export type SignalObservationInsert = InferInsertModel<typeof signalObservations>;
export type SignalEffect = SignalObservationInsert["effect"];
export type SignalAvailability = SignalObservationInsert["availability"];
export type SignalEvidenceState = SignalObservationInsert["evidenceState"];

export const SIGNAL_REASON_CODES = {
  LIQUIDITY_TO_MARKET_CAP_AVAILABLE: "liquidity_to_market_cap.available",
  LIQUIDITY_TO_MARKET_CAP_UNAVAILABLE: "liquidity_to_market_cap.unavailable",
  SILENCE_BREAK_DETECTED: "silence_break.detected",
  SILENCE_BREAK_NOT_DETECTED: "silence_break.not_detected",
  PRICE_POST_SPIKE_STABILITY: "price_post_spike.stability",
  PRICE_POST_SPIKE_UNAVAILABLE: "price_post_spike.unavailable",
  NAME_SYMBOL_COPYCAT_WARNING: "name_symbol_copycat.warning",
  NAME_SYMBOL_COPYCAT_CLEAR: "name_symbol_copycat.clear",
  BUY_SELL_PRESSURE_AVAILABLE: "buy_sell_pressure.available",
  BUY_SELL_PRESSURE_UNAVAILABLE: "buy_sell_pressure.unavailable",
} as const;

export type SignalReasonCode = (typeof SIGNAL_REASON_CODES)[keyof typeof SIGNAL_REASON_CODES];

export const SIGNAL_REASON_LABELS: Record<SignalReasonCode, string> = {
  [SIGNAL_REASON_CODES.LIQUIDITY_TO_MARKET_CAP_AVAILABLE]: "نسبة السيولة إلى القيمة السوقية متاحة",
  [SIGNAL_REASON_CODES.LIQUIDITY_TO_MARKET_CAP_UNAVAILABLE]: "القيمة السوقية غير متاحة لحساب النسبة",
  [SIGNAL_REASON_CODES.SILENCE_BREAK_DETECTED]: "كسر صمت النشاط مرصود",
  [SIGNAL_REASON_CODES.SILENCE_BREAK_NOT_DETECTED]: "لم يُرصد كسر صمت النشاط",
  [SIGNAL_REASON_CODES.PRICE_POST_SPIKE_STABILITY]: "استمرارية السعر بعد القفزة مرصودة",
  [SIGNAL_REASON_CODES.PRICE_POST_SPIKE_UNAVAILABLE]: "لا توجد لقطات كافية لقياس استمرارية السعر",
  [SIGNAL_REASON_CODES.NAME_SYMBOL_COPYCAT_WARNING]: "تشابه اسم أو رمز يحتاج مراجعة يدوية",
  [SIGNAL_REASON_CODES.NAME_SYMBOL_COPYCAT_CLEAR]: "لم يُرصد تشابه مقلق في الاسم أو الرمز",
  [SIGNAL_REASON_CODES.BUY_SELL_PRESSURE_AVAILABLE]: "نسبة ضغط الشراء إلى البيع متاحة",
  [SIGNAL_REASON_CODES.BUY_SELL_PRESSURE_UNAVAILABLE]: "بيانات ضغط الشراء إلى البيع غير متاحة",
};

export function createSignalObservation(input: SignalObservationInsert): SignalObservationInsert {
  if (!input.reasonCode || !input.signalKey || !input.source) throw new Error("reasonCode وsignalKey وsource مطلوبة لكل إشارة");
  if (!input.observedAt) throw new Error("observedAt مطلوب لكل إشارة");
  if ((input.requestCost ?? 0) < 0) throw new Error("requestCost لا يمكن أن يكون سالباً");
  if (input.availability === "unavailable" && input.evidenceState !== "unavailable") {
    throw new Error("الإشارة غير المتاحة يجب أن تحمل evidenceState=unavailable");
  }
  if (input.availability === "available" && input.evidenceState === "unavailable") {
    throw new Error("الإشارة المتاحة لا يمكن أن تحمل evidenceState=unavailable");
  }
  return { ...input };
}
