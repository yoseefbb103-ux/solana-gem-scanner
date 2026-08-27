import type { FundingEvidenceStatus, TokenCandidate } from "./types";
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const INCINERATOR_ADDRESS = "1nc1nerator11111111111111111111111111111111";
const ONCHAIN_CACHE_TTL_MS = 5 * 60_000;
const ONCHAIN_SCAN_BUDGET_MS = 18_000;
const MAX_HOLDERS = 10;
const MAX_FUNDING_HOLDERS = 3;
const MAX_SIGNATURES_PER_ADDRESS = 3;
const RPC_MIN_INTERVAL_MS = 400;
const RPC_MAX_ATTEMPTS = 2;
const RPC_RETRY_AFTER_CAP_MS = 2_000;
const RPC_RATE_LIMIT_COOLDOWN_MS = 30_000;

type RpcResponse<T> = { result?: T; error?: { message?: string } };
type LargestAccount = { address?: string; amount?: string; uiAmount?: number | null };
type ParsedAccount = { owner?: string; data?: { parsed?: { info?: { owner?: string; extensions?: unknown } } } | [string, string] | string | null };
type SignatureInfo = { signature?: string; slot?: number; blockTime?: number | null; err?: unknown };
type ParsedInstruction = { parsed?: { type?: string; info?: { source?: string; destination?: string } } };
type Transaction = { transaction?: { message?: { instructions?: ParsedInstruction[] } }; meta?: { innerInstructions?: { instructions?: ParsedInstruction[] }[] | null } };
type HeliusEnhancedTransaction = { nativeTransfers?: { fromUserAccount?: string; toUserAccount?: string }[] };

export type OnchainSecuritySignals = {
  status: "available" | "unavailable";
  holderClusterScore: number | null;
  bundleDetected: boolean | null;
  washTradingScore: number | null;
  fundingSourceOverlap: boolean | null;
  fundingEvidenceStatus: FundingEvidenceStatus;
  token2022Flags: string[];
  lpBurnVerified: boolean | null;
  flags: string[];
};

const unavailable = (reason: string): OnchainSecuritySignals => ({
  status: "unavailable", holderClusterScore: null, bundleDetected: null, washTradingScore: null, fundingSourceOverlap: null, fundingEvidenceStatus: "unavailable",
  token2022Flags: [], lpBurnVerified: null, flags: [`فحص on-chain غير متاح: ${reason}`],
});

let cache = new Map<string, { value: OnchainSecuritySignals; expiresAt: number }>();
let pending = new Map<string, Promise<OnchainSecuritySignals>>();
let rpcTail: Promise<void> = Promise.resolve();
let lastRpcStartedAt = 0;
let activeRpcIndex = 0;
let rateLimitedEndpoints = new Map<string, number>();

export function resetOnchainCache() {
  cache = new Map();
  pending = new Map();
  rpcTail = Promise.resolve();
  lastRpcStartedAt = 0;
  activeRpcIndex = 0;
  rateLimitedEndpoints = new Map();
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function heliusApiKey() { return process.env.HELIUS_API_KEY?.trim() || null; }

function rpcEndpoints() {
  const apiKey = heliusApiKey();
  const heliusUrl = apiKey ? `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(apiKey)}` : null;
  return Array.from(new Set([
    heliusUrl,
    process.env.SOLANA_RPC_URL,
    "https://api.mainnet-beta.solana.com",
    "https://solana-rpc.publicnode.com",
  ].filter((url): url is string => Boolean(url))));
}

function assertDeadline(deadlineAt: number) {
  if (Date.now() >= deadlineAt) throw new Error("انتهت ميزانية زمن الفحص on-chain");
}

async function executeRpc<T>(method: string, params: unknown[], deadlineAt: number): Promise<T> {
  for (let attempt = 1; attempt <= RPC_MAX_ATTEMPTS; attempt += 1) {
    assertDeadline(deadlineAt);
    const now = Date.now();
    const endpoints = rpcEndpoints();
    let endpoint: string | undefined;
    for (let offset = 0; offset < endpoints.length; offset += 1) {
      const candidate = endpoints[(activeRpcIndex + offset) % endpoints.length];
      if ((rateLimitedEndpoints.get(candidate) ?? 0) <= now) { endpoint = candidate; activeRpcIndex = (activeRpcIndex + offset) % endpoints.length; break; }
    }
    if (!endpoint) throw new Error("جميع نقاط Solana RPC العامة مقيدة مؤقتاً");
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: `${method}-${Date.now()}`, method, params }),
        signal: AbortSignal.timeout(Math.max(1, Math.min(8_000, deadlineAt - Date.now()))),
      });
    } catch (error) {
      rateLimitedEndpoints.set(endpoint, Date.now() + RPC_RATE_LIMIT_COOLDOWN_MS);
      activeRpcIndex = (activeRpcIndex + 1) % endpoints.length;
      if (attempt < RPC_MAX_ATTEMPTS) { await sleep(Math.min(250, Math.max(0, deadlineAt - Date.now()))); continue; }
      throw error;
    }
    const retryableEndpointError = response.status === 429 || response.status === 403 || response.status === 408 || response.status >= 500;
    if (retryableEndpointError && attempt < RPC_MAX_ATTEMPTS) {
      rateLimitedEndpoints.set(endpoint, Date.now() + RPC_RATE_LIMIT_COOLDOWN_MS);
      activeRpcIndex = (activeRpcIndex + 1) % endpoints.length;
      const retryAfterSeconds = Number(response.headers.get("retry-after"));
      const requestedDelay = response.status === 429 && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1_000 : 250;
      await sleep(Math.min(requestedDelay, RPC_RETRY_AFTER_CAP_MS, Math.max(0, deadlineAt - Date.now())));
      continue;
    }
    if (response.status === 429) rateLimitedEndpoints.set(endpoint, Date.now() + RPC_RATE_LIMIT_COOLDOWN_MS);
    if (!response.ok) throw new Error(`Solana RPC HTTP ${response.status}`);
    const payload = await response.json() as RpcResponse<T>;
    if (payload.error) throw new Error(payload.error.message || `Solana RPC error في ${method}`);
    if (payload.result === undefined) throw new Error(`Solana RPC أعاد نتيجة فارغة في ${method}`);
    return payload.result;
  }
  throw new Error("Solana RPC HTTP 429");
}

function rpc<T>(method: string, params: unknown[], deadlineAt: number): Promise<T> {
  const task = rpcTail.then(async () => {
    assertDeadline(deadlineAt);
    const waitMs = Math.max(0, RPC_MIN_INTERVAL_MS - (Date.now() - lastRpcStartedAt));
    if (waitMs) await sleep(Math.min(waitMs, Math.max(0, deadlineAt - Date.now())));
    assertDeadline(deadlineAt);
    lastRpcStartedAt = Date.now();
    return executeRpc<T>(method, params, deadlineAt);
  });
  rpcTail = task.then(() => undefined, () => undefined);
  return task;
}

function nestedInstructions(transaction: Transaction | null) {
  return [
    ...(transaction?.transaction?.message?.instructions ?? []),
    ...(transaction?.meta?.innerInstructions ?? []).flatMap((entry) => entry.instructions ?? []),
  ];
}

function findInboundSystemSources(transaction: Transaction | null, destination: string) {
  return nestedInstructions(transaction)
    .filter((instruction) => instruction.parsed?.type === "transfer" && instruction.parsed.info?.destination === destination)
    .map((instruction) => instruction.parsed?.info?.source)
    .filter((source): source is string => Boolean(source));
}

async function indexedFundingSources(owner: string, deadlineAt: number): Promise<Set<string> | undefined> {
  const apiKey = heliusApiKey();
  if (!apiKey) return undefined;
  assertDeadline(deadlineAt);
  try {
    const response = await fetch(`https://api.helius.xyz/v0/addresses/${encodeURIComponent(owner)}/transactions?api-key=${encodeURIComponent(apiKey)}&limit=100&sort-order=asc&token-accounts=all`, {
      signal: AbortSignal.timeout(Math.max(1, Math.min(8_000, deadlineAt - Date.now()))),
    });
    if (!response.ok) throw new Error(`Helius enhanced HTTP ${response.status}`);
    const transactions = await response.json() as HeliusEnhancedTransaction[];
    const sources = new Set<string>();
    for (const transaction of transactions) {
      for (const nativeTransfer of transaction.nativeTransfers ?? []) {
        if (nativeTransfer.toUserAccount === owner && nativeTransfer.fromUserAccount) sources.add(nativeTransfer.fromUserAccount);
      }
      if (sources.size) break;
    }
    return sources;
  } catch {
    return undefined;
  }
}

function extensionFlags(account: ParsedAccount | null) {
  const owner = account?.owner;
  if (owner !== TOKEN_2022_PROGRAM_ID) return [] as string[];
  const rawExtensions = account?.data && !Array.isArray(account.data) && typeof account.data === "object" ? account.data.parsed?.info?.extensions : undefined;
  const content = JSON.stringify(rawExtensions ?? "").toLowerCase();
  const flags = ["برنامج Token-2022 مرصود"];
  if (!rawExtensions) return [...flags, "امتدادات Token-2022 غير متاحة من RPC العام"];
  if (content.includes("transferhook") || content.includes("transfer_hook")) flags.push("Transfer Hook مرصود: التحويل قد يشغّل منطقاً مخصصاً");
  if (content.includes("transferfee") || content.includes("transfer_fee")) flags.push("رسوم تحويل Token-2022 مرصودة");
  if (content.includes("defaultaccountstate") || content.includes("default_account_state")) flags.push("حالة حساب افتراضية موسعة مرصودة");
  if (content.includes("pausable")) flags.push("امتداد إيقاف Token-2022 مرصود");
  if (content.includes("permanentdelegate") || content.includes("permanent_delegate")) flags.push("مندوب دائم Token-2022 مرصود");
  return flags;
}

async function inspectHolderOwnership(mint: string, deadlineAt: number) {
  const result = await rpc<{ value?: LargestAccount[] }>("getTokenLargestAccounts", [mint, { commitment: "confirmed" }], deadlineAt);
  const addresses = (result.value ?? []).slice(0, MAX_HOLDERS).map((entry) => entry.address).filter((address): address is string => Boolean(address));
  if (!addresses.length) return { holderClusterScore: null, owners: [] as string[] };
  const accounts = await rpc<{ value?: (ParsedAccount | null)[] }>("getMultipleAccounts", [addresses, { encoding: "jsonParsed", commitment: "confirmed" }], deadlineAt);
  const owners = (accounts.value ?? []).map((account) => account?.data && !Array.isArray(account.data) && typeof account.data === "object" ? account.data.parsed?.info?.owner : undefined).filter((owner): owner is string => Boolean(owner));
  if (!owners.length) return { holderClusterScore: null, owners: [] as string[] };
  const counts = new Map<string, number>();
  for (const owner of owners) counts.set(owner, (counts.get(owner) ?? 0) + 1);
  const mostRepeated = Math.max(...Array.from(counts.values()));
  const fundingLimit = heliusApiKey() ? 5 : MAX_FUNDING_HOLDERS;
  return { holderClusterScore: Math.round((mostRepeated / owners.length) * 1000) / 10, owners: Array.from(counts.keys()).slice(0, fundingLimit) };
}

async function inspectObservedFundingOverlap(owners: string[], deadlineAt: number): Promise<{ fundingSourceOverlap: boolean | null; fundingEvidenceStatus: FundingEvidenceStatus }> {
  const sourceSets = await Promise.all(owners.map(async (owner) => {
    try {
      const indexedSources = await indexedFundingSources(owner, deadlineAt);
      if (indexedSources !== undefined) return indexedSources;
      const signatures = await rpc<SignatureInfo[]>("getSignaturesForAddress", [owner, { commitment: "confirmed", limit: MAX_SIGNATURES_PER_ADDRESS }], deadlineAt);
      const oldestFirst = signatures.filter((entry) => !entry.err && entry.signature).reverse();
      for (const entry of oldestFirst) {
        const transaction = await rpc<Transaction | null>("getTransaction", [entry.signature, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 }], deadlineAt);
        const sources = findInboundSystemSources(transaction, owner);
        if (sources.length) return new Set(sources);
      }
      return new Set<string>();
    } catch {
      return null;
    }
  }));
  if (sourceSets.some((entry) => entry === null)) return { fundingSourceOverlap: null, fundingEvidenceStatus: "unavailable" };
  const sourceCounts = new Map<string, number>();
  for (const sources of sourceSets) for (const source of Array.from(sources ?? [])) sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
  if (Array.from(sourceCounts.values()).some((count) => count >= 2)) return { fundingSourceOverlap: true, fundingEvidenceStatus: "overlap_observed" };
  return { fundingSourceOverlap: false, fundingEvidenceStatus: heliusApiKey() ? "no_overlap_indexed_window" : "no_overlap_public_window" };
}

async function inspectPairBundling(candidate: TokenCandidate, deadlineAt: number) {
  if (!candidate.pairCreatedAt) return null;
  const signatures = await rpc<SignatureInfo[]>("getSignaturesForAddress", [candidate.pairAddress, { commitment: "confirmed", limit: 30 }], deadlineAt);
  const start = Math.floor(candidate.pairCreatedAt / 1000);
  const early = signatures.filter((entry) => !entry.err && typeof entry.blockTime === "number" && entry.blockTime >= start && entry.blockTime <= start + 120 && typeof entry.slot === "number");
  if (early.length < 4) return null;
  const slotCounts = new Map<number, number>();
  for (const entry of early) slotCounts.set(entry.slot as number, (slotCounts.get(entry.slot as number) ?? 0) + 1);
  const peak = Math.max(...Array.from(slotCounts.values()));
  return peak >= 3 && peak / early.length >= 0.6;
}

async function inspectLpBurn(lpMintAddresses: string[], deadlineAt: number) {
  if (!lpMintAddresses.length) return null;
  for (const mint of lpMintAddresses.slice(0, 2)) {
    const largest = await rpc<{ value?: LargestAccount[] }>("getTokenLargestAccounts", [mint, { commitment: "confirmed" }], deadlineAt);
    const addresses = (largest.value ?? []).map((entry) => entry.address).filter((address): address is string => Boolean(address));
    if (!addresses.length) continue;
    const accounts = await rpc<{ value?: (ParsedAccount | null)[] }>("getMultipleAccounts", [addresses, { encoding: "jsonParsed", commitment: "confirmed" }], deadlineAt);
    const owners = (accounts.value ?? []).map((account) => account?.data && !Array.isArray(account.data) && typeof account.data === "object" ? account.data.parsed?.info?.owner : undefined);
    if (owners.includes(INCINERATOR_ADDRESS)) return true;
  }
  return false;
}

async function inspectOnchainSecurityUncached(candidate: TokenCandidate, lpMintAddresses: string[], deadlineAt: number): Promise<OnchainSecuritySignals> {
  try {
    const [holderData, mintAccount, bundleDetected, lpBurnVerified] = await Promise.all([
      inspectHolderOwnership(candidate.baseAddress, deadlineAt),
      rpc<{ value?: ParsedAccount | null }>("getAccountInfo", [candidate.baseAddress, { encoding: "jsonParsed", commitment: "confirmed" }], deadlineAt).then((result) => result.value ?? null),
      inspectPairBundling(candidate, deadlineAt).catch(() => null),
      inspectLpBurn(lpMintAddresses, deadlineAt).catch(() => null),
    ]);
    const fundingEvidence = await inspectObservedFundingOverlap(holderData.owners, deadlineAt);
    const token2022Flags = extensionFlags(mintAccount);
    const flags: string[] = [];
    if (holderData.holderClusterScore !== null && holderData.holderClusterScore >= 40) flags.push("تمركز حسابات كبير مرصود ضمن أكبر حائزي التوكن");
    if (bundleDetected) flags.push("نمط معاملات مجمعة محتمل على حساب الزوج خلال أول دقيقتين؛ لا يثبت وحده شراءً مجمعاً");
    if (fundingEvidence.fundingSourceOverlap) flags.push("مصدر تمويل مشترك مرصود بين حائزين كبار ضمن سجل الفحص المتاح");
    if (fundingEvidence.fundingEvidenceStatus === "unavailable" && holderData.owners.length) flags.push("مصدر تمويل كبار الحائزين غير محسوم بسبب تعذر مصدر الفحص");
    if (lpBurnVerified === true) flags.push("حرق LP موثق: حساب LP مرصود باسم عنوان الحرق المعروف");
    if (lpBurnVerified === null) flags.push("تحقق حرق LP غير متاح: عنوان LP القابل للفحص لم يتوفر من المصدر العام");
    flags.push(...token2022Flags);
    return { status: "available", holderClusterScore: holderData.holderClusterScore, bundleDetected, washTradingScore: null, fundingSourceOverlap: fundingEvidence.fundingSourceOverlap, fundingEvidenceStatus: fundingEvidence.fundingEvidenceStatus, token2022Flags, lpBurnVerified, flags: Array.from(new Set(flags)) };
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : "تعذر اتصال RPC العام");
  }
}

export async function inspectOnchainSecurity(candidate: TokenCandidate, lpMintAddresses: string[]): Promise<OnchainSecuritySignals> {
  const cacheKey = `${candidate.baseAddress}:${candidate.pairAddress}:${[...lpMintAddresses].sort().join(",")}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const inFlight = pending.get(cacheKey);
  if (inFlight) return inFlight;
  const request = inspectOnchainSecurityUncached(candidate, lpMintAddresses, Date.now() + ONCHAIN_SCAN_BUDGET_MS);
  pending.set(cacheKey, request);
  try {
    const result = await request;
    if (result.status === "available") cache.set(cacheKey, { value: result, expiresAt: Date.now() + ONCHAIN_CACHE_TTL_MS });
    return result;
  } finally {
    pending.delete(cacheKey);
  }
}
