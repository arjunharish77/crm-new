-- Priority Module 15 -- Telephony: call recording support.
-- TelephonyCallLog already had "recordingUrl" (set by the webhook/click-to-call paths), but
-- nothing else this bullet asks for existed: no retention/expiry, no transcript placeholder,
-- no restricted playback/download gate, no audit log for who actually played or downloaded a
-- recording. Confirmed by audit before building: this app's ExportRequest.expiresAt +
-- getExportDownloadForUser (migration 0044_export_governance.sql) is the closest existing
-- retention/audit-gated-download pattern, and this migration/pass follows that same shape --
-- see src/lib/server/call-recordings.ts.

alter table "TelephonyCallLog"
  add column if not exists "transcript" text,
  add column if not exists "recordingExpiresAt" timestamptz;
