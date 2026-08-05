const { Client } = require("pg");
const dotenv = require("dotenv");

dotenv.config({ path: ".env" });

async function main() {
  const adminUrl = process.env.LOCAL_POSTGRES_ADMIN_URL || "postgresql://localhost:5432/postgres";
  const dbName = "unnatividya";
  const appUser = "unnatividya_app";
  const appPassword = "unnatividya_app";
  const client = new Client({ connectionString: adminUrl });
  await client.connect();

  const userExists = await client.query("select 1 from pg_roles where rolname = $1", [appUser]);
  if (!userExists.rowCount) {
    await client.query(`create role ${appUser} login password '${appPassword}'`);
    console.log(`Created role ${appUser}`);
  } else {
    console.log(`Role ${appUser} already exists`);
  }

  const dbExists = await client.query("select 1 from pg_database where datname = $1", [dbName]);
  if (!dbExists.rowCount) {
    await client.query(`create database ${dbName} owner ${appUser}`);
    console.log(`Created database ${dbName}`);
  } else {
    console.log(`Database ${dbName} already exists`);
  }

  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
