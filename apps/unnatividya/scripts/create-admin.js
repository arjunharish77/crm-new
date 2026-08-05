const path = require("path");
const { Client } = require("pg");
const { pbkdf2Sync, randomBytes } = require("crypto");
const dotenv = require("dotenv");

// Resolved relative to this file, not the caller's cwd, so this behaves the same whether
// invoked as `node scripts/create-admin.js` or `npm run unnatividya:create-admin` from the
// repo root -- otherwise a cwd-relative ".env" can silently pick up an unrelated .env file.
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const PBKDF2_ITERATIONS = 210_000;
const PBKDF2_KEY_LENGTH = 32;
const PBKDF2_DIGEST = "sha256";

// Mirrors src/lib/password.ts exactly -- must stay in sync with it so the login
// route's verifyPassword() can read whatever hash this script writes.
function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LENGTH, PBKDF2_DIGEST).toString("hex");
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${hash}`;
}

function readArg(flag, fallback) {
  const index = process.argv.indexOf(flag);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function main() {
  const name = readArg("--name", "Admin");
  const email = readArg("--email", "admin@unnatividya.com").toLowerCase();
  const password = readArg("--password", "UnnatiVidya@2026");

  if (password.length < 10) {
    throw new Error("Password must be at least 10 characters (matches the /admin/setup validation rule).");
  }

  const connectionString =
    process.env.UNNATIVIDYA_DATABASE_URL || "postgresql://unnatividya_app:unnatividya_app@localhost:5432/unnatividya";
  const client = new Client({ connectionString });
  await client.connect();

  try {
    const existing = await client.query("select id from cms_user where email = $1", [email]);
    if (existing.rows.length > 0) {
      console.log(`CMS admin already exists for ${email} (id ${existing.rows[0].id}) -- not creating a duplicate.`);
      return;
    }

    await client.query("begin");
    try {
      const created = await client.query(
        `insert into cms_user (name, email, password_hash, role, two_factor_enabled)
         values ($1, $2, $3, 'ADMIN', true)
         returning id`,
        [name, email, hashPassword(password)],
      );
      await client.query(
        `insert into cms_audit_log (user_id, action, entity_type, entity_id, metadata)
         values ($1, 'CMS_ADMIN_CREATED', 'cms_user', $2, '{"source":"create-admin.js"}'::jsonb)`,
        [created.rows[0].id, created.rows[0].id],
      );
      await client.query("commit");
      console.log(`Created CMS admin ${email} (id ${created.rows[0].id}).`);
      console.log("Two-factor (email OTP) is enabled by default, matching the manual /admin/setup flow.");
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
