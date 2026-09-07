import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("FILE_DOWNLOAD_SIGNING_SECRET", "test-signing-secret");

import { generateSignedDownloadToken, verifySignedDownloadToken } from "@/lib/server/signed-urls";

beforeEach(() => {
  vi.useRealTimers();
});

describe("generateSignedDownloadToken / verifySignedDownloadToken", () => {
  it("verifies a freshly generated token as valid", () => {
    const { token } = generateSignedDownloadToken("export-request", "export-1", 3600);
    expect(verifySignedDownloadToken("export-request", "export-1", token)).toEqual({ valid: true });
  });

  it("rejects a token generated for a different resourceId", () => {
    const { token } = generateSignedDownloadToken("export-request", "export-1", 3600);
    expect(verifySignedDownloadToken("export-request", "export-2", token)).toMatchObject({ valid: false, reason: "INVALID_SIGNATURE" });
  });

  it("rejects a token generated for a different resource type", () => {
    const { token } = generateSignedDownloadToken("export-request", "export-1", 3600);
    expect(verifySignedDownloadToken("partner-invoice", "export-1", token)).toMatchObject({ valid: false, reason: "INVALID_SIGNATURE" });
  });

  it("rejects a tampered signature", () => {
    const { token } = generateSignedDownloadToken("export-request", "export-1", 3600);
    const [expiresAt] = token.split(".");
    const tampered = `${expiresAt}.${"0".repeat(64)}`;
    expect(verifySignedDownloadToken("export-request", "export-1", tampered)).toMatchObject({ valid: false, reason: "INVALID_SIGNATURE" });
  });

  it("rejects an expired token", () => {
    const { token } = generateSignedDownloadToken("export-request", "export-1", -10);
    expect(verifySignedDownloadToken("export-request", "export-1", token)).toMatchObject({ valid: false, reason: "EXPIRED" });
  });

  it("rejects a malformed token", () => {
    expect(verifySignedDownloadToken("export-request", "export-1", "not-a-real-token")).toMatchObject({ valid: false, reason: "MALFORMED_TOKEN" });
  });

  it("rejects a null token", () => {
    expect(verifySignedDownloadToken("export-request", "export-1", null)).toMatchObject({ valid: false, reason: "MALFORMED_TOKEN" });
  });

  it("issues a token whose expiresAt matches the requested TTL", () => {
    const before = Math.floor(Date.now() / 1000);
    const { expiresAt } = generateSignedDownloadToken("export-request", "export-1", 60);
    expect(expiresAt).toBeGreaterThanOrEqual(before + 59);
    expect(expiresAt).toBeLessThanOrEqual(before + 61);
  });
});
