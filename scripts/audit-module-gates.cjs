/* eslint-disable @typescript-eslint/no-require-imports */
// Static audit: for every API route belonging to a non-core tenant module, does the request path
// reach a module (or overlapping feature-flag) entitlement check? Follows imported @/lib
// functions transitively (depth-limited). Prints unchecked routes per module; exits 1 if any are
// found that are not explicitly allow-listed below with a reason.
//   node scripts/audit-module-gates.cjs            -> summary
//   node scripts/audit-module-gates.cjs --verbose  -> every route
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(file, "latin1");
const walk = (dir, filter) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full, filter) : filter(full) ? [full] : [];
});

// Module key -> [overlapping legacy feature flag or null, API route prefixes under src/app/api].
const MODULES = {
  OPPORTUNITIES: ["opportunityEnabled", ["opportunities", "opportunity-types", "v1/opportunities", "v1/opportunity-types", "v1/leads-with-opportunity"]],
  FORMS: ["formBuilderEnabled", ["forms", "public/forms"]],
  AUTOMATIONS: ["automationEnabled", ["automation-v2"]],
  REPORTS: ["advancedReporting", ["reports"]],
  MARKETING: [null, ["marketing"]],
  JOURNEY_ORCHESTRATION: [null, ["marketing/journeys"]],
  PREDICTIVE_SCORING: [null, ["lead-scoring/self-learning"]],
  NEXT_BEST_ACTION: [null, ["next-best-action"]],
  AI_COPILOT: [null, ["ai"]],
  DISTRIBUTION: [null, ["assignment"]],
  PARTNERS: [null, ["partners"]],
  PAYOUTS: ["payoutsEnabled", ["payouts", "payout-cycles", "payout-disputes", "payout-settings", "commission-rules", "partner-invoices"]],
  GAMIFICATION: ["gamificationEnabled", ["gamification", "gamification-redemptions", "gamification-rules", "gamification-settings", "badges"]],
  PRODUCT_CATALOG: [null, ["catalog", "applications"]],
  SERVICE_DESK: [null, ["cases", "case-attachments", "case-inbound-addresses", "case-macros", "case-priorities", "case-queues", "case-sla-policies", "case-statuses", "case-types", "knowledge-base"]],
  MARKETPLACE: [null, ["marketplace", "v1/apps"]],
  TELEPHONY: [null, ["agent-availability", "call-campaigns", "call-center", "call-dispositions", "call-queues", "call-scripts", "disposition-groups", "disposition-outcomes", "telephony", "integrations/telephony", "reports/inbuilt/telephony-call-performance"]],
  DATA_PLATFORM: [null, ["dedupe", "external-integrations", "integrations/webhooks", "integrations/inbound/leads", "integrations/inbound/settings", "integrations/inbound/events"]],
};

// Routes intentionally without a module check, each with the reason (reviewed 2026-09-29).
const ALLOW = {
  "reports/rollups/process-jobs": "Cron endpoint protected by REPORTING_CRON_SECRET; it only runs refreshes a tenant requested through the (gated) refresh route.",
  "reports/rollups/process-schedule": "Cron endpoint protected by REPORTING_CRON_SECRET; scheduled refreshes, not a tenant request.",
  "integrations/telephony/suppress": "Phone suppression list is shared with SMS/WhatsApp compliance, not Telephony-only.",
  "assignment/reassign": "Manual owner reassignment (leads/opportunities lists, view row actions) is core CRM, not the Distribution Engine; only simulations/rules are Distribution.",
};

// Index every top-level function in src/lib (exported or file-local): a call resolves to the same
// file's definition first, then to an exported definition anywhere (file-local helpers such as
// requireServiceDesk(user) are where many module checks live).
const byFile = new Map(); // file -> Map(name -> body)
const exported = new Map(); // name -> [{ file, body }]
for (const file of walk(path.join(ROOT, "src/lib"), (f) => /\.(ts|tsx)$/.test(f))) {
  const source = read(file);
  const starts = [...source.matchAll(/^(export )?(?:async )?function (\w+)|^(export )?const (\w+)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\(|function|[a-zA-Z_]\w*\s*=>)/gm)];
  const local = new Map();
  starts.forEach((match, index) => {
    const end = index + 1 < starts.length ? starts[index + 1].index : source.length;
    const name = match[2] || match[4];
    const body = source.slice(match.index, end);
    local.set(name, body);
    if (match[1] || match[3]) exported.set(name, (exported.get(name) || []).concat([{ file, body }]));
  });
  byFile.set(file, local);
}

function hasDirectCheck(text, moduleKey, flag) {
  if (new RegExp(`(assertModuleEnabled|assertTenantModule|isModuleEnabledForTenant)\\([^)]*["']${moduleKey}["']`).test(text)) return true;
  if (flag && new RegExp(`(assertFeatureEnabled|isFeatureEnabledForTenant)\\([^)]*["']${flag}["']`).test(text)) return true;
  return false;
}

function definitions(name, fromFile) {
  const local = fromFile && byFile.get(fromFile)?.get(name);
  return local ? [{ file: fromFile, body: local }] : exported.get(name) || [];
}

const memo = new Map();
function reachesCheck(name, fromFile, moduleKey, flag, depth, seen) {
  const defs = definitions(name, fromFile);
  const key = `${defs.map((d) => d.file).join(",")}#${name}|${moduleKey}`;
  if (memo.has(key)) return memo.get(key);
  if (depth > 5 || seen.has(key)) return false;
  seen.add(key);
  let result = false;
  for (const { file, body } of defs) {
    if (hasDirectCheck(body, moduleKey, flag)) { result = true; break; }
    const called = new Set([...body.slice(body.indexOf("{")).matchAll(/\b([a-zA-Z]\w{3,})\s*\(/g)].map((m) => m[1]).filter((n) => n !== name));
    for (const callee of called) {
      if (!definitions(callee, file).length) continue;
      if (reachesCheck(callee, file, moduleKey, flag, depth + 1, seen)) { result = true; break; }
    }
    if (result) break;
  }
  memo.set(key, result);
  return result;
}

const verbose = process.argv.includes("--verbose");
const report = {};
let unexplained = 0;
const routeFiles = walk(path.join(ROOT, "src/app/api"), (f) => f.endsWith("route.ts"));
for (const [moduleKey, [flag, prefixes]] of Object.entries(MODULES)) {
  const routes = routeFiles.filter((file) => {
    const rel = path.relative(path.join(ROOT, "src/app/api"), path.dirname(file));
    // Longest-prefix ownership: a route belongs to the most specific module prefix that matches.
    const owner = Object.entries(MODULES).flatMap(([key, [, p]]) => p.filter((x) => rel === x || rel.startsWith(`${x}/`)).map((x) => [key, x.length])).sort((a, b) => b[1] - a[1])[0];
    return owner && owner[0] === moduleKey;
  });
  const unchecked = [];
  for (const file of routes) {
    const rel = path.relative(path.join(ROOT, "src/app/api"), path.dirname(file));
    const source = read(file);
    const imported = new Set([...source.matchAll(/import \{([^}]+)\} from ["']@\/lib\/[^"']+["']/g)].flatMap((m) => m[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean)));
    // Per HTTP handler: a route whose PATCH is checked but whose GET is not is a real gap.
    const handlers = [...source.matchAll(/^export (?:async )?function (GET|POST|PUT|PATCH|DELETE)\b/gm)];
    const fileLevel = source.slice(0, handlers[0]?.index ?? source.length);
    handlers.forEach((match, index) => {
      const body = source.slice(match.index, index + 1 < handlers.length ? handlers[index + 1].index : source.length);
      // Local helpers defined in the route file itself (above the handlers) count as part of it.
      const localHelpers = [...fileLevel.matchAll(/^(?:async )?function (\w+)[\s\S]*?^}/gm)].filter((m) => body.includes(`${m[1]}(`)).map((m) => m[0]).join("\n");
      const calls = new Set([...body.matchAll(/\b([a-zA-Z]\w{3,})\s*\(/g)].map((m) => m[1]).filter((n) => imported.has(n)));
      const ok = hasDirectCheck(body + localHelpers, moduleKey, flag) || [...calls].some((name) => reachesCheck(name, null, moduleKey, flag, 0, new Set()));
      if (!ok) unchecked.push(`${rel} ${match[1]}`);
      if (verbose) console.log(`${ok ? "ok  " : "MISS"} ${moduleKey.padEnd(22)} ${rel} ${match[1]}`);
    });
  }
  const unexplainedHere = unchecked.filter((entry) => { const rel = entry.split(' ')[0]; return !Object.keys(ALLOW).some((a) => rel === a || rel.startsWith(`${a}/`)); });
  unexplained += unexplainedHere.length;
  report[moduleKey] = { routes: routes.length, unchecked: unexplainedHere };
}
for (const [moduleKey, { routes, unchecked }] of Object.entries(report)) {
  console.log(`${moduleKey.padEnd(22)} ${String(routes).padStart(3)} routes  ${unchecked.length ? `${unchecked.length} unchecked handlers` : "all checked"}`);
}
process.exitCode = unexplained ? 1 : 0;
