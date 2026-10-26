// Local-only public rendering check. Adds a disposable course, then removes it.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const { Client } = require('pg');
const prepared = require('../src/data/prepared-program-details.json');
const base = process.env.UV_TEST_URL || 'http://localhost:3100';
const dbUrl = process.env.UNNATIVIDYA_DATABASE_URL;
if (!dbUrl || ![base, dbUrl].every(value => ['localhost', '127.0.0.1'].includes(new URL(value).hostname))) throw Error('Local endpoints required');
const db = new Client({ connectionString: dbUrl });
const id = `program-details-smoke-${randomUUID().slice(0, 8)}`;
let checks = 0;
function check(value, expected) { assert.deepEqual(value, expected); checks++; }

(async () => {
  await db.connect();
  check(prepared.length, 3);
  await db.query(`insert into course(id,slug,university_id,name,short_name,level,program_type,ugc_approved,stream,fee_inr,duration,status,is_published,data)
    select $1,$1,university_id,'Program details smoke course',short_name,level,program_type,ugc_approved,stream,fee_inr,duration,'PUBLISHED',true,data
    from course where id='mba-muj'`, [id]);
  const url = `${base}/courses/${id}`;
  const before = await fetch(url);
  check(before.status, 200);
  check((await before.text()).includes('The stated assessment split is 30% continuous assignments'), false);
  const details = prepared.find(row => row.courseId === 'mba-muj').programDetails;
  await db.query("update course set data=jsonb_set(data,'{programDetails}',$2::jsonb,true), updated_at=now() where id=$1", [id, JSON.stringify(details)]);
  const after = await fetch(url);
  check(after.status, 200);
  const html = await after.text();
  check(html.includes('The stated assessment split is 30% continuous assignments'), true);
  check(html.includes('Possible charges beyond tuition'), true);
  check(html.includes('When you choose a specialization'), true);
  check(html.includes('Official source'), true);
  console.log(`PASS ${checks} program-detail checks; disposable course will be removed.`);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await db.query('delete from course where id=$1', [id]).catch(() => {});
  await db.end().catch(() => {});
});
