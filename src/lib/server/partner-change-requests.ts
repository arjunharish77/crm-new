import { randomUUID } from "crypto";
import { execute, query, queryOne } from "@/lib/db/query";
import { assertModuleEnabled } from "@/lib/server/module-entitlements";
import { createAuditLog } from "@/lib/server/crm";
import { getPartnerProfileForUser, updatePartnerProfileForTenant } from "@/lib/server/partners";

type TenantUser = {
  id: string;
  tenantId: string | null;
  name?: string | null;
  email?: string | null;
  isPlatformAdmin?: boolean;
  isPartner?: boolean;
};

// Gap checklist Module 10's "approval inbox" item, "partner changes" sub-item -- confirmed by
// audit that PATCH /api/partners/[id] is already tenant-admin-only, so a partner has never had
// any way, self-service or otherwise, to change their own profile. Only these fields are
// proposable -- the legal/financial identity fields an admin should actually review, not
// operational fields like canAccessPayouts/partnerLoginRole (those stay admin-direct-edit-only,
// unchanged).
const PROPOSABLE_FIELDS = ["legalBusinessName", "gstin", "panNumber", "registeredAddress", "registeredState"] as const;
type ProposableField = (typeof PROPOSABLE_FIELDS)[number];

const CHANGE_REQUEST_COLUMNS = `id, "tenantId", "partnerProfileId", "requestedBy", "proposedChanges", status, "reviewedBy", "reviewedAt", "reviewComment", "createdAt", "updatedAt"`;

export async function submitPartnerChangeRequest(user: TenantUser, proposedChanges: Record<string, unknown>) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  await assertModuleEnabled(user.tenantId, "PARTNERS", { isPlatformAdmin: user.isPlatformAdmin });
  const profile = await getPartnerProfileForUser(user);
  if (!profile) throw new Error("PARTNER_PROFILE_NOT_FOUND");

  const filtered: Record<string, unknown> = {};
  for (const field of PROPOSABLE_FIELDS) {
    if (proposedChanges[field] !== undefined) filtered[field] = proposedChanges[field];
  }
  if (Object.keys(filtered).length === 0) throw new Error("NO_PROPOSED_CHANGES");

  const now = new Date().toISOString();
  const row = await queryOne<any>(
    `insert into "PartnerChangeRequest" (id, "tenantId", "partnerProfileId", "requestedBy", "proposedChanges", status, "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, 'PENDING', $6, $6)
     returning ${CHANGE_REQUEST_COLUMNS}`,
    [randomUUID(), user.tenantId, profile.id, user.id, filtered, now],
  );
  if (!row) throw new Error("PARTNER_CHANGE_REQUEST_INSERT_FAILED");
  await createAuditLog(user as any, "CREATE", "PARTNER_CHANGE_REQUEST", row.id, null, row, { partnerProfileId: profile.id }).catch(() => undefined);
  return row;
}

export async function listPendingPartnerChangeRequestsForTenant(user: TenantUser) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  await assertModuleEnabled(user.tenantId, "PARTNERS", { isPlatformAdmin: user.isPlatformAdmin });
  return query<any>(
    `select cr.id, cr."partnerProfileId", cr."requestedBy", cr."proposedChanges", cr.status, cr."createdAt",
            p."legalBusinessName" as "currentLegalBusinessName", u.name as "requestedByName", u.email as "requestedByEmail"
     from "PartnerChangeRequest" cr
     join "PartnerProfile" p on p.id = cr."partnerProfileId"
     join "User" u on u.id = cr."requestedBy"
     where cr."tenantId" = $1 and cr.status = 'PENDING'
     order by cr."createdAt" asc`,
    [user.tenantId],
  );
}

async function claimPartnerChangeRequest(user: TenantUser, id: string, status: "APPROVED" | "REJECTED", comment: string | null) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const now = new Date().toISOString();
  // Atomic claim -- the same `where status = 'PENDING'` idiom this codebase's other
  // approval-shaped transitions already use (payouts, export requests), so a double-click or a
  // race between two reviewers can't both "win".
  const row = await queryOne<any>(
    `update "PartnerChangeRequest"
     set status = $1, "reviewedBy" = $2, "reviewedAt" = $3, "reviewComment" = $4, "updatedAt" = $3
     where id = $5 and "tenantId" = $6 and status = 'PENDING'
     returning ${CHANGE_REQUEST_COLUMNS}`,
    [status, user.id, now, comment, id, user.tenantId],
  );
  if (!row) throw new Error("PARTNER_CHANGE_REQUEST_NOT_PENDING");
  return row;
}

export async function approvePartnerChangeRequest(user: TenantUser, id: string, comment?: string | null) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  await assertModuleEnabled(user.tenantId, "PARTNERS", { isPlatformAdmin: user.isPlatformAdmin });
  const row = await claimPartnerChangeRequest(user, id, "APPROVED", comment ?? null);
  // Applying the change reuses the exact same admin-direct-edit path (updatePartnerProfileForTenant)
  // this codebase's own admin-edit UI already goes through -- approval isn't a second, parallel
  // way of writing to PartnerProfile, just a gate in front of the one that already existed.
  await updatePartnerProfileForTenant(user, row.partnerProfileId, row.proposedChanges);
  await createAuditLog(user as any, "APPROVE", "PARTNER_CHANGE_REQUEST", id, null, row, { comment }).catch(() => undefined);
  return row;
}

export async function rejectPartnerChangeRequest(user: TenantUser, id: string, comment?: string | null) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  await assertModuleEnabled(user.tenantId, "PARTNERS", { isPlatformAdmin: user.isPlatformAdmin });
  const row = await claimPartnerChangeRequest(user, id, "REJECTED", comment ?? null);
  await createAuditLog(user as any, "REJECT", "PARTNER_CHANGE_REQUEST", id, null, row, { comment }).catch(() => undefined);
  return row;
}

export async function listMyPartnerChangeRequests(user: TenantUser) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  const profile = await getPartnerProfileForUser(user);
  if (!profile) return [];
  return query<any>(
    `select ${CHANGE_REQUEST_COLUMNS} from "PartnerChangeRequest" where "tenantId" = $1 and "partnerProfileId" = $2 order by "createdAt" desc`,
    [user.tenantId, profile.id],
  );
}
