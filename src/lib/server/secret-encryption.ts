import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

// Gap checklist Module 16's app-level secret management sub-item ("encrypted secret storage"),
// built per explicit user direction. Every other secret in this codebase (ApiKey.secret,
// ExternalIntegration.secretConfig, the inbound-webhook signing secret) is plaintext at rest --
// a deliberate, already-accepted precedent this pass does NOT change everywhere, only for
// TenantAppSecret, per the user's own scoped decision.
//
// AES-256-GCM with a server-held key, deliberately NOT a third-party KMS (no such service is
// reachable from this sandbox). The key falls back to a SHA-256 digest of JWT_SECRET when
// MARKETPLACE_SECRET_ENCRYPTION_KEY isn't set, mirroring FILE_DOWNLOAD_SIGNING_SECRET's own
// established "falls back to JWT_SECRET if unset" precedent (signed-urls.ts) -- so this works
// in every environment that already has working auth (including every existing test), while
// production can still set a distinct dedicated key.
//
// Round-2 plan O1: production no longer falls back to JWT_SECRET, so rotating JWT_SECRET (sign
// everyone out) can never make stored secrets unreadable. Set MARKETPLACE_SECRET_ENCRYPTION_KEY
// once, to the current JWT_SECRET value on an existing install, and never change it without a
// re-encrypt step.
function getEncryptionKey(): Buffer {
  const configured = process.env.MARKETPLACE_SECRET_ENCRYPTION_KEY;
  if (!configured && process.env.NODE_ENV === "production") throw new Error("Missing env var: MARKETPLACE_SECRET_ENCRYPTION_KEY");
  const source = configured || process.env.JWT_SECRET;
  if (!source) throw new Error("Missing env var: MARKETPLACE_SECRET_ENCRYPTION_KEY (or JWT_SECRET fallback)");
  return createHash("sha256").update(source).digest();
}

const CIPHERTEXT_VERSION = "v1";

export function encryptSecretAtRest(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [CIPHERTEXT_VERSION, iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptSecretAtRest(ciphertext: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 4 || parts[0] !== CIPHERTEXT_VERSION) throw new Error("Unsupported or corrupt secret ciphertext");
  const [, ivB64, tagB64, dataB64] = parts;
  const key = getEncryptionKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}

// Convenience for the common "decrypt if present, pass through null" shape every call site needs.
export function decryptSecretAtRestOrNull(ciphertext: string | null | undefined): string | null {
  if (!ciphertext) return null;
  return decryptSecretAtRest(ciphertext);
}
