import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCatalogSnapshot, catalogReader, type CatalogRow } from "../src/lib/catalog-snapshot";

const seed=JSON.parse(readFileSync(new URL("./catalog-export.json",import.meta.url),"utf8"));
const universities:CatalogRow[]=seed.universities.map((u:Record<string,unknown>)=>({...u,short_name:u.shortName,status:"PUBLISHED",is_published:true}));
const courses:CatalogRow[]=seed.courses.map((c:Record<string,unknown>)=>({...c,short_name:c.shortName,university_id:c.universityId,program_type:c.programType,ugc_approved:c.ugcApproved,fee_inr:c.fee,status:"PUBLISHED",is_published:true}));
let checks=0;
function check(actual:unknown,expected:unknown){assert.deepEqual(actual,expected);checks++;}
const result=buildCatalogSnapshot(universities,courses);
check(result.issues,[]); assert.ok(result.snapshot);
check([result.snapshot.universities.length,result.snapshot.courses.length],[universities.length,courses.length]);
const reader=catalogReader(result.snapshot);
check(reader.getCourseBySlug(String(courses[0].slug))?.fee,courses[0].fee_inr);
check(reader.getCourseBySlug(String(courses[0].id))?.university.id,courses[0].university_id);
check(reader.getCourseBySlug('missing'),null);
check(reader.getUniversityBySlug(String(universities[0].slug))?.id,universities[0].id);
const changed=structuredClone(courses);changed[0].fee_inr=123456;
changed[0].data={...(changed[0].data as object),feePlans:[],highlights:[]};
const fresh=buildCatalogSnapshot(universities,changed);assert.ok(fresh.snapshot);
check(catalogReader(fresh.snapshot).getCourseBySlug(String(changed[0].id))?.fee,123456);
check(reader.getCourseBySlug(String(courses[0].id))?.fee,courses[0].fee_inr); // snapshots cannot leak across requests
check(buildCatalogSnapshot(universities,[...courses,{id:'private-draft',status:'DRAFT',is_published:false,data:{secret:'never expose'}}]).snapshot,result.snapshot);
check(buildCatalogSnapshot(universities,courses.map((row,i)=>i===0?{...row,status:'ARCHIVED',is_published:false}:row)).snapshot?.courses.length,courses.length-1);
function rejects(rows:CatalogRow[],universityRows=universities){const invalid=buildCatalogSnapshot(universityRows,rows);check(invalid.snapshot,null);check(invalid.issues.length>0,true);}
rejects(courses.map((row,i)=>i===0?{...row,fee_inr:null}:row));
rejects(courses.map((row,i)=>i===0?{...row,data:{}}:row));
rejects(courses.map((row,i)=>i===0?{...row,data:{...(row.data as object),curriculum:'broken'}}:row));
rejects(courses.map((row,i)=>i===0?{...row,university_id:'missing'}:row));
rejects(courses,universities.map((row,i)=>i===0?{...row,is_published:false}:row));
rejects([...courses,courses[0]]);
rejects(courses.map((row,i)=>i===0?{...row,data:{...(row.data as object),sourceUrls:['javascript:alert(1)']}}:row));
rejects([],[]);
const internal=structuredClone(courses);internal[0].data={...(internal[0].data as object),internalNote:'secret',sourceReview:{rawHtml:'private'},name:'Wrong JSON name'};
const cleaned=buildCatalogSnapshot(universities,internal);assert.ok(cleaned.snapshot);
check(cleaned.snapshot.courses[0].name,courses[0].name);
check(JSON.stringify(cleaned.snapshot).includes('secret'),false);
check(JSON.stringify(cleaned.snapshot).includes('rawHtml'),false);
const conflicting=structuredClone(courses);
conflicting[0].fee_inr=123456;
rejects(conflicting);
const datedUniversities=universities.map(row=>({...row,updated_at:'2026-08-01T00:00:00.000Z'}));
const datedCourses=courses.map(row=>({...row,updated_at:'2026-09-01T00:00:00.000Z'}));
const dated=buildCatalogSnapshot(datedUniversities,datedCourses);assert.ok(dated.snapshot);
check(dated.snapshot.modifiedAt[`course:${courses[0].id}`],'2026-09-01T00:00:00.000Z');
check(dated.snapshot.modifiedAt[`university:${universities[0].id}`],'2026-08-01T00:00:00.000Z');
console.log(`PASS ${checks} catalog snapshot checks using the build export; no database writes.`);

if(process.argv.includes('--local-db')) {
  void (async()=>{
    const {default:dotenv}=await import('dotenv');
    dotenv.config({path:new URL('../.env',import.meta.url).pathname,quiet:true});
    const url=process.env.UNNATIVIDYA_DATABASE_URL;
    if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname)) throw Error('Local database required');
    const {Client}=await import('pg');const client=new Client({connectionString:url});await client.connect();
    try {
      await client.query('begin isolation level repeatable read read only');
      const universities=await client.query('select * from university order by id');
      const courses=await client.query('select * from course order by id');
      const result=buildCatalogSnapshot(universities.rows,courses.rows);
      await client.query('commit');
      console.log(JSON.stringify({publishedUniversities:result.snapshot?.universities.length,publishedCourses:result.snapshot?.courses.length,issues:result.issues},null,2));
      if(result.issues.length) process.exitCode=1;
    } finally {await client.end();}
  })().catch(error=>{console.error(error.message);process.exitCode=1});
}
