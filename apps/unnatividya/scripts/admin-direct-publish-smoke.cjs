// Administrators edit and publish in one step (owner request, 25 October 2026). Local only, with
// disposable CMS identities, a disposable course and article, and one imported guide that is
// restored exactly. Covers catalog records (straight away and from a saved working draft), articles
// (new and existing), guides, the stale and validation guards, and bulk publishing with guides and
// a scheduled article.
const assert = require('node:assert/strict');
const { randomUUID, createHmac } = require('node:crypto');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const { Client } = require('pg');
const { chromium } = require(process.env.UV_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.UV_TEST_URL || 'http://localhost:3100';
const dbUrl = process.env.UNNATIVIDYA_DATABASE_URL;
if (!dbUrl || ![dbUrl, base].every(value => ['localhost', '127.0.0.1'].includes(new URL(value).hostname))) throw Error('Local endpoints required');
const db = new Client({ connectionString: dbUrl });
const secret = process.env.UNNATIVIDYA_SESSION_SECRET || 'dev-secret-change-me';
const suffix = randomUUID().slice(0, 8);
const DIRECT = 'Published directly by an administrator.';
const KEYS = ['slug', 'name', 'short_name', 'data', 'university_id', 'level', 'program_type', 'ugc_approved', 'stream', 'fee_inr', 'duration'];
const users = {}; const ids = { course: `direct-smoke-${suffix}`, articleSlug: `direct-smoke-${suffix}`, editorSlug: `direct-smoke-editor-${suffix}`, articles: [] };
let checks = 0, guideBefore, startedAt;
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
const snapshot = async () => (await db.query('select to_jsonb(t) as s from course t where id=$1', [ids.course])).rows[0].s;
const contentOf = s => Object.fromEntries(KEYS.map(key => [key, s[key]]));

(async () => {
 await db.connect();
 startedAt = new Date();
 for (const role of ['ADMIN', 'EDITOR']) {
  const id = randomUUID(), email = `direct-${role.toLowerCase()}-${suffix}@example.invalid`;
  await db.query('insert into cms_user(id,email,name,password_hash,role) values($1,$2,$3,$4,$5)', [id, email, `Disposable ${role.toLowerCase()}`, 'not-a-login-password', role]);
  users[role] = { id, email };
 }
 guideBefore = (await db.query("select * from guide where kind='eligibility' and guide_key='bca'")).rows[0];
 check(Boolean(guideBefore), true);
 await db.query(`insert into course(id,slug,university_id,name,short_name,level,program_type,ugc_approved,stream,fee_inr,duration,status,is_published,data)
   select $1,$1,university_id,'Direct smoke course',short_name,level,program_type,ugc_approved,stream,fee_inr,duration,'PUBLISHED',true,data from course where id='mba-muj'`, [ids.course]);
 try {
  // Catalog: the editors' page offers review only; administrators also get "Save and publish".
  const recordPage = `/admin/catalog-revisions?type=course&id=${ids.course}`;
  check([(await html(recordPage, 'ADMIN')).text.includes('Save and publish'), (await html(recordPage, 'EDITOR')).text.includes('Save and publish')], [true, false]);
  let s = await snapshot();
  const renamed = { ...contentOf(s), name: 'Direct smoke course, published' };
  check((await api('EDITOR', '/api/admin/catalog-revisions', 'POST', { entityType: 'course', entityId: ids.course, baseSnapshot: s, content: renamed, reason: 'Smoke: editor', publish: true })).status, 403);
  const direct = await api('ADMIN', '/api/admin/catalog-revisions', 'POST', { entityType: 'course', entityId: ids.course, baseSnapshot: s, content: renamed, reason: 'Smoke: rename', publish: true });
  check([direct.status, direct.data.status], [201, 'APPLIED']);
  check((await db.query('select name from course where id=$1', [ids.course])).rows[0].name, renamed.name);
  const revision = (await db.query('select status, reviewed_by, review_note, created_by from catalog_revision where id=$1', [direct.data.id])).rows[0];
  check(revision, { status: 'APPLIED', reviewed_by: users.ADMIN.id, review_note: DIRECT, created_by: users.ADMIN.id });
  check((await db.query("select count(*)::int n from cms_audit_log where user_id=$1 and action='CATALOG_REVISION_APPLIED' and metadata->>'direct'='true'", [users.ADMIN.id])).rows[0].n, 1);
  // A stale snapshot is refused and nothing is recorded.
  check((await api('ADMIN', '/api/admin/catalog-revisions', 'POST', { entityType: 'course', entityId: ids.course, baseSnapshot: s, content: { ...renamed, name: 'Stale' }, reason: 'Smoke: stale', publish: true })).status, 409);
  // Content that would break the published catalog is refused as a whole (an INR category row must equal the fee).
  s = await snapshot();
  const broken = { ...contentOf(s), data: { ...s.data, categoryFees: { checkedAt: '2026-10-25', sourceUrl: 'https://www.onlinemanipal.com/', sourceLabel: 'Smoke', rows: [{ category: 'Indian applicants', currency: 'INR', total: s.fee_inr + 1, perSemester: 1, semesters: 4 }] } } };
  const refused = await api('ADMIN', '/api/admin/catalog-revisions', 'POST', { entityType: 'course', entityId: ids.course, baseSnapshot: s, content: broken, reason: 'Smoke: invalid', publish: true });
  check([refused.status, Array.isArray(refused.data.issues)], [409, true]);
  check((await db.query('select count(*)::int n from catalog_revision where entity_id=$1', [ids.course])).rows[0].n, 1);
  check(await snapshot(), s);
  // From a saved working draft: publishing submits and applies it, and removes the working draft.
  const draftContent = { ...contentOf(s), name: 'Direct smoke course, from a draft' };
  const saved = await api('ADMIN', '/api/admin/catalog-drafts', 'PUT', { entityType: 'course', entityId: ids.course, baseSnapshot: s, content: draftContent, reason: '', version: null });
  check(saved.status, 200);
  check((await api('EDITOR', '/api/admin/catalog-drafts', 'PUT', { entityType: 'course', entityId: ids.course, baseSnapshot: s, content: draftContent, reason: 'x', version: null, publish: true })).status, 400);
  const fromDraft = await api('ADMIN', '/api/admin/catalog-drafts', 'POST', { entityType: 'course', entityId: ids.course, baseSnapshot: s, content: draftContent, reason: 'Smoke: from draft', version: saved.data.draft.version, publish: true });
  check([fromDraft.status, fromDraft.data.status], [201, 'APPLIED']);
  check((await db.query('select name from course where id=$1', [ids.course])).rows[0].name, draftContent.name);
  check((await db.query('select count(*)::int n from catalog_working_draft where entity_id=$1', [ids.course])).rows[0].n, 0);

  // Articles: an administrator creates and publishes a new article in one go.
  const template = (await db.query("select content from article where slug='online-mba-guide'")).rows[0].content;
  check((await html('/admin/articles/new', 'ADMIN')).text.includes('Create and publish'), true);
  check((await html('/admin/articles/new', 'EDITOR')).text.includes('Create and publish'), false);
  const created = await api('ADMIN', '/api/admin/articles', 'POST', { slug: ids.articleSlug, content: { ...template, title: 'Direct smoke article' }, reason: 'Smoke: new article' });
  check(created.status, 201); ids.articles.push(created.data.articleId);
  check((await html(`/blog/${ids.articleSlug}`)).status, 404);
  check((await api('ADMIN', `/api/admin/articles/${created.data.articleId}/draft/publish`, 'POST')).data.status, 'APPLIED');
  const live = await html(`/blog/${ids.articleSlug}`);
  check([live.status, live.text.includes('Direct smoke article')], [200, true]);
  // Editing a published article and publishing straight away.
  check((await api('ADMIN', `/api/admin/articles/${created.data.articleId}/draft`, 'PUT', { content: { ...template, title: 'Direct smoke article, edited' }, reason: 'Smoke: edit' })).status, 200);
  check((await api('ADMIN', `/api/admin/articles/${created.data.articleId}/draft/publish`, 'POST')).status, 200);
  check((await html(`/blog/${ids.articleSlug}`)).text.includes('Direct smoke article, edited'), true);
  check((await api('ADMIN', `/api/admin/articles/${created.data.articleId}/draft/publish`, 'POST')).status, 409);
  // Editors still submit for review.
  const editorArticle = await api('EDITOR', '/api/admin/articles', 'POST', { slug: ids.editorSlug, content: { ...template, title: 'Editor smoke article' }, reason: 'Smoke: editor' });
  ids.articles.push(editorArticle.data.articleId);
  check((await api('EDITOR', `/api/admin/articles/${editorArticle.data.articleId}/draft/publish`, 'POST')).status, 403);
  check((await db.query('select status from article where id=$1', [editorArticle.data.articleId])).rows[0].status, 'DRAFT');

  // Guides: an administrator saves and publishes in one step.
  const guidePage = '/online-degree-guides/bca-eligibility';
  check([(await html(`/admin/guides/${guideBefore.id}`, 'ADMIN')).text.includes('Save and publish'), (await html(`/admin/guides/${guideBefore.id}`, 'EDITOR')).text.includes('Save and publish')], [true, false]);
  const marker = 'Smoke: published directly by an administrator.';
  const edited = { ...guideBefore.content, faqs: guideBefore.content.faqs.map((faq, i) => i === 0 ? [faq[0], marker] : faq) };
  check((await api('ADMIN', `/api/admin/guides/${guideBefore.id}/draft`, 'PUT', { content: edited, reason: 'Smoke: direct' })).status, 200);
  check((await api('EDITOR', `/api/admin/guides/${guideBefore.id}/draft/publish`, 'POST')).status, 403);
  check((await api('ADMIN', `/api/admin/guides/${guideBefore.id}/draft/publish`, 'POST')).data.status, 'APPLIED');
  check((await html(guidePage)).text.includes(marker), true);

  // The buttons in the browser: the administrator confirms, and the change is live.
  const browser = await chromium.launch({ headless: true, ...(process.env.UV_CHROMIUM_PATH ? { executablePath: process.env.UV_CHROMIUM_PATH } : {}) });
  try {
   const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
   const [name, value] = cookie('ADMIN').split('=');
   await context.addCookies([{ name, value, url: base }]);
   const page = await context.newPage();
   const dialogs = []; page.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.accept(); });
   await page.goto(`${base}/admin/articles/${created.data.articleId}`, { waitUntil: 'networkidle' });
   await page.locator('#article-title').fill('Direct smoke article, from the editor');
   await page.locator('#article-reason').fill('Smoke: browser publish');
   await page.getByRole('button', { name: 'Save and publish', exact: true }).click();
   await page.getByText('Published. The live article is updated.').waitFor();
   check((await html(`/blog/${ids.articleSlug}`)).text.includes('Direct smoke article, from the editor'), true);
   await page.goto(`${base}${recordPage}`, { waitUntil: 'networkidle' });
   await page.getByLabel('Course name', { exact: true }).fill('Direct smoke course, from the editor');
   await page.locator('#revision-reason').fill('Smoke: browser publish');
   await page.getByRole('button', { name: 'Save and publish', exact: true }).click();
   await page.getByText(/^Published\. Changes to a published record/).waitFor();
   check((await db.query('select name from course where id=$1', [ids.course])).rows[0].name, 'Direct smoke course, from the editor');
   check([dialogs.length, dialogs.every(text => /straight away/.test(text))], [2, true]);
  } finally { await browser.close(); }

  // Bulk publishing includes guide revisions and leaves scheduled articles to their schedule.
  const current = (await db.query('select content from guide where id=$1', [guideBefore.id])).rows[0].content;
  const bulkMarker = 'Smoke: published in bulk.';
  ids.guideRevision = (await db.query(`insert into guide_revision(guide_id,status,content,base_content,reason,created_by,submitted_at) values($1,'NEEDS_REVIEW',$2,$3,'Smoke: bulk',$4,now()) returning id`,
   [guideBefore.id, { ...current, faqs: current.faqs.map((faq, i) => i === 0 ? [faq[0], bulkMarker] : faq) }, current, users.EDITOR.id])).rows[0].id;
  const articleNow = (await db.query('select content from article where id=$1', [created.data.articleId])).rows[0].content;
  ids.scheduled = (await db.query(`insert into article_revision(article_id,status,content,base_content,reason,created_by,submitted_at,scheduled_for,scheduled_by) values($1,'NEEDS_REVIEW',$2,$2,'Smoke: scheduled',$3,now(),now()+interval '2 days',$3) returning id`,
   [created.data.articleId, articleNow, users.ADMIN.id])).rows[0].id;
  const checklist = await html('/admin/publishing-checklist', 'ADMIN');
  check([checklist.text.includes('Guide: Online BCA eligibility'), /Scheduled to publish at .* IST; unschedule it to publish now\./.test(checklist.text)], [true, true]);
  const ready = (await db.query("select id from guide_revision where status='NEEDS_REVIEW' union all select id from catalog_revision where status='NEEDS_REVIEW' union all select id from article_revision where status='NEEDS_REVIEW' and scheduled_for is null")).rows.map(row => row.id);
  check(ready, [ids.guideRevision]);
  const bulk = await api('ADMIN', '/api/admin/publish-ready', 'POST', { revisionIds: [ids.guideRevision] });
  check([bulk.status, bulk.data.guides, bulk.data.published], [200, 1, 1]);
  check((await html(guidePage)).text.includes(bulkMarker), true);
  check((await db.query('select status from article_revision where id=$1', [ids.scheduled])).rows[0].status, 'NEEDS_REVIEW');
  console.log(`PASS ${checks} administrator direct-publish checks; guide restored, disposable rows removed.`);
 } finally {
  if (guideBefore) {
   await db.query('update guide set content=$2, updated_at=$3 where id=$1', [guideBefore.id, guideBefore.content, guideBefore.updated_at]).catch(error => console.error('RESTORE FAILED', error.message));
   await db.query('delete from guide_revision where guide_id=$1 and created_at >= $2', [guideBefore.id, startedAt]).catch(() => {});
  }
  const userIds = Object.values(users).map(user => user.id);
  if (ids.articles.length) {
   await db.query('delete from article_revision where article_id=any($1::uuid[])', [ids.articles]).catch(() => {});
   await db.query('delete from article where id=any($1::uuid[])', [ids.articles]).catch(() => {});
  }
  await db.query('delete from catalog_working_draft where entity_id=$1', [ids.course]).catch(() => {});
  await db.query('delete from catalog_revision where entity_id=$1', [ids.course]).catch(() => {});
  await db.query('delete from course where id=$1', [ids.course]).catch(() => {});
  if (userIds.length) {
   await db.query('delete from cms_audit_log where user_id=any($1::uuid[])', [userIds]).catch(() => {});
   await db.query('delete from cms_user where id=any($1::uuid[])', [userIds]).catch(() => {});
  }
  await db.end().catch(() => {});
 }
})().catch(error => { console.error(error); process.exitCode = 1; });
