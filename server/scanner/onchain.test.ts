import { afterEach, describe, expect, it, vi } from "vitest";
import { inspectOnchainSecurity, resetOnchainCache } from "./onchain";
import type { TokenCandidate } from "./types";

const candidate: TokenCandidate = {
  pairAddress: "pair", baseAddress: "mint", symbol: "TEST", name: "Test", dexId: "raydium", sourceUrl: "https://example.com",
  priceUsd: 0.1, liquidityUsd: 20_000, volumeH1: 3_000, volumeH24: 20_000, transactionsH1: 25, buysH1: 15, sellsH1: 10,
  priceChangeM5: 2, priceChangeH1: 4, priceChangeH6: 3, priceChangeH24: 2, pairCreatedAt: Date.now(), discoverySources: [], liquidDexCount: 1, metadataCompleteness: 0,
};

function rpcResponse(result: unknown) {
  return { ok: true, json: async () => ({ jsonrpc: "2.0", result }) };
}

afterEach(() => { resetOnchainCache(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("فحص الأمان on-chain", () => {
  it("يجمع إشارات الحائزين والحزم والتمويل وامتداد Token-2022 من RPC عام", async () => {
    let firstRpcCall = true;
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (firstRpcCall) {
        firstRpcCall = false;
        return { ok: false, status: 429, headers: new Headers({ "retry-after": "0.001" }) };
      }
      const request = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };
      const address = request.params[0];
      if (request.method === "getTokenLargestAccounts" && address === "mint") return rpcResponse({ value: [{ address: "accountA" }, { address: "accountB" }] });
      if (request.method === "getMultipleAccounts") return rpcResponse({ value: [{ data: { parsed: { info: { owner: "ownerA" } } } }, { data: { parsed: { info: { owner: "ownerB" } } } }] });
      if (request.method === "getAccountInfo") return rpcResponse({
        value: {
          owner: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
          data: { parsed: { info: { extensions: [{ extension: "transferHook" }] } } },
        },
      });
      if (request.method === "getSignaturesForAddress" && address === "pair") return rpcResponse([
        { signature: "pair-1", slot: 77, blockTime: Math.floor(Date.now() / 1000) }, { signature: "pair-2", slot: 77, blockTime: Math.floor(Date.now() / 1000) },
        { signature: "pair-3", slot: 77, blockTime: Math.floor(Date.now() / 1000) }, { signature: "pair-4", slot: 78, blockTime: Math.floor(Date.now() / 1000) },
      ]);
      if (request.method === "getSignaturesForAddress" && (address === "ownerA" || address === "ownerB")) return rpcResponse([{ signature: `funding-${address}`, slot: 12, blockTime: 1 }]);
      if (request.method === "getTransaction") {
        const signature = request.params[0];
        const destination = signature === "funding-ownerA" ? "ownerA" : "ownerB";
        return rpcResponse({ transaction: { message: { instructions: [{ parsed: { type: "transfer", info: { source: "shared-funder", destination } } }] } } });
      }
      throw new Error(`unexpected RPC call ${request.method}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await inspectOnchainSecurity(candidate, []);

    expect(result.status).toBe("available");
    expect(result.holderClusterScore).toBe(50);
    expect(result.bundleDetected).toBe(true);
    expect(result.fundingSourceOverlap).toBe(true);
    expect(result.fundingEvidenceStatus).toBe("overlap_observed");
    expect(result.token2022Flags.join(" ")).toContain("Transfer Hook");
  });

  it("يعيد حالة غير متاحة عند فشل RPC ولا يحول الفشل إلى إشارة سلبية أو آمنة", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network unavailable"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await inspectOnchainSecurity(candidate, []);
    const retry = await inspectOnchainSecurity(candidate, []);

    expect(result.status).toBe("unavailable");
    expect(result.bundleDetected).toBeNull();
    expect(result.fundingSourceOverlap).toBeNull();
    expect(result.fundingEvidenceStatus).toBe("unavailable");
    expect(result.flags.join(" ")).toContain("غير متاح");
    expect(retry.status).toBe("unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("يفرق بين عدم رصد تداخل في نافذة RPC العامة وبين تعذر المصدر", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };
      const address = request.params[0];
      if (request.method === "getTokenLargestAccounts" && address === "mint") return rpcResponse({ value: [{ address: "accountA" }, { address: "accountB" }] });
      if (request.method === "getMultipleAccounts") return rpcResponse({ value: [{ data: { parsed: { info: { owner: "ownerA" } } } }, { data: { parsed: { info: { owner: "ownerB" } } } }] });
      if (request.method === "getAccountInfo") return rpcResponse({ value: { owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", data: { parsed: { info: {} } } } });
      if (request.method === "getSignaturesForAddress" && (address === "pair" || address === "ownerA" || address === "ownerB")) return rpcResponse([]);
      throw new Error(`unexpected RPC call ${request.method}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await inspectOnchainSecurity(candidate, []);

    expect(result.status).toBe("available");
    expect(result.fundingSourceOverlap).toBe(false);
    expect(result.fundingEvidenceStatus).toBe("no_overlap_public_window");
  });

  it("يفضّل Helius الخادمي وسجلّه المفهرس عندما يتوافر المفتاح الاختياري", async () => {
    vi.stubEnv("HELIUS_API_KEY", "server-only-test-key");
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.startsWith("https://api.helius.xyz/")) return { ok: true, json: async () => [] };
      const request = JSON.parse(String(init?.body)) as { method: string; params: unknown[] };
      const address = request.params[0];
      if (request.method === "getTokenLargestAccounts" && address === "mint") return rpcResponse({ value: [{ address: "accountA" }, { address: "accountB" }] });
      if (request.method === "getMultipleAccounts") return rpcResponse({ value: [{ data: { parsed: { info: { owner: "ownerA" } } } }, { data: { parsed: { info: { owner: "ownerB" } } } }] });
      if (request.method === "getAccountInfo") return rpcResponse({ value: { owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", data: { parsed: { info: {} } } } });
      if (request.method === "getSignaturesForAddress" && address === "pair") return rpcResponse([]);
      throw new Error(`unexpected RPC call ${request.method}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await inspectOnchainSecurity(candidate, []);

    expect(result.status).toBe("available");
    expect(result.fundingEvidenceStatus).toBe("no_overlap_indexed_window");
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("https://mainnet.helius-rpc.com/?api-key=server-only-test-key"))).toBe(true);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith("https://api.helius.xyz/")).length).toBe(2);
  });
});
