import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import { sendEmail } from "@/lib/zeptomail";

// Marketing consent and the opt-in newsletter (next-phase plan, decision 9). The enquiry's contact
// consent is separate and unchanged. Wording versions are stored with every record so a later
// change of text never rewrites what someone agreed to.
export { MARKETING_CONSENT_TEXT, MARKETING_CONSENT_VERSION } from "@/lib/lead-consent";
export const NEWSLETTER_SIGNUP_VERSION = "newsletter-signup-2026-10-05";
export const NEWSLETTER_SIGNUP_TEXT = "Get Unnati Vidya's newsletter about online degrees, fees and admission dates. We'll email you a link to confirm. You can unsubscribe at any time.";

const CONFIRM_DAYS = 7;
const siteUrl = () => (process.env.NEXT_PUBLIC_UNNATIVIDYA_SITE_URL || "https://unnatividya.com").replace(/\/$/, "");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

function secret() {
  const value = process.env.UNNATIVIDYA_SESSION_SECRET;
  if (!value && process.env.NODE_ENV === "production") throw new Error("UNNATIVIDYA_SESSION_SECRET is required");
  return value || "dev-secret-change-me";
}

// Stateless unsubscribe tokens (an HMAC of the subscriber id), so every email, including ones
// sent later from an exported list, can carry a working one-click link without storing it.
export function unsubscribeToken(subscriberId: string) {
  return createHmac("sha256", secret()).update(`newsletter-unsubscribe:${subscriberId}`).digest("base64url");
}
export function validUnsubscribeToken(subscriberId: string, token: string) {
  const expected = Buffer.from(unsubscribeToken(subscriberId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
export function unsubscribeUrl(subscriberId: string) {
  return `${siteUrl()}/newsletter/unsubscribe?id=${encodeURIComponent(subscriberId)}&token=${encodeURIComponent(unsubscribeToken(subscriberId))}`;
}

type Request = { email: string; source: "SIGNUP_FORM" | "LEAD_FORM"; sourcePath?: string | null; leadId?: string | null; consentVersion: string };

// Creates or refreshes a pending subscription. A confirmed address is left alone, and a pending
// one is not re-mailed within ten minutes, so the endpoint can't be used to flood an inbox.
// Returns the raw confirmation token only when a confirmation email should be sent.
export async function requestSubscription(db: PoolClient, input: Request) {
  const existing = (await db.query("select * from newsletter_subscriber where lower(email)=lower($1) for update", [input.email])).rows[0];
  if (existing?.status === "CONFIRMED") return { id: existing.id as string, token: null };
  if (existing?.status === "PENDING" && Date.now() - new Date(existing.updated_at).getTime() < 10 * 60 * 1000) {
    if (input.leadId) await db.query("update newsletter_subscriber set lead_capture_id=coalesce(lead_capture_id,$2) where id=$1", [existing.id, input.leadId]);
    return { id: existing.id as string, token: null };
  }
  const token = randomBytes(32).toString("base64url");
  const values = [input.email, input.source, input.sourcePath || null, input.leadId || null, input.consentVersion, hash(token)];
  const row = existing
    ? (await db.query(`update newsletter_subscriber set status='PENDING', source=$2, source_path=$3, lead_capture_id=coalesce($4, lead_capture_id),
        consent_version=$5, confirm_token_hash=$6, confirm_expires_at=now()+interval '${CONFIRM_DAYS} days', unsubscribed_at=null, updated_at=now()
        where id=$7 returning id`, [...values, existing.id])).rows[0]
    : (await db.query(`insert into newsletter_subscriber (email, source, source_path, lead_capture_id, consent_version, confirm_token_hash, confirm_expires_at)
        values ($1,$2,$3,$4,$5,$6, now()+interval '${CONFIRM_DAYS} days') returning id`, values)).rows[0];
  return { id: row.id as string, token };
}

export async function sendConfirmationEmail(email: string, token: string) {
  const link = `${siteUrl()}/newsletter/confirm?token=${encodeURIComponent(token)}`;
  return sendEmail({
    toEmail: email,
    toName: "Subscriber",
    subject: "Confirm your Unnati Vidya newsletter subscription",
    htmlbody: `<div style="font-family:Arial,sans-serif;color:#16133f;line-height:1.6">
      <p>Please confirm that you want Unnati Vidya's newsletter about online degrees, fees and admission dates.</p>
      <p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#5b4cf0;color:#fff;border-radius:6px;text-decoration:none">Confirm subscription</a></p>
      <p>The link works for ${CONFIRM_DAYS} days. If you didn't ask for this, ignore this email and nothing will be sent.</p>
    </div>`,
  });
}

export async function confirmSubscription(db: PoolClient, token: string) {
  const row = (await db.query(`update newsletter_subscriber set status='CONFIRMED', confirmed_at=now(), confirm_token_hash=null, confirm_expires_at=null, updated_at=now()
    where confirm_token_hash=$1 and confirm_expires_at > now() and status='PENDING' returning id`, [hash(token)])).rows[0];
  return row ? (row.id as string) : null;
}

// Unsubscribing withdraws marketing consent for both channels, including on any enquiry with the
// same email address, because one consent covered the newsletter and WhatsApp updates.
export async function unsubscribe(db: PoolClient, subscriberId: string) {
  const row = (await db.query(`update newsletter_subscriber set status='UNSUBSCRIBED', unsubscribed_at=coalesce(unsubscribed_at, now()),
    confirm_token_hash=null, confirm_expires_at=null, updated_at=now() where id=$1 returning email`, [subscriberId])).rows[0];
  if (!row) return false;
  const leads = await db.query("update lead_capture set marketing_consent=false, updated_at=now() where lower(email)=lower($1) and marketing_consent returning id", [row.email]);
  for (const lead of leads.rows) await db.query("insert into lead_event (lead_capture_id,event_type,metadata) values ($1,'MARKETING_CONSENT_WITHDRAWN',$2)", [lead.id, { via: "newsletter_unsubscribe" }]);
  return true;
}
