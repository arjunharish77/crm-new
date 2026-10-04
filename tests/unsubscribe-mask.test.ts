import { describe, expect, it } from "vitest";
import { maskRecipient } from "@/lib/mask-recipient";

describe("unsubscribe page masks the recipient (round-2 plan S17)", () => {
  it("masks emails and phone numbers", () => {
    expect(maskRecipient("priya.sharma@example.com")).toBe("p******@e***.com");
    expect(maskRecipient("ab@x.in")).toBe("a**@x***.in");
    expect(maskRecipient("+91 98765 43210")).toBe("******3210");
    expect(maskRecipient("12")).toBe("****");
    expect(maskRecipient(null)).toBe("");
  });
});
