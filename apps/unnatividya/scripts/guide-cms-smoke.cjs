// Guides in the CMS (Wave 5 C3, decision V6). Local only, with disposable CMS identities. Edits one
// imported guide through draft → review → publish, checks preview access, validation and the stale
// guard, then restores the guide row exactly and deletes every revision, audit row and identity the
// test created.
const assert = require('node:assert/strict');
const { randomUUID, createHmac } = require('node:crypto');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const { Client } = require('pg');
const base = process.env.UV_TEST_URL || 'http://localhost:3100';
const dbUrl = process.env.UNNATIVIDYA_DATABASE_URL;
if (!dbUrl || ![dbUrl, base].every(value => ['localhost', '127.0.0.1'].includes(new URL(value).hostname))) throw Error('Local endpoints required');
const db = new Client({ connectionString: dbUrl });
const secret = process.env.UNNATIVIDYA_SESSION_SECRET || 'dev-secret-change-me';
const PAGE = '/online-degree-guides/mca-eligibility';
const users = {}; let checks = 0, before, startedAt;
function check(value, expected) { assert.deepEqual(value, expected); checks++; }
function cookie(role) {
 const { id, email } = users[role]; const iat = Math.floor(Date.now() / 1000);
 const payload = Buffer.from(JSON.stringify({ userId: id, email, role, iat, exp: iat + 600 })).toString('base64url');
 return `uv_admin_session=${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}
async function api(role, route, method, body) {
 const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie(role) }, body: body ? JSON.stringify(body) : undefined });
 return { status: response.status, data: await response.json().catch(() => ({})) };
}
const html = async (route, role) => { const response = await fetch(base + route, role ? { headers: { Cookie: cookie(role) } } : {}); return { status: response.status, text: await response.text() }; };

(async () => {
 await db.connect();
 startedAt = new Date();
 for (const role of ['ADMIN', 'EDITOR', 'VIEWER']) {
  const id = randomUUID(), email = `guide-${role.toLowerCase()}-${id}@example.invalid`;
  await db.query('insert into cms_user(id,email,name,password_hash,role) values($1,$2,$3,$4,$5)', [id, email, `Disposable ${role.toLowerCase()}`, 'not-a-login-password', role]);
  users[role] = { id, email };
 }
 before = (await db.query("select * from guide where kind='eligibility' and guide_key='mca'")).rows[0];
 check(Boolean(before), true);
 try {
  const id = before.id;
  // The admin list and page.
  check((await html('/admin/guides', 'VIEWER')).text.includes('MCA eligibility'), true);
  const adminPage = await html(`/admin/guides/${id}`, 'EDITOR');
  check([adminPage.status, adminPage.text.includes('Sikkim Manipal University')], [200, true]);
  const marker = 'Smoke: SMU MCA eligibility edited in the CMS.';
  const edited = { ...before.content, facts: before.content.facts.map(fact => fact.universityId === 'smu' ? { ...fact, fact: marker } : fact), lastReviewed: 'October 2026' };
  // Roles and validation.
  check((await api('VIEWER', `/api/admin/guides/${id}/draft`, 'PUT', { content: edited, reason: 'x' })).status, 403);
  check((await api('EDITOR', `/api/admin/guides/${id}/draft`, 'PUT', { content: { ...edited, facts: edited.facts.slice(1) }, reason: 'x' })).data.error, 'Keep one entry for each university the guide covers.');
  check((await api('EDITOR', `/api/admin/guides/${id}/draft`, 'PUT', { content: { ...edited, sourceUrls: ['http://example.com/'] }, reason: 'x' })).status, 400);
  check((await api('EDITOR', `/api/admin/guides/${id}/draft`, 'PUT', { content: { ...edited, faqs: [] }, reason: 'x' })).status, 400);
  check((await api('EDITOR', `/api/admin/guides/${id}/draft`, 'PUT', { content: { ...edited, extra: 1 }, reason: 'x' })).status, 400);
  // Draft and submit.
  check((await api('EDITOR', `/api/admin/guides/${id}/draft`, 'PUT', { content: edited, reason: '' })).status, 200);
  check((await api('EDITOR', `/api/admin/guides/${id}/draft/submit`, 'POST')).status, 400);
  check((await api('EDITOR', `/api/admin/guides/${id}/draft`, 'PUT', { content: edited, reason: 'Smoke: SMU fact' })).status, 200);
  const submitted = await api('EDITOR', `/api/admin/guides/${id}/draft/submit`, 'POST');
  check(submitted.status, 200);
  const revisionId = submitted.data.revisionId;
  // Preview: CMS users only, noindex, with a banner; everyone else sees the live guide.
  const preview = await html(`${PAGE}?preview=${revisionId}`, 'VIEWER');
  check([preview.text.includes(marker), preview.text.includes('Preview. This is not live'), /<meta name="robots" content="noindex/.test(preview.text)], [true, true, true]);
  const anonymous = await html(`${PAGE}?preview=${revisionId}`);
  check([anonymous.status, anonymous.text.includes(marker), anonymous.text.includes('Preview. This is not live')], [200, false, false]);
  check((await html(`/online-degree-guides/mba-eligibility?preview=${revisionId}`, 'ADMIN')).text.includes(marker), false);
  check((await html(PAGE)).text.includes(marker), false);
  // Only administrators publish; publishing changes the live guide.
  check((await api('EDITOR', `/api/admin/guide-revisions/${revisionId}`, 'PATCH', { action: 'APPLY', note: 'Editors cannot apply' })).status, 403);
  check((await api('ADMIN', `/api/admin/guide-revisions/${revisionId}`, 'PATCH', { action: 'APPLY', note: 'x' })).status, 400);
  // A draft started before the publish is stale afterwards.
  check((await api('ADMIN', `/api/admin/guides/${id}/draft`, 'PUT', { content: { ...before.content, differentiatorNote: 'Smoke: stale draft' }, reason: 'Smoke: stale' })).status, 200);
  check((await api('ADMIN', `/api/admin/guides/${id}/draft/submit`, 'POST')).status, 200);
  const staleId = (await db.query("select id from guide_revision where guide_id=$1 and created_by=$2 and status='NEEDS_REVIEW'", [id, users.ADMIN.id])).rows[0].id;
  check((await api('ADMIN', `/api/admin/guide-revisions/${revisionId}`, 'PATCH', { action: 'APPLY', note: 'Smoke: checked against the SMU page' })).data.status, 'APPLIED');
  const live = await html(PAGE);
  check([live.text.includes(marker), /Last reviewed: (<!-- -->)?October 2026/.test(live.text)], [true, true]);
  const stale = await api('ADMIN', `/api/admin/guide-revisions/${staleId}`, 'PATCH', { action: 'APPLY', note: 'Smoke: should be refused' });
  check([stale.status, /changed after this draft was started/.test(stale.data.error)], [409, true]);
  check((await api('ADMIN', `/api/admin/guide-revisions/${staleId}`, 'PATCH', { action: 'REJECT', note: 'Smoke: sending back' })).data.status, 'REJECTED');
  // History: restoring the migrated version makes it the editor's draft, not live.
  const migrated = (await db.query("select id from guide_revision where guide_id=$1 and reason='Migrated from the website code'", [id])).rows[0].id;
  check((await api('EDITOR', `/api/admin/guide-revisions/${migrated}/restore`, 'POST')).status, 200);
  check((await html(PAGE)).text.includes(marker), true);
  check((await db.query("select count(*)::int n from guide_revision where guide_id=$1 and created_by=$2 and status='DRAFT'", [id, users.EDITOR.id])).rows[0].n, 1);
  check((await db.query("select count(*)::int n from cms_audit_log where user_id=$1 and action='GUIDE_REVISION_APPLIED'", [users.ADMIN.id])).rows[0].n, 1);
  console.log(`PASS ${checks} guide CMS checks; guide restored, disposable rows removed.`);
 } finally {
  if (before) {
   await db.query('update guide set content=$2, updated_at=$3 where id=$1', [before.id, before.content, before.updated_at]).catch(error => console.error('RESTORE FAILED', error.message));
   await db.query('delete from guide_revision where guide_id=$1 and created_at >= $2', [before.id, startedAt]).catch(() => {});
  }
  const ids = Object.values(users).map(user => user.id);
  await db.query('delete from cms_audit_log where user_id = any($1::uuid[])', [ids]).catch(() => {});
  await db.query('delete from cms_user where id = any($1::uuid[])', [ids]).catch(() => {});
  await db.end().catch(() => {});
 }
})().catch(error => { console.error(error); process.exitCode = 1; });
