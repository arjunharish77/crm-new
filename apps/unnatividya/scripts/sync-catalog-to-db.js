const path = require("path");
const fs = require("fs");
const { Client } = require("pg");
const dotenv = require("dotenv");

// Resolved relative to this file, not the caller's cwd -- matches create-admin.js.
dotenv.config({ path: path.join(__dirname, "..", ".env") });

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

async function main() {
  const { universities, courses } = loadCatalogExport();
  const connectionString =
    process.env.UNNATIVIDYA_DATABASE_URL || "postgresql://unnatividya_app:unnatividya_app@localhost:5432/unnatividya";
  const client = new Client({ connectionString });
  await client.connect();

  try {
    await client.query("begin");
    try {
      for (const university of universities) {
        await client.query(
          `insert into university (id, slug, name, short_name, city, status, data, is_published)
           values ($1, $2, $3, $4, $5, 'PUBLISHED', $6::jsonb, true)
           on conflict (id) do update set
             slug = excluded.slug,
             name = excluded.name,
             short_name = excluded.short_name,
             city = excluded.city,
             status = 'PUBLISHED',
             data = excluded.data,
             is_published = true,
             updated_at = now()`,
          [university.id, university.slug, university.name, university.shortName, university.city, JSON.stringify(university.data)],
        );
      }

      for (const course of courses) {
        await client.query(
          `insert into course (
             id, slug, university_id, name, short_name, level, program_type,
             ugc_approved, stream, fee_inr, duration, status, data, is_published
           )
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'PUBLISHED', $12::jsonb, true)
           on conflict (id) do update set
             slug = excluded.slug,
             university_id = excluded.university_id,
             name = excluded.name,
             short_name = excluded.short_name,
             level = excluded.level,
             program_type = excluded.program_type,
             ugc_approved = excluded.ugc_approved,
             stream = excluded.stream,
             fee_inr = excluded.fee_inr,
             duration = excluded.duration,
             status = 'PUBLISHED',
             data = excluded.data,
             is_published = true,
             updated_at = now()`,
          [
            course.id,
            course.slug,
            course.universityId,
            course.name,
            course.shortName,
            course.level,
            course.programType,
            course.ugcApproved,
            course.stream,
            course.fee,
            course.duration,
            JSON.stringify(course.data),
          ],
        );
      }

      // Anything left in the DB that catalog.ts no longer knows about gets archived, never
      // deleted -- reversible, and keeps the DB honest about what the live site actually shows.
      const universityIds = universities.map((u) => u.id);
      const courseIds = courses.map((c) => c.id);
      const archivedUniversities = await client.query(
        `update university set status = 'ARCHIVED', is_published = false, updated_at = now()
         where status <> 'ARCHIVED' and not (id = any($1::text[])) returning id`,
        [universityIds],
      );
      const archivedCourses = await client.query(
        `update course set status = 'ARCHIVED', is_published = false, updated_at = now()
         where status <> 'ARCHIVED' and not (id = any($1::text[])) returning id`,
        [courseIds],
      );

      await client.query("commit");
      console.log(`Synced ${universities.length} universities and ${courses.length} courses from catalog.ts.`);
      if (archivedUniversities.rows.length) {
        console.log(
          `Archived ${archivedUniversities.rows.length} university row(s) no longer in catalog.ts: ${archivedUniversities.rows.map((row) => row.id).join(", ")}`,
        );
      }
      if (archivedCourses.rows.length) {
        console.log(
          `Archived ${archivedCourses.rows.length} course row(s) no longer in catalog.ts: ${archivedCourses.rows.map((row) => row.id).join(", ")}`,
        );
      }
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
