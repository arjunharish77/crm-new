const path = require("path");
const fs = require("fs");
const { Client } = require("pg");
const dotenv = require("dotenv");

// Resolved relative to this file, not the caller's cwd -- matches create-admin.js.
dotenv.config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const EXPORT_PATH = path.join(__dirname, "catalog-export.json");

function loadCatalogExport() {
  if (!fs.existsSync(EXPORT_PATH)) {
    throw new Error(
      `${EXPORT_PATH} not found. Run "npm run export-catalog" (apps/unnatividya) or ` +
        `"npm run unnatividya:export-catalog" (repo root) first -- it's generated at build time ` +
        `from src/data/catalog.ts and isn't committed to git.`,
    );
  }
  return JSON.parse(fs.readFileSync(EXPORT_PATH, "utf8"));
}

// Seed missing records only. CMS data and publication decisions are never replaced by a deploy.
async function seedCatalog(client, catalog) {
  if (!catalog || !Array.isArray(catalog.universities) || !Array.isArray(catalog.courses)) {
    throw new Error("Invalid catalog export: universities and courses arrays are required.");
  }
  const { universities, courses } = catalog;
  for (const rows of [universities, courses]) {
    const ids = new Set();
    for (const row of rows) {
      if (!row || typeof row.id !== "string" || !row.id || ids.has(row.id)) {
        throw new Error("Invalid catalog export: missing or duplicate record ID.");
      }
      ids.add(row.id);
    }
  }
  const counts = { universitiesInserted: 0, coursesInserted: 0, universitiesPreserved: 0, coursesPreserved: 0 };
  await client.query("begin");
  try {
    // Serialize concurrent deployment seeds. ON CONFLICT also protects concurrent CMS inserts.
    await client.query("select pg_advisory_xact_lock(714083291)");
    for (const university of universities) {
      const result = await client.query(
        `insert into university (id, slug, name, short_name, city, status, data, is_published)
         values ($1, $2, $3, $4, $5, 'DRAFT', $6::jsonb, false)
         on conflict (id) do nothing`,
        [university.id, university.slug, university.name, university.shortName, university.city, JSON.stringify(university.data)],
      );
      counts.universitiesInserted += result.rowCount;
      counts.universitiesPreserved += 1 - result.rowCount;
    }
    for (const course of courses) {
      const result = await client.query(
        `insert into course (
           id, slug, university_id, name, short_name, level, program_type,
           ugc_approved, stream, fee_inr, duration, status, data, is_published
         )
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'DRAFT', $12::jsonb, false)
         on conflict (id) do nothing`,
        [course.id, course.slug, course.universityId, course.name, course.shortName,
          course.level, course.programType, course.ugcApproved, course.stream, course.fee,
          course.duration, JSON.stringify(course.data)],
      );
      counts.coursesInserted += result.rowCount;
      counts.coursesPreserved += 1 - result.rowCount;
    }
    // Deliberately no archive/delete sweep: absence from a code seed is not an editorial decision.
    await client.query("commit");
    return counts;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function main() {
  const catalog = loadCatalogExport();
  const connectionString = process.env.UNNATIVIDYA_DATABASE_URL ||
    "postgresql://unnatividya_app:unnatividya_app@localhost:5432/unnatividya";
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const counts = await seedCatalog(client, catalog);
    console.log(`Seeded ${counts.universitiesInserted} universities and ${counts.coursesInserted} courses as unpublished drafts.`);
    console.log(`Preserved ${counts.universitiesPreserved} existing universities and ${counts.coursesPreserved} existing courses. No records overwritten, published or archived.`);
  } finally {
    await client.end();
  }
}

module.exports = { seedCatalog };
if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
