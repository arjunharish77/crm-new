const { createHash, timingSafeEqual } = require("crypto");
const { Client } = require("pg");
const dotenv = require("dotenv");

dotenv.config({ path: ".env" });

const connectionString =
  process.env.UNNATIVIDYA_DATABASE_URL ||
  "postgresql://unnatividya_app:unnatividya_app@localhost:5432/unnatividya";
const secret = process.env.UNNATIVIDYA_SESSION_SECRET || "dev-secret-change-me";

function hashOtp(otp) {
  return createHash("sha256").update(`${otp}:${secret}`).digest("hex");
}

function verifyOtpHash(otp, hash) {
  const incoming = Buffer.from(hashOtp(otp));
  const stored = Buffer.from(hash);
  return incoming.length === stored.length && timingSafeEqual(incoming, stored);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  const marker = `smoke-${Date.now()}@unnatividya.test`;
  let leadId;

  try {
    const lead = await client.query(
      `insert into lead_capture (
         name, email, phone, city, source_path, source_page_type, consent_accepted, crm_sync_status
       )
       values ($1, $2, $3, $4, $5, $6, true, 'DISABLED')
       returning id, email_otp_verified, phone_otp_verified, crm_sync_status`,
      ["Smoke Learner", marker, "9999999999", "Bengaluru", "/smoke", "smoke_test"],
    );
    leadId = lead.rows[0].id;
    assert(lead.rows[0].email_otp_verified === false, "New lead should start email-unverified");
    assert(lead.rows[0].phone_otp_verified === false, "New lead should start phone-unverified");
    assert(lead.rows[0].crm_sync_status === "DISABLED", "New lead should not auto-push to CRM");

    const otp = "4321";
    const otpRequest = await client.query(
      `insert into otp_request (
         lead_capture_id, channel, purpose, target, otp_hash, expires_at, provider, provider_status
       )
       values ($1, 'EMAIL', 'LEAD_VERIFY', $2, $3, now() + interval '10 minutes', 'smoke', 'created')
       returning id, otp_hash, attempts`,
      [leadId, marker, hashOtp(otp)],
    );
    const otpRequestId = otpRequest.rows[0].id;
    assert(verifyOtpHash("0000", otpRequest.rows[0].otp_hash) === false, "Wrong OTP should not verify");
    await client.query("update otp_request set attempts = attempts + 1 where id = $1", [otpRequestId]);

    const attempts = await client.query("select attempts from otp_request where id = $1", [otpRequestId]);
    assert(attempts.rows[0].attempts === 1, "Invalid OTP attempt should increment attempts");
    assert(verifyOtpHash(otp, otpRequest.rows[0].otp_hash) === true, "Correct OTP should verify");

    await client.query("update otp_request set verified_at = now() where id = $1", [otpRequestId]);
    await client.query(
      `update lead_capture
       set email_otp_verified = true, email_verified_at = now(), updated_at = now()
       where id = $1`,
      [leadId],
    );
    await client.query(
      `insert into lead_event (lead_capture_id, event_type, metadata)
       values ($1, 'EMAIL_OTP_VERIFIED', '{}'::jsonb)`,
      [leadId],
    );

    const verified = await client.query(
      `select email_otp_verified, email_verified_at
       from lead_capture
       where id = $1`,
      [leadId],
    );
    assert(verified.rows[0].email_otp_verified === true, "Lead should be marked email-verified");
    assert(Boolean(verified.rows[0].email_verified_at), "Lead should have email verified timestamp");

    const events = await client.query(
      `select count(*)::int as count
       from lead_event
       where lead_capture_id = $1 and event_type = 'EMAIL_OTP_VERIFIED'`,
      [leadId],
    );
    assert(events.rows[0].count === 1, "OTP verification event should be written");

    console.log(`Lead/OTP smoke passed for lead ${leadId}.`);
  } finally {
    if (leadId) {
      await client.query("delete from lead_capture where id = $1", [leadId]);
    }
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
