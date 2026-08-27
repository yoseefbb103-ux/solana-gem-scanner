import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn() }));

import { getDb } from "./db";
import { acquireScannerRunLock, releaseScannerRunLock, SCANNER_LOCKED_MESSAGE } from "./scannerDb";

const mockedGetDb = vi.mocked(getDb);

function buildDb(activeLockToken: string) {
  const onDuplicateKeyUpdate = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ onDuplicateKeyUpdate }) });
  const select = vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([{ scopeKey: "global-scanner", lockToken: activeLockToken, lockedAt: new Date() }]) }) }) });
  const deleteWhere = vi.fn().mockResolvedValue(undefined);
  const remove = vi.fn().mockReturnValue({ where: deleteWhere });
  return { db: { insert, select, delete: remove }, onDuplicateKeyUpdate, deleteWhere };
}

describe("shared scanner run lock", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts the caller that owns the database lock", async () => {
    const fixture = buildDb("owner-token");
    mockedGetDb.mockResolvedValue(fixture.db as never);

    await expect(acquireScannerRunLock("owner-token")).resolves.toBeUndefined();
    expect(fixture.onDuplicateKeyUpdate).toHaveBeenCalledTimes(1);
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
