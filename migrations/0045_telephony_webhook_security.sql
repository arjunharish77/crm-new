-- Priority Module 15 -- Telephony: secure the inbound call-event webhook and make it
-- idempotent against provider retries. The webhook previously authenticated with a single
-- global static secret (WEBHOOK_SIGNING_SECRET) shared across every tenant -- the same class
-- of vulnerability fixed for the inbound-lead webhook earlier this session -- and had no
-- unique constraint to stop a retried event from creating a duplicate call log + duplicate
-- Activity every time a provider resends the same event (a normal, expected occurrence).

alter table "TelephonyCallLog"
  add constraint "TelephonyCallLog_tenantId_provider_callId_key" unique ("tenantId", provider, "callId");
