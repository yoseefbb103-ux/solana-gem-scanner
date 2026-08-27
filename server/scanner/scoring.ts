import { DEFAULT_FILTERS, type ScanFilters, type ScoredCandidate, type SecurityReport, type TokenCandidate } from "./types";

export type CandidateSignals = {
  jupiterPriceUsd?: number | null;
  jupiterChecked?: boolean;
  liquidityDeltaPct?: number | null;
  liquidityPullDetected?: boolean;
  liquidityGrowthStable?: boolean;
};

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const round = (value: number) => Math.round(value * 10) / 10;
const median = (values: number[]) => { const sorted = [...values].sort((left, right) => left - right); const middle = Math.floor(sorted.length / 2); return sorted.length ? sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2 : 0; };

export function unavailableSecurity(candidate: TokenCandidate): SecurityReport {
  return { baseAddress: candidate.baseAddress, pairAddress: candidate.pairAddress, symbol: candidate.symbol, source: "RugCheck", status: "unavailable", mintAuthorityOpen: false, freezeAuthorityOpen: false, lpLockStatus: "unknown", holderTopPct: null, holderTop10Pct: null, creatorAddress: null, ruggedCreator: false, knownRuggedDeployer: false, sprayCount24h: 0, rugcheckScore: null, symbolConflict: false, deepScanApplied: false, flags: ["بيانات أمان غير متاحة"], checkedAt: Date.now() };
}

function estimateSlippage(tradeUsd: number, liquidityUsd: number) { if (liquidityUsd <= 0) return null; return round((tradeUsd / (liquidityUsd / 2 + tradeUsd)) * 100); }
function momentumConsistency(candidate: TokenCandidate): ScoredCandidate["momentumConsistency"] { const movements = [candidate.priceChangeH1, candidate.priceChangeH6, candidate.priceChangeH24]; const positives = movements.filter((value) => value > 0).length; const negatives = movements.filter((value) => value < 0).length; return !movements.some(Boolean) ? "unknown" : positives >= 2 && candidate.priceChangeH1 > 0 ? "positive" : negatives >= 2 ? "negative" : "mixed"; }

export function scoreCandidate(candidate: TokenCandidate, previousScore?: number, security: SecurityReport = unavailableSecurity(candidate), signals: CandidateSignals = {}): ScoredCandidate {
  const ageHours = candidate.pairCreatedAt ? Math.max(0, (Date.now() - candidate.pairCreatedAt) / 3_600_000) : null;
  const factors: string[] = [];
  const warnings = [...security.flags];
  const liquidityScore = clamp((candidate.liquidityUsd / 150_000) * 22, 0, 22);
  if (candidate.liquidityUsd >= 50_000) factors.push("سيولة قابلة للتداول نسبياً");
  if (candidate.liquidityUsd < 15_000) warnings.push("سيولة منخفضة جداً");
  const volumeRatio = candidate.liquidityUsd > 0 ? candidate.volumeH1 / candidate.liquidityUsd : 0;
  const volumeScore = clamp((candidate.volumeH1 / 50_000) * 10 + clamp(volumeRatio * 4, 0, 8), 0, 18);
  if (candidate.volumeH1 >= 10_000) factors.push("حجم ساعة أولي ملحوظ");
  if (candidate.volumeH1 < 500) warnings.push("حجم تداول ضعيف في الساعة الماضية");
  if (volumeRatio > 5) warnings.push("نشاط مشبوه: حجم مرتفع جداً مقارنة بالسيولة وقد يكون مصطنعاً");
  const ageScore = ageHours === null ? 3 : ageHours >= 0.5 && ageHours <= 48 ? 14 : ageHours <= 96 ? 7 : 2;
  if (ageHours !== null && ageHours <= 24) factors.push("زوج حديث ضمن نافذة الرصد");
  if (ageHours !== null && ageHours < 1) warnings.push("عمر الزوج أقل من ساعة");
  const totalTransactions = candidate.transactionsH1;
  const balance = totalTransactions > 0 ? Math.min(candidate.buysH1, candidate.sellsH1) / Math.max(candidate.buysH1, candidate.sellsH1, 1) : 0;
  const activityScore = clamp((totalTransactions / 180) * 12 + balance * 5, 0, 17);
  if (totalTransactions >= 40) factors.push("نشاط معاملات متكرر خلال ساعة");
  if (totalTransactions < 8) warnings.push("نشاط معاملات محدود");
  if (totalTransactions >= 12 && balance < 0.25) warnings.push("اختلال واضح بين الشراء والبيع");
  const consistency = momentumConsistency(candidate);
  const absH1 = Math.abs(candidate.priceChangeH1);
  const momentumScore = candidate.priceChangeH1 > 0 && absH1 <= 25 ? clamp(candidate.priceChangeH1 * 0.45 + Math.max(candidate.priceChangeM5, 0) * 0.15, 0, 14) : 0;
  const consistencyScore = consistency === "positive" ? 10 : consistency === "mixed" ? 3 : 0;
  if (consistency === "positive") factors.push("زخم متسق عبر 1س و6س و24س");
  if (consistency === "negative") warnings.push("زخم سلبي عبر أكثر من إطار زمني");
  if (candidate.priceChangeH1 > 2 && candidate.priceChangeH1 <= 25) factors.push("زخم سعري إيجابي غير مفرط");
  if (absH1 > 35 || Math.abs(candidate.priceChangeM5) > 12) warnings.push("حركة سعرية حادة");
  const slippage200 = estimateSlippage(200, candidate.liquidityUsd);
  const slippage500 = estimateSlippage(500, candidate.liquidityUsd);
  if ((slippage500 ?? 100) > 8) warnings.push("انزلاق تقديري مرتفع لصفقة 500 دولار");
  const jupiterPriceUsd = signals.jupiterPriceUsd ?? null;
  const priceDivergencePct = candidate.priceUsd && jupiterPriceUsd ? round(Math.abs(candidate.priceUsd - jupiterPriceUsd) / jupiterPriceUsd * 100) : null;
  if (signals.jupiterChecked && priceDivergencePct === null) warnings.push("مقارنة السعر مع Jupiter غير متاحة");
  if (priceDivergencePct !== null && priceDivergencePct > 12) warnings.push("تعارض في السعر بين المصادر، تحقق يدوياً قبل أي قرار");
  if (candidate.liquidDexCount >= 2) factors.push("سيولة موزعة عبر أكثر من منصة تداول");
  if (candidate.metadataCompleteness >= 2) factors.push("بيانات وصفية متاحة من المصدر العام");
  if (signals.liquidityGrowthStable) factors.push("نمو سيولة متسق عبر عدة فحصات");
  if (signals.liquidityPullDetected) warnings.unshift("احتمال سحب سيولة نشط الآن؛ استبعد من أفضل الآن");
  if (security.sprayCount24h >= 3) warnings.push("نمط رش: نفس الناشر أطلق عدة توكنات خلال 24 ساعة");
  let risk = 0;
  risk += clamp((25_000 - candidate.liquidityUsd) / 25_000 * 24, 0, 24) + (ageHours !== null && ageHours < 1 ? 12 : ageHours !== null && ageHours < 6 ? 6 : 0) + (absH1 > 35 ? 15 : absH1 > 20 ? 8 : 0) + (Math.abs(candidate.priceChangeM5) > 12 ? 8 : 0) + (totalTransactions >= 12 && balance < 0.25 ? 9 : 0) + (volumeRatio > 5 ? 9 : 0) + (candidate.volumeH1 < 500 ? 9 : 0) + ((slippage500 ?? 12) > 8 ? 8 : 0) + (consistency === "negative" ? 7 : 0);
  risk += (priceDivergencePct ?? 0) > 12 ? 7 : 0;
  risk += security.mintAuthorityOpen ? 28 : 0; risk += security.freezeAuthorityOpen ? 20 : 0; risk += security.lpLockStatus === "unlocked" ? 24 : 0;
  risk += security.holderTopPct !== null && security.holderTopPct >= 25 ? 12 : 0; risk += security.holderTop10Pct !== null && security.holderTop10Pct >= 65 ? 10 : 0;
  risk += security.ruggedCreator ? 22 : 0; risk += security.knownRuggedDeployer ? 35 : 0; risk += security.sprayCount24h >= 3 ? 18 : 0; risk += security.symbolConflict ? 14 : 0; risk += security.status === "unavailable" ? 4 : 0; risk += signals.liquidityPullDetected ? 65 : 0;
  const opportunityScore = round(clamp(liquidityScore + volumeScore + ageScore + activityScore + momentumScore + consistencyScore + (candidate.liquidDexCount >= 2 ? 2 : 0) + (candidate.metadataCompleteness >= 2 ? 1 : 0) + (signals.liquidityGrowthStable ? 3 : 0)));
  const riskScore = round(clamp(risk));
  const decision: ScoredCandidate["decision"] = signals.liquidityPullDetected || security.mintAuthorityOpen || security.freezeAuthorityOpen || security.lpLockStatus === "unlocked" || security.knownRuggedDeployer || riskScore >= 65 ? "avoid" : security.status === "passed" && riskScore <= 28 && opportunityScore >= 55 ? "monitor" : "caution";
  return { ...candidate, ageHours: ageHours === null ? null : round(ageHours), opportunityScore, riskScore, scoreDelta: round(opportunityScore - (previousScore ?? opportunityScore)), factors: Array.from(new Set(factors)), warnings: Array.from(new Set(warnings)), security, decision, estimatedSlippage200: slippage200, estimatedSlippage500: slippage500, momentumConsistency: consistency, jupiterPriceUsd, priceDivergencePct, liquidityDeltaPct: signals.liquidityDeltaPct ?? null, liquidityPullDetected: Boolean(signals.liquidityPullDetected), liquidityGrowthStable: Boolean(signals.liquidityGrowthStable) };
}

export function scoreCandidates(candidates: TokenCandidate[], previousScores: Map<string, number>, securityByAddress: Map<string, SecurityReport>, signalsByAddress = new Map<string, CandidateSignals>()) {
  const scored = candidates.map((candidate) => scoreCandidate(candidate, previousScores.get(candidate.baseAddress), securityByAddress.get(candidate.baseAddress), signalsByAddress.get(candidate.baseAddress)));
  const liquidityMedian = median(scored.map((candidate) => candidate.liquidityUsd));
  const volumeMedian = median(scored.map((candidate) => candidate.volumeH1));
  return scored.map((candidate) => {
    const relativeBoost = (candidate.liquidityUsd >= liquidityMedian ? 3 : 0) + (candidate.volumeH1 >= volumeMedian ? 3 : 0);
    const factors = [...candidate.factors]; if (relativeBoost >= 3) factors.push("يتفوق نسبياً على مرشحي الفحص الحاليين");
    const opportunityScore = round(clamp(candidate.opportunityScore + relativeBoost));
    const decision: ScoredCandidate["decision"] = candidate.decision === "avoid" ? "avoid" : candidate.security.status === "passed" && candidate.riskScore <= 28 && opportunityScore >= 62 ? "monitor" : "caution";
    return { ...candidate, opportunityScore, scoreDelta: round(opportunityScore - (previousScores.get(candidate.baseAddress) ?? opportunityScore)), factors, decision };
  });
}

export function applyFilters(candidates: ScoredCandidate[], filters: ScanFilters = DEFAULT_FILTERS, strictSecurity = false) {
  return candidates.filter((candidate) => candidate.liquidityUsd >= filters.minLiquidity).filter((candidate) => candidate.volumeH1 >= filters.minVolume).filter((candidate) => candidate.ageHours === null || candidate.ageHours <= filters.maxAgeHours).filter((candidate) => candidate.riskScore <= filters.maxRisk).filter((candidate) => !strictSecurity || candidate.decision !== "avoid").sort((left, right) => right.opportunityScore - left.opportunityScore);
}
