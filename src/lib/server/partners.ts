import { randomUUID } from "crypto";
import { createTenantScopedUser } from "@/lib/server/admin";
import { createAuditLog } from "@/lib/server/crm";
import { execute, query, queryOne } from "@/lib/db/query";
import { assertModuleEnabled } from "@/lib/server/module-entitlements";

type TenantUser = {
  id: string;
  tenantId: string | null;
  name?: string | null;
  email?: string | null;
  role?: { permissions?: any } | string | null;
  isPlatformAdmin?: boolean;
};

export type CreatePartnerInput = {
  name: string;
  email: string;
  password: string;
  roleId: string;
  legalBusinessName: string;
  gstin?: string | null;
  panNumber?: string | null;
  registeredAddress?: Record<string, unknown> | null;
  registeredState?: string | null;
  invoiceNumberPrefix?: string;
};

export type CreatePartnerLoginInput = {
  name: string;
  email: string;
  password: string;
  roleId: string;
  partnerLoginRole?: "MANAGER" | "MEMBER" | "FINANCE";
  canAccessPayouts?: boolean;
  parentPartnerProfileId?: string | null;
};

export type UpdatePartnerProfileInput = {
  legalBusinessName?: string;
  gstin?: string | null;
  panNumber?: string | null;
  registeredAddress?: Record<string, unknown> | null;
  registeredState?: string | null;
  status?: "ACTIVE" | "SUSPENDED";
  invoiceNumberPrefix?: string;
  canAccessPayouts?: boolean;
  partnerLoginRole?: "PRIMARY" | "MANAGER" | "MEMBER" | "FINANCE";
  parentPartnerProfileId?: string | null;
};

async function assertRoleIsPartnerRole(tenantId: string, roleId: string) {
  const role = await queryOne<any>('select id, permissions from "Role" where "tenantId" = $1 and id = $2 limit 1', [tenantId, roleId]);
  if (!role || !(role as any).permissions?.isPartnerRole) {
    throw new Error("ROLE_IS_NOT_A_PARTNER_ROLE");
  }
}

export async function listPartnerProfilesForTenant(user: TenantUser) {
  if (!user.tenantId) return [];

  const profiles = await query<any>(
    `select id, "tenantId", "userId", "legalBusinessName", gstin, "panNumber", "registeredAddress",
            "registeredState", status, "invoiceNumberPrefix", "invoiceNumberCounter",
            "partnerOrganizationId", "parentPartnerProfileId", "canAccessPayouts",
            "partnerLoginRole", "createdAt", "updatedAt"
     from "PartnerProfile"
     where "tenantId" = $1
     order by "createdAt" desc`,
    [user.tenantId],
  );
  if (!profiles.length) return [];

  const userIds = profiles.map((profile: any) => profile.userId);
  const users = await query<any>('select id, name, email, status from "User" where "tenantId" = $1 and id = any($2::text[])', [
    user.tenantId,
    userIds,
  ]);
  const userMap = new Map(users.map((row) => [row.id, row]));
  return profiles.map((profile: any) => ({ ...profile, user: userMap.get(profile.userId) ?? null }));
}

// Gap checklist Module 17's "embedded analytics surfaces" sub-item ("partner/counselor/team
// mini dashboards") -- the previously-missing per-partner detail page needs a single-profile
// fetch, which didn't exist before (only PATCH did).
export async function getPartnerProfileForTenant(user: TenantUser, partnerProfileId: string) {
  if (!user.tenantId) return null;
  const profile = await queryOne<any>(
    `select id, "tenantId", "userId", "legalBusinessName", gstin, "panNumber", "registeredAddress",
            "registeredState", status, "invoiceNumberPrefix", "invoiceNumberCounter",
            "partnerOrganizationId", "parentPartnerProfileId", "canAccessPayouts",
            "partnerLoginRole", "createdAt", "updatedAt"
     from "PartnerProfile"
     where "tenantId" = $1 and id = $2
     limit 1`,
    [user.tenantId, partnerProfileId],
  );
  if (!profile) return null;
  const profileUser = await queryOne<any>('select id, name, email, status from "User" where "tenantId" = $1 and id = $2 limit 1', [
    user.tenantId,
    profile.userId,
  ]);
  return { ...profile, user: profileUser ?? null };
}

// Gap checklist Module 17's "embedded analytics surfaces" sub-item ("partner/counselor/team
// mini dashboards"). Reuses listCommissionLedgerForPartner unchanged (already accepts an
// explicit partnerId for tenant-admin callers) -- both it and listPayoutsForPartnerAsAdmin
// expect a User.id, so this resolves the profile's own `userId` first. Deliberately calls
// listPayoutsForPartnerAsAdmin, NOT listPayoutsForPartner -- the latter resolves visibility from
// the caller's own partner rollup target, which is empty for a real tenant admin (confirmed by
// reading it fully before reusing it, not assumed).
export async function getPartnerDashboardForTenant(user: TenantUser, partnerProfileId: string) {
  const profile = await getPartnerProfileForTenant(user, partnerProfileId);
  if (!profile) return null;

  const { listCommissionLedgerForPartner } = await import("@/lib/server/commission");
  const { listPayoutsForPartnerAsAdmin } = await import("@/lib/server/payouts");
  const [ledgerEntries, payouts] = await Promise.all([
    listCommissionLedgerForPartner(user, profile.userId),
    listPayoutsForPartnerAsAdmin(user, profile.userId),
  ]);

  const totalEarned = ledgerEntries
    .filter((entry: any) => entry.entryType === "EARNED")
    .reduce((sum: number, entry: any) => sum + Number(entry.commissionAmount ?? 0), 0);
  const totalPaid = payouts
    .filter((payout: any) => payout.status === "PAID")
    .reduce((sum: number, payout: any) => sum + Number(payout.totalCommissionAmount ?? 0), 0);
  const pendingPayouts = payouts.filter((payout: any) => payout.status !== "PAID").length;

  return {
    totals: { totalEarned, totalPaid, pendingPayouts },
    recentLedgerEntries: ledgerEntries.slice(0, 10),
    recentPayouts: payouts.slice(0, 10),
  };
}

export async function listPartnerLoginsForOrganization(user: TenantUser, partnerOrganizationId: string) {
  if (!user.tenantId) return [];

  const profiles = await query<any>(
    `select id, "tenantId", "userId", "legalBusinessName", gstin, "panNumber", "registeredAddress",
            "registeredState", status, "invoiceNumberPrefix", "invoiceNumberCounter",
            "partnerOrganizationId", "parentPartnerProfileId", "canAccessPayouts",
            "partnerLoginRole", "createdAt", "updatedAt"
     from "PartnerProfile"
     where "tenantId" = $1 and "partnerOrganizationId" = $2
     order by "partnerLoginRole" asc, "createdAt" asc`,
    [user.tenantId, partnerOrganizationId],
  );
  if (!profiles.length) return [];

  const users = await query<any>('select id, name, email, status from "User" where "tenantId" = $1 and id = any($2::text[])', [
    user.tenantId,
    profiles.map((profile: any) => profile.userId),
  ]);
  const userMap = new Map(users.map((row) => [row.id, row]));
  return profiles.map((profile: any) => ({ ...profile, user: userMap.get(profile.userId) ?? null }));
}

export async function getPartnerProfileForUser(user: TenantUser) {
  if (!user.tenantId) return null;
  return queryOne<any>(
    `select id, "tenantId", "userId", "legalBusinessName", gstin, "panNumber", "registeredAddress",
            "registeredState", status, "invoiceNumberPrefix", "invoiceNumberCounter",
            "partnerOrganizationId", "parentPartnerProfileId", "canAccessPayouts",
            "partnerLoginRole", "createdAt", "updatedAt"
     from "PartnerProfile"
     where "tenantId" = $1 and "userId" = $2
     limit 1`,
    [user.tenantId, user.id],
  );
}

export async function createPartnerForTenant(user: TenantUser, input: CreatePartnerInput) {
  if (!user.tenantId) {
    throw new Error("TENANT_CONTEXT_REQUIRED");
  }
  await assertModuleEnabled(user.tenantId, "PARTNERS", { isPlatformAdmin: user.isPlatformAdmin });

  await assertRoleIsPartnerRole(user.tenantId, input.roleId);

  const createdUser = await createTenantScopedUser(user.tenantId, {
    name: input.name,
    email: input.email,
    password: input.password,
    roleId: input.roleId,
  });

  const now = new Date().toISOString();
  const organization = await queryOne<any>(
    `insert into "PartnerOrganization"
      (id, "tenantId", name, status, "primaryUserId", "createdBy", "createdAt", "updatedAt")
     values ($1, $2, $3, 'ACTIVE', $4, $5, $6, $6)
     returning id`,
    [randomUUID(), user.tenantId, input.legalBusinessName, (createdUser as any).id, user.id, now],
  );
  if (!organization) throw new Error("PARTNER_ORGANIZATION_INSERT_FAILED");

  const profile = await queryOne<any>(
    `insert into "PartnerProfile"
      (id, "tenantId", "userId", "legalBusinessName", gstin, "panNumber", "registeredAddress",
       "registeredState", status, "invoiceNumberPrefix", "invoiceNumberCounter", "partnerOrganizationId",
       "canAccessPayouts", "partnerLoginRole", "createdBy", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', $9, 0, $10, true, 'PRIMARY', $11, $12, $12)
     returning id, "tenantId", "userId", "legalBusinessName", gstin, "panNumber", "registeredAddress",
               "registeredState", status, "invoiceNumberPrefix", "invoiceNumberCounter",
               "partnerOrganizationId", "parentPartnerProfileId", "canAccessPayouts",
               "partnerLoginRole", "createdAt", "updatedAt"`,
    [
      randomUUID(),
      user.tenantId,
      (createdUser as any).id,
      input.legalBusinessName,
      input.gstin || null,
      input.panNumber || null,
      input.registeredAddress || null,
      input.registeredState || null,
      input.invoiceNumberPrefix || "INV",
      organization.id,
      user.id,
      now,
    ],
  );
  if (!profile) throw new Error("PARTNER_PROFILE_INSERT_FAILED");
  await createAuditLog(user as any, "CREATE", "PARTNER_PROFILE", profile.id, null, profile, null);
  return { ...profile, user: createdUser };
}

export async function createPartnerLoginForTenant(
  user: TenantUser,
  partnerProfileId: string,
  input: CreatePartnerLoginInput
) {
  if (!user.tenantId) {
    throw new Error("TENANT_CONTEXT_REQUIRED");
  }
  await assertModuleEnabled(user.tenantId, "PARTNERS", { isPlatformAdmin: user.isPlatformAdmin });

  await assertRoleIsPartnerRole(user.tenantId, input.roleId);

  const primaryProfile = await queryOne<any>(
    `select id, "tenantId", "userId", "legalBusinessName", gstin, "panNumber", "registeredAddress",
            "registeredState", status, "invoiceNumberPrefix", "invoiceNumberCounter",
            "partnerOrganizationId", "parentPartnerProfileId", "canAccessPayouts",
            "partnerLoginRole", "createdAt", "updatedAt"
     from "PartnerProfile"
     where "tenantId" = $1 and id = $2
     limit 1`,
    [user.tenantId, partnerProfileId],
  );
  if (!primaryProfile) return null;

  let partnerOrganizationId = primaryProfile.partnerOrganizationId;
  const now = new Date().toISOString();
  if (!partnerOrganizationId) {
    const organization = await queryOne<any>(
      `insert into "PartnerOrganization"
        (id, "tenantId", name, status, "primaryUserId", "createdBy", "createdAt", "updatedAt")
       values ($1, $2, $3, $4, $5, $6, $7, $7)
       returning id`,
      [
        randomUUID(),
        user.tenantId,
        primaryProfile.legalBusinessName,
        primaryProfile.status ?? "ACTIVE",
        primaryProfile.userId,
        user.id,
        now,
      ],
    );
    if (!organization) throw new Error("PARTNER_ORGANIZATION_INSERT_FAILED");
    partnerOrganizationId = organization.id;
    await execute(
      'update "PartnerProfile" set "partnerOrganizationId" = $1, "partnerLoginRole" = $2, "updatedAt" = $3 where "tenantId" = $4 and id = $5',
      [partnerOrganizationId, "PRIMARY", now, user.tenantId, primaryProfile.id],
    );
  }

  const createdUser = await createTenantScopedUser(user.tenantId, {
    name: input.name,
    email: input.email,
    password: input.password,
    roleId: input.roleId,
  });

  const loginRole = input.partnerLoginRole ?? "MEMBER";
  const profile = await queryOne<any>(
    `insert into "PartnerProfile"
      (id, "tenantId", "userId", "legalBusinessName", gstin, "panNumber", "registeredAddress",
       "registeredState", status, "invoiceNumberPrefix", "invoiceNumberCounter", "partnerOrganizationId",
       "parentPartnerProfileId", "canAccessPayouts", "partnerLoginRole", "createdBy", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', $9, 0, $10, $11, $12, $13, $14, $15, $15)
     returning id, "tenantId", "userId", "legalBusinessName", gstin, "panNumber", "registeredAddress",
               "registeredState", status, "invoiceNumberPrefix", "invoiceNumberCounter",
               "partnerOrganizationId", "parentPartnerProfileId", "canAccessPayouts",
               "partnerLoginRole", "createdAt", "updatedAt"`,
    [
      randomUUID(),
      user.tenantId,
      (createdUser as any).id,
      primaryProfile.legalBusinessName,
      primaryProfile.gstin || null,
      primaryProfile.panNumber || null,
      primaryProfile.registeredAddress || null,
      primaryProfile.registeredState || null,
      primaryProfile.invoiceNumberPrefix || "INV",
      partnerOrganizationId,
      input.parentPartnerProfileId || primaryProfile.id,
      input.canAccessPayouts ?? (loginRole === "FINANCE" || loginRole === "MANAGER"),
      loginRole,
      user.id,
      now,
    ],
  );
  if (!profile) throw new Error("PARTNER_LOGIN_PROFILE_INSERT_FAILED");

  await createAuditLog(user as any, "CREATE", "PARTNER_LOGIN", profile.id, null, profile, {
    partnerOrganizationId,
    parentPartnerProfileId: profile.parentPartnerProfileId,
  });

  return { ...profile, user: createdUser };
}

export async function updatePartnerProfileForTenant(
  user: TenantUser,
  partnerProfileId: string,
  input: UpdatePartnerProfileInput
) {
  if (!user.tenantId) {
    throw new Error("TENANT_CONTEXT_REQUIRED");
  }
  await assertModuleEnabled(user.tenantId, "PARTNERS", { isPlatformAdmin: user.isPlatformAdmin });

  const existing = await queryOne<any>(
    `select id, "tenantId", "userId", "legalBusinessName", gstin, "panNumber", "registeredAddress",
            "registeredState", status, "invoiceNumberPrefix", "invoiceNumberCounter",
            "partnerOrganizationId", "parentPartnerProfileId", "canAccessPayouts",
            "partnerLoginRole", "createdAt", "updatedAt"
     from "PartnerProfile"
     where "tenantId" = $1 and id = $2
     limit 1`,
    [user.tenantId, partnerProfileId],
  );
  if (!existing) return null;

  const updatePayload: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (input.legalBusinessName !== undefined) updatePayload.legalBusinessName = input.legalBusinessName;
  if (input.gstin !== undefined) updatePayload.gstin = input.gstin || null;
  if (input.panNumber !== undefined) updatePayload.panNumber = input.panNumber || null;
  if (input.registeredAddress !== undefined) updatePayload.registeredAddress = input.registeredAddress || null;
  if (input.registeredState !== undefined) updatePayload.registeredState = input.registeredState || null;
  if (input.status !== undefined) updatePayload.status = input.status;
  if (input.invoiceNumberPrefix !== undefined) updatePayload.invoiceNumberPrefix = input.invoiceNumberPrefix;
  if (input.canAccessPayouts !== undefined) updatePayload.canAccessPayouts = input.canAccessPayouts;
  if (input.partnerLoginRole !== undefined) updatePayload.partnerLoginRole = input.partnerLoginRole;
  if (input.parentPartnerProfileId !== undefined) updatePayload.parentPartnerProfileId = input.parentPartnerProfileId || null;

  const columns = Object.keys(updatePayload);
  const values = columns.map((column) => updatePayload[column]);
  const assignments = columns.map((column, index) => `"${column}" = $${index + 1}`).join(", ");
  const data = await queryOne<any>(
    `update "PartnerProfile"
     set ${assignments}
     where "tenantId" = $${columns.length + 1} and id = $${columns.length + 2}
     returning id, "tenantId", "userId", "legalBusinessName", gstin, "panNumber", "registeredAddress",
               "registeredState", status, "invoiceNumberPrefix", "invoiceNumberCounter",
               "partnerOrganizationId", "parentPartnerProfileId", "canAccessPayouts",
               "partnerLoginRole", "createdAt", "updatedAt"`,
    [...values, user.tenantId, partnerProfileId],
  );
  if (!data) return null;

  await createAuditLog(user as any, "UPDATE", "PARTNER_PROFILE", data.id, existing, data, null);

  return data;
}
