import type { SecurityReport, TokenCandidate } from "./types";

type RugCheckRisk = { name?: string; description?: string; level?: string; score?: number };
type RugCheckHolder = { pct?: number };
type RugCheckMarket = {
  lp?: { lpLockedPct?: number; lockedPct?: number; lockPercentage?: number; isLocked?: boolean };
};
type RugCheckReport = {
  creator?: string;
  rugged?: boolean;
  score?: number;
  token?: { mintAuthority?: string | null; freezeAuthority?: string | null };
  topHolders?: RugCheckHolder[];
  risks?: RugCheckRisk[];
  markets?: RugCheckMarket[];
};

const RUGCHECK_BASE_URL = "https://api.rugcheck.xyz";
const HIGH_RISK_LEVELS = new Set(["danger", "high", "critical"]);
const SECURITY_CACHE_TTL_MS = 45_000;

let securityCache = new Map<string, { value: RugCheckReport; expiresAt: number }>();
let pendingSecurityFetches = new Map<string, Promise<RugCheckReport>>();

const asNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;

export function resetSecurityCache() {
  securityCache = new Map();
  pendingSecurityFetches = new Map();
}

async function fetchRugCheckReport(baseAddress: string): Promise<RugCheckReport> {
  const cached = securityCache.get(baseAddress);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const pending = pendingSecurityFetches.get(baseAddress);
  if (pending) return pending;
  const request = (async () => {
    const response = await fetch(`${RUGCHECK_BASE_URL}/v1/tokens/${baseAddress}/report`, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`RugCheck HTTP ${response.status}`);
    const report = await response.json() as RugCheckReport;
    securityCache.set(baseAddress, { value: report, expiresAt: Date.now() + SECURITY_CACHE_TTL_MS });
    return report;
  })();
  pendingSecurityFetches.set(baseAddress, request);
  try {
    return await request;
  } finally {
    pendingSecurityFetches.delete(baseAddress);
  }
}

function getLpLockStatus(markets: RugCheckMarket[] | undefined): SecurityReport["lpLockStatus"] {
  const values = (markets ?? []).flatMap((market) => {
    const lp = market.lp;
    if (!lp) return [] as number[];
    if (lp.isLocked === true) return [100];
    if (lp.isLocked === false) return [0];
    return [lp.lpLockedPct, lp.lockedPct, lp.lockPercentage].filter((value): value is number => asNumber(value) !== null);
  });
  if (!values.length) return "unknown";
  return Math.max(...values) >= 95 ? "locked" : "unlocked";
}

function getRugFlags(risks: RugCheckRisk[] | undefined) {
  return (risks ?? [])
    .filter((risk) => HIGH_RISK_LEVELS.has((risk.level ?? "").toLowerCase()))
    .map((risk) => risk.name || risk.description || "إشارة خطر من RugCheck")
    .slice(0, 5);
}

export async function fetchSecurityReport(candidate: TokenCandidate, symbolConflict: boolean, deepScanApplied: boolean): Promise<SecurityReport> {
  const checkedAt = Date.now();
  try {
    const report = await fetchRugCheckReport(candidate.baseAddress);
    const mintAuthorityOpen = Boolean(report.token?.mintAuthority);
    const freezeAuthorityOpen = Boolean(report.token?.freezeAuthority);
    const lpLockStatus = getLpLockStatus(report.markets);
    const holderPcts = (report.topHolders ?? []).map((holder) => asNumber(holder.pct) ?? 0);
    const holderTopPct = holderPcts[0] ?? null;
    const holderTop10Pct = holderPcts.slice(0, 10).reduce((sum, pct) => sum + pct, 0) || null;
    const flags = getRugFlags(report.risks);
    if (mintAuthorityOpen) flags.unshift("صلاحية سك التوكن مفتوحة");
    if (freezeAuthorityOpen) flags.unshift("صلاحية تجميد التوكن مفتوحة");
    if (lpLockStatus === "unlocked") flags.unshift("السيولة غير مقفلة أو غير محروقة بحسب التقرير");
    if (symbolConflict) flags.push("رمز مطابق لتوكن آخر؛ تحقق من عنوان العقد يدوياً");
    if (deepScanApplied && holderTopPct !== null && holderTopPct >= 25) flags.push("تمركز مرتفع لدى أكبر حائز");
    if (deepScanApplied && holderTop10Pct !== null && holderTop10Pct >= 65) flags.push("تمركز مرتفع لدى أكبر 10 حائزين");
    const ruggedCreator = Boolean(report.rugged) || (report.risks ?? []).some((risk) => `${risk.name ?? ""} ${risk.description ?? ""}`.toLowerCase().includes("rugged"));
    if (ruggedCreator) flags.push("تقرير RugCheck يربط الناشر بإشارة رَقّ سلبية");
    const critical = mintAuthorityOpen || freezeAuthorityOpen || lpLockStatus === "unlocked" || ruggedCreator || getRugFlags(report.risks).length > 0;
    return {
      baseAddress: candidate.baseAddress,
      pairAddress: candidate.pairAddress,
      symbol: candidate.symbol,
      source: "RugCheck",
      status: critical ? "flagged" : "passed",
      mintAuthorityOpen,
      freezeAuthorityOpen,
      lpLockStatus,
      holderTopPct: deepScanApplied ? holderTopPct : null,
      holderTop10Pct: deepScanApplied ? holderTop10Pct : null,
      creatorAddress: report.creator ?? null,
      ruggedCreator,
      knownRuggedDeployer: false,
      sprayCount24h: 0,
      rugcheckScore: asNumber(report.score),
      symbolConflict,
      deepScanApplied,
      holderClusterScore: null,
      bundleDetected: null,
      washTradingScore: null,
      fundingSourceOverlap: null,
      token2022Flags: [],
      lpBurnVerified: null,
      flags,
      checkedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر الوصول إلى RugCheck";
    return {
      baseAddress: candidate.baseAddress,
      pairAddress: candidate.pairAddress,
      symbol: candidate.symbol,
      source: "RugCheck",
      status: "unavailable",
      mintAuthorityOpen: false,
      freezeAuthorityOpen: false,
      lpLockStatus: "unknown",
      holderTopPct: null,
      holderTop10Pct: null,
      creatorAddress: null,
      ruggedCreator: false,
      knownRuggedDeployer: false,
      sprayCount24h: 0,
      rugcheckScore: null,
      symbolConflict,
      deepScanApplied,
      holderClusterScore: null,
      bundleDetected: null,
      washTradingScore: null,
      fundingSourceOverlap: null,
      token2022Flags: [],
      lpBurnVerified: null,
      flags: [`بيانات أمان غير متاحة: ${message}`],
      checkedAt,
    };
  }
}

export function requiresStrictExclusion(report: SecurityReport) {
  return report.mintAuthorityOpen || report.freezeAuthorityOpen || report.lpLockStatus === "unlocked";
}
