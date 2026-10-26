// Scheduled article publishing (Wave 5 C2, decision V7). Local only, with disposable CMS identities.
// Schedules a revision, runs scripts/publish-scheduled.js before and after it is due, checks a
// refused (stale) schedule and unscheduling, then restores the article row exactly and deletes every
// revision, audit row and identity the test created.
const assert = require('node:assert/strict');
const { randomUUID, createHmac } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const { Client } = require('pg');
const base = process.env.UV_TEST_URL || 'http://localhost:3100';
const dbUrl = process.env.UNNATIVIDYA_DATABASE_URL;
if (!dbUrl || ![dbUrl, base].every(value => ['localhost', '127.0.0.1'].includes(new URL(value).hostname))) throw Error('Local endpoints required');
const db = new Client({ connectionString: dbUrl });
const secret = process.env.UNNATIVIDYA_SESSION_SECRET || 'dev-secret-change-me';
const SLUG = 'wes-evaluation-online-degrees';
const users = {}; let checks = 0, original, before, startedAt;
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
const html = async (route, role) => (await fetch(base + route, role ? { headers: { Cookie: cookie(role) } } : {})).text();
const publish = () => execFileSync('node', [path.join(__dirname, 'publish-scheduled.js')], { env: { ...process.env, UNNATIVIDYA_DATABASE_URL: dbUrl } }).toString();
// "YYYY-MM-DDTHH:MM:00+05:30", the form's India-time format, for a moment minutes from now.
const istIn = minutes => { const t = new Date(Date.now() + minutes * 60000 + 5.5 * 3600000); return `${t.toISOString().slice(0, 16)}:00+05:30`; };
async function submitEdit(change, reason) {
 check((await api('EDITOR', `/api/admin/articles/${original.id}/draft`, 'PUT', { content: { ...original.content, ...change }, reason })).status, 200);
 const submitted = await api('EDITOR', `/api/admin/articles/${original.id}/draft/submit`, 'POST'); check(submitted.status, 200);
 return submitted.data.revisionId;
}
const revision = async id => (await db.query('select status, scheduled_for, scheduled_by, schedule_error, reviewed_by, review_note from article_revision where id=$1', [id])).rows[0];

(async () => {
 await db.connect();
 startedAt = new Date();
 for (const role of ['ADMIN', 'EDITOR']) {
  const id = randomUUID(), email = `schedule-${role.toLowerCase()}-${id}@example.invalid`;
  await db.query('insert into cms_user(id,email,name,password_hash,role) values($1,$2,$3,$4,$5)', [id, email, `Disposable ${role.toLowerCase()}`, 'not-a-login-password', role]);
  users[role] = { id, email };
 }
 original = (await db.query('select * from article where slug=$1', [SLUG])).rows[0];
 check(Boolean(original && original.content), true);
 before = { ...original };
 try {
  const title = `${original.content.title} (schedule test)`;
  const first = await submitEdit({ title }, 'Smoke: scheduled title');
  const url = `/api/admin/article-revisions/${first}`;
  // Who may schedule, and what is accepted.
  check((await api('EDITOR', url, 'PATCH', { action: 'SCHEDULE', note: 'Editors cannot schedule', publishAt: istIn(30) })).status, 403);
  check((await api('ADMIN', url, 'PATCH', { action: 'SCHEDULE', note: 'x', publishAt: istIn(30) })).status, 400);
  check((await api('ADMIN', url, 'PATCH', { action: 'SCHEDULE', note: 'No time given' })).status, 400);
  check((await api('ADMIN', url, 'PATCH', { action: 'SCHEDULE', note: 'Not a time', publishAt: '2026-13-45T99:00:00+05:30' })).status, 400);
  const past = await api('ADMIN', url, 'PATCH', { action: 'SCHEDULE', note: 'Too soon', publishAt: istIn(2) });
  check([past.status, past.data.error], [400, 'Choose a time at least 5 minutes from now.']);
  check((await api('ADMIN', url, 'PATCH', { action: 'SCHEDULE', note: 'Too far', publishAt: istIn(60 * 24 * 400) })).status, 400);
  // Schedule for 30 minutes from now.
  const when = istIn(30);
  const scheduled = await api('ADMIN', url, 'PATCH', { action: 'SCHEDULE', note: 'Smoke: go live later', publishAt: when });
  check([scheduled.status, scheduled.data.status], [200, 'SCHEDULED']);
  const stored = await revision(first);
  check([stored.status, new Date(stored.scheduled_for).toISOString(), stored.scheduled_by], ['NEEDS_REVIEW', new Date(when).toISOString(), users.ADMIN.id]);
  check((await db.query("select count(*)::int n from cms_audit_log where user_id=$1 and action='ARTICLE_REVISION_SCHEDULED' and entity_id=$2", [users.ADMIN.id, first])).rows[0].n, 1);
  check((await html(`/admin/articles/${original.id}`, 'ADMIN')).includes('Scheduled to go live on'), true);
  check(/<strong>1<\/strong> scheduled/.test(await html('/admin/articles', 'ADMIN')), true);
  // Not due yet: the publisher changes nothing.
  check(publish(), '');
  check((await revision(first)).status, 'NEEDS_REVIEW');
  check((await db.query('select content->>\'title\' t from article where id=$1', [original.id])).rows[0].t, original.content.title);
  // Due: it goes live exactly as a manual apply by the scheduling administrator.
  await db.query("update article_revision set scheduled_for=now()-interval '1 minute' where id=$1", [first]);
  check(/published 1 scheduled revision/.test(publish()), true);
  const applied = await revision(first);
  check([applied.status, applied.reviewed_by, applied.review_note], ['APPLIED', users.ADMIN.id, 'Scheduled publication: Smoke: go live later']);
  check((await db.query('select content->>\'title\' t from article where id=$1', [original.id])).rows[0].t, title);
  check((await html(`/blog/${SLUG}`)).includes('(schedule test)'), true);
  check(publish(), '');
  // A schedule whose article changed in the meantime is refused, recorded and not retried.
  const live = (await db.query('select content from article where id=$1', [original.id])).rows[0].content;
  original = { ...original, content: live };
  const second = await submitEdit({ excerpt: 'Smoke: scheduled excerpt' }, 'Smoke: stale schedule');
  check((await api('ADMIN', `/api/admin/article-revisions/${second}`, 'PATCH', { action: 'SCHEDULE', note: 'Smoke: will go stale', publishAt: istIn(20) })).status, 200);
  await db.query("update article set content=jsonb_set(content,'{title}',to_jsonb($2::text)), updated_at=now() where id=$1", [original.id, `${title} (changed meanwhile)`]);
  await db.query("update article_revision set scheduled_for=now()-interval '1 minute' where id=$1", [second]);
  check(/published 0 scheduled revision\(s\); refused 1/.test(publish()), true);
  const refused = await revision(second);
  check([refused.status, refused.scheduled_for, /changed after this draft was started/.test(refused.schedule_error)], ['NEEDS_REVIEW', null, true]);
  check((await html(`/admin/articles/${original.id}`, 'ADMIN')).includes('Scheduled publication was refused'), true);
  check(publish(), '');
  // Scheduling a stale revision is refused up front; unscheduling clears a schedule.
  check((await api('ADMIN', `/api/admin/article-revisions/${second}`, 'PATCH', { action: 'SCHEDULE', note: 'Smoke: retry', publishAt: istIn(20) })).status, 409);
  check((await api('ADMIN', `/api/admin/article-revisions/${second}`, 'PATCH', { action: 'REJECT', note: 'Smoke: send back' })).status, 200);
  original = { ...original, content: (await db.query('select content from article where id=$1', [original.id])).rows[0].content };
  const third = await submitEdit({ excerpt: 'Smoke: unscheduled excerpt' }, 'Smoke: unschedule');
  check((await api('ADMIN', `/api/admin/article-revisions/${third}`, 'PATCH', { action: 'SCHEDULE', note: 'Smoke: then cancel', publishAt: istIn(20) })).status, 200);
  check((await api('ADMIN', `/api/admin/article-revisions/${third}`, 'PATCH', { action: 'UNSCHEDULE' })).status, 200);
  check((await revision(third)).scheduled_for, null);
  check((await api('ADMIN', `/api/admin/article-revisions/${third}`, 'PATCH', { action: 'UNSCHEDULE' })).status, 409);
  console.log(`PASS ${checks} scheduled-publishing checks; article restored, disposable rows removed.`);
 } finally {
  const row = (await db.query('select * from article where slug=$1', [SLUG])).rows[0];
  if (row && before) await db.query('update article set content=$2, status=$3, published_at=$4, updated_at=$5 where id=$1', [row.id, before.content, before.status, before.published_at, before.updated_at]).catch(error => console.error('RESTORE FAILED', error.message));
  await db.query('delete from article_revision where article_id=$1 and created_at >= $2', [row?.id, startedAt]).catch(() => {});
  const ids = Object.values(users).map(user => user.id);
  await db.query('delete from cms_audit_log where user_id = any($1::uuid[])', [ids]).catch(() => {});
  await db.query('delete from cms_user where id = any($1::uuid[])', [ids]).catch(() => {});
  await db.end().catch(() => {});
 }
})().catch(error => { console.error(error); process.exitCode = 1; });

