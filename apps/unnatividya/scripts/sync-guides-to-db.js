const path = require("path");
const fs = require("fs");
const { Client } = require("pg");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const EXPORT_PATH = path.join(__dirname, "guides-export.json");

// Wave 5 C3: one-time copy of the eligibility and career-scope guides' text into the CMS. Safe to
// re-run: a guide that already has a row is never touched, so CMS edits are never overwritten by a
// deploy. Each new row gets an APPLIED revision as its first history entry, so rollback can always
// return to the migrated text.
async function main() {
  if (!fs.existsSync(EXPORT_PATH)) throw new Error(`${EXPORT_PATH} not found. Run "npm run unnatividya:export-catalog" first.`);
  const { guides } = JSON.parse(fs.readFileSync(EXPORT_PATH, "utf8"));
  if (!Array.isArray(guides) || !guides.length) throw new Error("No guides in the export.");
  const client = new Client({ connectionString: process.env.UNNATIVIDYA_DATABASE_URL || "postgresql://unnatividya_app:unnatividya_app@localhost:5432/unnatividya" });
  await client.connect();
  let created = 0, kept = 0;
  try {
    await client.query("begin");
    await client.query("select pg_advisory_xact_lock($1)", [714083293]);
    for (const guide of guides) {
      const row = (await client.query("insert into guide (kind, guide_key, content) values ($1, $2, $3) on conflict (kind, guide_key) do nothing returning id", [guide.kind, guide.key, guide.content])).rows[0];
      if (!row) { kept++; continue; }
      await client.query(`insert into guide_revision (guide_id, status, content, base_content, reason, submitted_at, reviewed_at, review_note)
        values ($1, 'APPLIED', $2, null, 'Migrated from the website code', now(), now(), 'Published before the CMS guide editor existed')`, [row.id, guide.content]);
      created++;
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
  console.log(`Migrated ${created} guides; kept ${kept} that were already in the CMS.`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
