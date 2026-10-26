// CMS article workflow (decision 8). Local only, with disposable CMS identities. Edits one
// migrated article through draft → review → publish, checks the guards, then restores the
// article row exactly and deletes every revision and identity the test created.
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
const users = {}, createdUsers = [];
let checks = 0, original, startedAt, createdSlug;
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
const page = async route => { const response = await fetch(base + route); return { status: response.status, html: await response.text() }; };

(async () => {
 await db.connect();
 startedAt = new Date();
 for (const role of ['ADMIN', 'EDITOR', 'VIEWER']) {
  const id = randomUUID(), email = `article-${role.toLowerCase()}-${id}@example.invalid`;
  await db.query('insert into cms_user(id,email,name,password_hash,role) values($1,$2,$3,$4,$5)', [id, email, `Disposable ${role.toLowerCase()}`, 'not-a-login-password', role]);
  users[role] = { id, email }; createdUsers.push(id);
 }
 original = (await db.query("select * from article where slug='online-mba-guide'")).rows[0];
 check(Boolean(original), true);
 // The public blog comes from the CMS table.
 const blog = await page('/blog');
 check(blog.status, 200);
 check((await db.query("select count(*)::int n from article where status='PUBLISHED'")).rows[0].n >= 26, true);
 check(blog.html.includes(original.content.title.replace(/&/g, '&amp;').replace(/'/g, '&#x27;')), true);

 const edited = { ...original.content, title: `${original.content.title} (smoke edit)` };
 // Roles and validation.
 check((await api('VIEWER', `/api/admin/articles/${original.id}/draft`, 'PUT', { content: edited, reason: 'x' })).status, 403);
 check((await api('EDITOR', `/api/admin/articles/${original.id}/draft`, 'PUT', { content: { ...edited, cover: 'javascript:alert(1)' }, reason: 'x' })).status, 400);
 check((await api('EDITOR', `/api/admin/articles/${original.id}/draft`, 'PUT', { content: { ...edited, body: [{ type: 'links', heading: 'x', items: [{ href: 'javascript:alert(1)', label: 'x' }] }] }, reason: 'x' })).status, 400);
 // Draft, submit, a second (stale) draft, then publish.
 const saved = await api('EDITOR', `/api/admin/articles/${original.id}/draft`, 'PUT', { content: edited, reason: '' });
 check(saved.status, 200);
 check((await api('EDITOR', `/api/admin/articles/${original.id}/draft/submit`, 'POST')).status, 400); // a reason is required
 check((await api('EDITOR', `/api/admin/articles/${original.id}/draft`, 'PUT', { content: edited, reason: 'Smoke: title edit' })).status, 200);
 const submitted = await api('EDITOR', `/api/admin/articles/${original.id}/draft/submit`, 'POST');
 check(submitted.status, 200);
 const stale = await api('ADMIN', `/api/admin/articles/${original.id}/draft`, 'PUT', { content: { ...original.content, excerpt: 'Smoke stale draft' }, reason: 'Smoke: stale' });
 check(stale.status, 200);
 check((await api('EDITOR', `/api/admin/article-revisions/${submitted.data.revisionId}`, 'PATCH', { action: 'APPLY', note: 'Editors cannot apply' })).status, 403);
 check((await page('/blog/online-mba-guide')).html.includes('(smoke edit)'), false); // not live before review
 const preview = await fetch(`${base}/admin/articles/${original.id}/preview?revision=${submitted.data.revisionId}`, { headers: { Cookie: cookie('VIEWER') } });
 check(preview.status, 200);
 check((await preview.text()).includes('(smoke edit)'), true);
 check((await api('ADMIN', `/api/admin/article-revisions/${submitted.data.revisionId}`, 'PATCH', { action: 'APPLY', note: 'Checked against sources' })).status, 200);
 check((await page('/blog/online-mba-guide')).html.includes('(smoke edit)'), true);
 check((await api('ADMIN', `/api/admin/article-revisions/${submitted.data.revisionId}`, 'PATCH', { action: 'APPLY', note: 'Applying twice' })).status, 409);
 // The admin's draft started before that publish: applying it is refused.
 check((await api('ADMIN', `/api/admin/articles/${original.id}/draft/submit`, 'POST')).status, 200);
 const staleId = (await db.query("select id from article_revision where article_id=$1 and status='NEEDS_REVIEW' and created_by=$2", [original.id, users.ADMIN.id])).rows[0].id;
 check((await api('ADMIN', `/api/admin/article-revisions/${staleId}`, 'PATCH', { action: 'APPLY', note: 'Should be refused' })).status, 409);
 check((await api('ADMIN', `/api/admin/article-revisions/${staleId}`, 'PATCH', { action: 'REJECT', note: 'Based on an old version' })).status, 200);
 // Restore the migrated version as a draft and publish it: the article is back to its text.
 const migrated = (await db.query("select id from article_revision where article_id=$1 and reason='Migrated from the website code'", [original.id])).rows[0];
 check(Boolean(migrated), true);
 check((await api('EDITOR', `/api/admin/article-revisions/${migrated.id}/restore`, 'POST')).status, 200);
 check((await api('EDITOR', `/api/admin/articles/${original.id}/draft/submit`, 'POST')).status, 200);
 const restored = (await db.query("select id from article_revision where article_id=$1 and status='NEEDS_REVIEW'", [original.id])).rows[0];
 check((await api('ADMIN', `/api/admin/article-revisions/${restored.id}`, 'PATCH', { action: 'APPLY', note: 'Restore the migrated text' })).status, 200);
 check((await db.query('select content from article where id=$1', [original.id])).rows[0].content, original.content);
 // Unpublish and republish.
 check((await api('EDITOR', `/api/admin/articles/${original.id}`, 'PATCH', { status: 'ARCHIVED' })).status, 403);
 check((await api('ADMIN', `/api/admin/articles/${original.id}`, 'PATCH', { status: 'ARCHIVED' })).status, 200);
 check((await page('/blog/online-mba-guide')).status, 404);
 check((await api('ADMIN', `/api/admin/articles/${original.id}`, 'PATCH', { status: 'PUBLISHED' })).status, 200);
 check((await page('/blog/online-mba-guide')).status, 200);
 // A brand-new article stays unpublished until reviewed.
 createdSlug = `smoke-article-${randomUUID().slice(0, 8)}`;
 const fresh = await api('EDITOR', '/api/admin/articles', 'POST', { slug: createdSlug, reason: 'Smoke: new', content: { ...original.content, title: 'Smoke new article' } });
 check(fresh.status, 201);
 check((await page(`/blog/${createdSlug}`)).status, 404);
 check((await api('EDITOR', '/api/admin/articles', 'POST', { slug: createdSlug, reason: 'dup', content: original.content })).status, 409);
 console.log(`PASS ${checks} article CMS checks; the article was restored exactly and test records were deleted.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
 if (original) {
  await db.query('update article set status=$2, content=$3, published_at=$4, updated_at=$5 where id=$1', [original.id, original.status, original.content, original.published_at, original.updated_at]).catch(e => console.error('RESTORE FAILED', e.message));
  await db.query('delete from article_revision where article_id=$1 and created_at >= $2', [original.id, startedAt]).catch(() => {});
 }
 if (createdSlug) await db.query('delete from article where slug=$1', [createdSlug]).catch(() => {});
 if (createdUsers.length) {
  await db.query('delete from cms_audit_log where user_id = any($1::uuid[])', [createdUsers]).catch(() => {});
  await db.query('delete from cms_user where id = any($1::uuid[])', [createdUsers]).catch(() => {});
 }
 await db.end();
});
