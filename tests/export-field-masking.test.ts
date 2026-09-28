import { describe, expect, it } from "vitest";
import { maskExportRows } from "@/lib/server/exports";

// F03 fix (WP04): the Lead/Opportunity CSV/XLSX export query used friendly column headers
// ("Email", "Phone") rather than raw field keys, so it never consulted the field-permission
// model at all -- a field a user's role/template marks "hidden" was still fully exported. This
// maps header back to key so the same masking already applied to every other read surface in
// this work package (list/detail/reports/AI context) applies to exports too.
describe("maskExportRows", () => {
  const userWithHiddenPhone = {
    id: "user-1", tenantId: "tenant-1",
    role: { permissions: { fieldPermissions: { leads: { phone: "hidden" } } } },
  };

  it("nulls the aliased column for a field marked hidden", () => {
    const rows = [{ "Lead Name": "Alpha", Email: "a@x.com", Phone: "555-1234", Company: "Acme" }];
    const masked = maskExportRows(userWithHiddenPhone, "leads", rows);
    expect(masked[0].Phone).toBeNull();
    expect(masked[0].Email).toBe("a@x.com"); // unrelated column unaffected
  });

  it("is a no-op when no fieldPermissions are configured (backward compatible default)", () => {
    const rows = [{ "Lead Name": "Alpha", Email: "a@x.com", Phone: "555-1234" }];
    const masked = maskExportRows({ id: "user-1", tenantId: "tenant-1" }, "leads", rows);
    expect(masked).toEqual(rows);
  });

  it("masks the Opportunity export's own aliased columns independently", () => {
    const userWithHiddenAmount = {
      id: "user-1", tenantId: "tenant-1",
      role: { permissions: { fieldPermissions: { opportunities: { amount: "hidden" } } } },
    };
    const rows = [{ Opportunity: "Big Deal", Amount: 50000, Priority: "HIGH" }];
    const masked = maskExportRows(userWithHiddenAmount, "opportunities", rows);
    expect(masked[0].Amount).toBeNull();
    expect(masked[0].Opportunity).toBe("Big Deal");
  });

  it("masks multiple rows, not just the first", () => {
    const rows = [
      { "Lead Name": "Alpha", Phone: "555-1111" },
      { "Lead Name": "Beta", Phone: "555-2222" },
    ];
    const masked = maskExportRows(userWithHiddenPhone, "leads", rows);
    expect(masked.map((row) => row.Phone)).toEqual([null, null]);
  });
});
