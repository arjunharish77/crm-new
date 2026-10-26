// Last-good catalog check (next-phase plan §8). Local only. Primes the server with a valid
// catalog, then breaks one published record directly in the database (as a manual SQL edit
// would, bypassing CMS validation). Public pages must keep serving the last good catalog. The
// record is restored exactly afterwards.
const assert = require('node:assert/strict');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const { Client } = require('pg');
const base = process.env.UV_TEST_URL || 'http://localhost:3001';
const connectionString = process.env.UNNATIVIDYA_DATABASE_URL;
if (!connectionString || ![connectionString, base].every(value => ['localhost', '127.0.0.1'].includes(new URL(value).hostname))) throw Error('Local endpoints required');
const db = new Client({ connectionString });
let checks = 0, original;
function check(actual, expected) { assert.deepEqual(actual, expected); checks++; }
(async () => {
 try {
  await db.connect();
  const primed = await fetch(base + '/courses/mba-muj');
  check(primed.status, 200);
  original = (await db.query('select duration, updated_at from course where id=$1', ['mba-muj'])).rows[0];
  await db.query("update course set duration='' where id=$1", ['mba-muj']);
  for (const url of ['/courses/mba-muj', '/courses', '/']) {
   const response = await fetch(base + url);
   check(response.status, 200);
   check((await response.text()).includes(original.duration), true);
  }
  console.log(`PASS ${checks} last-good catalog checks; record restored.`);
 } finally {
  if (original) await db.query('update course set duration=$2, updated_at=$3 where id=$1', ['mba-muj', original.duration, original.updated_at]).catch(error => console.error('RESTORE FAILED', error.message));
  await db.end().catch(() => {});
 }
})().catch(error => { console.error(error); process.exit(1); });
