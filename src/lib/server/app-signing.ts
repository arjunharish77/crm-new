import { createHmac } from "crypto";
import { decryptSecretAtRestOrNull } from "@/lib/server/secret-encryption";

// Webhook signatures for marketplace app deliveries. After the signing secret is rotated, the
// old one stays valid for 24 hours: deliveries carry x-app-signature (new secret) and
// x-app-signature-previous (old secret), so a receiver still on the old secret keeps verifying.

export const APP_SIGNING_COLUMNS = `"signingSecret", "previousSigningSecret", "previousSigningSecretExpiresAt"`;

export type AppSigningRow = { signingSecret: string | null; previousSigningSecret?: string | null; previousSigningSecretExpiresAt?: string | Date | null } | null | undefined;

function sign(secret: string, timestamp: string, rawBody: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

export function appSignatureHeaders(row: AppSigningRow, timestamp: string, rawBody: string, now = Date.now()): Record<string, string> {
  const headers: Record<string, string> = {};
  const current = decryptSecretAtRestOrNull(row?.signingSecret ?? null);
  if (current) headers["x-app-signature"] = sign(current, timestamp, rawBody);
  const expires = row?.previousSigningSecretExpiresAt ? new Date(row.previousSigningSecretExpiresAt).getTime() : 0;
  if (row?.previousSigningSecret && expires > now) {
    const previous = decryptSecretAtRestOrNull(row.previousSigningSecret);
    if (previous) headers["x-app-signature-previous"] = sign(previous, timestamp, rawBody);
  }
  return headers;
}
