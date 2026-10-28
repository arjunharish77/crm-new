import { describe, expect, it } from "vitest";
import { isValidUserPhone, userPhoneForStorage } from "@/lib/user-phone";

describe("agent profile phone", () => {
  it("accepts international and national numbers while leaving the country-code decision to the connector", () => {
    expect(userPhoneForStorage(" +91 98765 43210 ")).toBe("+91 98765 43210");
    expect(userPhoneForStorage("98765 43210")).toBe("98765 43210");
    expect(userPhoneForStorage("0091 98765 43210")).toBe("0091 98765 43210");
    expect(userPhoneForStorage("")).toBeNull();
    expect(isValidUserPhone("")).toBe(true);
  });

  it("rejects text and numbers that cannot be dialed", () => {
    for (const value of ["call me", "12345", "+1+1234567890", "+00919876543210", "12345678901234567890"]) {
      expect(isValidUserPhone(value)).toBe(false);
      expect(() => userPhoneForStorage(value)).toThrow("USER_PHONE_INVALID");
    }
  });
});
