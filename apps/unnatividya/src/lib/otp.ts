import { createHash, randomInt, timingSafeEqual } from "crypto";

const secret = process.env.UNNATIVIDYA_SESSION_SECRET || "dev-secret-change-me";

export function createOtp() {
  return String(randomInt(1000, 9999));
}

export function hashOtp(otp: string) {
  return createHash("sha256").update(`${otp}:${secret}`).digest("hex");
}

export function verifyOtpHash(otp: string, hash: string) {
  const incoming = Buffer.from(hashOtp(otp));
  const stored = Buffer.from(hash);
  return incoming.length === stored.length && timingSafeEqual(incoming, stored);
}
