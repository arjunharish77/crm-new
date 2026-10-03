import { describe, expect, it } from "vitest";
import { humanizeEnum, statusDisplay } from "@/lib/display/status";
import { formatMoney, formatMoneyCompact, formatPercent } from "@/lib/display/format";

describe("display maps (UI/UX plan §11.6 N)", () => {
  it("maps known values to a label and tone", () => {
    expect(statusDisplay("leadStatus", "QUALIFIED")).toEqual({ label: "Qualified", tone: "accent" });
    expect(statusDisplay("sla", "breached")).toEqual({ label: "Breached", tone: "danger" });
    expect(statusDisplay("outcome", "FOLLOW_UP_NEEDED")).toEqual({ label: "Follow-up needed", tone: "warning" });
    expect(statusDisplay("taskStatus", "in-progress")).toEqual({ label: "In progress", tone: "info" });
  });

  it("gives unknown and custom values a readable label and a neutral tone", () => {
    expect(statusDisplay("leadStatus", "NURTURE_LATER")).toEqual({ label: "Nurture later", tone: "neutral" });
    expect(statusDisplay("leadStatus", null)).toEqual({ label: "—", tone: "neutral" });
  });

  it("humanizes enums but leaves readable text alone", () => {
    expect(humanizeEnum("SMS_DELIVERY_FAILED")).toBe("SMS delivery failed");
    expect(humanizeEnum("not-attempted")).toBe("Not attempted");
    expect(humanizeEnum("Google Ads")).toBe("Google Ads");
    expect(humanizeEnum("Inbound Webhook")).toBe("Inbound Webhook");
    expect(humanizeEnum("")).toBe("");
  });
});

describe("money and number formatting (decision 4)", () => {
  it("defaults to INR with Indian grouping and no decimals for whole amounts", () => {
    expect(formatMoney(110000)).toBe("₹1,10,000");
    expect(formatMoney(1234.5)).toBe("₹1,234.50");
    expect(formatMoney("250000")).toBe("₹2,50,000");
    expect(formatMoney(null)).toBe("—");
  });

  it("formats other currencies with their own grouping", () => {
    expect(formatMoney(135000, { currency: "USD" })).toBe("$135,000");
  });

  it("compacts INR to lakh and crore", () => {
    expect(formatMoneyCompact(250000)).toBe("₹2.5L");
    expect(formatMoneyCompact(99525000)).toBe("₹10Cr");
    expect(formatMoneyCompact(15000000)).toBe("₹1.5Cr");
    expect(formatMoneyCompact(5000)).toBe("₹5,000");
  });

  it("formats percentages from fractions or percents", () => {
    expect(formatPercent(0.123)).toBe("12%");
    expect(formatPercent(77, { fromPercent: true })).toBe("77%");
  });
});
