const path = require("path");
const fs = require("fs");
const { Client } = require("pg");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });

// Wave 4 (decision W4): loads prepared article drafts into the CMS review queue. Nothing is published:
// - a new slug becomes a DRAFT article with one revision waiting for review;
// - a revision of an existing article is queued only if the article still shows the exact text the
//   draft was written against (basedOn); otherwise it is skipped, so CMS edits are never overwritten;
// - a slug that already has a revision waiting for review, or a new slug that already exists, is
//   skipped, so the script is safe to re-run.
// An administrator reviews each item in CMS → Articles and applies or rejects it as usual.
const DRAFTS_PATH = path.join(__dirname, "prepared-article-drafts.json");

async function main() {
  const { drafts, batch } = JSON.parse(fs.readFileSync(DRAFTS_PATH, "utf8"));
  if (!Array.isArray(drafts) || !drafts.length) throw new Error("No prepared drafts found.");
  const client = new Client({ connectionString: process.env.UNNATIVIDYA_DATABASE_URL || "postgresql://unnatividya_app:unnatividya_app@localhost:5432/unnatividya" });
  await client.connect();
  const result = { queued: [], skipped: [] };
  try {
    await client.query("begin");
    for (const draft of drafts) {
      const article = (await client.query("select id, content from article where slug=$1 for update", [draft.slug])).rows[0];
      if (draft.kind === "new") {
        if (article) { result.skipped.push(`${draft.slug} (already exists)`); continue; }
        const created = (await client.query("insert into article (slug, status) values ($1, 'DRAFT') returning id", [draft.slug])).rows[0];
        await client.query(`insert into article_revision (article_id, status, content, base_content, reason, submitted_at)
          values ($1, 'NEEDS_REVIEW', $2, null, $3, now())`, [created.id, draft.content, draft.reason]);
        result.queued.push(`${draft.slug} (new article)`);
        continue;
      }
      if (!article) { result.skipped.push(`${draft.slug} (article not found)`); continue; }
      const waiting = (await client.query("select 1 from article_revision where article_id=$1 and status='NEEDS_REVIEW' and reason=$2", [article.id, draft.reason])).rowCount;
      if (waiting) { result.skipped.push(`${draft.slug} (already waiting for review)`); continue; }
      const same = (await client.query("select $1::jsonb = $2::jsonb as same", [JSON.stringify(article.content), JSON.stringify(draft.basedOn)])).rows[0].same;
      if (!same) { result.skipped.push(`${draft.slug} (changed in the CMS since this draft was prepared)`); continue; }
      await client.query(`insert into article_revision (article_id, status, content, base_content, reason, submitted_at)
        values ($1, 'NEEDS_REVIEW', $2, $3, $4, now())`, [article.id, draft.content, article.content, draft.reason]);
      result.queued.push(`${draft.slug} (revision)`);
    }
    await client.query("commit");
  } catch (error) { await client.query("rollback"); throw error; }
  finally { await client.end(); }
  console.log(`${batch}: queued ${result.queued.length} for review${result.queued.length ? `: ${result.queued.join(", ")}` : ""}.`);
  if (result.skipped.length) console.log(`Skipped ${result.skipped.length}: ${result.skipped.join(", ")}.`);
  console.log("Nothing was published. Review and apply each item in CMS → Articles.");
}

main().catch((error) => { console.error(error); process.exit(1); });
