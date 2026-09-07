import { randomBytes, createHmac, timingSafeEqual } from "crypto";

// TOTP (RFC 6238) built directly on Node's crypto module rather than pulling in an auth-
// specific dependency (otplib, speakeasy, etc.) -- the algorithm itself is short and this way
// the security-critical code is fully auditable in one file rather than trusting a third-party
// implementation. QR rendering (a genuinely non-trivial algorithm -- Reed-Solomon error
// correction, not something to hand-roll) uses the `qrcode` package, which does no network
// calls and generates entirely locally.

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TIME_STEP_SECONDS = 30;
const CODE_DIGITS = 6;

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
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

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

// Standard `otpauth://` URI every authenticator app (Google Authenticator, Authy, 1Password,
// etc.) recognizes for QR-code enrollment.
export function generateTotpUri(secret: string, accountEmail: string, issuer = "CRM") {
  const label = encodeURIComponent(`${issuer}:${accountEmail}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: String(CODE_DIGITS), period: String(TIME_STEP_SECONDS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

// Exported (not just used internally) so tests can verify the core HOTP/truncation math
// directly against RFC 4226's canonical test vectors, independent of wall-clock timing.
export function hotpWithRawKey(key: Buffer, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  counterBuffer.writeUInt32BE(counter >>> 0, 4);

  const hmac = createHmac("sha1", key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(binary % 10 ** CODE_DIGITS).padStart(CODE_DIGITS, "0");
}

function hotp(secret: string, counter: number): string {
  return hotpWithRawKey(base32Decode(secret), counter);
}

function currentTimeStep(atMs: number) {
  return Math.floor(atMs / 1000 / TIME_STEP_SECONDS);
}

// Window of ±1 time step (±30s) tolerates ordinary clock drift between the server and the
// user's device without meaningfully widening the guessable window (an attacker still only
// gets 3 total 6-digit codes valid at any moment, same order of magnitude as no window at all).
// `atMs` defaults to the real clock but is injectable so tests aren't flaky near a 30s boundary.
export function verifyTotpToken(secret: string, token: string, windowSteps = 1, atMs: number = Date.now()): boolean {
  const cleanToken = token.replace(/\s/g, "");
  if (!/^\d{6}$/.test(cleanToken)) return false;
  const step = currentTimeStep(atMs);
  for (let offset = -windowSteps; offset <= windowSteps; offset++) {
    const candidate = hotp(secret, step + offset);
    const a = Buffer.from(candidate);
    const b = Buffer.from(cleanToken);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

// Backup codes: 10-character alphanumeric, grouped for readability (XXXX-XXXX), generated in
// batches of 10 -- the conventional count (enough to outlast a "lost my phone for a few weeks"
// scenario without an unreasonably large list to store/hash).
const BACKUP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // excludes visually ambiguous chars (I/O/0/1)

export function generateBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(8);
    let raw = "";
    for (const byte of bytes) raw += BACKUP_CODE_ALPHABET[byte % BACKUP_CODE_ALPHABET.length];
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4, 8)}`);
  }
  return codes;
}
