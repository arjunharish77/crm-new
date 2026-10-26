// Marketing consent and newsletter (decision 9). Local HTTP/database checks that never call the
// email provider: sign-ups are exercised only where no email is due (an already-pending or
// confirmed address), and confirmation tokens are seeded directly. All test rows are deleted.
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash, createHmac } = require('node:crypto');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const { Client } = require('pg');
const base = process.env.UV_TEST_URL || 'http://localhost:3100';
const dbUrl = process.env.UNNATIVIDYA_DATABASE_URL;
if (!dbUrl || ![dbUrl, base].every(value => ['localhost', '127.0.0.1'].includes(new URL(value).hostname))) throw Error('Local endpoints required');
const secret = process.env.UNNATIVIDYA_SESSION_SECRET || 'dev-secret-change-me';
const db = new Client({ connectionString: dbUrl });
const run = randomUUID().slice(0, 8), emails = [];
const testIp = `127.0.1.${Math.floor(Math.random() * 200) + 20}`;
let checks = 0;
function check(value, expected) { assert.deepEqual(value, expected); checks++; }
const email = label => { const value = `uv-mkt-${label}-${run}@example.invalid`; emails.push(value); return value; };
async function json(route, method, body, headers = {}) {
 const response = await fetch(base + route, { method, headers: { 'X-Forwarded-For': testIp, 'Content-Type': 'application/json', Origin: base, ...headers }, body: body ? JSON.stringify(body) : undefined });
 return { status: response.status, data: await response.json().catch(() => ({})) };
}
async function form(route, fields, headers = { Origin: base }) {
 const response = await fetch(base + route, { method: 'POST', redirect: 'manual', headers: { 'X-Forwarded-For': testIp, ...headers }, body: new URLSearchParams(fields) });
 return { status: response.status, location: response.headers.get('location') };
}
const subscriber = address => db.query('select * from newsletter_subscriber where lower(email)=lower($1)', [address]).then(result => result.rows[0]);

(async () => {
 await db.connect();
 const crm = (await db.query('select is_enabled from crm_sync_config order by created_at limit 1')).rows[0];
 if (crm?.is_enabled) throw Error('Disable CRM delivery for this local smoke; no external sends allowed');

 // Legacy API clients may still submit an explicit marketing opt-in; it remains separate
 // from the contact consent and is pending until the email is verified.
 const token = randomBytes(32).toString('hex'), submissionKey = randomUUID(), leadEmail = email('lead');
 const body = { submissionKey, name: 'UV marketing smoke', email: leadEmail, phone: '+919999999998', consent: true, marketingConsent: true, intent: 'local_smoke' };
 const created = await json('/api/leads', 'POST', body, { Authorization: `Bearer ${token}` });
 check(created.status, 201);
 const leadId = created.data.leadId;
 let lead = (await db.query('select marketing_consent, marketing_consent_version, consent_version from lead_capture where id=$1', [leadId])).rows[0];
 check([lead.marketing_consent, lead.marketing_consent_version, lead.consent_version], [true, 'marketing-email-whatsapp-2026-10-05', 'application-follow-up-2026-10-08-v2']);
 check((await subscriber(leadEmail)).status, 'PENDING');
 check((await db.query("select count(*)::int n from lead_event where lead_capture_id=$1 and event_type='MARKETING_CONSENT_GIVEN'", [leadId])).rows[0].n, 1);
 // Editing contact in the new UI omits the field; same-address edits preserve prior consent.
 check((await json(`/api/leads/${leadId}`, 'PATCH', { contact: { ...body, marketingConsent: undefined } }, { Authorization: `Bearer ${token}` })).status, 200);
 check((await db.query('select marketing_consent from lead_capture where id=$1', [leadId])).rows[0].marketing_consent, true);
 check((await subscriber(leadEmail)).status, 'PENDING');
 // The current Apply now UI omits marketingConsent: no marketing consent or subscriber.
 const plainKey = randomUUID(), plainEmail = email('plain');
 check((await json('/api/leads', 'POST', { ...body, submissionKey: plainKey, email: plainEmail, marketingConsent: undefined }, { Authorization: `Bearer ${randomBytes(32).toString('hex')}` })).status, 201);
 check((await db.query('select marketing_consent from lead_capture where submission_key=$1', [plainKey])).rows[0].marketing_consent, false);
 check(await subscriber(plainEmail), undefined);
 // A new email cannot inherit opt-in recorded against the earlier address.
 const changedKey = randomUUID(), changedEmail = email('changed-from'), replacementEmail = email('changed-to');
 const changedToken = randomBytes(32).toString('hex');
 const changedLead = await json('/api/leads', 'POST', { ...body, submissionKey: changedKey, email: changedEmail }, { Authorization: `Bearer ${changedToken}` });
 check(changedLead.status, 201);
 check((await json(`/api/leads/${changedLead.data.leadId}`, 'PATCH', { contact: { ...body, submissionKey: changedKey, email: replacementEmail, marketingConsent: undefined } }, { Authorization: `Bearer ${changedToken}` })).status, 200);
 check((await db.query('select marketing_consent from lead_capture where id=$1', [changedLead.data.leadId])).rows[0].marketing_consent, false);
 check((await subscriber(changedEmail)).status, 'UNSUBSCRIBED');
 check(await subscriber(replacementEmail), undefined);
 // Verifying the email (OTP step) confirms the pending sign-up.
 check((await json(`/api/leads/${leadId}`, 'PATCH', { coursePreference: 'Online MBA', university: '' }, { Authorization: `Bearer ${token}` })).status, 200);
 const code = '4321', otpHash = createHash('sha256').update(`${code}:${secret}`).digest('hex');
 await db.query(`insert into otp_request(lead_capture_id,channel,purpose,target,otp_hash,expires_at,provider) values($1,'EMAIL','LEAD_VERIFY',$2,$3,now()+interval '10 minutes','local_test')`, [leadId, leadEmail, otpHash]);
 check((await json('/api/otp/verify', 'POST', { leadId, otp: code }, { Authorization: `Bearer ${token}` })).status, 200);
 check((await subscriber(leadEmail)).status, 'CONFIRMED');

 // Sign-up form: same answer for a confirmed address, no email due; bad input and origin refused.
 check((await json('/api/newsletter', 'POST', { email: leadEmail })).status, 202);
 check((await json('/api/newsletter', 'POST', { email: 'not-an-email' })).status, 400);
 check((await json('/api/newsletter', 'POST', { email: leadEmail, website: 'bot' })).status, 400);
 check((await json('/api/newsletter', 'POST', { email: leadEmail }, { Origin: 'https://evil.example' })).status, 403);

 // Email confirmation: seeded token, confirmed by the page's POST; reused or bad tokens refused.
 const pendingEmail = email('pending'), confirmToken = randomBytes(32).toString('base64url');
 await db.query(`insert into newsletter_subscriber (email, source, consent_version, confirm_token_hash, confirm_expires_at) values ($1,'SIGNUP_FORM','newsletter-signup-2026-10-05',$2, now()+interval '7 days')`,
  [pendingEmail, createHash('sha256').update(confirmToken).digest('hex')]);
 const page = await fetch(`${base}/newsletter/confirm?token=${confirmToken}`);
 check(page.status, 200);
 check((await page.text()).includes('Confirm subscription'), true);
 check((await subscriber(pendingEmail)).status, 'PENDING'); // opening the link alone changes nothing
 check(await form('/api/newsletter/confirm', { token: confirmToken }), { status: 303, location: '/newsletter/confirm?status=confirmed' });
 check((await subscriber(pendingEmail)).status, 'CONFIRMED');
 check(await form('/api/newsletter/confirm', { token: confirmToken }), { status: 303, location: '/newsletter/confirm?status=invalid' });
 check((await form('/api/newsletter/confirm', { token: confirmToken }, { Origin: 'https://evil.example' })).status, 403);

 // Unsubscribe: HMAC link required; withdraws marketing consent on the enquiry too.
 const leadSubscriber = await subscriber(leadEmail);
 const unsubscribeToken = createHmac('sha256', secret).update(`newsletter-unsubscribe:${leadSubscriber.id}`).digest('base64url');
 check(await form('/api/newsletter/unsubscribe', { id: leadSubscriber.id, token: 'wrong' }), { status: 303, location: '/newsletter/unsubscribe?status=invalid' });
 check((await subscriber(leadEmail)).status, 'CONFIRMED');
 check(await form('/api/newsletter/unsubscribe', { id: leadSubscriber.id, token: unsubscribeToken }), { status: 303, location: '/newsletter/unsubscribe?status=done' });
 check((await subscriber(leadEmail)).status, 'UNSUBSCRIBED');
 lead = (await db.query('select marketing_consent from lead_capture where id=$1', [leadId])).rows[0];
 check(lead.marketing_consent, false);
 check((await db.query("select count(*)::int n from lead_event where lead_capture_id=$1 and event_type='MARKETING_CONSENT_WITHDRAWN'", [leadId])).rows[0].n, 1);
 // RFC 8058 one-click (mail providers post without an Origin).
 const other = await subscriber(pendingEmail);
 const otherToken = createHmac('sha256', secret).update(`newsletter-unsubscribe:${other.id}`).digest('base64url');
 const oneClick = await fetch(`${base}/api/newsletter/unsubscribe?id=${other.id}&token=${otherToken}`, { method: 'POST', headers: { 'X-Forwarded-For': testIp }, body: new URLSearchParams({ 'List-Unsubscribe': 'One-Click' }) });
 check(oneClick.status, 200);
 check((await subscriber(pendingEmail)).status, 'UNSUBSCRIBED');
 console.log(`PASS ${checks} marketing-consent and newsletter checks; no email or CRM delivery attempted.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
 await db.query('delete from newsletter_subscriber where email = any($1)', [emails]).catch(() => {});
 await db.query('delete from lead_capture where email = any($1)', [emails]).catch(() => {});
 await db.end();
});
