import { randomUUID } from "crypto";
import { query, queryOne, execute } from "@/lib/db/query";
import { dependencyViolations } from "@/lib/module-dependencies";
import { getTenantModuleEntitlements, setTenantModuleStatus, type ModuleStatus } from "@/lib/server/module-entitlements";

// Tenant-facing module visibility + access requests, and platform-wide module bundles (Module 21,
// decisions confirmed 2026-09-29). Tenant admins can see their modules and request access; only
// platform admins change entitlements (approving a request goes through setTenantModuleStatus,
// so dependency rules, trial dates, pausing/restoring and the audit log all still apply).

type User = { id: string; tenantId: string | null; isPlatformAdmin?: boolean };

async function notify(userId: string, tenantId: string | null, title: string, message: string, data: Record<string, unknown>) {
  const { createUserNotification } = await import("@/lib/server/notifications");
  await createUserNotification({ tenantId, userId, title, message, data }).catch(() => undefined);
}

/** A tenant admin's view: every catalog module, its status/trial end, and any pending request. */
export async function listModulesForTenantAdmin(user: User) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const [modules, pending] = await Promise.all([
    getTenantModuleEntitlements(user.tenantId),
    query<{ moduleKey: string; id: string; createdAt: string }>(
      `select id, "moduleKey", "createdAt" from "ModuleAccessRequest" where "tenantId" = $1 and status = 'PENDING'`,
      [user.tenantId],
    ),
  ]);
  const pendingByKey = new Map(pending.map((row) => [row.moduleKey, row]));
  // Internal platform-admin reasons are not shown to tenants.
  return modules.map((moduleRow: any) => ({
    key: moduleRow.key,
    name: moduleRow.name,
    description: moduleRow.description,
    category: moduleRow.category,
    isCore: moduleRow.isCore,
    status: moduleRow.status as ModuleStatus,
    trialEndsAt: moduleRow.trialEndsAt,
    pendingRequest: pendingByKey.get(moduleRow.key) ?? null,
  }));
}

export async function requestModuleAccess(user: User, moduleKey: string, message?: string | null) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const modules = await listModulesForTenantAdmin(user);
  const requested = modules.find((candidate) => candidate.key === moduleKey);
  if (!requested) throw new Error("MODULE_NOT_FOUND");
  if (requested.isCore || requested.status === "ENABLED") throw new Error("MODULE_ALREADY_AVAILABLE");
  const text = message?.trim() ? message.trim().slice(0, 1000) : null;
  const id = randomUUID();
  try {
    await execute(
      `insert into "ModuleAccessRequest" (id, "tenantId", "moduleKey", "requestedBy", message) values ($1, $2, $3, $4, $5)`,
      [id, user.tenantId, moduleKey, user.id, text],
    );
  } catch (error: any) {
    if (error?.code === "23505") throw new Error("MODULE_REQUEST_ALREADY_PENDING");
    throw error;
  }
  const tenant = await queryOne<{ name: string }>(`select name from "Tenant" where id = $1`, [user.tenantId]);
  const admins = await query<{ userId: string }>(`select "userId" from "PlatformAdmin" where "isActive" = true`, []);
  for (const admin of admins) {
    await notify(admin.userId, null, `${tenant?.name ?? "A workspace"} requested ${requested.name}`, text ? `"${text}"` : `Review the request on the tenant's Modules section.`, { event: "MODULE_ACCESS_REQUESTED", tenantId: user.tenantId, moduleKey, requestId: id });
  }
  return { id, moduleKey, status: "PENDING" as const };
}

export async function withdrawModuleAccessRequest(user: User, requestId: string) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const row = await queryOne<{ id: string }>(
    `update "ModuleAccessRequest" set status = 'WITHDRAWN', "resolvedBy" = $3, "resolvedAt" = now() where id = $1 and "tenantId" = $2 and status = 'PENDING' returning id`,
    [requestId, user.tenantId, user.id],
  );
  if (!row) throw new Error("MODULE_REQUEST_NOT_FOUND");
  return { id: requestId, status: "WITHDRAWN" as const };
}

export async function listModuleAccessRequests(filter: { tenantId?: string | null; status?: string | null } = {}) {
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (filter.tenantId) { values.push(filter.tenantId); clauses.push(`r."tenantId" = $${values.length}`); }
  if (filter.status) { values.push(filter.status); clauses.push(`r.status = $${values.length}`); }
  return query<any>(
    `select r.id, r."tenantId", t.name as "tenantName", r."moduleKey", m.name as "moduleName", r.message, r.status, r."createdAt",
            r."resolvedAt", r."resolutionNote", u.name as "requestedByName", u.email as "requestedByEmail"
     from "ModuleAccessRequest" r
     join "Tenant" t on t.id = r."tenantId"
     join "PlatformModule" m on m.key = r."moduleKey"
     left join "User" u on u.id = r."requestedBy"
     ${clauses.length ? `where ${clauses.join(" and ")}` : ""}
     order by r."createdAt" desc limit 200`,
    values,
  );
}

export async function resolveModuleAccessRequest(
  platformAdmin: User,
  requestId: string,
  input: { decision: "APPROVED" | "DECLINED"; note?: string | null; status?: "ENABLED" | "TRIAL"; trialEndsAt?: string | null },
) {
  const request = await queryOne<{ tenantId: string; moduleKey: string; requestedBy: string; status: string }>(
    `select "tenantId", "moduleKey", "requestedBy", status from "ModuleAccessRequest" where id = $1`,
    [requestId],
  );
  if (!request) throw new Error("MODULE_REQUEST_NOT_FOUND");
  if (request.status !== "PENDING") throw new Error("MODULE_REQUEST_ALREADY_RESOLVED");
  const note = input.note?.trim() ? input.note.trim().slice(0, 1000) : null;
  if (input.decision === "APPROVED") {
    // Throws (and leaves the request pending) on a dependency refusal or missing trial date.
    await setTenantModuleStatus(platformAdmin, request.tenantId, request.moduleKey, input.status ?? "ENABLED", note ?? "Access request approved", { trialEndsAt: input.trialEndsAt ?? null });
  }
  const resolved = await queryOne<{ id: string }>(
    `update "ModuleAccessRequest" set status = $2, "resolvedBy" = $3, "resolvedAt" = now(), "resolutionNote" = $4 where id = $1 and status = 'PENDING' returning id`,
    [requestId, input.decision, platformAdmin.id, note],
  );
  if (!resolved) throw new Error("MODULE_REQUEST_ALREADY_RESOLVED");
  const catalogEntry = await queryOne<{ name: string }>(`select name from "PlatformModule" where key = $1`, [request.moduleKey]);
  const outcome = input.decision === "APPROVED"
    ? `${catalogEntry?.name ?? request.moduleKey} is now ${input.status === "TRIAL" ? "on trial" : "enabled"} for your workspace.`
    : `Your request for ${catalogEntry?.name ?? request.moduleKey} was declined.`;
  await notify(request.requestedBy, request.tenantId, `Module request ${input.decision === "APPROVED" ? "approved" : "declined"}`, note ? `${outcome} Note: ${note}` : outcome, { event: "MODULE_ACCESS_RESOLVED", moduleKey: request.moduleKey, requestId, decision: input.decision });
  return { id: requestId, status: input.decision };
}

// ------------------------------------------------------------------------------------------ bundles

export async function listModuleBundles() {
  return query<{ key: string; name: string; description: string | null; modules: string[]; sortOrder: number; updatedAt: string }>(
    `select key, name, description, modules, "sortOrder", "updatedAt" from "ModuleBundle" order by "sortOrder", name`,
    [],
  );
}

/** Validates against the live catalog: known keys, every core module included, no broken dependency. */
export async function saveModuleBundle(platformAdmin: User, key: string, input: { name: string; description?: string | null; modules: string[]; sortOrder?: number }) {
  if (!/^[A-Z][A-Z0-9_]{1,40}$/.test(key)) throw new Error("BUNDLE_KEY_INVALID");
  const name = input.name?.trim();
  if (!name || name.length > 80) throw new Error("BUNDLE_NAME_INVALID");
  const catalog = await query<{ key: string; name: string; isCore: boolean }>(`select key, name, "isCore" from "PlatformModule"`, []);
  const known = new Set(catalog.map((entry) => entry.key));
  const modules = [...new Set(input.modules ?? [])];
  const unknown = modules.filter((moduleKey) => !known.has(moduleKey));
  if (unknown.length) throw new Error(`BUNDLE_INVALID: Unknown modules: ${unknown.join(", ")}`);
  const missingCore = catalog.filter((entry) => entry.isCore && !modules.includes(entry.key)).map((entry) => entry.name);
  if (missingCore.length) throw new Error(`BUNDLE_INVALID: Core modules must be included: ${missingCore.join(", ")}`);
  const names = Object.fromEntries(catalog.map((entry) => [entry.key, entry.name]));
  const violations = dependencyViolations(Object.fromEntries(catalog.map((entry) => [entry.key, modules.includes(entry.key)])), (moduleKey) => names[moduleKey] ?? moduleKey);
  if (violations.length) throw new Error(`BUNDLE_INVALID: ${violations.map((violation) => violation.message).join(" ")}`);
  await execute(
    `insert into "ModuleBundle" (key, name, description, modules, "sortOrder", "updatedBy", "updatedAt") values ($1, $2, $3, $4, $5, $6, now())
     on conflict (key) do update set name = excluded.name, description = excluded.description, modules = excluded.modules,
       "sortOrder" = excluded."sortOrder", "updatedBy" = excluded."updatedBy", "updatedAt" = now()`,
    [key, name, input.description?.trim() || null, modules, input.sortOrder ?? 0, platformAdmin.id],
  );
  return (await listModuleBundles()).find((bundle) => bundle.key === key);
}
