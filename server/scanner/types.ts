export type ScanFilters = {
  minLiquidity: number;
  minVolume: number;
  maxAgeHours: number;
  maxRisk: number;
};

export type ScannerSettings = {
  strictSecurity: boolean;
  opportunityAlertThreshold: number;
  riskAlertThreshold: number;
  cooldownMinutes: number;
  deepScanLimit: number;
};

export const DEFAULT_FILTERS: ScanFilters = { minLiquidity: 0, minVolume: 0, maxAgeHours: 168, maxRisk: 100 };
export const DEFAULT_SCANNER_SETTINGS: ScannerSettings = { strictSecurity: true, opportunityAlertThreshold: 72, riskAlertThreshold: 28, cooldownMinutes: 120, deepScanLimit: 8 };

type TimeframeTransactions = { buys?: number; sells?: number };

export type DexScreenerPair = {
  chainId?: string; dexId?: string; url?: string; pairAddress?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string; txns?: Record<string, TimeframeTransactions>; volume?: Record<string, number>;
  priceChange?: Record<string, number>; liquidity?: { usd?: number | null }; pairCreatedAt?: number;
};

export type TokenCandidate = {
  pairAddress: string; baseAddress: string; symbol: string; name: string; dexId: string; sourceUrl: string; priceUsd: number | null;
  liquidityUsd: number; volumeH1: number; volumeH24: number; transactionsH1: number; buysH1: number; sellsH1: number;
  priceChangeM5: number; priceChangeH1: number; priceChangeH6: number; priceChangeH24: number; pairCreatedAt: number | null;
};

export type SecurityStatus = "passed" | "flagged" | "unavailable";
export type LpLockStatus = "locked" | "unlocked" | "unknown";

export type SecurityReport = {
  baseAddress: string; pairAddress: string; symbol: string; source: string; status: SecurityStatus;
  mintAuthorityOpen: boolean; freezeAuthorityOpen: boolean; lpLockStatus: LpLockStatus;
  holderTopPct: number | null; holderTop10Pct: number | null; creatorAddress: string | null; ruggedCreator: boolean;
  rugcheckScore: number | null; symbolConflict: boolean; deepScanApplied: boolean; flags: string[]; checkedAt: number;
};

export type ScoredCandidate = TokenCandidate & {
  ageHours: number | null; opportunityScore: number; riskScore: number; scoreDelta: number;
  factors: string[]; warnings: string[]; security: SecurityReport; decision: "monitor" | "caution" | "avoid";
  estimatedSlippage200: number | null; estimatedSlippage500: number | null; momentumConsistency: "positive" | "mixed" | "negative" | "unknown";
};

export type SourceTelemetry = {
  source: string; requestCount: number; throttled: boolean; slowRequestCount: number; errorCount: number;
  latestStatus: number | null; maxLatencyMs: number; capturedAt: number;
};

export type MarketFetchResult = { candidates: TokenCandidate[]; telemetry: SourceTelemetry };
