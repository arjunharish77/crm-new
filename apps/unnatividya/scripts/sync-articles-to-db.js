const path = require("path");
const fs = require("fs");
const { Client } = require("pg");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const EXPORT_PATH = path.join(__dirname, "articles-export.json");

// One-time migration of the code posts into the CMS (decision 8), safe to re-run: an article that
// already exists is never touched, so CMS edits and unpublishing are never overwritten by a deploy.
// New rows are published (they are the posts already live) and get an APPLIED revision as their
// first history entry, so rollback can always return to the migrated text.
async function main() {
  if (!fs.existsSync(EXPORT_PATH)) throw new Error(`${EXPORT_PATH} not found. Run "npm run unnatividya:export-catalog" first.`);
  const { articles } = JSON.parse(fs.readFileSync(EXPORT_PATH, "utf8"));
  if (!Array.isArray(articles) || !articles.length) throw new Error("No articles in the export.");
  const client = new Client({ connectionString: process.env.UNNATIVIDYA_DATABASE_URL || "postgresql://unnatividya_app:unnatividya_app@localhost:5432/unnatividya" });
  await client.connect();
  let created = 0, kept = 0;
  try {
    await client.query("begin");
    for (const article of articles) {
      const row = (await client.query(
        `insert into article (slug, status, content, published_at) values ($1, 'PUBLISHED', $2, $3::date)
         on conflict (slug) do nothing returning id`, [article.slug, article.content, article.content.publishedDate])).rows[0];
      if (!row) { kept++; continue; }
      await client.query(`insert into article_revision (article_id, status, content, base_content, reason, submitted_at, reviewed_at, review_note)
        values ($1, 'APPLIED', $2, null, 'Migrated from the website code', now(), now(), 'Published before the CMS article editor existed')`, [row.id, article.content]);
      created++;
    }
    await client.query("commit");
  } catch (error) { await client.query("rollback"); throw error; }
  finally { await client.end(); }
  console.log(`Migrated ${created} articles as published; kept ${kept} that already exist in the CMS.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
