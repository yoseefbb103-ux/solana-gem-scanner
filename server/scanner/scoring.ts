import { DEFAULT_FILTERS, type ScanFilters, type ScoredCandidate, type TokenCandidate } from "./types";

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const round = (value: number) => Math.round(value * 10) / 10;

export function scoreCandidate(candidate: TokenCandidate, previousScore?: number): ScoredCandidate {
  const now = Date.now();
  const ageHours = candidate.pairCreatedAt ? Math.max(0, (now - candidate.pairCreatedAt) / 3_600_000) : null;
  const factors: string[] = [];
  const warnings: string[] = [];

  const liquidityScore = clamp((candidate.liquidityUsd / 150_000) * 25, 0, 25);
  if (candidate.liquidityUsd >= 50_000) factors.push("سيولة قابلة للتداول نسبياً");
  if (candidate.liquidityUsd < 15_000) warnings.push("سيولة منخفضة جداً");

  const volumeRatio = candidate.liquidityUsd > 0 ? candidate.volumeH1 / candidate.liquidityUsd : 0;
  const volumeScore = clamp((candidate.volumeH1 / 50_000) * 12 + clamp(volumeRatio * 5, 0, 10), 0, 22);
  if (candidate.volumeH1 >= 10_000) factors.push("حجم ساعة أولي ملحوظ");
  if (candidate.volumeH1 < 500) warnings.push("حجم تداول ضعيف في الساعة الماضية");
  if (volumeRatio > 5) warnings.push("حجم مرتفع جداً مقارنة بالسيولة");

  const ageScore = ageHours === null ? 3 : ageHours >= 0.5 && ageHours <= 48 ? 15 : ageHours <= 96 ? 8 : 3;
  if (ageHours !== null && ageHours <= 24) factors.push("زوج حديث ضمن نافذة الرصد");
  if (ageHours !== null && ageHours < 1) warnings.push("عمر الزوج أقل من ساعة");

  const txTotal = candidate.transactionsH1;
  const balance = txTotal > 0 ? Math.min(candidate.buysH1, candidate.sellsH1) / Math.max(candidate.buysH1, candidate.sellsH1, 1) : 0;
  const activityScore = clamp((txTotal / 180) * 14 + balance * 6, 0, 20);
  if (txTotal >= 40) factors.push("نشاط معاملات متكرر خلال ساعة");
  if (txTotal < 8) warnings.push("نشاط معاملات محدود");
  if (txTotal >= 12 && balance < 0.25) warnings.push("اختلال واضح بين الشراء والبيع");

  const absH1 = Math.abs(candidate.priceChangeH1);
  const momentumScore = candidate.priceChangeH1 > 0 && absH1 <= 25
    ? clamp(candidate.priceChangeH1 * 0.5 + Math.max(candidate.priceChangeM5, 0) * 0.2, 0, 18)
    : 0;
  if (candidate.priceChangeH1 > 2 && candidate.priceChangeH1 <= 25) factors.push("زخم سعري إيجابي غير مفرط");
  if (absH1 > 35 || Math.abs(candidate.priceChangeM5) > 12) warnings.push("حركة سعرية حادة");

  let risk = 0;
  risk += clamp((25_000 - candidate.liquidityUsd) / 25_000 * 28, 0, 28);
  risk += ageHours !== null && ageHours < 1 ? 13 : ageHours !== null && ageHours < 6 ? 7 : 0;
  risk += absH1 > 35 ? 18 : absH1 > 20 ? 10 : 0;
  risk += Math.abs(candidate.priceChangeM5) > 12 ? 10 : 0;
  risk += txTotal >= 12 && balance < 0.25 ? 10 : 0;
  risk += volumeRatio > 5 ? 10 : 0;
  risk += candidate.volumeH1 < 500 ? 10 : 0;
  risk += candidate.priceUsd === null ? 8 : 0;

  return {
    ...candidate,
    ageHours: ageHours === null ? null : round(ageHours),
    opportunityScore: round(liquidityScore + volumeScore + ageScore + activityScore + momentumScore),
    riskScore: round(clamp(risk)),
    scoreDelta: round((liquidityScore + volumeScore + ageScore + activityScore + momentumScore) - (previousScore ?? liquidityScore + volumeScore + ageScore + activityScore + momentumScore)),
    factors,
    warnings,
  };
}

export function applyFilters(candidates: ScoredCandidate[], filters: ScanFilters = DEFAULT_FILTERS) {
  return candidates
    .filter((candidate) => candidate.liquidityUsd >= filters.minLiquidity)
    .filter((candidate) => candidate.volumeH1 >= filters.minVolume)
    .filter((candidate) => candidate.ageHours === null || candidate.ageHours <= filters.maxAgeHours)
    .filter((candidate) => candidate.riskScore <= filters.maxRisk)
    .sort((left, right) => right.opportunityScore - left.opportunityScore);
}
