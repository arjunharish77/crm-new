import { describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ executeAsSystem: vi.fn().mockResolvedValue(3) }));
vi.mock("@/lib/db/query", () => db);

import { HOUSEKEEPING_RULES, runHousekeeping } from "@/lib/server/housekeeping";

describe("housekeeping (round-2 plan B14)", () => {
  it("deletes in bounded batches, one statement per rule", async () => {
    const removed = await runHousekeeping(100);
    expect(db.executeAsSystem).toHaveBeenCalledTimes(HOUSEKEEPING_RULES.length);
    for (const [sql, values] of db.executeAsSystem.mock.calls) {
      expect(sql).toMatch(/^delete from "\w+" where id in \(select id from "\w+" where .+ limit \$1\)$/);
      expect(values).toEqual([100]);
    }
    expect(Object.values(removed).every((count) => count === 3)).toBe(true);
  });

  it("never removes unreviewed impersonation sessions or anything still pending", () => {
    const impersonation = HOUSEKEEPING_RULES.filter((rule) => rule.table === "UserSession" && rule.where.includes('"isImpersonation" = true'));
    expect(impersonation.every((rule) => rule.where.includes('"reviewedAt" is not null'))).toBe(true);
    for (const rule of HOUSEKEEPING_RULES.filter((item) => item.table === "WebhookOutbox" || item.table === "TenantAppDelivery")) {
      expect(rule.where).not.toMatch(/PENDING|SENDING/);
    }
  });
});
