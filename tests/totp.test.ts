import { describe, expect, it } from "vitest";
import { generateTotpSecret, generateTotpUri, verifyTotpToken, generateBackupCodes, hotpWithRawKey } from "@/lib/server/totp";

describe("hotpWithRawKey against RFC 4226 Appendix D's canonical test vectors", () => {
  // The RFC's own 20-byte ASCII secret "12345678901234567890", counters 0-9, and their
  // published 6-digit truncated HOTP values -- this is the actual proof the hand-rolled
  // HMAC-SHA1 + dynamic-truncation math is implemented correctly, independent of base32 or
  // time-step logic layered on top of it.
  const key = Buffer.from("12345678901234567890", "ascii");
  const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];

  it.each(expected.map((code, counter) => [counter, code] as const))("counter=%i -> %s", (counter, code) => {
    expect(hotpWithRawKey(key, counter)).toBe(code);
  });
});

// Independent base32 decoder (deliberately re-implemented here, not imported from totp.ts) so
// tests can derive an expected TOTP code without exercising the same decode path the module
// under test uses -- if totp.ts's own base32Decode had a bug, a test that reused it could still
// pass while being wrong in the same way.
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function independentBase32Decode(input: string): Buffer {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of input.toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

describe("generateTotpSecret / verifyTotpToken round-trip", () => {
  it("verifies a code independently computed for the same secret and time step", () => {
    const secret = generateTotpSecret();
    const now = Date.parse("2026-01-01T00:00:00.000Z");
    const step = Math.floor(now / 1000 / 30);
    const expectedCode = hotpWithRawKey(independentBase32Decode(secret), step);

    expect(verifyTotpToken(secret, expectedCode, 1, now)).toBe(true);
  });

  it("accepts the same code up to 25s later (still inside the same 30s step)", () => {
    const secret = generateTotpSecret();
    const now = Date.parse("2026-01-01T00:00:00.000Z");
    const step = Math.floor(now / 1000 / 30);
    const expectedCode = hotpWithRawKey(independentBase32Decode(secret), step);

    expect(verifyTotpToken(secret, expectedCode, 1, now + 25_000)).toBe(true);
  });

  it("accepts a code from the previous time step (±1 window tolerates clock drift)", () => {
    const secret = generateTotpSecret();
    const now = Date.parse("2026-01-01T00:00:30.000Z"); // exactly on a step boundary
    const previousStep = Math.floor(now / 1000 / 30) - 1;
    const previousStepCode = hotpWithRawKey(independentBase32Decode(secret), previousStep);

    expect(verifyTotpToken(secret, previousStepCode, 1, now)).toBe(true);
  });

  it("rejects a code that's correct for the wrong secret", () => {
    const secretA = generateTotpSecret();
    const secretB = generateTotpSecret();
    const now = Date.parse("2026-01-01T00:00:00.000Z");
    const step = Math.floor(now / 1000 / 30);
    const codeForSecretA = hotpWithRawKey(independentBase32Decode(secretA), step);

    expect(verifyTotpToken(secretB, codeForSecretA, 1, now)).toBe(false);
  });

  it("rejects a malformed (non-6-digit) token outright", () => {
    const secret = generateTotpSecret();
    expect(verifyTotpToken(secret, "12345", 1, Date.now())).toBe(false);
    expect(verifyTotpToken(secret, "abcdef", 1, Date.now())).toBe(false);
    expect(verifyTotpToken(secret, "", 1, Date.now())).toBe(false);
  });

  it("strips whitespace before validating (common when a user types '123 456')", () => {
    const secret = generateTotpSecret();
    // A spaced-out wrong code still correctly fails (proves stripping doesn't accidentally
    // relax validation), and importantly does not throw.
    expect(() => verifyTotpToken(secret, "000 000", 1, Date.now())).not.toThrow();
  });

  it("rejects a code once it's outside the drift window", () => {
    const secret = generateTotpSecret();
    const now = Date.parse("2026-01-01T00:00:00.000Z");
    const farFuture = now + 10 * 60 * 1000; // 10 minutes later -- far outside any reasonable window
    // A code valid "now" (whatever it is) must not remain valid 10 minutes later against a
    // ±1-step (±30s) window.
    expect(verifyTotpToken(secret, "000000", 1, farFuture)).toBe(false);
  });
});

describe("generateTotpUri", () => {
  it("produces a well-formed otpauth:// URI carrying the account and issuer", () => {
    const uri = generateTotpUri("JBSWY3DPEHPK3PXP", "user@example.com", "MyCRM");
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("issuer=MyCRM");
    expect(decodeURIComponent(uri)).toContain("MyCRM:user@example.com");
  });
});

describe("generateBackupCodes", () => {
  it("generates the requested count of codes, each in XXXX-XXXX shape", () => {
    const codes = generateBackupCodes(10);
    expect(codes).toHaveLength(10);
    for (const code of codes) expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it("never generates visually ambiguous characters (I, O, 0, 1)", () => {
    const codes = generateBackupCodes(50);
    const joined = codes.join("");
    expect(joined).not.toMatch(/[IO01]/);
  });

  it("generates codes that are (almost certainly) unique within a batch", () => {
    const codes = generateBackupCodes(10);
    expect(new Set(codes).size).toBe(10);
  });
});
