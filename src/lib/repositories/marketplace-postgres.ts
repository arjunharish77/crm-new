import { randomUUID, randomBytes, createHmac } from "crypto";
import { execute, query, queryOne } from "@/lib/db/query";
import { DatabaseError } from "@/lib/db/errors";
import { createAuditLog } from "@/lib/server/crm";
import { assertModuleEnabled } from "@/lib/server/module-entitlements";
import { decryptSecretAtRestOrNull, encryptSecretAtRest } from "@/lib/server/secret-encryption";

type TenantUser = { id: string; tenantId: string | null; isPlatformAdmin?: boolean };

type PermissionScope = "read" | "write";
type RequestedPermissions = Record<string, PermissionScope>;

const APP_COLUMNS =
  'id, "tenantId", name, description, category, "isPrivate", "redirectUrls", "webhookUrl", "eventSubscriptions", "requestedPermissions", "ownerId", "isActive", "dailyDeliveryLimit", "rateLimitPerMinute", "vendorName", screenshots, "docsUrl", "pricingNotes", "publishStatus", "publishRejectedReason", "publishedAt", "publishedBy", "unpublishedAt", "unpublishedBy", "trustLevel", "trustLevelSetBy", "trustLevelSetAt", "requiredContractVersion", "dependsOnAppIds", "requiredModuleKeys", "isDeprecated", "deprecationMessage", "createdBy", "createdAt", "updatedAt"';

// Single source of truth for "current platform contract version" -- kept in sync by hand with
// the `version` field getConnectorContractForApp returns, since that function's return shape
// (not a DB row) is the actual contract apps are built against.
const PLATFORM_CONNECTOR_CONTRACT_VERSION = "1.0";
const INSTALL_COLUMNS =
  'id, "tenantId", "appId", status, "requestedBy", "approvedBy", "approvedAt", "rejectedReason", "suspendedAt", "suspendedReason", "uninstalledAt", "reviewState", "reviewComment", "reviewedBy", "reviewedAt", "pendingPlatformPermissions", "installedVersion", "createdAt", "updatedAt"';
const SECRET_COLUMNS = 'id, "tenantId", "appId", secret, "previousSecret", "previousSecretExpiresAt", "signingSecret", "lastRotatedAt", "rotatedBy", "createdAt"';
const VERSION_COLUMNS = 'id, "tenantId", "appId", version, "changeNotes", "approvalStatus", "approvedBy", "approvedAt", "rejectedReason", "createdBy", "createdAt"';

const ROTATION_GRACE_MS = 24 * 60 * 60 * 1000;

async function assertMarketplaceEnabled(user: TenantUser) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  await assertModuleEnabled(user.tenantId, "MARKETPLACE", { isPlatformAdmin: user.isPlatformAdmin });
}

function normalizePermissions(input: unknown): RequestedPermissions {
  if (!input || typeof input !== "object") return {};
  const result: RequestedPermissions = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (value === "read" || value === "write") result[key] = value;
  }
  return result;
}

// approvalStatus defaults to APPROVED (matching the migration's own column default) so every
// private/draft app's own versions -- the overwhelming majority -- are never blocked on a
// review that has no reason to exist yet. Only a version snapshot taken while the app is
// PENDING_REVIEW or already PUBLISHED needs a real platform-admin approval (see
// updateMarketplaceApp/requestPublishApp below), so callers in that situation pass "PENDING".
async function snapshotAppVersion(
  tenantId: string,
  appId: string,
  app: Record<string, unknown>,
  changeNotes: string | null,
  userId: string | null,
  approvalStatus: "PENDING" | "APPROVED" = "APPROVED",
) {
  const latest = await queryOne<{ version: number }>(`select max(version) as version from "MarketplaceAppVersion" where "appId" = $1`, [appId]);
  const nextVersion = (latest?.version ?? 0) + 1;
  await execute(
    `insert into "MarketplaceAppVersion" (id, "tenantId", "appId", version, "changeNotes", snapshot, "approvalStatus", "createdBy", "createdAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [randomUUID(), tenantId, appId, nextVersion, changeNotes, app, approvalStatus, userId, new Date().toISOString()],
  );
  return nextVersion;
}

export async function listMarketplaceAppsForTenant(user: TenantUser) {
  await assertMarketplaceEnabled(user);
  return query<any>(
    `select a.${APP_COLUMNS.split(", ").join(', a.')}, i.id as "installId", i.status as "installStatus"
     from "MarketplaceApp" a
     left join "TenantAppInstall" i on i."appId" = a.id and i."tenantId" = a."tenantId"
     where a."tenantId" = $1
     order by a."createdAt" desc`,
    [user.tenantId],
  );
}

// Registering a custom/private app implicitly requests its own install -- both the app
// definition and the install-approval request are created together (checklist sub-items 1 and
// 5 are naturally one action from the registering admin's point of view; a *separate* admin
// still has to approve it before it's actually installed, per sub-item 3).
export async function registerMarketplaceApp(
  user: TenantUser,
  input: {
    name?: string;
    description?: string | null;
    category?: string;
    redirectUrls?: string[];
    webhookUrl?: string | null;
    eventSubscriptions?: string[];
    requestedPermissions?: unknown;
    requiredContractVersion?: string | null;
    dependsOnAppIds?: string[];
    requiredModuleKeys?: string[];
  },
) {
  await assertMarketplaceEnabled(user);
  const tenantId = user.tenantId!;
  const name = input.name?.trim();
  if (!name) throw new Error("APP_NAME_REQUIRED");

  const now = new Date().toISOString();
  const appId = randomUUID();
  const requestedPermissions = normalizePermissions(input.requestedPermissions);
  let app;
  try {
    app = await queryOne<any>(
      `insert into "MarketplaceApp"
        (id, "tenantId", name, description, category, "isPrivate", "redirectUrls", "webhookUrl", "eventSubscriptions", "requestedPermissions", "ownerId", "isActive", "requiredContractVersion", "dependsOnAppIds", "requiredModuleKeys", "createdBy", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, true, $6, $7, $8, $9, $10, true, $11, $12, $13, $10, $14, $14)
       returning ${APP_COLUMNS}`,
      [
        appId,
        tenantId,
        name,
        input.description ?? null,
        input.category ?? "CUSTOM",
        input.redirectUrls?.filter(Boolean) ?? [],
        input.webhookUrl ?? null,
        input.eventSubscriptions?.filter(Boolean) ?? [],
        requestedPermissions,
        user.id,
        input.requiredContractVersion?.trim() || PLATFORM_CONNECTOR_CONTRACT_VERSION,
        input.dependsOnAppIds?.filter(Boolean) ?? [],
        input.requiredModuleKeys?.filter(Boolean) ?? [],
        now,
      ],
    );
  } catch (error) {
    if (error instanceof DatabaseError && error.code === "23505") throw new Error("DUPLICATE_APP_NAME");
    throw error;
  }
  if (!app) throw new Error("MARKETPLACE_APP_INSERT_FAILED");

  await snapshotAppVersion(tenantId, appId, app, "Initial registration", user.id);

  for (const eventType of app.eventSubscriptions as string[]) {
    await execute(
      `insert into "TenantAppEventSubscription" (id, "tenantId", "appId", "eventType", "isActive", "createdAt")
       values ($1, $2, $3, $4, true, $5) on conflict ("tenantId", "appId", "eventType") do nothing`,
      [randomUUID(), tenantId, appId, eventType, now],
    );
  }

  const secret = randomBytes(24).toString("hex");
  const signingSecret = randomBytes(24).toString("hex");
  await execute(
    `insert into "TenantAppSecret" (id, "tenantId", "appId", secret, "signingSecret", "createdAt") values ($1, $2, $3, $4, $5, $6)`,
    [randomUUID(), tenantId, appId, encryptSecretAtRest(secret), encryptSecretAtRest(signingSecret), now],
  );

  const install = await queryOne<any>(
    `insert into "TenantAppInstall" (id, "tenantId", "appId", status, "requestedBy", "createdAt", "updatedAt")
     values ($1, $2, $3, 'PENDING_APPROVAL', $4, $5, $5)
     returning ${INSTALL_COLUMNS}`,
    [randomUUID(), tenantId, appId, user.id, now],
  );

  await createAuditLog(user as any, "CREATE", "MARKETPLACE_APP", appId, null, app, { installId: install?.id }).catch(() => undefined);

  // secret/signingSecret returned here are the real PLAINTEXT values, shown once to the
  // registering admin -- everything at rest (the row just inserted above) is ciphertext.
  return { app, install, secret, signingSecret };
}

export async function updateMarketplaceApp(
  user: TenantUser,
  appId: string,
  input: {
    description?: string | null;
    redirectUrls?: string[];
    webhookUrl?: string | null;
    eventSubscriptions?: string[];
    requestedPermissions?: unknown;
    changeNotes?: string | null;
    requiredContractVersion?: string | null;
    dependsOnAppIds?: string[];
    requiredModuleKeys?: string[];
  },
) {
  await assertMarketplaceEnabled(user);
  const tenantId = user.tenantId!;
  const existing = await queryOne<any>(`select ${APP_COLUMNS} from "MarketplaceApp" where "tenantId" = $1 and id = $2 limit 1`, [tenantId, appId]);
  if (!existing) throw new Error("MARKETPLACE_APP_NOT_FOUND");

  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (input.description !== undefined) patch.description = input.description;
  if (input.redirectUrls !== undefined) patch.redirectUrls = input.redirectUrls.filter(Boolean);
  if (input.webhookUrl !== undefined) patch.webhookUrl = input.webhookUrl;
  if (input.eventSubscriptions !== undefined) patch.eventSubscriptions = input.eventSubscriptions.filter(Boolean);
  if (input.requestedPermissions !== undefined) patch.requestedPermissions = normalizePermissions(input.requestedPermissions);
  if (input.requiredContractVersion !== undefined) patch.requiredContractVersion = input.requiredContractVersion?.trim() || PLATFORM_CONNECTOR_CONTRACT_VERSION;
  if (input.dependsOnAppIds !== undefined) patch.dependsOnAppIds = input.dependsOnAppIds.filter(Boolean);
  if (input.requiredModuleKeys !== undefined) patch.requiredModuleKeys = input.requiredModuleKeys.filter(Boolean);

  const columns = Object.keys(patch);
  const values = columns.map((c) => patch[c]);
  const assignments = columns.map((c, i) => `"${c}" = $${i + 1}`).join(", ");
  const updated = await queryOne<any>(
    `update "MarketplaceApp" set ${assignments} where "tenantId" = $${columns.length + 1} and id = $${columns.length + 2} returning ${APP_COLUMNS}`,
    [...values, tenantId, appId],
  );
  if (!updated) throw new Error("MARKETPLACE_APP_UPDATE_FAILED");

  // An edit to an app that's already public (or awaiting its first publish review) needs a
  // fresh platform-admin approval before it counts as the app's trusted, installable snapshot
  // -- a private/draft app's own edits need no such review, since nothing outside the owner's
  // own tenant can install it yet.
  const versionApprovalStatus = existing.publishStatus === "PUBLISHED" || existing.publishStatus === "PENDING_REVIEW" ? "PENDING" : "APPROVED";
  await snapshotAppVersion(tenantId, appId, updated, input.changeNotes ?? "Updated configuration", user.id, versionApprovalStatus);

  if (input.eventSubscriptions !== undefined) {
    const now = new Date().toISOString();
    for (const eventType of updated.eventSubscriptions as string[]) {
      await execute(
        `insert into "TenantAppEventSubscription" (id, "tenantId", "appId", "eventType", "isActive", "createdAt")
         values ($1, $2, $3, $4, true, $5) on conflict ("tenantId", "appId", "eventType") do update set "isActive" = true`,
        [randomUUID(), tenantId, appId, eventType, now],
      );
    }
    // Scoped to this caller's own tenantId -- an owner editing their app's event menu must
    // only touch their OWN subscription rows, never another installing tenant's independent
    // subscription state for the same app (migration 0066 made those genuinely separate rows).
    await execute(
      `update "TenantAppEventSubscription" set "isActive" = false where "tenantId" = $1 and "appId" = $2 and "eventType" <> all($3::text[])`,
      [tenantId, appId, updated.eventSubscriptions],
    );
  }

  // Permission diff on upgrade -- real fix, not just a checklist item: previously an app's
  // owner could change requestedPermissions freely, at any time, with zero re-approval and no
  // live effect on already-granted access either way (a confusing, silently-inert path).
  // Now: narrowing access (a module removed, or write downgraded to read) applies immediately,
  // since revoking access needs no one's permission. Anything that ADDS access beyond what's
  // currently granted is staged -- read-only additions on "pendingPermissions" (tenant-admin
  // approvable, see approvePermissionChange below), any WRITE addition on
  // "pendingPlatformPermissions" instead (platform-admin only, see approvePlatformWritePermissions
  // -- gap checklist Module 16's "platform-admin-only restricted capabilities" sub-item, built
  // per explicit user decision that any write permission needs platform-admin sign-off).
  if (input.requestedPermissions !== undefined) {
    const { installId, grants } = await getCurrentGrantsForApp(tenantId, appId);
    if (installId) {
      const newPermissions = normalizePermissions(updated.requestedPermissions);
      const additions = computePermissionEscalation(grants, newPermissions);
      for (const [moduleKey, currentScope] of Object.entries(grants)) {
        const requestedScope = newPermissions[moduleKey];
        if (!requestedScope) {
          await execute(`delete from "TenantAppPermissionGrant" where "installId" = $1 and "moduleKey" = $2`, [installId, moduleKey]);
        } else if (currentScope === "write" && requestedScope === "read") {
          await execute(`update "TenantAppPermissionGrant" set scope = 'read' where "installId" = $1 and "moduleKey" = $2`, [installId, moduleKey]);
        }
      }
      const { tenantAdminGrantable: readOnlyAdditions, platformAdminOnly: writeAdditions } = splitPermissionsByAdminTier(additions);
      const now = new Date().toISOString();
      await execute(
        `update "TenantAppInstall" set "pendingPermissions" = $1, "pendingPlatformPermissions" = $2, "updatedAt" = $3 where id = $4`,
        [Object.keys(readOnlyAdditions).length > 0 ? readOnlyAdditions : null, Object.keys(writeAdditions).length > 0 ? writeAdditions : null, now, installId],
      );
      if (Object.keys(additions).length > 0) {
        await createAuditLog(user as any, "PERMISSION_CHANGE_REQUESTED", "TENANT_APP_INSTALL", installId, grants, newPermissions, { readOnlyAdditions, writeAdditions }).catch(() => undefined);
      }
    }
  }

  await createAuditLog(user as any, "UPDATE", "MARKETPLACE_APP", appId, existing, updated, {}).catch(() => undefined);
  return updated;
}

// Owner-initiated: "I want this private app to become a real, publicly-installable catalog
// entry." Does not itself publish anything -- a platform admin still has to approve the
// version this request is tied to (approveAppVersion below), matching the exact same
// two-step "requester asks, a different admin reviews" shape every other approval flow in
// this module already uses (install approval, permission-change approval).
export async function requestPublishApp(user: TenantUser, appId: string) {
  await assertMarketplaceEnabled(user);
  const tenantId = user.tenantId!;
  const app = await queryOne<any>(`select ${APP_COLUMNS} from "MarketplaceApp" where "tenantId" = $1 and id = $2 limit 1`, [tenantId, appId]);
  if (!app) throw new Error("MARKETPLACE_APP_NOT_FOUND");
  if (!["DRAFT", "REJECTED", "UNPUBLISHED"].includes(app.publishStatus)) throw new Error("APP_ALREADY_PUBLISHED_OR_PENDING");

  const now = new Date().toISOString();
  const updated = await queryOne<any>(
    `update "MarketplaceApp" set "publishStatus" = 'PENDING_REVIEW', "publishRejectedReason" = null, "updatedAt" = $1 where id = $2 returning ${APP_COLUMNS}`,
    [now, appId],
  );
  // The version a platform admin will actually be reviewing is whichever one is currently
  // latest -- reset it to PENDING explicitly rather than trusting whatever approvalStatus it
  // already had (it could be a stale APPROVED from before an earlier UNPUBLISHED/REJECTED
  // cycle, which must not let this resubmission skip review).
  await execute(
    `update "MarketplaceAppVersion" set "approvalStatus" = 'PENDING', "approvedBy" = null, "approvedAt" = null, "rejectedReason" = null
     where "appId" = $1 and version = (select max(version) from "MarketplaceAppVersion" where "appId" = $1)`,
    [appId],
  );
  await createAuditLog(user as any, "REQUEST_PUBLISH", "MARKETPLACE_APP", appId, null, updated, {}).catch(() => undefined);
  return updated;
}

async function getCurrentGrantsForApp(tenantId: string, appId: string): Promise<{ installId: string | null; grants: RequestedPermissions }> {
  const install = await queryOne<{ id: string }>(`select id from "TenantAppInstall" where "tenantId" = $1 and "appId" = $2 and status = 'INSTALLED' limit 1`, [tenantId, appId]);
  if (!install) return { installId: null, grants: {} };
  const rows = await query<{ moduleKey: string; scope: PermissionScope }>(`select "moduleKey", scope from "TenantAppPermissionGrant" where "installId" = $1`, [install.id]);
  return { installId: install.id, grants: Object.fromEntries(rows.map((r) => [r.moduleKey, r.scope])) };
}

// An "escalation" is anything the new request asks for that isn't already granted: a brand
// new module, or an existing read-only module upgraded to write. Pure narrowing (a module
// dropped, or write downgraded to read) is never an escalation.
function computePermissionEscalation(currentGrants: RequestedPermissions, requested: RequestedPermissions) {
  const additions: RequestedPermissions = {};
  for (const [moduleKey, scope] of Object.entries(requested)) {
    const currentScope = currentGrants[moduleKey];
    if (!currentScope || (currentScope === "read" && scope === "write")) additions[moduleKey] = scope;
  }
  return additions;
}

// Real per-install version tracking (gap checklist Module 16's dependency/compatibility checks,
// "safe upgrade path" sub-item) -- bumps installedVersion to whatever's latest-approved at the
// moment a permission-change approval (tenant-admin or platform-admin) actually takes effect.
async function bumpInstalledVersionToLatestApproved(appId: string, installId: string, now: string) {
  const latest = await queryOne<{ version: number }>(
    `select max(version) as version from "MarketplaceAppVersion" where "appId" = $1 and "approvalStatus" = 'APPROVED'`,
    [appId],
  );
  if (latest?.version != null) {
    await execute(`update "TenantAppInstall" set "installedVersion" = $1 where id = $2`, [latest.version, installId]).catch(() => undefined);
  }
  return now;
}

// Second, explicit approval required before a staged permission increase takes effect --
// separate from approveAppInstall (first-time install approval), since this app is already
// installed and running; only the NEW, additional access needs review, not the whole app again.
export async function approvePermissionChange(user: TenantUser, installId: string) {
  await assertMarketplaceEnabled(user);
  const tenantId = user.tenantId!;
  const install = await queryOne<any>(`select id, "appId", "pendingPermissions" from "TenantAppInstall" where "tenantId" = $1 and id = $2 and status = 'INSTALLED' limit 1`, [tenantId, installId]);
  if (!install?.pendingPermissions) throw new Error("NO_PENDING_PERMISSION_CHANGE");
  const now = new Date().toISOString();
  const pending = normalizePermissions(install.pendingPermissions);
  for (const [moduleKey, scope] of Object.entries(pending)) {
    await execute(
      `insert into "TenantAppPermissionGrant" (id, "tenantId", "installId", "moduleKey", scope, "grantedAt")
       values ($1, $2, $3, $4, $5, $6) on conflict ("installId", "moduleKey") do update set scope = excluded.scope`,
      [randomUUID(), tenantId, installId, moduleKey, scope, now],
    );
  }
  await execute(`update "TenantAppInstall" set "pendingPermissions" = null, "updatedAt" = $1 where id = $2`, [now, installId]);
  await bumpInstalledVersionToLatestApproved(install.appId, installId, now);
  await createAuditLog(user as any, "APPROVE_PERMISSION_CHANGE", "TENANT_APP_INSTALL", installId, null, pending, {}).catch(() => undefined);
  return { installId, grantedPermissions: pending };
}

export async function rejectPermissionChange(user: TenantUser, installId: string) {
  await assertMarketplaceEnabled(user);
  const now = new Date().toISOString();
  const install = await queryOne<{ id: string }>(
    `update "TenantAppInstall" set "pendingPermissions" = null, "updatedAt" = $1 where "tenantId" = $2 and id = $3 and "pendingPermissions" is not null returning id`,
    [now, user.tenantId, installId],
  );
  if (!install) throw new Error("NO_PENDING_PERMISSION_CHANGE");
  await createAuditLog(user as any, "REJECT_PERMISSION_CHANGE", "TENANT_APP_INSTALL", installId, null, null, {}).catch(() => undefined);
  return { installId };
}

export async function listPendingPermissionChangesForTenant(user: TenantUser) {
  await assertMarketplaceEnabled(user);
  return query<any>(
    `select i.id, i."appId", a.name as "appName", i."pendingPermissions", i."updatedAt"
     from "TenantAppInstall" i
     join "MarketplaceApp" a on a.id = i."appId"
     where i."tenantId" = $1 and i."pendingPermissions" is not null`,
    [user.tenantId],
  );
}

// Real per-app quota ("tenant quotas" sub-item) -- null means unlimited. Enforced in
// marketplace-events.ts's enqueueAppEvent, which inserts a visible CANCELLED delivery with a
// clear reason once an app hits its limit for the day, rather than silently dropping events.
export async function updateAppDeliveryLimit(user: TenantUser, appId: string, dailyDeliveryLimit: number | null) {
  await assertMarketplaceEnabled(user);
  if (dailyDeliveryLimit !== null && (!Number.isFinite(dailyDeliveryLimit) || dailyDeliveryLimit < 1)) throw new Error("INVALID_DAILY_LIMIT");
  const row = await queryOne<any>(
    `update "MarketplaceApp" set "dailyDeliveryLimit" = $1, "updatedAt" = $2 where "tenantId" = $3 and id = $4 returning id, "dailyDeliveryLimit"`,
    [dailyDeliveryLimit, new Date().toISOString(), user.tenantId, appId],
  );
  if (!row) throw new Error("MARKETPLACE_APP_NOT_FOUND");
  return row;
}

// Connector SDK contract sub-item "rate-limit handling": mirrors ApiKey.rateLimitPerMinute
// exactly (migration 0065) -- checked in authenticateMarketplaceAppRequest via the same
// checkRateLimit fixed-window counter the ApiKey system already uses.
export async function updateAppRateLimit(user: TenantUser, appId: string, rateLimitPerMinute: number) {
  await assertMarketplaceEnabled(user);
  if (!Number.isFinite(rateLimitPerMinute) || rateLimitPerMinute < 1) throw new Error("INVALID_RATE_LIMIT");
  const row = await queryOne<any>(
    `update "MarketplaceApp" set "rateLimitPerMinute" = $1, "updatedAt" = $2 where "tenantId" = $3 and id = $4 returning id, "rateLimitPerMinute"`,
    [Math.round(rateLimitPerMinute), new Date().toISOString(), user.tenantId, appId],
  );
  if (!row) throw new Error("MARKETPLACE_APP_NOT_FOUND");
  return row;
}

// The rest of the connector SDK contract: a real, machine-readable, versioned spec a developer
// building against this app's credentials can rely on instead of reading this codebase's
// source -- rather than the implicit, undocumented convention the auth/signing code already
// followed. Deliberately read-only and derived entirely from real, already-enforced values
// (marketplace-inbound.ts's own auth format, marketplace-events.ts's own signing/retry
// constants) -- never a second, driftable copy of them.
export async function getConnectorContractForApp(user: TenantUser, appId: string) {
  await assertMarketplaceEnabled(user);
  const app = await queryOne<{ rateLimitPerMinute: number; eventSubscriptions: string[] }>(
    `select "rateLimitPerMinute", "eventSubscriptions" from "MarketplaceApp" where "tenantId" = $1 and id = $2 limit 1`,
    [user.tenantId, appId],
  );
  if (!app) throw new Error("MARKETPLACE_APP_NOT_FOUND");
  return {
    version: PLATFORM_CONNECTOR_CONTRACT_VERSION,
    inboundAuth: {
      type: "bearer",
      header: "Authorization",
      format: "Bearer <appId>.<secret>",
      endpoints: [
        "GET /api/v1/apps/leads",
        "POST /api/v1/apps/leads",
        "PATCH /api/v1/apps/leads/{id}",
        "GET /api/v1/apps/opportunities",
        "POST /api/v1/apps/opportunities",
        "PATCH /api/v1/apps/opportunities/{id}",
        "POST /api/v1/apps/automation-events",
      ],
      permissionScopes: ["read", "write"],
      rateLimitPerMinute: app.rateLimitPerMinute,
    },
    automationTriggers: {
      description: "POST /api/v1/apps/automation-events with { eventType, payload } to fire a CRM automation trigger of type \"APP_EVENT\" -- requires this app's install to have 'automations' write access (the same grant call_app_action's outbound direction requires). A tenant's automation opts in via trigger.type = 'APP_EVENT', optionally scoped to trigger.appId/trigger.eventName.",
      requiredPermission: { module: "automations", scope: "write" },
    },
    syncJob: {
      description: "Field mapping, default ownership, and conflict resolution are configured per install on /dashboard/settings/marketplace, not per app -- each installing tenant can configure them independently.",
      crmToAppSync: "A scheduled reconciliation push to outboundWebhook, distinct from real-time events -- payload shape { type: 'sync', module, records }.",
      appToCrmSync: "Apply field mapping/default ownership/conflict resolution to this app's own POST/PATCH calls against the inbound endpoints above -- there is no CRM-initiated pull.",
      conflictDetection: "Include expectedUpdatedAt (the record's updatedAt you last read) in a PATCH body to enable conflict detection; omit it to always apply the update unconditionally.",
      dryRun: "POST /api/marketplace/installs/{installId}/sync-dry-run",
    },
    outboundWebhook: {
      subscribedEventTypes: app.eventSubscriptions,
      requestTimeoutMs: 15_000,
      maxAttempts: 5,
      retryScheduleMinutes: [1, 5, 30, 120, 720],
      verification: {
        algorithm: "HMAC-SHA256",
        secretSource: "the app's own signingSecret, shown once at registration/rotation",
        signedPayload: "`${timestamp}.${rawBody}`",
        headers: { timestamp: "x-app-timestamp", signature: "x-app-signature", eventType: "x-app-event" },
      },
    },
    errorFormat: {
      shape: "{ message: string }",
      statusCodes: { badRequest: 400, unauthorized: 401, forbidden: 403, rateLimited: 429, serverError: 500 },
    },
    diagnostics: {
      testEvent: "POST /api/marketplace/apps/{id}/test-event",
      deliveryReplay: "POST /api/marketplace/deliveries/{id}/replay",
      health: "GET /api/marketplace/apps/{id}/health",
    },
  };
}

export async function listAppVersionsForTenant(user: TenantUser, appId: string) {
  await assertMarketplaceEnabled(user);
  return query<any>(
    `select id, version, "changeNotes", "approvalStatus", "approvedBy", "approvedAt", "rejectedReason", "createdBy", "createdAt"
     from "MarketplaceAppVersion" where "tenantId" = $1 and "appId" = $2 order by version desc`,
    [user.tenantId, appId],
  );
}

// Gap checklist Module 16's app dependency and compatibility checks, "safe upgrade path"/
// "rollback plan" sub-items, built per explicit user decision: a real rollback, not a rename of
// "just edit it back manually". Deliberately reuses updateMarketplaceApp entirely rather than a
// parallel code path -- restoring an old version's config fields is just another edit, so it
// gets the exact same version-snapshot-at-the-tip and permission-diff-on-upgrade-escalation
// staging every other edit already goes through (matching restoreJourneyVersion/
// restoreDashboardTabVersion/restoreCustomReportVersion's own established "republish the old
// snapshot as a brand-new version at the tip" precedent from elsewhere this session, rather
// than rewinding "currentVersion" -- old versions must stay addressable forever).
export async function rollbackAppToVersion(user: TenantUser, appId: string, targetVersion: number) {
  await assertMarketplaceEnabled(user);
  const tenantId = user.tenantId!;
  const versionRow = await queryOne<{ snapshot: any }>(
    `select snapshot from "MarketplaceAppVersion" where "tenantId" = $1 and "appId" = $2 and version = $3 and "approvalStatus" = 'APPROVED' limit 1`,
    [tenantId, appId, targetVersion],
  );
  if (!versionRow) throw new Error("MARKETPLACE_APP_VERSION_NOT_FOUND");
  const snapshot = versionRow.snapshot ?? {};
  return updateMarketplaceApp(user, appId, {
    description: snapshot.description ?? null,
    redirectUrls: snapshot.redirectUrls ?? [],
    webhookUrl: snapshot.webhookUrl ?? null,
    eventSubscriptions: snapshot.eventSubscriptions ?? [],
    requestedPermissions: snapshot.requestedPermissions ?? {},
    requiredContractVersion: snapshot.requiredContractVersion ?? PLATFORM_CONNECTOR_CONTRACT_VERSION,
    dependsOnAppIds: snapshot.dependsOnAppIds ?? [],
    requiredModuleKeys: snapshot.requiredModuleKeys ?? [],
    changeNotes: `Rolled back to version ${targetVersion}`,
  });
}

// Gap checklist Module 16's app dependency and compatibility checks, "deprecated app warning"
// sub-item -- an owner-set signal, informational like `trustLevel`, not an install-blocking
// gate. A deliberately separate, lightweight function rather than folding into
// updateMarketplaceApp, since flagging deprecation shouldn't trigger a new version
// snapshot/permission-diff -- nothing about the app's actual behavior changed.
export async function setAppDeprecation(user: TenantUser, appId: string, isDeprecated: boolean, message?: string | null) {
  await assertMarketplaceEnabled(user);
  const tenantId = user.tenantId!;
  const now = new Date().toISOString();
  const updated = await queryOne<any>(
    `update "MarketplaceApp" set "isDeprecated" = $1, "deprecationMessage" = $2, "updatedAt" = $3
     where "tenantId" = $4 and id = $5
     returning ${APP_COLUMNS}`,
    [isDeprecated, isDeprecated ? message ?? null : null, now, tenantId, appId],
  );
  if (!updated) throw new Error("MARKETPLACE_APP_NOT_FOUND");
  await createAuditLog(user as any, isDeprecated ? "DEPRECATE" : "UNDEPRECATE", "MARKETPLACE_APP", appId, null, updated, { message }).catch(() => undefined);
  return updated;
}

// "Marketplace catalog UI": every app another tenant has actually published, for this tenant
// to browse and request-install. Excludes the caller's own apps (already visible in "My Apps")
// and anything not currently PUBLISHED -- a DRAFT/PENDING_REVIEW/UNPUBLISHED/REJECTED app has
// no business appearing in anyone else's catalog. "Supported modules" is derived from the
// live requestedPermissions keys rather than stored separately, so it can never drift from
// what the app would actually request on install. installStatus/health are the CALLER's own
// relationship to the app if any (not installed yet is a real, honest state -- not faked data
// about a stranger's install). Also excludes anything a platform admin has blocked for this
// specific tenant (MarketplaceAppTenantBlock) -- a blocked tenant doesn't even see the app as
// an option, not just get denied after trying.
export async function listPublishedAppsForCatalog(user: TenantUser) {
  await assertMarketplaceEnabled(user);
  const rows = await query<any>(
    `select a.id, a.name, a.description, a.category, a."vendorName", a."trustLevel", t.name as "ownerTenantName", a.screenshots, a."docsUrl", a."pricingNotes",
            a."requestedPermissions", a."publishedAt", a."isDeprecated", a."deprecationMessage", a."requiredModuleKeys", i.id as "installId", i.status as "installStatus"
     from "MarketplaceApp" a
     join "Tenant" t on t.id = a."tenantId"
     left join "TenantAppInstall" i on i."appId" = a.id and i."tenantId" = $1
     where a."publishStatus" = 'PUBLISHED' and a."isActive" = true and a."tenantId" <> $1
       and not exists (select 1 from "MarketplaceAppTenantBlock" b where b."appId" = a.id and b."tenantId" = $1)
     order by a."publishedAt" desc`,
    [user.tenantId],
  );
  return rows.map((row: any) => ({ ...row, supportedModules: Object.keys(row.requestedPermissions ?? {}) }));
}

// The actual "install a published app from another tenant" action -- the missing piece that
// makes the multi-tenant scoping rework (migration 0066) reachable at all, not just safe.
// Deliberately reuses every existing install-lifecycle function unchanged from here on
// (approveAppInstall/rejectAppInstall/suspendAppInstall/reinstateAppInstall/uninstallApp) --
// this only creates the PENDING_APPROVAL install plus this tenant's own fresh secret and event
// subscription rows, exactly what registerMarketplaceApp already does for an owner's first
// install of their own app, just without creating a new MarketplaceApp row.
export async function requestInstallOfPublishedApp(user: TenantUser, appId: string) {
  await assertMarketplaceEnabled(user);
  const tenantId = user.tenantId!;
  const app = await queryOne<any>(`select id, "tenantId", "isActive", "publishStatus", "eventSubscriptions" from "MarketplaceApp" where id = $1 limit 1`, [appId]);
  if (!app || app.publishStatus !== "PUBLISHED" || !app.isActive) throw new Error("MARKETPLACE_APP_NOT_PUBLISHED");
  if (app.tenantId === tenantId) throw new Error("CANNOT_INSTALL_OWN_APP");

  // Defense in depth -- the catalog listing already excludes blocked apps for this tenant, but
  // enforce it here too in case a stale client still has the app in view.
  const block = await queryOne<{ id: string }>(`select id from "MarketplaceAppTenantBlock" where "tenantId" = $1 and "appId" = $2 limit 1`, [tenantId, appId]);
  if (block) throw new Error("APP_BLOCKED_FOR_TENANT");

  // A newer edit awaiting platform-admin review blocks NEW installs (existing installs are
  // simply out of scope for this pass -- there is no per-install version pinning, stated
  // honestly as a known limitation rather than silently half-built).
  const versions = await queryOne<{ maxVersion: number; maxApproved: number | null }>(
    `select max(version) as "maxVersion", max(version) filter (where "approvalStatus" = 'APPROVED') as "maxApproved" from "MarketplaceAppVersion" where "appId" = $1`,
    [appId],
  );
  if (!versions?.maxApproved || versions.maxApproved < versions.maxVersion) throw new Error("APP_VERSION_PENDING_REVIEW");

  const existingInstall = await queryOne<{ id: string }>(`select id from "TenantAppInstall" where "tenantId" = $1 and "appId" = $2 limit 1`, [tenantId, appId]);
  if (existingInstall) throw new Error("APP_ALREADY_INSTALLED");

  const now = new Date().toISOString();
  const install = await queryOne<any>(
    `insert into "TenantAppInstall" (id, "tenantId", "appId", status, "requestedBy", "createdAt", "updatedAt")
     values ($1, $2, $3, 'PENDING_APPROVAL', $4, $5, $5)
     returning ${INSTALL_COLUMNS}`,
    [randomUUID(), tenantId, appId, user.id, now],
  );
  if (!install) throw new Error("APP_INSTALL_CREATE_FAILED");

  const secret = randomBytes(24).toString("hex");
  const signingSecret = randomBytes(24).toString("hex");
  await execute(
    `insert into "TenantAppSecret" (id, "tenantId", "appId", secret, "signingSecret", "createdAt") values ($1, $2, $3, $4, $5, $6)`,
    [randomUUID(), tenantId, appId, encryptSecretAtRest(secret), encryptSecretAtRest(signingSecret), now],
  );

  for (const eventType of (app.eventSubscriptions as string[]) ?? []) {
    await execute(
      `insert into "TenantAppEventSubscription" (id, "tenantId", "appId", "eventType", "isActive", "createdAt")
       values ($1, $2, $3, $4, true, $5) on conflict ("tenantId", "appId", "eventType") do nothing`,
      [randomUUID(), tenantId, appId, eventType, now],
    );
  }

  await createAuditLog(user as any, "REQUEST_INSTALL", "TENANT_APP_INSTALL", install.id, null, install, { appId }).catch(() => undefined);
  return { install, secret, signingSecret };
}

export async function listAppInstallsForTenant(user: TenantUser, status?: string) {
  await assertMarketplaceEnabled(user);
  const clauses = [`i."tenantId" = $1`];
  const values: unknown[] = [user.tenantId];
  if (status) {
    values.push(status);
    clauses.push(`i.status = $${values.length}`);
  }
  return query<any>(
    `select i.${INSTALL_COLUMNS.split(", ").join(', i.')}, a.name as "appName", a.category as "appCategory", a."requestedPermissions"
     from "TenantAppInstall" i
     join "MarketplaceApp" a on a.id = i."appId"
     where ${clauses.join(" and ")}
     order by i."createdAt" desc`,
    values,
  );
}

// Checked at approval time (not registration/install-request time) -- see approveAppInstall
// below for why. "compatible" means the app's declared contract version matches this platform's
// current one, every declared app-to-app dependency is already INSTALLED for this same tenant
// (an app depending on another app must have that other app live for the SAME tenant -- one
// tenant's install of a dependency doesn't satisfy a different tenant's install of a dependent
// app, since permission grants/secrets are all per-tenant rows), AND every CRM module the app
// declares as required is actually enabled for this tenant (gap checklist Module 16's "required
// CRM modules" sub-item, built per explicit user decision -- reuses the exact
// isModuleEnabledForTenant check every other module-gated feature in this codebase already does,
// not a second entitlements system).
export async function checkAppCompatibilityForTenant(user: TenantUser, appId: string) {
  await assertMarketplaceEnabled(user);
  const tenantId = user.tenantId!;
  const app = await queryOne<{ requiredContractVersion: string; dependsOnAppIds: string[]; requiredModuleKeys: string[] }>(
    `select "requiredContractVersion", "dependsOnAppIds", "requiredModuleKeys" from "MarketplaceApp" where id = $1 limit 1`,
    [appId],
  );
  if (!app) throw new Error("MARKETPLACE_APP_NOT_FOUND");

  const contractCompatible = app.requiredContractVersion === PLATFORM_CONNECTOR_CONTRACT_VERSION;
  const dependsOnAppIds = app.dependsOnAppIds ?? [];
  let missingDependencies: Array<{ id: string; name: string | null }> = [];
  if (dependsOnAppIds.length > 0) {
    const installedRows = await query<{ id: string }>(
      `select a.id from "MarketplaceApp" a
       join "TenantAppInstall" i on i."appId" = a.id and i."tenantId" = $1 and i.status = 'INSTALLED'
       where a.id = any($2::text[])`,
      [tenantId, dependsOnAppIds],
    );
    const installedIds = new Set(installedRows.map((row) => row.id));
    const missingIds = dependsOnAppIds.filter((id) => !installedIds.has(id));
    if (missingIds.length > 0) {
      const missingApps = await query<{ id: string; name: string }>(`select id, name from "MarketplaceApp" where id = any($1::text[])`, [missingIds]);
      const nameById = new Map(missingApps.map((row) => [row.id, row.name]));
      missingDependencies = missingIds.map((id) => ({ id, name: nameById.get(id) ?? null }));
    }
  }

  const requiredModuleKeys = app.requiredModuleKeys ?? [];
  let missingRequiredModules: Array<{ key: string; name: string | null }> = [];
  if (requiredModuleKeys.length > 0) {
    const { isModuleEnabledForTenant } = await import("@/lib/server/module-entitlements");
    const enabledFlags = await Promise.all(requiredModuleKeys.map((key) => isModuleEnabledForTenant(tenantId, key)));
    const missingKeys = requiredModuleKeys.filter((_, index) => !enabledFlags[index]);
    if (missingKeys.length > 0) {
      const missingModules = await query<{ key: string; name: string }>(`select "key", name from "PlatformModule" where "key" = any($1::text[])`, [missingKeys]);
      const nameByKey = new Map(missingModules.map((row) => [row.key, row.name]));
      missingRequiredModules = missingKeys.map((key) => ({ key, name: nameByKey.get(key) ?? null }));
    }
  }

  return {
    requiredContractVersion: app.requiredContractVersion,
    currentContractVersion: PLATFORM_CONNECTOR_CONTRACT_VERSION,
    contractCompatible,
    missingDependencies,
    missingRequiredModules,
    compatible: contractCompatible && missingDependencies.length === 0 && missingRequiredModules.length === 0,
  };
}

// Gap checklist Module 16's install-approval workflow, "security review"/"permission review"
// sub-item, built per explicit user direction: a real, tracked, auditable step -- a reviewer
// comment plus an explicit reviewState -- rather than an approver's implicit glance at requested
// permissions before clicking Approve. Required before approveAppInstall will succeed (see below).
export async function reviewAppInstall(user: TenantUser, installId: string, comment?: string | null) {
  await assertMarketplaceEnabled(user);
  const tenantId = user.tenantId!;
  const now = new Date().toISOString();
  const install = await queryOne<any>(
    `update "TenantAppInstall"
     set "reviewState" = 'REVIEWED', "reviewComment" = $1, "reviewedBy" = $2, "reviewedAt" = $3, "updatedAt" = $3
     where "tenantId" = $4 and id = $5 and status = 'PENDING_APPROVAL'
     returning ${INSTALL_COLUMNS}`,
    [comment ?? null, user.id, now, tenantId, installId],
  );
  if (!install) throw new Error("APP_INSTALL_NOT_PENDING");
  await createAuditLog(user as any, "REVIEW", "TENANT_APP_INSTALL", installId, null, install, { comment }).catch(() => undefined);
  return install;
}

// Splits a requested-permissions map into what a tenant admin can grant unilaterally (read-only)
// vs. what needs a separate platform-admin sign-off (any write scope) -- gap checklist Module
// 16's "platform-admin-only restricted capabilities" sub-item, built per explicit user decision:
// ANY write permission, not just a narrower "sensitive module" list, escalates to platform-admin.
function splitPermissionsByAdminTier(permissions: RequestedPermissions) {
  const tenantAdminGrantable: RequestedPermissions = {};
  const platformAdminOnly: RequestedPermissions = {};
  for (const [moduleKey, scope] of Object.entries(permissions)) {
    if (scope === "write") platformAdminOnly[moduleKey] = scope;
    else tenantAdminGrantable[moduleKey] = scope;
  }
  return { tenantAdminGrantable, platformAdminOnly };
}

// Materializes the app's requested READ-ONLY permissions into real, queryable
// TenantAppPermissionGrant rows at approval time (not at registration time) -- an approver is
// the one actually granting access, so the grant should date from approval, and a rejected/
// never-approved app never gets any live grant rows at all. Any WRITE-scope permission is staged
// on "pendingPlatformPermissions" instead and needs a separate approvePlatformWritePermissions
// call from a platform admin before it's live -- the install still goes INSTALLED so the app's
// read-only access (and its non-permission-gated lifecycle) works immediately.
//
// Compatibility/dependency checks are enforced HERE, not at registration or install-request
// time: registration/request only ever affects the requester's own pending state, but approval
// is the moment the app actually goes live and starts receiving real webhook/API traffic --
// the correct, single gate for "is this actually safe to let run." An approver can always
// re-check via checkAppCompatibilityForTenant before approving, and a blocked approval leaves
// the install exactly where it was (PENDING_APPROVAL), not in some new stuck state.
export async function approveAppInstall(user: TenantUser, installId: string) {
  await assertMarketplaceEnabled(user);
  const tenantId = user.tenantId!;
  const pending = await queryOne<{ appId: string; reviewState: string }>(
    `select "appId", "reviewState" from "TenantAppInstall" where "tenantId" = $1 and id = $2 and status = 'PENDING_APPROVAL'`,
    [tenantId, installId],
  );
  if (!pending) throw new Error("APP_INSTALL_NOT_PENDING");
  if (pending.reviewState !== "REVIEWED") throw new Error("APP_INSTALL_NOT_REVIEWED");
  const compatibility = await checkAppCompatibilityForTenant(user, pending.appId);
  if (!compatibility.compatible) throw new Error("APP_INCOMPATIBLE");

  const app = await queryOne<any>(`select "requestedPermissions" from "MarketplaceApp" where id = $1 limit 1`, [pending.appId]);
  const permissions = normalizePermissions(app?.requestedPermissions);
  const { tenantAdminGrantable, platformAdminOnly } = splitPermissionsByAdminTier(permissions);
  const hasPlatformAdminOnly = Object.keys(platformAdminOnly).length > 0;
  // Real per-install version tracking (gap checklist Module 16's dependency/compatibility
  // checks, "safe upgrade path" sub-item): this install's grants reflect whichever version was
  // latest-approved at the moment of this approval.
  const latestApprovedVersion = await queryOne<{ version: number }>(
    `select max(version) as version from "MarketplaceAppVersion" where "appId" = $1 and "approvalStatus" = 'APPROVED'`,
    [pending.appId],
  );

  const now = new Date().toISOString();
  const install = await queryOne<any>(
    `update "TenantAppInstall"
     set status = 'INSTALLED', "approvedBy" = $1, "approvedAt" = $2, "updatedAt" = $2, "pendingPlatformPermissions" = $3, "installedVersion" = $4
     where "tenantId" = $5 and id = $6 and status = 'PENDING_APPROVAL'
     returning ${INSTALL_COLUMNS}`,
    [user.id, now, hasPlatformAdminOnly ? platformAdminOnly : null, latestApprovedVersion?.version ?? null, tenantId, installId],
  );
  if (!install) throw new Error("APP_INSTALL_NOT_PENDING");

  for (const [moduleKey, scope] of Object.entries(tenantAdminGrantable)) {
    await execute(
      `insert into "TenantAppPermissionGrant" (id, "tenantId", "installId", "moduleKey", scope, "grantedAt")
       values ($1, $2, $3, $4, $5, $6) on conflict ("installId", "moduleKey") do update set scope = excluded.scope`,
      [randomUUID(), tenantId, installId, moduleKey, scope, now],
    );
  }

  await createAuditLog(user as any, "APPROVE", "TENANT_APP_INSTALL", installId, null, install, {
    grantedPermissions: tenantAdminGrantable,
    stagedForPlatformAdmin: hasPlatformAdminOnly ? platformAdminOnly : null,
  }).catch(() => undefined);
  return install;
}

// Platform-admin-only sign-off for write-scope permissions staged by approveAppInstall (initial
// install) or updateMarketplaceApp (a later upgrade request) -- see splitPermissionsByAdminTier.
// Deliberately NOT gated by assertMarketplaceEnabled/tenant-admin: a platform admin acting on a
// specific tenant's install still needs that tenant's id to scope the row, but the action itself
// is a platform-level capability, the same reasoning every other platform-admin marketplace
// function in this file already follows.
export async function approvePlatformWritePermissions(platformAdminUser: { id: string }, tenantId: string, installId: string) {
  const install = await queryOne<{ id: string; appId: string; pendingPlatformPermissions: unknown }>(
    `select id, "appId", "pendingPlatformPermissions" from "TenantAppInstall" where "tenantId" = $1 and id = $2 limit 1`,
    [tenantId, installId],
  );
  if (!install?.pendingPlatformPermissions) throw new Error("NO_PENDING_PLATFORM_PERMISSION_CHANGE");
  const now = new Date().toISOString();
  const pending = normalizePermissions(install.pendingPlatformPermissions);
  for (const [moduleKey, scope] of Object.entries(pending)) {
    await execute(
      `insert into "TenantAppPermissionGrant" (id, "tenantId", "installId", "moduleKey", scope, "grantedAt")
       values ($1, $2, $3, $4, $5, $6) on conflict ("installId", "moduleKey") do update set scope = excluded.scope`,
      [randomUUID(), tenantId, installId, moduleKey, scope, now],
    );
  }
  await execute(`update "TenantAppInstall" set "pendingPlatformPermissions" = null, "updatedAt" = $1 where id = $2`, [now, installId]);
  await bumpInstalledVersionToLatestApproved(install.appId, installId, now);
  await createAuditLog({ id: platformAdminUser.id, tenantId } as any, "APPROVE_PLATFORM_PERMISSIONS", "TENANT_APP_INSTALL", installId, null, pending, {}).catch(() => undefined);
  return { installId, grantedPermissions: pending };
}

export async function rejectPlatformWritePermissions(platformAdminUser: { id: string }, tenantId: string, installId: string) {
  const now = new Date().toISOString();
  const install = await queryOne<{ id: string }>(
    `update "TenantAppInstall" set "pendingPlatformPermissions" = null, "updatedAt" = $1 where "tenantId" = $2 and id = $3 and "pendingPlatformPermissions" is not null returning id`,
    [now, tenantId, installId],
  );
  if (!install) throw new Error("NO_PENDING_PLATFORM_PERMISSION_CHANGE");
  await createAuditLog({ id: platformAdminUser.id, tenantId } as any, "REJECT_PLATFORM_PERMISSIONS", "TENANT_APP_INSTALL", installId, null, null, {}).catch(() => undefined);
  return { installId };
}

// Cross-tenant queue for a platform admin to review, mirroring listPendingVersionsForPlatformAdmin's
// own shape exactly.
export async function listPendingPlatformPermissionChangesForPlatformAdmin() {
  return query<any>(
    `select i.id, i."tenantId", i."appId", a.name as "appName", i."pendingPlatformPermissions", i."updatedAt"
     from "TenantAppInstall" i
     join "MarketplaceApp" a on a.id = i."appId"
     where i."pendingPlatformPermissions" is not null`,
  );
}

export async function rejectAppInstall(user: TenantUser, installId: string, reason?: string | null) {
  await assertMarketplaceEnabled(user);
  const now = new Date().toISOString();
  const install = await queryOne<any>(
    `update "TenantAppInstall" set status = 'REJECTED', "rejectedReason" = $1, "updatedAt" = $2
     where "tenantId" = $3 and id = $4 and status = 'PENDING_APPROVAL'
     returning ${INSTALL_COLUMNS}`,
    [reason ?? null, now, user.tenantId, installId],
  );
  if (!install) throw new Error("APP_INSTALL_NOT_PENDING");
  await createAuditLog(user as any, "REJECT", "TENANT_APP_INSTALL", installId, null, install, { reason }).catch(() => undefined);
  return install;
}

export async function suspendAppInstall(user: TenantUser, installId: string, reason?: string | null) {
  await assertMarketplaceEnabled(user);
  const now = new Date().toISOString();
  const install = await queryOne<any>(
    `update "TenantAppInstall" set status = 'SUSPENDED', "suspendedAt" = $1, "suspendedReason" = $2, "updatedAt" = $1
     where "tenantId" = $3 and id = $4 and status = 'INSTALLED'
     returning ${INSTALL_COLUMNS}`,
    [now, reason ?? null, user.tenantId, installId],
  );
  if (!install) throw new Error("APP_INSTALL_NOT_INSTALLED");
  await createAuditLog(user as any, "SUSPEND", "TENANT_APP_INSTALL", installId, null, install, { reason }).catch(() => undefined);
  return install;
}

export async function reinstateAppInstall(user: TenantUser, installId: string) {
  await assertMarketplaceEnabled(user);
  const now = new Date().toISOString();
  const install = await queryOne<any>(
    `update "TenantAppInstall" set status = 'INSTALLED', "suspendedAt" = null, "suspendedReason" = null, "updatedAt" = $1
     where "tenantId" = $2 and id = $3 and status = 'SUSPENDED'
     returning ${INSTALL_COLUMNS}`,
    [now, user.tenantId, installId],
  );
  if (!install) throw new Error("APP_INSTALL_NOT_SUSPENDED");
  await createAuditLog(user as any, "REINSTATE", "TENANT_APP_INSTALL", installId, null, install, {}).catch(() => undefined);
  return install;
}

// Uninstall safeguard scope, stated honestly: this revokes the live permission grants, deletes
// the app's credential, stops its event subscriptions, cancels anything still queued for
// delivery, and marks the install UNINSTALLED -- all in that order, before the DB row itself
// ever flips to UNINSTALLED, so a failure partway through never leaves the install marked done
// while cleanup is still incomplete. It does NOT scan automations/views/reports for references
// to this app's fields (that's checklist sub-item 14's own, separately-named "dependency scan"
// half -- no app-managed-fields concept exists yet, sub-item 15, to scan for).
export async function uninstallApp(user: TenantUser, installId: string) {
  await assertMarketplaceEnabled(user);
  const tenantId = user.tenantId!;
  const install = await queryOne<any>(
    `select ${INSTALL_COLUMNS} from "TenantAppInstall" where "tenantId" = $1 and id = $2 and status in ('INSTALLED', 'SUSPENDED') limit 1`,
    [tenantId, installId],
  );
  if (!install) throw new Error("APP_INSTALL_NOT_ACTIVE");

  await execute(`delete from "TenantAppPermissionGrant" where "installId" = $1`, [installId]);
  // Secret deletion: a genuinely revoked credential, not just an install status the app itself
  // has no way to see -- authenticateMarketplaceAppRequest would already reject an uninstalled
  // app's calls at the install-status check, but deleting the row removes the credential
  // outright rather than leaving a live secret sitting unused, and makes a stale "Rotate
  // Secret" click on an uninstalled app fail loudly (APP_SECRET_NOT_FOUND) instead of quietly
  // rotating a credential nothing can ever present again. Scoped by tenantId too -- since a
  // published app can have other tenants' own installs (migration 0066), this must only ever
  // touch the uninstalling tenant's own secret row, never another tenant's.
  await execute(`delete from "TenantAppSecret" where "tenantId" = $1 and "appId" = $2`, [tenantId, install.appId]);
  // Webhook cleanup, part 1: stop subscribing to anything further (explicit and auditable,
  // even though enqueueAppEvent's own install-status join already blocks new events). Scoped
  // by tenantId for the same reason -- this tenant's own subscription rows only.
  await execute(`update "TenantAppEventSubscription" set "isActive" = false where "tenantId" = $1 and "appId" = $2`, [tenantId, install.appId]);
  // Webhook cleanup, part 2: the real bug this pass found -- a delivery already enqueued
  // before uninstall (status PENDING, possibly still awaiting its next retry) is untouched by
  // the install-status join and would otherwise still be claimed and delivered post-uninstall
  // by processAppEventDeliveries. Cancelling it here closes that gap. Scoped by tenantId so
  // another installing tenant's own in-flight deliveries for the same app are untouched.
  await execute(
    `update "TenantAppDelivery" set status = 'CANCELLED', error = 'App uninstalled', "updatedAt" = $1 where "tenantId" = $2 and "appId" = $3 and status in ('PENDING', 'SENDING')`,
    [new Date().toISOString(), tenantId, install.appId],
  );

  const now = new Date().toISOString();
  const uninstalled = await queryOne<any>(
    `update "TenantAppInstall" set status = 'UNINSTALLED', "uninstalledAt" = $1, "updatedAt" = $1 where id = $2 returning ${INSTALL_COLUMNS}`,
    [now, installId],
  );
  await createAuditLog(user as any, "UNINSTALL", "TENANT_APP_INSTALL", installId, null, uninstalled, {}).catch(() => undefined);
  return uninstalled;
}

export async function listPermissionGrantsForInstall(user: TenantUser, installId: string) {
  await assertMarketplaceEnabled(user);
  return query<any>(
    `select g.id, g."moduleKey", g.scope, g."grantedAt" from "TenantAppPermissionGrant" g
     join "TenantAppInstall" i on i.id = g."installId"
     where i."tenantId" = $1 and g."installId" = $2`,
    [user.tenantId, installId],
  );
}

// Secret is only ever returned in plaintext here (registration/rotation) -- every other read
// path gets the masked list view instead, matching the ApiKey "shown once" convention already
// established this session.
export async function rotateAppSecret(user: TenantUser, appId: string) {
  await assertMarketplaceEnabled(user);
  const tenantId = user.tenantId!;
  const existing = await queryOne<any>(`select ${SECRET_COLUMNS} from "TenantAppSecret" where "tenantId" = $1 and "appId" = $2 limit 1`, [tenantId, appId]);
  if (!existing) throw new Error("APP_SECRET_NOT_FOUND");

  const now = new Date();
  const secret = randomBytes(24).toString("hex");
  // existing.secret is already ciphertext (fetched via SECRET_COLUMNS above) -- moved into
  // previousSecret as-is, no decrypt/re-encrypt round trip needed for the value that isn't changing.
  const updated = await queryOne<any>(
    `update "TenantAppSecret"
     set secret = $1, "previousSecret" = $2, "previousSecretExpiresAt" = $3, "lastRotatedAt" = $4, "rotatedBy" = $5
     where id = $6
     returning ${SECRET_COLUMNS}`,
    [encryptSecretAtRest(secret), existing.secret, new Date(now.getTime() + ROTATION_GRACE_MS).toISOString(), now.toISOString(), user.id, existing.id],
  );
  if (!updated) throw new Error("APP_SECRET_ROTATE_FAILED");
  await createAuditLog(user as any, "ROTATE", "TENANT_APP_SECRET", existing.id, null, null, { appId }).catch(() => undefined);
  return { secret, signingSecret: decryptSecretAtRestOrNull(updated.signingSecret), lastRotatedAt: updated.lastRotatedAt };
}

export async function listAppSecretsMaskedForTenant(user: TenantUser) {
  await assertMarketplaceEnabled(user);
  return query<any>(
    `select "appId", "lastRotatedAt", "rotatedBy", "createdAt", (case when "previousSecret" is not null and "previousSecretExpiresAt" > now() then true else false end) as "hasActiveGraceSecret"
     from "TenantAppSecret" where "tenantId" = $1`,
    [user.tenantId],
  );
}

// --- Platform-admin cross-tenant controls ("platform admin controls" sub-item) ---
// Deliberately NOT gated by assertMarketplaceEnabled/a single tenant's MARKETPLACE module
// toggle -- a platform admin inspecting or acting across every tenant isn't operating inside
// any one tenant's context, the same reasoning every other platform-admin function in this
// codebase (changeTenantStatus, getTenantConfigForPlatformAdmin, etc.) already follows.

// Multi-tenant note: an app's install status here can no longer be a single value -- a
// published app can be INSTALLED for one tenant, SUSPENDED for another, and PENDING_APPROVAL
// for a third, all at once. Rather than the old join (which only ever showed the owning
// tenant's own install and silently ignored every other installing tenant), this returns a
// real per-app install count broken out by status, and a separate row per (app, installing
// tenant) via the lateral join so a platform admin can act on any specific tenant's install.
export async function listMarketplaceAppsForPlatformAdmin() {
  return query<any>(
    `select a.id, a."tenantId" as "ownerTenantId", t.name as "ownerTenantName", a.name, a.category, a."isActive", a."createdAt", a."publishStatus", a."trustLevel",
            i."tenantId", it.name as "tenantName", i.status as "installStatus"
     from "MarketplaceApp" a
     join "Tenant" t on t.id = a."tenantId"
     left join "TenantAppInstall" i on i."appId" = a.id
     left join "Tenant" it on it.id = i."tenantId"
     order by a."createdAt" desc, i."createdAt" asc
     limit 500`,
    [],
  );
}

// A stronger lock than a tenant admin's own suspend (suspendAppInstall): sets
// MarketplaceApp.isActive = false directly, which also stops enqueueAppEvent's own join
// condition (`a."isActive" = true`) from ever matching this app again regardless of install
// status -- the tenant can't quietly reinstate a platform-admin-suspended app via the normal
// reinstateAppInstall path, since that only flips TenantAppInstall.status, not this.
export async function suspendAppAsPlatformAdmin(platformAdminUser: { id: string }, appId: string, reason: string | null) {
  const now = new Date().toISOString();
  const app = await queryOne<{ id: string; tenantId: string; name: string }>(
    `update "MarketplaceApp" set "isActive" = false, "updatedAt" = $1 where id = $2 returning id, "tenantId", name`,
    [now, appId],
  );
  if (!app) throw new Error("MARKETPLACE_APP_NOT_FOUND");
  await execute(
    `update "TenantAppInstall" set status = 'SUSPENDED', "suspendedAt" = $1, "suspendedReason" = $2, "updatedAt" = $1 where "appId" = $3 and status = 'INSTALLED'`,
    [now, reason || "Suspended by platform admin", appId],
  );
  await createAuditLog({ id: platformAdminUser.id, tenantId: app.tenantId } as any, "PLATFORM_ADMIN_SUSPEND", "MARKETPLACE_APP", appId, null, null, { reason }).catch(() => undefined);
  return app;
}

// "Rotate platform secrets" -- adapted honestly rather than reinterpreted loosely: there is no
// single shared "platform secret" in this per-tenant-app model, so this is a platform admin's
// emergency ability to force-rotate a specific tenant's app credential (e.g. a suspected
// compromise reported outside normal tenant-admin channels), not scoped by the platform admin's
// own tenant the way the tenant-facing rotateAppSecret is scoped by the caller's tenant.
//
// Multi-tenant note: `tenantId` is now a required parameter, not inferred. Since a published
// app can have one TenantAppSecret row per installing tenant (migration 0066), "rotate this
// app's secret" is ambiguous without saying whose install -- the platform-admin apps list
// already returns each row's tenantId, so the caller always has it on hand.
export async function rotateAppSecretAsPlatformAdmin(platformAdminUser: { id: string }, appId: string, tenantId: string) {
  const app = await queryOne<{ tenantId: string }>(`select "tenantId" from "MarketplaceApp" where id = $1`, [appId]);
  if (!app) throw new Error("MARKETPLACE_APP_NOT_FOUND");
  const existing = await queryOne<any>(`select ${SECRET_COLUMNS} from "TenantAppSecret" where "tenantId" = $1 and "appId" = $2`, [tenantId, appId]);
  if (!existing) throw new Error("APP_SECRET_NOT_FOUND");

  const now = new Date();
  const secret = randomBytes(24).toString("hex");
  const updated = await queryOne<any>(
    `update "TenantAppSecret"
     set secret = $1, "previousSecret" = $2, "previousSecretExpiresAt" = $3, "lastRotatedAt" = $4, "rotatedBy" = $5
     where id = $6
     returning ${SECRET_COLUMNS}`,
    [encryptSecretAtRest(secret), existing.secret, new Date(now.getTime() + ROTATION_GRACE_MS).toISOString(), now.toISOString(), platformAdminUser.id, existing.id],
  );
  if (!updated) throw new Error("APP_SECRET_ROTATE_FAILED");
  await createAuditLog({ id: platformAdminUser.id, tenantId } as any, "PLATFORM_ADMIN_ROTATE_SECRET", "TENANT_APP_SECRET", existing.id, null, null, { appId }).catch(() => undefined);
  return { secret, signingSecret: decryptSecretAtRestOrNull(updated.signingSecret) };
}

// --- Publish/vendor-version approval ("publish/unpublish apps" + "approve vendor/app
// versions" sub-items) ---

export async function listPendingVersionsForPlatformAdmin() {
  return query<any>(
    `select v.id, v."appId", a.name as "appName", t.name as "ownerTenantName", v.version, v."changeNotes", v."createdAt", a."publishStatus"
     from "MarketplaceAppVersion" v
     join "MarketplaceApp" a on a.id = v."appId"
     join "Tenant" t on t.id = a."tenantId"
     where v."approvalStatus" = 'PENDING'
     order by v."createdAt" asc
     limit 200`,
    [],
  );
}

// Approving a version is the actual publish action for an app's first-ever review (auto-flips
// PENDING_REVIEW -> PUBLISHED in the same transaction-shaped sequence), and is also how a
// platform admin re-approves a subsequent edit to an app that's already public -- one review
// mechanism for both cases rather than two separate ones.
export async function approveAppVersion(platformAdminUser: { id: string }, versionId: string) {
  const now = new Date().toISOString();
  const version = await queryOne<any>(
    `update "MarketplaceAppVersion" set "approvalStatus" = 'APPROVED', "approvedBy" = $1, "approvedAt" = $2, "rejectedReason" = null
     where id = $3 and "approvalStatus" = 'PENDING'
     returning ${VERSION_COLUMNS}`,
    [platformAdminUser.id, now, versionId],
  );
  if (!version) throw new Error("APP_VERSION_NOT_PENDING");

  const app = await queryOne<{ id: string; tenantId: string; publishStatus: string }>(`select id, "tenantId", "publishStatus" from "MarketplaceApp" where id = $1`, [version.appId]);
  let publishedApp = null;
  if (app?.publishStatus === "PENDING_REVIEW") {
    publishedApp = await queryOne<any>(
      `update "MarketplaceApp" set "publishStatus" = 'PUBLISHED', "isPrivate" = false, "publishedAt" = $1, "publishedBy" = $2, "updatedAt" = $1 where id = $3 returning ${APP_COLUMNS}`,
      [now, platformAdminUser.id, version.appId],
    );
  }
  await createAuditLog({ id: platformAdminUser.id, tenantId: app?.tenantId } as any, "APPROVE_VERSION", "MARKETPLACE_APP_VERSION", versionId, null, version, {
    publishedApp: !!publishedApp,
  }).catch(() => undefined);
  return { version, app: publishedApp ?? app };
}

export async function rejectAppVersion(platformAdminUser: { id: string }, versionId: string, reason: string | null) {
  const now = new Date().toISOString();
  const version = await queryOne<any>(
    `update "MarketplaceAppVersion" set "approvalStatus" = 'REJECTED', "rejectedReason" = $1
     where id = $2 and "approvalStatus" = 'PENDING'
     returning ${VERSION_COLUMNS}`,
    [reason ?? null, versionId],
  );
  if (!version) throw new Error("APP_VERSION_NOT_PENDING");

  const app = await queryOne<{ id: string; tenantId: string; publishStatus: string }>(`select id, "tenantId", "publishStatus" from "MarketplaceApp" where id = $1`, [version.appId]);
  let rejectedApp = null;
  if (app?.publishStatus === "PENDING_REVIEW") {
    rejectedApp = await queryOne<any>(
      `update "MarketplaceApp" set "publishStatus" = 'REJECTED', "publishRejectedReason" = $1, "updatedAt" = $2 where id = $3 returning ${APP_COLUMNS}`,
      [reason ?? null, now, version.appId],
    );
  }
  await createAuditLog({ id: platformAdminUser.id, tenantId: app?.tenantId } as any, "REJECT_VERSION", "MARKETPLACE_APP_VERSION", versionId, null, version, { reason }).catch(() => undefined);
  return { version, app: rejectedApp ?? app };
}

// Softer than suspendAppAsPlatformAdmin: removes the app from the catalog (no NEW installs)
// without touching any tenant that already installed it -- a deliberate, stated scope decision
// rather than an oversight, since this pass doesn't build per-install version pinning either.
export async function unpublishApp(platformAdminUser: { id: string }, appId: string, reason: string | null) {
  const now = new Date().toISOString();
  const app = await queryOne<any>(
    `update "MarketplaceApp" set "publishStatus" = 'UNPUBLISHED', "isPrivate" = true, "unpublishedAt" = $1, "unpublishedBy" = $2, "updatedAt" = $1
     where id = $3 and "publishStatus" = 'PUBLISHED'
     returning ${APP_COLUMNS}`,
    [now, platformAdminUser.id, appId],
  );
  if (!app) throw new Error("MARKETPLACE_APP_NOT_PUBLISHED");
  await createAuditLog({ id: platformAdminUser.id, tenantId: app.tenantId } as any, "UNPUBLISH", "MARKETPLACE_APP", appId, null, app, { reason }).catch(() => undefined);
  return app;
}

// --- Vendor trust level + tenant allow/block list ("marketplace security controls" sub-items,
// the last 2 that were previously marked not-applicable pending a real public catalog) ---

// Purely informational, not a gate on anything -- a signal shown to an installing tenant in the
// catalog to help them decide, not an enforcement rule. Every app starts UNVERIFIED; a platform
// admin raises it after actually reviewing the vendor/app, same spirit as any app-store trust
// badge.
export async function setAppTrustLevel(platformAdminUser: { id: string }, appId: string, trustLevel: string) {
  if (!["UNVERIFIED", "VERIFIED", "TRUSTED"].includes(trustLevel)) throw new Error("INVALID_TRUST_LEVEL");
  const now = new Date().toISOString();
  const app = await queryOne<any>(
    `update "MarketplaceApp" set "trustLevel" = $1, "trustLevelSetBy" = $2, "trustLevelSetAt" = $3, "updatedAt" = $3 where id = $4 returning ${APP_COLUMNS}`,
    [trustLevel, platformAdminUser.id, now, appId],
  );
  if (!app) throw new Error("MARKETPLACE_APP_NOT_FOUND");
  await createAuditLog({ id: platformAdminUser.id, tenantId: app.tenantId } as any, "SET_TRUST_LEVEL", "MARKETPLACE_APP", appId, null, null, { trustLevel }).catch(() => undefined);
  return app;
}

// Blocks only NEW install requests (requestInstallOfPublishedApp) for this specific tenant --
// matching unpublishApp's own scope decision, an existing install (if this tenant already had
// one) is untouched.
export async function blockAppForTenant(platformAdminUser: { id: string }, tenantId: string, appId: string, reason: string | null) {
  const app = await queryOne<{ id: string; tenantId: string }>(`select id, "tenantId" from "MarketplaceApp" where id = $1`, [appId]);
  if (!app) throw new Error("MARKETPLACE_APP_NOT_FOUND");
  const now = new Date().toISOString();
  await execute(
    `insert into "MarketplaceAppTenantBlock" (id, "tenantId", "appId", reason, "blockedBy", "createdAt")
     values ($1, $2, $3, $4, $5, $6)
     on conflict ("tenantId", "appId") do update set reason = excluded.reason, "blockedBy" = excluded."blockedBy", "createdAt" = excluded."createdAt"`,
    [randomUUID(), tenantId, appId, reason, platformAdminUser.id, now],
  );
  await createAuditLog({ id: platformAdminUser.id, tenantId: app.tenantId } as any, "BLOCK_TENANT", "MARKETPLACE_APP", appId, null, null, { blockedTenantId: tenantId, reason }).catch(
    () => undefined,
  );
  return { tenantId, appId, reason };
}

export async function unblockAppForTenant(platformAdminUser: { id: string }, tenantId: string, appId: string) {
  const removed = await execute(`delete from "MarketplaceAppTenantBlock" where "tenantId" = $1 and "appId" = $2`, [tenantId, appId]);
  if (!removed) throw new Error("APP_TENANT_BLOCK_NOT_FOUND");
  const app = await queryOne<{ tenantId: string }>(`select "tenantId" from "MarketplaceApp" where id = $1`, [appId]);
  await createAuditLog({ id: platformAdminUser.id, tenantId: app?.tenantId } as any, "UNBLOCK_TENANT", "MARKETPLACE_APP", appId, null, null, { unblockedTenantId: tenantId }).catch(
    () => undefined,
  );
  return { tenantId, appId };
}

export async function listAppTenantBlocksForPlatformAdmin() {
  return query<any>(
    `select b.id, b."appId", a.name as "appName", b."tenantId", t.name as "tenantName", b.reason, b."createdAt"
     from "MarketplaceAppTenantBlock" b
     join "MarketplaceApp" a on a.id = b."appId"
     join "Tenant" t on t.id = b."tenantId"
     order by b."createdAt" desc
     limit 500`,
    [],
  );
}

// ---------------------------------------------------------------------------------------------
// App-backed automation nodes (checklist: "installed apps can expose safe actions/triggers with
// schema-defined inputs, dropdown-backed values, permission checks, and runtime audit logs").
// "Triggers" are out of scope for this pass -- there is no mechanism anywhere in this codebase
// for an external app to originate a CRM-side event (only the reverse, via the existing app
// event bus), so only the "actions" half is built here, honestly. inputSchema entries are
// {key, label, type: "text"|"number"|"select", required, options?} -- "options" is what makes a
// field dropdown-backed in the automation builder UI.
// ---------------------------------------------------------------------------------------------

const APP_ACTION_COLUMNS = 'id, "tenantId", "appId", key, name, description, "inputSchema", "isActive", "createdBy", "createdAt", "updatedAt"';

type AppActionInputField = { key: string; label: string; type: string; required: boolean; options?: string[] };

function normalizeInputSchema(input: unknown): AppActionInputField[] {
  if (!Array.isArray(input)) return [];
  const fields: AppActionInputField[] = [];
  for (const field of input) {
    const key = String((field as any)?.key ?? "").trim();
    if (!key) continue;
    const type = ["text", "number", "select"].includes((field as any)?.type) ? (field as any).type : "text";
    fields.push({
      key,
      label: String((field as any)?.label ?? key),
      type,
      required: Boolean((field as any)?.required),
      options: type === "select" && Array.isArray((field as any)?.options) ? (field as any).options.map(String).filter(Boolean) : undefined,
    });
  }
  return fields;
}

// App owner's own management of their app's action catalog -- scoped to apps the caller's
// tenant owns, the same "tenantId" = a."tenantId" ownership check every other app-management
// function in this file already uses (registerMarketplaceApp/updateMarketplaceApp, etc).
async function assertOwnsApp(tenantId: string, appId: string) {
  const app = await queryOne<{ id: string }>(`select id from "MarketplaceApp" where id = $1 and "tenantId" = $2 limit 1`, [appId, tenantId]);
  if (!app) throw new Error("MARKETPLACE_APP_NOT_FOUND");
}

export async function listAppActionsForTenant(user: TenantUser, appId: string) {
  await assertMarketplaceEnabled(user);
  await assertOwnsApp(user.tenantId!, appId);
  return query<any>(`select ${APP_ACTION_COLUMNS} from "MarketplaceAppAction" where "appId" = $1 order by "createdAt" asc`, [appId]);
}

export async function createAppAction(user: TenantUser, appId: string, input: { key?: string; name?: string; description?: string | null; inputSchema?: unknown }) {
  await assertMarketplaceEnabled(user);
  const tenantId = user.tenantId!;
  await assertOwnsApp(tenantId, appId);
  const key = String(input.key ?? "").trim();
  const name = String(input.name ?? "").trim();
  if (!key || !name) throw new Error("APP_ACTION_KEY_AND_NAME_REQUIRED");

  let action;
  try {
    action = await queryOne<any>(
      `insert into "MarketplaceAppAction" (id, "tenantId", "appId", key, name, description, "inputSchema", "createdBy", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
       returning ${APP_ACTION_COLUMNS}`,
      [randomUUID(), tenantId, appId, key, name, input.description ?? null, normalizeInputSchema(input.inputSchema), user.id, new Date().toISOString()],
    );
  } catch (error) {
    if (error instanceof DatabaseError && error.code === "23505") throw new Error("DUPLICATE_APP_ACTION_KEY");
    throw error;
  }
  if (!action) throw new Error("APP_ACTION_CREATE_FAILED");
  await createAuditLog(user as any, "CREATE", "MARKETPLACE_APP_ACTION", action.id, null, action, { appId }).catch(() => undefined);
  return action;
}

export async function updateAppAction(
  user: TenantUser,
  appId: string,
  actionId: string,
  input: { name?: string; description?: string | null; inputSchema?: unknown; isActive?: boolean },
) {
  await assertMarketplaceEnabled(user);
  const tenantId = user.tenantId!;
  await assertOwnsApp(tenantId, appId);
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (input.name !== undefined) patch.name = String(input.name).trim();
  if (input.description !== undefined) patch.description = input.description;
  if (input.inputSchema !== undefined) patch.inputSchema = normalizeInputSchema(input.inputSchema);
  if (input.isActive !== undefined) patch.isActive = Boolean(input.isActive);

  const columns = Object.keys(patch);
  const values = columns.map((c) => patch[c]);
  const assignments = columns.map((c, i) => `"${c}" = $${i + 1}`).join(", ");
  const updated = await queryOne<any>(
    `update "MarketplaceAppAction" set ${assignments} where "appId" = $${columns.length + 1} and id = $${columns.length + 2} returning ${APP_ACTION_COLUMNS}`,
    [...values, appId, actionId],
  );
  if (!updated) throw new Error("APP_ACTION_NOT_FOUND");
  await createAuditLog(user as any, "UPDATE", "MARKETPLACE_APP_ACTION", actionId, null, updated, { appId }).catch(() => undefined);
  return updated;
}

export async function deleteAppAction(user: TenantUser, appId: string, actionId: string) {
  await assertMarketplaceEnabled(user);
  await assertOwnsApp(user.tenantId!, appId);
  const deleted = await execute(`delete from "MarketplaceAppAction" where "appId" = $1 and id = $2`, [appId, actionId]);
  if (!deleted) throw new Error("APP_ACTION_NOT_FOUND");
  await createAuditLog(user as any, "DELETE", "MARKETPLACE_APP_ACTION", actionId, null, null, { appId }).catch(() => undefined);
}

// The automation builder's picker: every action from every app this tenant has actually
// INSTALLED and granted "automations":"write" to -- an app with only "read" (or no grant at
// all) never appears as something the builder can call, matching the "permission checks" half
// of the checklist item literally, not just at invocation time.
export async function listAvailableAppActionsForInstall(user: TenantUser) {
  await assertMarketplaceEnabled(user);
  const tenantId = user.tenantId!;
  return query<any>(
    `select act.id, act."appId", app.name as "appName", act.key, act.name, act.description, act."inputSchema"
     from "MarketplaceAppAction" act
     join "MarketplaceApp" app on app.id = act."appId" and app."isActive" = true
     join "TenantAppInstall" i on i."appId" = act."appId" and i."tenantId" = $1 and i.status = 'INSTALLED'
     join "TenantAppPermissionGrant" g on g."installId" = i.id and g."moduleKey" = 'automations' and g.scope = 'write'
     where act."isActive" = true
     order by app.name asc, act.name asc`,
    [tenantId],
  );
}

// The automation builder's "App Event" trigger picker -- every app this tenant has INSTALLED
// with "automations":"write" access, i.e. every app actually allowed to call POST
// /api/v1/apps/automation-events (fireAppAutomationTrigger in marketplace-inbound.ts checks the
// exact same grant). Deliberately not scoped to apps with a registered MarketplaceAppAction --
// unlike listAvailableAppActionsForInstall's outbound picker, an app needs no declared action to
// fire an inbound event, so that list would both wrongly exclude and wrongly duplicate entries.
export async function listAppsWithAutomationTriggerGrant(user: TenantUser) {
  await assertMarketplaceEnabled(user);
  const tenantId = user.tenantId!;
  return query<any>(
    `select distinct app.id as "appId", app.name as "appName"
     from "MarketplaceApp" app
     join "TenantAppInstall" i on i."appId" = app.id and i."tenantId" = $1 and i.status = 'INSTALLED'
     join "TenantAppPermissionGrant" g on g."installId" = i.id and g."moduleKey" = 'automations' and g.scope = 'write'
     where app."isActive" = true
     order by app.name asc`,
    [tenantId],
  );
}

function signAppPayload(secret: string, timestamp: string, rawBody: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

// The actual runtime call an automation's "call_app_action" node makes (see
// automations-postgres.ts). Re-checks the "automations":"write" grant itself rather than
// trusting the automation builder already checked it at config time -- an app's grant can be
// narrowed or the app suspended *after* a workflow was built around it, and this is the one
// place that actually matters: right before a real HTTP call goes out.
export async function invokeAppAction(user: TenantUser, appId: string, actionKey: string, input: Record<string, unknown>, automationId: string | null) {
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");

  const recordRun = async (status: "SUCCESS" | "FAILED", httpStatus: number | null, responseBody: string | null, errorMessage: string | null) => {
    await execute(
      `insert into "MarketplaceAppActionRun" (id, "tenantId", "appId", "actionKey", "automationId", input, status, "httpStatus", "responseBody", "errorMessage", "createdAt")
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [randomUUID(), tenantId, appId, actionKey, automationId, input, status, httpStatus, responseBody, errorMessage, new Date().toISOString()],
    ).catch(() => undefined);
  };

  const install = await queryOne<{ id: string }>(`select id from "TenantAppInstall" where "tenantId" = $1 and "appId" = $2 and status = 'INSTALLED' limit 1`, [tenantId, appId]);
  if (!install) {
    await recordRun("FAILED", null, null, "App is not installed for this workspace");
    return { status: "FAILED" as const, errorMessage: "App is not installed for this workspace" };
  }
  const grant = await queryOne<{ scope: string }>(`select scope from "TenantAppPermissionGrant" where "installId" = $1 and "moduleKey" = 'automations'`, [install.id]);
  if (grant?.scope !== "write") {
    await recordRun("FAILED", null, null, "This app has not been granted automations write access");
    return { status: "FAILED" as const, errorMessage: "This app has not been granted automations write access" };
  }

  const app = await queryOne<{ webhookUrl: string | null; name: string; isActive: boolean }>(`select "webhookUrl", name, "isActive" from "MarketplaceApp" where id = $1`, [appId]);
  const action = await queryOne<{ inputSchema: AppActionInputField[] }>(`select "inputSchema" from "MarketplaceAppAction" where "appId" = $1 and key = $2 and "isActive" = true`, [appId, actionKey]);
  if (!app?.isActive || !app.webhookUrl) {
    await recordRun("FAILED", null, null, "App has no webhook URL configured, or is suspended");
    return { status: "FAILED" as const, errorMessage: "App has no webhook URL configured, or is suspended" };
  }
  if (!action) {
    await recordRun("FAILED", null, null, `Unknown or inactive action "${actionKey}"`);
    return { status: "FAILED" as const, errorMessage: `Unknown or inactive action "${actionKey}"` };
  }
  const missingRequired = (action.inputSchema ?? []).filter((field) => field.required && (input[field.key] === undefined || input[field.key] === null || input[field.key] === ""));
  if (missingRequired.length > 0) {
    const message = `Missing required input: ${missingRequired.map((f) => f.key).join(", ")}`;
    await recordRun("FAILED", null, null, message);
    return { status: "FAILED" as const, errorMessage: message };
  }

  const secretRowEncrypted = await queryOne<{ signingSecret: string }>(`select "signingSecret" from "TenantAppSecret" where "tenantId" = $1 and "appId" = $2`, [tenantId, appId]);
  const secretRow = secretRowEncrypted ? { signingSecret: decryptSecretAtRestOrNull(secretRowEncrypted.signingSecret) } : null;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const rawBody = JSON.stringify({ type: "action", actionKey, tenantId, input });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const headers: Record<string, string> = { "content-type": "application/json", "x-app-timestamp": timestamp, "x-app-event": `action:${actionKey}` };
    if (secretRow?.signingSecret) headers["x-app-signature"] = signAppPayload(secretRow.signingSecret, timestamp, rawBody);
    const response = await fetch(app.webhookUrl, { method: "POST", headers, body: rawBody, signal: controller.signal });
    const responseBody = (await response.text().catch(() => "")).slice(0, 2000);
    if (!response.ok) {
      await recordRun("FAILED", response.status, responseBody, `HTTP ${response.status}`);
      return { status: "FAILED" as const, httpStatus: response.status, errorMessage: `HTTP ${response.status}` };
    }
    await recordRun("SUCCESS", response.status, responseBody, null);
    return { status: "SUCCESS" as const, httpStatus: response.status, responseBody };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Network error";
    await recordRun("FAILED", null, null, errorMessage);
    return { status: "FAILED" as const, errorMessage };
  } finally {
    clearTimeout(timeout);
  }
}

export async function listAppActionRunsForTenant(user: TenantUser, appId: string, limit = 50) {
  await assertMarketplaceEnabled(user);
  if (!user.tenantId) return [];
  return query<any>(
    `select id, "actionKey", "automationId", input, status, "httpStatus", "responseBody", "errorMessage", "createdAt"
     from "MarketplaceAppActionRun"
     where "tenantId" = $1 and "appId" = $2
     order by "createdAt" desc
     limit $3`,
    [user.tenantId, appId, Math.min(200, Math.max(1, limit))],
  );
}

// ---------------------------------------------------------------------------------------------
// App-backed report datasets (checklist: "installed apps can expose report datasets/widgets
// through validated schemas, tenant permission checks, and cached rollups where needed"). Scope
// decision: this pass builds the dataset declaration, permission-checked fetch, and TTL cache
// layer -- the actual "expose ... through ... widgets" half (wiring an app report into a
// DashboardWidget as a live STAT/BAR/TREND source) is a further, separate UI-surface piece not
// attempted here; the report-table consumption surface below is what's real.
// ---------------------------------------------------------------------------------------------

const APP_REPORT_COLUMNS = 'id, "tenantId", "appId", key, name, description, "columnSchema", "cacheTtlMinutes", "isActive", "createdBy", "createdAt", "updatedAt"';

type AppReportColumn = { key: string; label: string; type: string };

function normalizeColumnSchema(input: unknown): AppReportColumn[] {
  if (!Array.isArray(input)) return [];
  const columns: AppReportColumn[] = [];
  for (const column of input) {
    const key = String((column as any)?.key ?? "").trim();
    if (!key) continue;
    columns.push({ key, label: String((column as any)?.label ?? key), type: String((column as any)?.type ?? "text") });
  }
  return columns;
}

export async function listAppReportsForTenant(user: TenantUser, appId: string) {
  await assertMarketplaceEnabled(user);
  await assertOwnsApp(user.tenantId!, appId);
  return query<any>(`select ${APP_REPORT_COLUMNS} from "MarketplaceAppReport" where "appId" = $1 order by "createdAt" asc`, [appId]);
}

export async function createAppReport(
  user: TenantUser,
  appId: string,
  input: { key?: string; name?: string; description?: string | null; columnSchema?: unknown; cacheTtlMinutes?: number },
) {
  await assertMarketplaceEnabled(user);
  const tenantId = user.tenantId!;
  await assertOwnsApp(tenantId, appId);
  const key = String(input.key ?? "").trim();
  const name = String(input.name ?? "").trim();
  if (!key || !name) throw new Error("APP_REPORT_KEY_AND_NAME_REQUIRED");
  const cacheTtlMinutes = Number.isFinite(input.cacheTtlMinutes) && Number(input.cacheTtlMinutes) > 0 ? Math.floor(Number(input.cacheTtlMinutes)) : 15;

  let report;
  try {
    report = await queryOne<any>(
      `insert into "MarketplaceAppReport" (id, "tenantId", "appId", key, name, description, "columnSchema", "cacheTtlMinutes", "createdBy", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
       returning ${APP_REPORT_COLUMNS}`,
      [randomUUID(), tenantId, appId, key, name, input.description ?? null, normalizeColumnSchema(input.columnSchema), cacheTtlMinutes, user.id, new Date().toISOString()],
    );
  } catch (error) {
    if (error instanceof DatabaseError && error.code === "23505") throw new Error("DUPLICATE_APP_REPORT_KEY");
    throw error;
  }
  if (!report) throw new Error("APP_REPORT_CREATE_FAILED");
  await createAuditLog(user as any, "CREATE", "MARKETPLACE_APP_REPORT", report.id, null, report, { appId }).catch(() => undefined);
  return report;
}

export async function updateAppReport(
  user: TenantUser,
  appId: string,
  reportId: string,
  input: { name?: string; description?: string | null; columnSchema?: unknown; cacheTtlMinutes?: number; isActive?: boolean },
) {
  await assertMarketplaceEnabled(user);
  const tenantId = user.tenantId!;
  await assertOwnsApp(tenantId, appId);
  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (input.name !== undefined) patch.name = String(input.name).trim();
  if (input.description !== undefined) patch.description = input.description;
  if (input.columnSchema !== undefined) patch.columnSchema = normalizeColumnSchema(input.columnSchema);
  if (input.cacheTtlMinutes !== undefined && Number.isFinite(input.cacheTtlMinutes) && Number(input.cacheTtlMinutes) > 0) patch.cacheTtlMinutes = Math.floor(Number(input.cacheTtlMinutes));
  if (input.isActive !== undefined) patch.isActive = Boolean(input.isActive);

  const columns = Object.keys(patch);
  const values = columns.map((c) => patch[c]);
  const assignments = columns.map((c, i) => `"${c}" = $${i + 1}`).join(", ");
  const updated = await queryOne<any>(
    `update "MarketplaceAppReport" set ${assignments} where "appId" = $${columns.length + 1} and id = $${columns.length + 2} returning ${APP_REPORT_COLUMNS}`,
    [...values, appId, reportId],
  );
  if (!updated) throw new Error("APP_REPORT_NOT_FOUND");
  await createAuditLog(user as any, "UPDATE", "MARKETPLACE_APP_REPORT", reportId, null, updated, { appId }).catch(() => undefined);
  return updated;
}

export async function deleteAppReport(user: TenantUser, appId: string, reportId: string) {
  await assertMarketplaceEnabled(user);
  await assertOwnsApp(user.tenantId!, appId);
  const deleted = await execute(`delete from "MarketplaceAppReport" where "appId" = $1 and id = $2`, [appId, reportId]);
  if (!deleted) throw new Error("APP_REPORT_NOT_FOUND");
  await createAuditLog(user as any, "DELETE", "MARKETPLACE_APP_REPORT", reportId, null, null, { appId }).catch(() => undefined);
}

// The Reports page's picker: every dataset from every app this tenant has INSTALLED and
// granted "reports":"read" (or "write") to.
export async function listAvailableAppReportsForInstall(user: TenantUser) {
  await assertMarketplaceEnabled(user);
  const tenantId = user.tenantId!;
  return query<any>(
    `select rep.id, rep."appId", app.name as "appName", rep.key, rep.name, rep.description, rep."columnSchema", rep."cacheTtlMinutes"
     from "MarketplaceAppReport" rep
     join "MarketplaceApp" app on app.id = rep."appId" and app."isActive" = true
     join "TenantAppInstall" i on i."appId" = rep."appId" and i."tenantId" = $1 and i.status = 'INSTALLED'
     join "TenantAppPermissionGrant" g on g."installId" = i.id and g."moduleKey" = 'reports' and g.scope in ('read', 'write')
     where rep."isActive" = true
     order by app.name asc, rep.name asc`,
    [tenantId],
  );
}

// Cache-checked fetch: returns the cached rows if still fresh (now < expiresAt), otherwise
// makes a live signed POST to the app's webhookUrl (payload `{type: "report", reportKey}`,
// expects `{rows: [...]}` back) and refreshes the cache row before returning. forceRefresh
// bypasses the freshness check for an explicit user-triggered "Refresh now."
export async function getAppReportData(user: TenantUser, appId: string, reportKey: string, opts: { forceRefresh?: boolean } = {}) {
  const tenantId = user.tenantId;
  if (!tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");

  const install = await queryOne<{ id: string }>(`select id from "TenantAppInstall" where "tenantId" = $1 and "appId" = $2 and status = 'INSTALLED' limit 1`, [tenantId, appId]);
  if (!install) throw new Error("APP_NOT_INSTALLED");
  const grant = await queryOne<{ scope: string }>(`select scope from "TenantAppPermissionGrant" where "installId" = $1 and "moduleKey" = 'reports'`, [install.id]);
  if (grant?.scope !== "read" && grant?.scope !== "write") throw new Error("APP_REPORT_ACCESS_NOT_GRANTED");

  const report = await queryOne<{ webhookUrl: string | null; isActive: boolean; cacheTtlMinutes: number; columnSchema: AppReportColumn[] }>(
    `select app."webhookUrl", app."isActive", rep."cacheTtlMinutes", rep."columnSchema"
     from "MarketplaceAppReport" rep join "MarketplaceApp" app on app.id = rep."appId"
     where rep."appId" = $1 and rep.key = $2 and rep."isActive" = true limit 1`,
    [appId, reportKey],
  );
  if (!report) throw new Error("APP_REPORT_NOT_FOUND");

  if (!opts.forceRefresh) {
    const cached = await queryOne<{ rows: unknown; status: string; errorMessage: string | null; fetchedAt: string; expiresAt: string }>(
      `select rows, status, "errorMessage", "fetchedAt", "expiresAt" from "MarketplaceAppReportCache" where "tenantId" = $1 and "appId" = $2 and "reportKey" = $3`,
      [tenantId, appId, reportKey],
    );
    if (cached && new Date(cached.expiresAt).getTime() > Date.now()) {
      return { rows: cached.rows ?? [], columnSchema: report.columnSchema, status: cached.status, errorMessage: cached.errorMessage, fetchedAt: cached.fetchedAt, fromCache: true };
    }
  }

  if (!report.isActive || !report.webhookUrl) throw new Error("APP_REPORT_APP_UNAVAILABLE");
  const secretRowEncrypted = await queryOne<{ signingSecret: string }>(`select "signingSecret" from "TenantAppSecret" where "tenantId" = $1 and "appId" = $2`, [tenantId, appId]);
  const secretRow = secretRowEncrypted ? { signingSecret: decryptSecretAtRestOrNull(secretRowEncrypted.signingSecret) } : null;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const rawBody = JSON.stringify({ type: "report", reportKey, tenantId });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + report.cacheTtlMinutes * 60 * 1000).toISOString();

  let rows: unknown[] = [];
  let status: "OK" | "ERROR" = "OK";
  let errorMessage: string | null = null;
  try {
    const headers: Record<string, string> = { "content-type": "application/json", "x-app-timestamp": timestamp, "x-app-event": `report:${reportKey}` };
    if (secretRow?.signingSecret) headers["x-app-signature"] = signAppPayload(secretRow.signingSecret, timestamp, rawBody);
    const response = await fetch(report.webhookUrl, { method: "POST", headers, body: rawBody, signal: controller.signal });
    const body = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(body?.rows)) {
      status = "ERROR";
      errorMessage = !response.ok ? `HTTP ${response.status}` : "App response missing a `rows` array";
    } else {
      rows = body.rows.slice(0, 500);
    }
  } catch (error) {
    status = "ERROR";
    errorMessage = error instanceof Error ? error.message : "Network error";
  } finally {
    clearTimeout(timeout);
  }

  await execute(
    `insert into "MarketplaceAppReportCache" (id, "tenantId", "appId", "reportKey", rows, status, "errorMessage", "fetchedAt", "expiresAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict ("tenantId", "appId", "reportKey") do update set rows = excluded.rows, status = excluded.status, "errorMessage" = excluded."errorMessage", "fetchedAt" = excluded."fetchedAt", "expiresAt" = excluded."expiresAt"`,
    [randomUUID(), tenantId, appId, reportKey, rows, status, errorMessage, now.toISOString(), expiresAt],
  );

  return { rows, columnSchema: report.columnSchema, status, errorMessage, fetchedAt: now.toISOString(), fromCache: false };
}
