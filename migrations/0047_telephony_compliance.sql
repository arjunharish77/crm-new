-- Priority Module 15 -- Telephony compliance and consent controls.
-- Reuses the existing marketing-communications suppression/consent tables (CommunicationSuppression,
-- CommunicationConsent) rather than building a parallel do-not-call list -- both already
-- support EMAIL/WHATSAPP/SMS with the exact per-address and per-entity shape a phone DND/
-- opt-out list needs; only their channel CHECK constraint needs to widen to accept PHONE.

alter table "CommunicationSuppression" drop constraint if exists "CommunicationSuppression_channel_check";
alter table "CommunicationSuppression" add constraint "CommunicationSuppression_channel_check"
  check ("channel" in ('EMAIL', 'WHATSAPP', 'SMS', 'PHONE'));

alter table "CommunicationConsent" drop constraint if exists "CommunicationConsent_channel_check";
alter table "CommunicationConsent" add constraint "CommunicationConsent_channel_check"
  check ("channel" in ('EMAIL', 'WHATSAPP', 'SMS', 'PHONE'));
