import { createHmac, timingSafeEqual } from "crypto";

// True expiring signed URLs (gap checklist: "secure file/download controls"). What existed
// before this was a server-side status/timestamp CHECK on an otherwise-permanent path (e.g.
// ExportRequest.expiresAt) -- real, but not cryptographically time-limited: the same URL/id
// works for anyone who has it, for as long as the underlying row says so, with no way to issue
// a fresh, independently shorter-lived link for a specific share. A signed token embeds its
// own expiry and is verified with HMAC-SHA256, so a link generated "expires in 1 hour" actually
// does, regardless of how long the underlying resource itself remains valid.
// Round-2 plan O1: production needs its own FILE_DOWNLOAD_SIGNING_SECRET (no JWT_SECRET fallback),
// so rotating JWT_SECRET doesn't break download links already sent out.
function getSigningSecret() {
  if (!process.env.FILE_DOWNLOAD_SIGNING_SECRET && process.env.NODE_ENV === "production") throw new Error("MISSING_SIGNING_SECRET");
  const secret = process.env.FILE_DOWNLOAD_SIGNING_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error("MISSING_SIGNING_SECRET");
  return secret;
}

function sign(payload: string) {
  return createHmac("sha256", getSigningSecret()).update(payload).digest("hex");
}

export function generateSignedDownloadToken(resource: string, resourceId: string, expiresInSeconds: number) {
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payload = `${resource}:${resourceId}:${expiresAt}`;
  return { token: `${expiresAt}.${sign(payload)}`, expiresAt };
}

export type VerifyResult = { valid: true } | { valid: false; reason: "MALFORMED_TOKEN" | "EXPIRED" | "INVALID_SIGNATURE" };

export function verifySignedDownloadToken(resource: string, resourceId: string, token: string | null): VerifyResult {
  if (!token) return { valid: false, reason: "MALFORMED_TOKEN" };
  const separatorIndex = token.indexOf(".");
  if (separatorIndex === -1) return { valid: false, reason: "MALFORMED_TOKEN" };
  const expiresAtRaw = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || !signature) return { valid: false, reason: "MALFORMED_TOKEN" };
  if (Math.floor(Date.now() / 1000) > expiresAt) return { valid: false, reason: "EXPIRED" };

  const expected = sign(`${resource}:${resourceId}:${expiresAt}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  // Constant-time compare -- a naive `signature === expected` would leak timing information
  // about how many leading characters matched, letting an attacker brute-force the signature
  // byte-by-byte. Length must be checked before timingSafeEqual, which throws on mismatched
  // buffer lengths rather than returning false.
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { valid: false, reason: "INVALID_SIGNATURE" };
  return { valid: true };
}
