import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

describe("Render database bootstrap", () => {
  it("aborts clearly when DATABASE_URL is missing", async () => {
    await expect(execFileAsync("node", ["scripts/ensure-db.mjs"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: "" },
    })).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("DATABASE_URL is required"),
    });
  });
});
