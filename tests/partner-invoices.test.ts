import { describe, it, expect } from "vitest";
import { formatInvoiceNumber, getCurrentFinancialYear, computeTaxSplit } from "@/lib/server/partner-invoices";

describe("formatInvoiceNumber", () => {
  it("simple {prefix}-{counter} pattern", () => {
    expect(formatInvoiceNumber("{prefix}-{counter}", { prefix: "INV", counter: 1, fy: "" })).toBe("INV-1");
    expect(formatInvoiceNumber("{prefix}-{counter}", { prefix: "INV", counter: 42, fy: "" })).toBe("INV-42");
  });

  it("zero-pads the counter when a width is specified", () => {
    expect(formatInvoiceNumber("{prefix}/{counter:04d}", { prefix: "INV", counter: 7, fy: "" })).toBe("INV/0007");
    expect(formatInvoiceNumber("{counter:03d}", { prefix: "INV", counter: 1234, fy: "" })).toBe("1234"); // wider than pad width, unchanged
  });

  it("includes the financial year when the pattern references it", () => {
    expect(formatInvoiceNumber("{prefix}/{fy}/{counter:04d}", { prefix: "INV", counter: 3, fy: "2026-27" })).toBe(
      "INV/2026-27/0003"
    );
  });

  it("leaves unrecognized placeholders untouched", () => {
    expect(formatInvoiceNumber("{prefix}-{unknown}", { prefix: "INV", counter: 1, fy: "" })).toBe("INV-{unknown}");
  });
});

describe("getCurrentFinancialYear — Indian FY (Apr 1 - Mar 31)", () => {
  it("a date in January belongs to the FY that started the previous April", () => {
    expect(getCurrentFinancialYear(new Date("2026-01-15T00:00:00.000Z"))).toBe("2025-26");
  });

  it("March 31 is still the previous FY", () => {
    expect(getCurrentFinancialYear(new Date("2026-03-31T23:59:59.000Z"))).toBe("2025-26");
  });

  it("April 1 rolls into the new FY", () => {
    expect(getCurrentFinancialYear(new Date("2026-04-01T00:00:00.000Z"))).toBe("2026-27");
  });

  it("a date in December belongs to the FY that started that same year's April", () => {
    expect(getCurrentFinancialYear(new Date("2026-12-25T00:00:00.000Z"))).toBe("2026-27");
  });

  it("rolls the short year correctly across a century boundary", () => {
    expect(getCurrentFinancialYear(new Date("2099-06-01T00:00:00.000Z"))).toBe("2099-00");
  });
});

describe("computeTaxSplit — GST place-of-supply logic", () => {
  it("unregistered supplier: no GST at all, total equals taxable value", () => {
    const result = computeTaxSplit(1000, 18, "Karnataka", "Karnataka", false);
    expect(result).toEqual({ cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalAmount: 1000 });
  });

  it("same state: splits evenly into CGST + SGST, no IGST", () => {
    const result = computeTaxSplit(1000, 18, "Karnataka", "Karnataka", true);
    expect(result.cgstAmount).toBe(90);
    expect(result.sgstAmount).toBe(90);
    expect(result.igstAmount).toBe(0);
    expect(result.totalAmount).toBe(1180);
  });

  it("different states: full rate as IGST, no CGST/SGST", () => {
    const result = computeTaxSplit(1000, 18, "Karnataka", "Maharashtra", true);
    expect(result.cgstAmount).toBe(0);
    expect(result.sgstAmount).toBe(0);
    expect(result.igstAmount).toBe(180);
    expect(result.totalAmount).toBe(1180);
  });

  it("state comparison is case/whitespace insensitive", () => {
    const result = computeTaxSplit(1000, 18, "  karnataka ", "KARNATAKA", true);
    expect(result.igstAmount).toBe(0);
    expect(result.cgstAmount).toBe(90);
  });

  it("rounds to the nearest paisa rather than accumulating drift", () => {
    // 5.5% of 333 same-state -> 18.315 total tax -> 9.1575 each way -> rounds to 9.16 each
    const result = computeTaxSplit(333, 5.5, "Delhi", "Delhi", true);
    expect(result.cgstAmount).toBe(9.16);
    expect(result.sgstAmount).toBe(9.16);
  });

  it("treats a missing supplier or recipient state as different states (never silently assumes same-state)", () => {
    const result = computeTaxSplit(1000, 18, null, "Karnataka", true);
    expect(result.igstAmount).toBe(180);
    expect(result.cgstAmount).toBe(0);
  });
});
