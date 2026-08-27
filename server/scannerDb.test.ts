import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn() }));

import { getDb } from "./db";
import { acquireScannerRunLock, promoteEarlyDiscoveries, releaseScannerRunLock, SCANNER_LOCKED_MESSAGE } from "./scannerDb";
import type { ScoredCandidate } from "./scanner/types";

const mockedGetDb = vi.mocked(getDb);

function buildDb(activeLockToken: string) {
  const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ onConflictDoUpdate }) });
  const select = vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ scopeKey: "global-scanner", lockToken: activeLockToken, lockedAt: new Date() }]) }) }) });
  const deleteWhere = vi.fn().mockResolvedValue(undefined);
  const remove = vi.fn().mockReturnValue({ where: deleteWhere });
  return { db: { insert, select, delete: remove }, onConflictDoUpdate, deleteWhere };
}

describe("shared scanner run lock", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts the caller that owns the database lock", async () => {
    const fixture = buildDb("owner-token");
    mockedGetDb.mockResolvedValue(fixture.db as never);

    await expect(acquireScannerRunLock("owner-token")).resolves.toBeUndefined();
    expect(fixture.onConflictDoUpdate).toHaveBeenCalledTimes(1);
  });

  it("rejects a caller when another process owns the active lock", async () => {
    const fixture = buildDb("worker-token");
    mockedGetDb.mockResolvedValue(fixture.db as never);

    await expect(acquireScannerRunLock("manual-token")).rejects.toThrow(SCANNER_LOCKED_MESSAGE);
  });

  it("releases only a lock associated with the caller token", async () => {
    const fixture = buildDb("owner-token");
    mockedGetDb.mockResolvedValue(fixture.db as never);

    await releaseScannerRunLock("owner-token");
    expect(fixture.deleteWhere).toHaveBeenCalledTimes(1);
  });
});

describe("early watch promotion", () => {
  beforeEach(() => vi.clearAllMocks());

  it("promotes an early watch once and preserves its confirmed state on the next scan", async () => {
    const returning = vi.fn().mockResolvedValueOnce([{ id: 1 }]).mockResolvedValueOnce([]);
    const updateWhere = vi.fn().mockReturnValue({ returning });
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    const confirmedAlertInsert = vi.fn().mockResolvedValue(undefined);
    const tx = {
      update: vi.fn().mockReturnValue({ set: updateSet }),
      insert: vi.fn().mockReturnValue({ values: confirmedAlertInsert }),
    };
    const db = {
      transaction: vi.fn(async (callback) => callback(tx)),
    };
    mockedGetDb.mockResolvedValue(db as never);
    const candidate = { baseAddress: "mint", symbol: "TEST" } as ScoredCandidate;

    await expect(promoteEarlyDiscoveries([candidate], 42)).resolves.toEqual([candidate]);
    await expect(promoteEarlyDiscoveries([candidate], 43)).resolves.toEqual([]);

    expect(updateSet).toHaveBeenCalledTimes(2);
    expect(updateSet.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ stage: "confirmed", confirmationScanRunId: 42, confirmedAt: expect.any(Date), confirmedAlerted: true }));
    expect(updateWhere).toHaveBeenCalledTimes(2);
    expect(confirmedAlertInsert).toHaveBeenCalledTimes(1);
    expect(confirmedAlertInsert.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ alertType: "confirmed_alert", channel: "in_app", deliveryStatus: "sent" }));
  });
});
