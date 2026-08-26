export type ScanFilters = {
  minLiquidity: number;
  minVolume: number;
  maxAgeHours: number;
  maxRisk: number;
};

export const DEFAULT_FILTERS: ScanFilters = {
  minLiquidity: 0,
  minVolume: 0,
  maxAgeHours: 168,
  maxRisk: 100,
};

type TimeframeTransactions = { buys?: number; sells?: number };

export type DexScreenerPair = {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string;
  txns?: Record<string, TimeframeTransactions>;
  volume?: Record<string, number>;
  priceChange?: Record<string, number>;
  liquidity?: { usd?: number | null };
  pairCreatedAt?: number;
};

export type TokenCandidate = {
  pairAddress: string;
  baseAddress: string;
  symbol: string;
  name: string;
  dexId: string;
  sourceUrl: string;
  priceUsd: number | null;
  liquidityUsd: number;
  volumeH1: number;
  volumeH24: number;
  transactionsH1: number;
  buysH1: number;
  sellsH1: number;
  priceChangeM5: number;
  priceChangeH1: number;
  pairCreatedAt: number | null;
};

export type ScoredCandidate = TokenCandidate & {
  ageHours: number | null;
  opportunityScore: number;
  riskScore: number;
  scoreDelta: number;
  factors: string[];
  warnings: string[];
};
