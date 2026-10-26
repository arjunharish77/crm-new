import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import { CategoryFeeBatchChangedError, getCategoryFeeBatchPreview, stageCategoryFeeBatch } from "../src/lib/category-fee-batch";

const root = join(import.meta.dirname, "..");
const prepared = JSON.parse(readFileSync(join(root, "src/data/prepared-category-fees.json"), "utf8"));
let checked = 0;
// Each draft is checked against the evidence it cites: the 3 October prospectus review, or the
// 12 October new-batch re-check of the program pages (MUJ fees that changed).
const recheck = JSON.parse(readFileSync(join(root, "docs/FEE_RECHECK_2026-10-12.json"), "utf8"));
for (const school of ["MUJ", "SMU"]) {
  const evidence = JSON.parse(readFileSync(join(root, `docs/${school}_CATEGORY_FEES_2026-10-03.json`), "utf8"));
  for (const program of evidence.programs) {
    const draft = prepared.find((item: { courseId: string }) => item.courseId === program.courseId);
    assert.ok(draft, `Missing ${program.courseId}`);
    assert.equal(draft.programUrl, program.sourceUrl);
    const latest = recheck.programs.find((item: { courseId: string }) => item.courseId === program.courseId);
    const fromRecheck = draft.categoryFees.checkedAt === recheck.checkedAt;
    if (fromRecheck) {
      assert.equal(draft.categoryFees.sourceUrl, latest.sourceUrl);
      assert.equal(draft.expectedFee, latest.officialIndianBaseInr);
    } else {
      assert.equal(draft.categoryFees.sourceUrl, evidence.prospectus.url);
      assert.equal(draft.categoryFees.checkedAt, evidence.checkedAt);
    }
    assert.equal(draft.categoryFees.rows.length, program.categories.length);
    program.categories.forEach((source: { currency: string; semesterFee: number; baseTotal: number; semesterCount: number }, index: number) => {
      const row = draft.categoryFees.rows[index];
      const current = fromRecheck ? latest.categories[index] : source;
      assert.deepEqual([row.currency, row.perSemester, row.total, row.semesters], [current.currency, current.semesterFee, current.baseTotal, source.semesterCount]);
      assert.equal(row.total, row.perSemester * row.semesters);
      // Whatever the source date, the draft matches today's official page.
      assert.deepEqual([row.currency, row.total, row.perSemester], [latest.categories[index].currency, latest.categories[index].baseTotal, latest.categories[index].semesterFee]);
      checked++;
    });
  }
}
assert.equal(checked, 45);
// Prepared fee corrections match the 12 October page values.
const corrections = JSON.parse(readFileSync(join(root, "src/data/prepared-fee-corrections.json"), "utf8"));
for (const correction of corrections) {
  const latest = recheck.programs.find((item: { courseId: string }) => item.courseId === correction.courseId);
  assert.equal(correction.fee, latest.officialIndianBaseInr, `${correction.courseId}: correction differs from the 12 October page`);
  assert.equal(correction.expectedFee, latest.catalogFeeInr, `${correction.courseId}: correction baseline differs from the catalog`);
}

const url = process.env.UNNATIVIDYA_DATABASE_URL;
if (!url) throw new Error("UNNATIVIDYA_DATABASE_URL is required.");
if (!["localhost", "127.0.0.1", "::1"].includes(new URL(url).hostname)) throw new Error("This smoke check only uses the local website database.");
const pool = new Pool({ connectionString: url });
const db = await pool.connect();
try {
  await db.query("begin");
  const preview = await getCategoryFeeBatchPreview(db, true);
  const ready = preview.filter(item => !item.reason).map(item => item.courseId);
  assert.equal(preview.length, 18);
  // A draft whose Indian fee differs from the course (the six MUJ new-batch fees, until their fee
  // corrections are published) is held back with that reason; every other draft is ready.
  const fees = new Map((await db.query<{ id: string; fee_inr: number }>("select id, fee_inr from course where id=any($1)", [prepared.map((item: { courseId: string }) => item.courseId)])).rows.map(row => [row.id, row.fee_inr]));
  const expectedReady = prepared.filter((item: { courseId: string; expectedFee: number }) => fees.get(item.courseId) === item.expectedFee).map((item: { courseId: string }) => item.courseId).sort();
  assert.deepEqual([...ready].sort(), expectedReady, `Unexpected blocked fee drafts: ${JSON.stringify(preview.filter(item => item.reason))}`);
  assert.ok(preview.filter(item => item.reason).every(item => item.reason === "Current Indian fee differs from the prepared amount."), "Only fee changes may hold a draft back");
  const administrator = (await db.query<{ id: string }>("select id from cms_user where role='ADMIN' and is_active=true order by created_at limit 1")).rows[0];
  assert.ok(administrator, "A local CMS administrator is needed for the transactional staging check");
  const ids = await stageCategoryFeeBatch(db, administrator.id, ready);
  assert.equal(ids.length, ready.length);
  const proposed = await db.query("select count(*)::int as n from catalog_revision where id=any($1) and proposed_content->'data' ? 'categoryFees'", [ids]);
  assert.equal(proposed.rows[0].n, ready.length);
  const published = await db.query("select count(*)::int as n from course where id=any($1) and data ? 'categoryFees'", [ready]);
  assert.equal(published.rows[0].n, 0, "Staging must not change public course records");
  await assert.rejects(stageCategoryFeeBatch(db, administrator.id, ready), CategoryFeeBatchChangedError,
    "A repeated or stale submission must not add duplicate proposals");
  await db.query("rollback");
  console.log(`PASS ${checked} source fee schedules; ${ready.length} ready local proposals; staging remains private and rolled back`);
} catch (error) { await db.query("rollback").catch(() => {}); throw error; }
finally { db.release(); await pool.end(); }
