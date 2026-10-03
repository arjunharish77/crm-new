// Local-only regression test. Temporary tables shadow the catalog; real rows are never changed.
const assert = require('node:assert/strict');
const { Client } = require('pg');
const { seedCatalog } = require('./sync-catalog-to-db');
const url = process.env.UNNATIVIDYA_DATABASE_URL;
if (!url || !['localhost','127.0.0.1'].includes(new URL(url).hostname)) throw Error('Local database required');
const db = new Client({ connectionString: url });
let checks = 0;
function check(actual, expected) { assert.deepEqual(actual, expected); checks++; }
const university = { id:'seed-university', slug:'seed-university', name:'Seed University', shortName:'Seed', city:'Test', data:{ about:'Original' } };
const course = { id:'seed-course', slug:'seed-course', universityId:university.id, name:'Seed Course', shortName:'Course', level:'PG', programType:'DEGREE', ugcApproved:false, stream:'Management', fee:1000, duration:'2 years', data:{ eligibility:'Original' } };
const catalog = { universities:[university], courses:[course] };
async function snapshot() {
  return {
    universities:(await db.query('select * from pg_temp.university order by id')).rows,
    courses:(await db.query('select * from pg_temp.course order by id')).rows,
  };
}
(async () => {
  await db.connect();
  await db.query('create temporary table university (like public.university including all)');
  await db.query('create temporary table course (like public.course including all)');
  await db.query('alter table pg_temp.course add foreign key (university_id) references pg_temp.university(id)');
  // Prove unqualified seed writes resolve to the temporary tables, not public.
  check((await db.query("select 'university'::regclass::oid = 'pg_temp.university'::regclass::oid as isolated")).rows[0].isolated,true);
  check((await db.query("select 'course'::regclass::oid = 'pg_temp.course'::regclass::oid as isolated")).rows[0].isolated,true);
  check(await seedCatalog(db,catalog),{universitiesInserted:1,coursesInserted:1,universitiesPreserved:0,coursesPreserved:0});
  const initial = await snapshot();
  check([initial.universities[0].status,initial.universities[0].is_published],['DRAFT',false]);
  check([initial.courses[0].status,initial.courses[0].is_published],['DRAFT',false]);
  check(await seedCatalog(db,catalog),{universitiesInserted:0,coursesInserted:0,universitiesPreserved:1,coursesPreserved:1});
  check(await snapshot(),initial);
  // Preserve edited fields, reviewed JSON, publication choices and timestamps exactly.
  await db.query("update university set name='Editorial university', status='PUBLISHED', is_published=true, data='{\"reviewed\":true}', updated_at='2025-01-01'");
  await db.query("update course set name='Editorial course', fee_inr=4321, status='ARCHIVED', is_published=false, data='{\"reviewed\":true}', updated_at='2025-01-01'");
  await db.query("insert into university(id,slug,name,short_name,status,is_published) values('cms-only','cms-only','CMS only','CMS','PUBLISHED',true)");
  await db.query("insert into course(id,slug,university_id,name,short_name,level,stream,status,is_published) values('cms-only-course','cms-only-course','cms-only','CMS course','CMS','UG','Arts','NEEDS_REVIEW',false)");
  const editorial = await snapshot();
  await seedCatalog(db,catalog);
  check(await snapshot(),editorial);
  await seedCatalog(db,{universities:[],courses:[]});
  check(await snapshot(),editorial);
  // Any later failure rolls back earlier inserts from the same seed operation.
  await assert.rejects(seedCatalog(db,{ universities:[{...university,id:'rollback-university',slug:'rollback-university'}], courses:[{...course,id:'conflict-course'}] }),e=>e.code==='23505'); checks++;
  check(await snapshot(),editorial);
  await assert.rejects(seedCatalog(db,{universities:[],courses:[{...course,id:'orphan',slug:'orphan',universityId:'missing'}]}),e=>e.code==='23503'); checks++;
  check(await snapshot(),editorial);
  await assert.rejects(seedCatalog(db,{universities:[university,university],courses:[]}),/duplicate record ID/); checks++;
  await assert.rejects(seedCatalog(db,{universities:null,courses:[]}),/arrays are required/); checks++;
  check(await snapshot(),editorial);
  console.log(`PASS ${checks} catalog seed checks; only session-local temporary tables used.`);
})().catch(error=>{console.error(error.message);process.exitCode=1}).finally(()=>db.end());
