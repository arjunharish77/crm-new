import { describe, expect, it } from "vitest";
import { decryptSecretAtRest, decryptSecretAtRestOrNull, encryptSecretAtRest } from "@/lib/server/secret-encryption";

// Gap checklist Module 16's app-level secret management sub-item ("encrypted secret storage"),
// built per explicit user direction. Falls back to a SHA-256 digest of JWT_SECRET when
// MARKETPLACE_SECRET_ENCRYPTION_KEY isn't set -- tests/setup.ts already sets JWT_SECRET, so this
// works with zero new test configuration.
describe("secret-encryption", () => {
  it("round-trips a plaintext secret through encrypt/decrypt", () => {
    const ciphertext = encryptSecretAtRest("super-secret-value");
    expect(ciphertext).not.toBe("super-secret-value");
    expect(decryptSecretAtRest(ciphertext)).toBe("super-secret-value");
  });

  it("produces a different ciphertext each time (random IV), even for the same plaintext", () => {
    const first = encryptSecretAtRest("same-value");
    const second = encryptSecretAtRest("same-value");
    expect(first).not.toBe(second);
    expect(decryptSecretAtRest(first)).toBe("same-value");
    expect(decryptSecretAtRest(second)).toBe("same-value");
  });

  it("rejects a tampered ciphertext (GCM auth tag catches modification)", () => {
    const ciphertext = encryptSecretAtRest("original-value");
    const parts = ciphertext.split(":");
    // Flip the last character of the encrypted-data segment.
    const tamperedData = parts[3].slice(0, -1) + (parts[3].slice(-1) === "A" ? "B" : "A");
    const tampered = [parts[0], parts[1], parts[2], tamperedData].join(":");
    expect(() => decryptSecretAtRest(tampered)).toThrow();
  });

  it("rejects an unsupported ciphertext version or malformed shape", () => {
    expect(() => decryptSecretAtRest("not-a-real-ciphertext")).toThrow("Unsupported or corrupt secret ciphertext");
    expect(() => decryptSecretAtRest("v2:aa:bb:cc")).toThrow("Unsupported or corrupt secret ciphertext");
  });

  describe("decryptSecretAtRestOrNull", () => {
    it("passes through null/undefined without attempting to decrypt", () => {
      expect(decryptSecretAtRestOrNull(null)).toBeNull();
      expect(decryptSecretAtRestOrNull(undefined)).toBeNull();
    });

    it("decrypts a real ciphertext", () => {
      const ciphertext = encryptSecretAtRest("value");
      expect(decryptSecretAtRestOrNull(ciphertext)).toBe("value");
    });
  });
});
