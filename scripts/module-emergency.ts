/**
 * Emergency module suspension for platform operators (Module 21 VPS runbook).
 *
 *   status  [--all]                                   open emergencies (--all: include lifted)
 *   suspend --module KEY (--tenant ID ... | --all-tenants) --actor EMAIL --reason TEXT
 *           [--notice TEXT] [--include-dependents] [--dry-run] [--confirm KEY]
 *   lift    --module KEY [--tenant ID ...] --actor EMAIL --reason TEXT [--dry-run]
 *
 * --actor must be an active platform admin's email; every change is audited under them.
 * --all-tenants without --dry-run also needs --confirm KEY (the module key typed again).
 * --notice replaces the default message tenant admins receive (the reason stays internal).
 * Exit code: 0 done, 1 error, 2 done but some tenants were blocked, failed or left suspended.
 *
 * On the VPS (see docs/VPS_MODULE_EMERGENCY.md):
 *   docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env run --rm --no-deps worker \
 *     npx tsx scripts/module-emergency.ts suspend --module MARKETPLACE --all-tenants --actor ops@example.com --reason "..." --dry-run
 */
import { createRequire } from "module";
import { parseArgs } from "node:util";
import { liftModuleEmergency, listModuleEmergencies, resolvePlatformAdminActor, suspendModuleEmergency } from "../src/lib/server/module-emergency";

const require = createRequire(import.meta.url);
require("./db-utils.js"); // loads .env.local/.env when run outside a container; no-op inside one

const MESSAGES: Record<string, string> = {
  ACTOR_NOT_PLATFORM_ADMIN: "--actor must be the email of an active platform admin.",
  MODULE_NOT_FOUND: "Unknown module key. Run with `status` or see PlatformModule for keys.",
  CORE_MODULE_CANNOT_BE_DISABLED: "Core modules cannot be suspended.",
  REASON_REQUIRED: "--reason is required (at least 5 characters); it is recorded in the audit log.",
  NO_OPEN_EMERGENCY: "There is no open emergency for this module.",
};

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { values } = parseArgs({
    args: rest,
    options: {
      module: { type: "string" },
      tenant: { type: "string", multiple: true },
      "all-tenants": { type: "boolean", default: false },
      actor: { type: "string" },
      reason: { type: "string" },
      notice: { type: "string" },
      "include-dependents": { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      confirm: { type: "string" },
      all: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
    },
  });
  const print = (data: unknown, text: () => void) => (values.json ? console.log(JSON.stringify(data, null, 2)) : text());

  if (command === "status") {
    const rows = await listModuleEmergencies(values.all);
    return print(rows, () => {
      if (!rows.length) return console.log(values.all ? "No emergencies recorded." : "No open emergencies.");
      for (const row of rows) {
        console.log(`${row.moduleKey}  ${row.liftedAt ? `lifted ${new Date(row.liftedAt).toISOString()}` : "OPEN"}  started ${new Date(row.startedAt).toISOString()} by ${row.startedByEmail ?? row.startedBy}`);
        console.log(`  reason: ${row.reason}`);
        console.log(`  still suspended: ${row.suspendedCount} tenant module(s); resolved: ${row.resolvedCount}`);
      }
    });
  }

  if (command !== "suspend" && command !== "lift") fail("Command must be status, suspend or lift (see the header of scripts/module-emergency.ts).");
  const moduleKey = values.module?.trim().toUpperCase();
  if (!moduleKey) fail("--module is required.");
  if (!values.actor) fail("--actor is required.");
  if (!values.reason) fail(MESSAGES.REASON_REQUIRED);
  const tenants = values.tenant?.map((id) => id.trim()).filter(Boolean) ?? [];
  if (tenants.length && values["all-tenants"]) fail("Use either --tenant or --all-tenants, not both.");

  try {
    const actor = await resolvePlatformAdminActor(values.actor);
    if (command === "suspend") {
      if (!tenants.length && !values["all-tenants"]) fail("Choose --tenant ID (repeatable) or --all-tenants.");
      if (values["all-tenants"] && !values["dry-run"] && values.confirm?.trim().toUpperCase() !== moduleKey) {
        fail(`Suspending for every tenant needs --confirm ${moduleKey}. Run with --dry-run first to see what changes.`);
      }
      const result = await suspendModuleEmergency(actor, {
        moduleKey,
        tenantIds: values["all-tenants"] ? "ALL" : tenants,
        reason: values.reason,
        tenantNotice: values.notice ?? null,
        includeDependents: values["include-dependents"],
        dryRun: values["dry-run"],
      });
      print(result, () => {
        console.log(`${result.dryRun ? "DRY RUN (nothing changed): " : ""}suspend ${result.module.name} (${moduleKey})`);
        if (result.emergency?.reused) console.log(`Adding to the open emergency started ${new Date(result.emergency.startedAt).toISOString()}: ${result.emergency.reason}`);
        for (const row of result.results) {
          console.log(`  ${row.outcome.padEnd(22)} ${row.tenantName} (${row.tenantId})${row.modules.length > 1 ? ` modules: ${row.modules.join(", ")}` : ""}${row.pausedItems ? ` paused items: ${row.pausedItems}` : ""}${row.detail ? ` -- ${row.detail}` : ""}`);
        }
        const count = (outcome: string) => result.results.filter((row) => row.outcome === outcome).length;
        console.log(`Suspended ${count("SUSPENDED")}, already off ${count("ALREADY_OFF")}, already in this emergency ${count("ALREADY_IN_EMERGENCY")}, blocked ${count("BLOCKED_BY_DEPENDENTS")}, failed ${count("FAILED")}.`);
      });
      if (result.results.some((row) => row.outcome === "BLOCKED_BY_DEPENDENTS" || row.outcome === "FAILED")) process.exitCode = 2;
    } else {
      const result = await liftModuleEmergency(actor, { moduleKey, tenantIds: tenants.length ? tenants : "ALL", reason: values.reason, dryRun: values["dry-run"] });
      print(result, () => {
        console.log(`${result.dryRun ? "DRY RUN (nothing changed): " : ""}lift ${result.module.name} (${moduleKey}) emergency started ${new Date(result.emergency.startedAt).toISOString()}`);
        for (const row of result.results) {
          if (row.failed) console.log(`  FAILED  ${row.tenantName} (${row.tenantId}) -- ${row.failed}`);
          for (const item of row.modules) console.log(`  ${item.outcome.padEnd(16)} ${row.tenantName} (${row.tenantId}) ${item.moduleKey}${item.detail ? ` -- ${item.detail}` : ""}`);
        }
        if (!result.dryRun) console.log(result.closed ? "Emergency closed." : "Emergency still open (some tenants not lifted yet).");
      });
      if (result.results.some((row) => row.failed || row.modules.some((item) => item.outcome !== "RESTORED"))) process.exitCode = 2;
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : String(error);
    if (code.startsWith("TENANT_NOT_FOUND:")) fail(`Unknown tenant id(s): ${code.slice("TENANT_NOT_FOUND:".length)}`);
    fail(MESSAGES[code] ?? code);
  }
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => process.exit(process.exitCode ?? 0));
