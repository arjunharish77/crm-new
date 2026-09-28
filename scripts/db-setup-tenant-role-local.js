/* eslint-disable no-console */
// WP07 (F04): provisions the restricted, non-owner, non-bypassrls runtime role that
// TENANT_DATABASE_URL should point at once ENFORCE_TENANT_RLS is turned on. Deliberately a
// separate, manually-invoked script (not wired into db:setup:local or any deploy path) so
// running it is an explicit opt-in for a local or staging environment -- never applied to
// production by this repo's own tooling. See 25_AUDIT_REMEDIATION_PLAN.md WP07 for the staged
// rollout/rollback plan this is one step of.
//
// Deliberately does NOT touch ownership or bypassrls -- the role gets exactly the DML grants it
// needs (matching what crm_app itself is granted in db-setup-local.js, minus ownership/bypassrls),
// so every table's RLS policies apply to it regardless of who owns that table (see
// 25_AUDIT_REMEDIATION_PLAN.md WP07 for why table ownership is inconsistent across this schema's
// base-schema-restored vs migration-added tables -- irrelevant here since this role is never an
// owner either way).
const {
  adminDatabaseUrl,
  directDatabaseUrl,
  quoteIdentifier,
  quoteLiteral,
  withClient,
} = require("./db-utils");

function env(name, fallback) {
  return process.env[name] || fallback;
}

async function main() {
  const tenantUrl = env("TENANT_DATABASE_URL");
  if (!tenantUrl) {
    throw new Error(
      "Set TENANT_DATABASE_URL to the connection string this role should use (e.g. " +
      "postgresql://crm_app_tenant:<password>@localhost:5432/crm_dev) before running this script.",
    );
  }
  const url = new URL(tenantUrl);
  const roleName = url.username;
  const rolePassword = url.password;
  if (!roleName || !rolePassword) {
    throw new Error("TENANT_DATABASE_URL must include both a username and password.");
  }
  const quotedRole = quoteIdentifier(roleName);

  await withClient(adminDatabaseUrl(), async (client) => {
    const role = await client.query("select 1 from pg_roles where rolname = $1", [roleName]);
    if (!role.rowCount) {
      await client.query(`create role ${quotedRole} login password ${quoteLiteral(rolePassword)}`);
      console.log(`Created role ${roleName}`);
    } else {
      await client.query(`alter role ${quotedRole} with login password ${quoteLiteral(rolePassword)}`);
      console.log(`Role ${roleName} already existed -- password/login synchronized`);
    }
    // Explicit, not merely "not granted" -- guards against someone re-running this against a
    // role that was previously (mis)configured with bypassrls by hand.
    await client.query(`alter role ${quotedRole} with nobypassrls nosuperuser nocreatedb nocreaterole`);
  });

  await withClient(directDatabaseUrl(), async (client) => {
    await client.query(`grant usage on schema public to ${quotedRole}`);
    await client.query(`grant select, insert, update, delete on all tables in schema public to ${quotedRole}`);
    await client.query(`grant usage, select, update on all sequences in schema public to ${quotedRole}`);
    // No `alter default privileges ... to <role>` here on purpose: those privileges are already
    // granted (by db-setup-local.js) to whichever role owns the schema (crm_app), and ownership
    // is what this role must never have -- so its grants are refreshed by re-running this script
    // after new tables are added, not automatically.
  });

  console.log(`Role ${roleName}: login, NOT bypassrls, NOT owner, DML-only grants on schema public.`);
  console.log("Re-run this script after adding new tables/migrations to refresh its grants.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
