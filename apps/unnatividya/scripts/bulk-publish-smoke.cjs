// Disposable local-only integration check for the one-click CMS publish action.
const assert = require('node:assert/strict');
const { createHmac, randomUUID } = require('node:crypto');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const { Client } = require('pg');

const base = process.env.UV_TEST_URL || 'http://localhost:3100';
const dbUrl = process.env.UNNATIVIDYA_DATABASE_URL;
if (!dbUrl || ![base, dbUrl].every(value => ['localhost', '127.0.0.1'].includes(new URL(value).hostname))) throw Error('Local endpoints required');
const db = new Client({ connectionString: dbUrl });
const suffix = randomUUID().slice(0, 8);
const ids = { course: `bulk-smoke-${suffix}`, articleSlug: `bulk-smoke-${suffix}`, users: [] };
let checks = 0;
function check(actual, expected) { assert.deepEqual(actual, expected); checks++; }
function cookie(user) {
  const iat = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ userId: user.id, email: user.email, role: user.role, iat, exp: iat + 600 })).toString('base64url');
  return `uv_admin_session=${payload}.${createHmac('sha256', process.env.UNNATIVIDYA_SESSION_SECRET || 'dev-secret-change-me').update(payload).digest('base64url')}`;
}
async function request(user, route, method = 'GET', body) {
  const response = await fetch(base + route, { method, headers: { Cookie: cookie(user), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: response.headers.get('content-type')?.includes('json') ? await response.json() : await response.text() };
}

(async () => {
  await db.connect();
  const users = {};
  for (const role of ['ADMIN', 'EDITOR']) {
    const id = randomUUID(), email = `bulk-smoke-${role.toLowerCase()}-${suffix}@example.invalid`;
    await db.query("insert into cms_user(id,email,name,password_hash,role) values($1,$2,'Bulk smoke user','not-a-login-password',$3)", [id, email, role]);
    users[role] = { id, email, role }; ids.users.push(id);
  }
  await db.query(`insert into course(id,slug,university_id,name,short_name,level,program_type,ugc_approved,stream,fee_inr,duration,status,is_published,data)
    select $1,$1,university_id,'Bulk smoke course',short_name,level,program_type,ugc_approved,stream,fee_inr,duration,'PUBLISHED',true,data from course where id='mba-muj'`, [ids.course]);
  const snapshot = (await db.query('select to_jsonb(t) as snapshot from course t where id=$1', [ids.course])).rows[0].snapshot;
  const keys = ['slug', 'name', 'short_name', 'data', 'university_id', 'level', 'program_type', 'ugc_approved', 'stream', 'fee_inr', 'duration'];
  const content = Object.fromEntries(keys.map(key => [key, snapshot[key]]));
  content.name = 'Bulk smoke course reviewed';
  ids.courseRevision = (await db.query(`insert into catalog_revision(entity_type,entity_id,base_snapshot,proposed_content,reason,created_by)
    values('course',$1,$2,$3,'Disposable review fixture',$4) returning id`, [ids.course, snapshot, content, users.EDITOR.id])).rows[0].id;

  const articleContent = (await db.query("select content from article where slug='online-mba-guide'")).rows[0].content;
  ids.article = (await db.query("insert into article(slug,status) values($1,'DRAFT') returning id", [ids.articleSlug])).rows[0].id;
  ids.articleRevision = (await db.query(`insert into article_revision(article_id,status,content,base_content,reason,created_by,submitted_at)
    values($1,'NEEDS_REVIEW',$2,null,'Disposable review fixture',$3,now()) returning id`, [ids.article, { ...articleContent, title: 'Bulk smoke article' }, users.EDITOR.id])).rows[0].id;

  const checklist = await request(users.ADMIN, '/admin/publishing-checklist');
  check(checklist.status, 200);
  check(checklist.body.includes('Publish all 2 ready revisions'), true);
  const batch = { revisionIds: [ids.courseRevision, ids.articleRevision] };
  check((await request(users.EDITOR, '/api/admin/publish-ready', 'POST', batch)).status, 403);
  check((await request(users.ADMIN, '/api/admin/publish-ready', 'POST', { revisionIds: [ids.courseRevision] })).status, 409);
  check((await db.query('select name from course where id=$1', [ids.course])).rows[0].name, 'Bulk smoke course');
  check((await db.query('select status from article where id=$1', [ids.article])).rows[0].status, 'DRAFT');

  const applied = await request(users.ADMIN, '/api/admin/publish-ready', 'POST', batch);
  check(applied.status, 200);
  check([applied.body.catalog, applied.body.articles], [1, 1]);
  check((await db.query('select name from course where id=$1', [ids.course])).rows[0].name, content.name);
  check((await db.query('select status from article where id=$1', [ids.article])).rows[0].status, 'PUBLISHED');
  check((await db.query('select status from catalog_revision where id=$1', [ids.courseRevision])).rows[0].status, 'APPLIED');
  check((await db.query('select status from article_revision where id=$1', [ids.articleRevision])).rows[0].status, 'APPLIED');
  check((await request(users.ADMIN, '/api/admin/publish-ready', 'POST', batch)).status, 409);
  console.log(`PASS ${checks} bulk publish checks; local fixtures will be removed.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (ids.users.length) await db.query('delete from cms_audit_log where user_id=any($1::uuid[])', [ids.users]).catch(() => {});
  if (ids.courseRevision) await db.query('delete from catalog_revision where id=$1', [ids.courseRevision]).catch(() => {});
  if (ids.articleRevision) await db.query('delete from article_revision where id=$1', [ids.articleRevision]).catch(() => {});
  if (ids.course) await db.query('delete from course where id=$1', [ids.course]).catch(() => {});
  if (ids.article) await db.query('delete from article where id=$1', [ids.article]).catch(() => {});
  if (ids.users.length) await db.query('delete from cms_user where id=any($1::uuid[])', [ids.users]).catch(() => {});
  await db.end().catch(() => {});
});
