// Read-only readiness check, suitable for the production image before restarting the website.
const path = require('path');
const fs = require('fs');
const {Client} = require('pg');
require('dotenv').config({path:path.join(__dirname,'../.env'),quiet:true});
const validatorPath=path.join(__dirname,'generated/catalog-snapshot.js');
if(!fs.existsSync(validatorPath)) throw Error('Generated validator missing. Run the website export-catalog build step first.');
const {buildCatalogSnapshot}=require(validatorPath);
const url=process.env.UNNATIVIDYA_DATABASE_URL;
if(!url) throw Error('UNNATIVIDYA_DATABASE_URL is required.');
const client=new Client({connectionString:url});
(async()=>{
  await client.connect();
  await client.query('begin isolation level repeatable read read only');
  const universities=await client.query("select * from university where status='PUBLISHED' and is_published=true order by id");
  const courses=await client.query("select * from course where status='PUBLISHED' and is_published=true order by id");
  const result=buildCatalogSnapshot(universities.rows,courses.rows);
  await client.query('commit');
  if(!result.snapshot){console.error(JSON.stringify({ready:false,issues:result.issues},null,2));process.exitCode=1;return;}
  console.log(JSON.stringify({ready:true,universities:result.snapshot.universities.length,courses:result.snapshot.courses.length,note:'Structure only; source accuracy requires editorial verification.'}));
})().catch(error=>{console.error(error.message);process.exitCode=1}).finally(()=>client.end());
