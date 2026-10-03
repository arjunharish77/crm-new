-- Rotating a marketplace app's webhook signing secret (decision follow-up, 2026-10-03): rotating
-- the API secret no longer returns the signing secret, so a lost signing secret is replaced by
-- rotating it. The old one keeps signing deliveries (as x-app-signature-previous) for 24 hours so
-- receivers can switch without dropping messages.
alter table "TenantAppSecret"
  add column if not exists "previousSigningSecret" text,
  add column if not exists "previousSigningSecretExpiresAt" timestamptz,
  add column if not exists "signingSecretRotatedAt" timestamptz;
