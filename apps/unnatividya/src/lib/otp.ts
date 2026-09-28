import { createHash, randomInt, timingSafeEqual } from "crypto";

// F26-pattern fix (WP16, found during the F27 endpoint inventory): this used to be a module-level
// `const` evaluated once at import time, so an unset env var would silently and *permanently*
// lock this process into the well-known "dev-secret-change-me" value for every OTP hash it ever
// computes -- in production that's the same class of forgeable-secret bug as admin-auth.ts's
// sessionSecret() (see the F26 fix there). Make it a lazy, per-call check with the same fail-
// closed-in-production rule, keeping the zero-config dev/test fallback.
function otpSecret() {
  const secret = process.env.UNNATIVIDYA_SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "UNNATIVIDYA_SESSION_SECRET must be set in production -- refusing to hash or verify lead OTPs with the insecure development default.",
    );
  }
  return "dev-secret-change-me";
}

export function createOtp() {
  return String(randomInt(1000, 9999));
}

export function hashOtp(otp: string) {
  return createHash("sha256").update(`${otp}:${otpSecret()}`).digest("hex");
}

export function verifyOtpHash(otp: string, hash: string) {
  const incoming = Buffer.from(hashOtp(otp));
  const stored = Buffer.from(hash);
  return incoming.length === stored.length && timingSafeEqual(incoming, stored);
}
