import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// Every API handler of every switchable (non-core) tenant module must reach a module or
// overlapping feature-flag entitlement check (scripts/audit-module-gates.cjs; exceptions there
// are allow-listed with a reason). Fails CI when a new route/handler skips its module gate.
describe("module gate audit", () => {
  it("finds no API handler of a switchable module without an entitlement check", () => {
    let output = "";
    let failed = false;
    try {
      output = execFileSync(process.execPath, ["scripts/audit-module-gates.cjs"], { encoding: "utf8" });
    } catch (error: any) {
      failed = true;
      output = String(error.stdout ?? error.message);
    }
    const unchecked = output.split("\n").filter((line) => line.includes("unchecked handlers"));
    expect(unchecked).toEqual([]);
    expect(failed).toBe(false);
  }, 60_000);
});
