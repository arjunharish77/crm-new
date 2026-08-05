const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const dotenv = require("dotenv");

dotenv.config({ path: ".env" });

async function main() {
  const connectionString =
    process.env.UNNATIVIDYA_DATABASE_URL ||
    "postgresql://unnatividya_app:unnatividya_app@localhost:5432/unnatividya";
  const client = new Client({ connectionString });
  await client.connect();
  await client.query(`
    create table if not exists schema_migration (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const migrationsDir = path.join(__dirname, "..", "migrations");
  const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();

  for (const file of files) {
    const already = await client.query("select 1 from schema_migration where filename = $1", [file]);
    if (already.rowCount) {
      console.log(`Skipped ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into schema_migration (filename) values ($1)", [file]);
      await client.query("commit");
      console.log(`Applied ${file}`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }

  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
