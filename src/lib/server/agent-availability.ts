import { getTenantTodayRange } from "@/lib/server/date-format";
import { assertTenantModule } from "@/lib/server/module-entitlements";
import { randomUUID } from "crypto";
import { query, queryOne } from "@/lib/db/query";
import { createAuditLog } from "@/lib/server/crm";

type TenantUser = {
  id: string;
  tenantId: string | null;
  isTenantAdmin?: boolean;
  isPlatformAdmin?: boolean;
  role?: { permissions?: any } | string | null;
};

const STATUSES = new Set(["ONLINE", "OFFLINE", "BREAK"]);

function requireTenantId(user: TenantUser) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  return user.tenantId;
}

function hasAvailabilityAdminAccess(user: TenantUser) {
  const rolePermissions = typeof user.role === "object" && user.role ? (user.role as any).permissions : null;
  return Boolean(user.isTenantAdmin || user.isPlatformAdmin || rolePermissions?.modules?.admin === "full");
}

// Same server-local-time comparison this session already used for telephony quiet hours
// (telephony-webhook.ts) and, before that, marketing-campaign quiet hours (communications.ts)
// -- duplicated again rather than shared, matching that established precedent, since each is a
// small, self-contained check with no per-tenant timezone lookup in any of the three places.
function parseTimeOfDay(value: unknown, fallback: string) {
  const [hoursRaw, minutesRaw] = String(value || fallback).split(":");
  return { hours: Math.max(0, Math.min(23, Number(hoursRaw || 0))), minutes: Math.max(0, Math.min(59, Number(minutesRaw || 0))) };
}

function isWithinWorkingHours(now: Date, workingHours: { enabled?: boolean; start?: string; end?: string } | undefined) {
  if (!workingHours?.enabled) return true; // no configured hours -- treat as always available
  const start = parseTimeOfDay(workingHours.start, "09:00");
  const end = parseTimeOfDay(workingHours.end, "18:00");
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const startMinutes = start.hours * 60 + start.minutes;
  const endMinutes = end.hours * 60 + end.minutes;
  const crossesMidnight = startMinutes > endMinutes;
  return crossesMidnight ? minutesNow >= startMinutes || minutesNow < endMinutes : minutesNow >= startMinutes && minutesNow < endMinutes;
}

function defaultAvailability(userId: string) {
  return {
    id: null,
    userId,
    status: "OFFLINE" as const,
    statusReason: null,
    workingHours: {},
    dailyCallCap: null,
    maxSimultaneousAssignments: null,
    lastStatusChangeAt: null,
  };
}

// No row yet just means "never set a status" -- returned as a synthetic OFFLINE default
// instead of lazily inserting a row on a read, so simply viewing a page never creates data.
export async function getMyAvailabilityForTenant(user: TenantUser) {
  await assertTenantModule(user, "TELEPHONY");
  const tenantId = requireTenantId(user);
  const row = await queryOne<any>(`select * from "AgentAvailability" where "tenantId" = $1 and "userId" = $2 limit 1`, [
    tenantId,
    user.id,
  ]);
  return row ?? defaultAvailability(user.id);
}

export async function setMyAvailabilityStatus(user: TenantUser, status: string, reason?: string | null) {
  await assertTenantModule(user, "TELEPHONY");
  const tenantId = requireTenantId(user);
  if (!STATUSES.has(status)) throw new Error("INVALID_STATUS");
  const now = new Date().toISOString();
  const row = await queryOne<any>(
    `insert into "AgentAvailability" (id, "tenantId", "userId", status, "statusReason", "lastStatusChangeAt", "lastStatusChangedBy", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $6, $7, $7)
     on conflict ("tenantId", "userId") do update
       set status = excluded.status, "statusReason" = excluded."statusReason",
           "lastStatusChangeAt" = excluded."lastStatusChangeAt", "lastStatusChangedBy" = excluded."lastStatusChangedBy",
           "updatedAt" = excluded."updatedAt"
     returning *`,
    [randomUUID(), tenantId, user.id, status, reason || null, user.id, now],
  );
  return row;
}

// Team-wide view for supervisors/admins: current status plus computed, real-time workload --
// today's call count against dailyCallCap, and open-task count against
// maxSimultaneousAssignments -- rather than just showing the static config values with no
// signal of whether anyone is actually near them.
export async function listAgentAvailabilityForTenant(user: TenantUser) {
  await assertTenantModule(user, "TELEPHONY");
  const tenantId = requireTenantId(user);
  if (!hasAvailabilityAdminAccess(user)) throw new Error("FORBIDDEN");

  // Today's calls count from the workspace's midnight, not the server's.
  const startOfToday = new Date((await getTenantTodayRange(tenantId)).start);

  const [users, availability, callCounts, taskCounts] = await Promise.all([
    query<any>(`select id, name, email, "managerId" from "User" where "tenantId" = $1 and "deletedAt" is null order by name asc`, [
      tenantId,
    ]),
    query<any>(`select * from "AgentAvailability" where "tenantId" = $1`, [tenantId]),
    query<{ agentId: string; count: number }>(
      `select "agentId", count(*)::int as count from "TelephonyCallLog" where "tenantId" = $1 and "startedAt" >= $2 and "agentId" is not null group by "agentId"`,
      [tenantId, startOfToday.toISOString()],
    ),
    query<{ ownerId: string; count: number }>(
      `select "ownerId", count(*)::int as count from "Task" where "tenantId" = $1 and status in ('OPEN', 'IN_PROGRESS') group by "ownerId"`,
      [tenantId],
    ),
  ]);

  const availabilityByUser = new Map(availability.map((row) => [row.userId, row]));
  const callCountByUser = new Map(callCounts.map((row) => [row.agentId, Number(row.count)]));
  const taskCountByUser = new Map(taskCounts.map((row) => [row.ownerId, Number(row.count)]));
  const now = new Date();

  return users.map((u) => {
    const availabilityRow = availabilityByUser.get(u.id) ?? defaultAvailability(u.id);
    const callsToday = callCountByUser.get(u.id) ?? 0;
    const openTaskWorkload = taskCountByUser.get(u.id) ?? 0;
    return {
      userId: u.id,
      name: u.name,
      email: u.email,
      managerId: u.managerId,
      status: availabilityRow.status,
      statusReason: availabilityRow.statusReason,
      workingHours: availabilityRow.workingHours ?? {},
      dailyCallCap: availabilityRow.dailyCallCap,
      maxSimultaneousAssignments: availabilityRow.maxSimultaneousAssignments,
      lastStatusChangeAt: availabilityRow.lastStatusChangeAt,
      callsToday,
      openTaskWorkload,
      isWithinWorkingHours: isWithinWorkingHours(now, availabilityRow.workingHours),
      isOverCallCap: availabilityRow.dailyCallCap != null && callsToday >= availabilityRow.dailyCallCap,
      isOverAssignmentCap:
        availabilityRow.maxSimultaneousAssignments != null && openTaskWorkload >= availabilityRow.maxSimultaneousAssignments,
    };
  });
}

// Supervisor override: a tenant/platform admin (or anyone with modules.admin === "full", the
// same admin-permission gate every other admin-config feature this session added uses), OR the
// target user's own manager -- User.managerId is a real, pre-existing relationship, reused here
// rather than inventing a parallel supervisor concept.
export async function supervisorUpdateAgentAvailability(
  user: TenantUser,
  targetUserId: string,
  patch: Record<string, unknown>,
) {
  await assertTenantModule(user, "TELEPHONY");
  const tenantId = requireTenantId(user);
  const target = await queryOne<{ id: string; managerId: string | null }>(
    `select id, "managerId" from "User" where "tenantId" = $1 and id = $2 and "deletedAt" is null limit 1`,
    [tenantId, targetUserId],
  );
  if (!target) throw new Error("USER_NOT_FOUND");
  const allowed = hasAvailabilityAdminAccess(user) || target.managerId === user.id;
  if (!allowed) throw new Error("FORBIDDEN");

  if ("status" in patch && !STATUSES.has(String(patch.status))) throw new Error("INVALID_STATUS");

  // Merge onto the existing row (or defaults) so a partial patch -- e.g. only changing
  // dailyCallCap -- can't accidentally reset an unrelated field like status back to OFFLINE.
  const existing = await queryOne<any>(`select * from "AgentAvailability" where "tenantId" = $1 and "userId" = $2 limit 1`, [
    tenantId,
    targetUserId,
  ]);
  const current = existing ?? defaultAvailability(targetUserId);

  const now = new Date().toISOString();
  const status = "status" in patch ? String(patch.status) : current.status;
  const statusReason = "statusReason" in patch ? (patch.statusReason ? String(patch.statusReason) : null) : current.statusReason;
  const workingHours = "workingHours" in patch && patch.workingHours ? patch.workingHours : current.workingHours ?? {};
  const dailyCallCap =
    "dailyCallCap" in patch
      ? patch.dailyCallCap !== "" && patch.dailyCallCap != null
        ? Number(patch.dailyCallCap)
        : null
      : current.dailyCallCap;
  const maxSimultaneousAssignments =
    "maxSimultaneousAssignments" in patch
      ? patch.maxSimultaneousAssignments !== "" && patch.maxSimultaneousAssignments != null
        ? Number(patch.maxSimultaneousAssignments)
        : null
      : current.maxSimultaneousAssignments;

  const row = await queryOne<any>(
    `insert into "AgentAvailability" (id, "tenantId", "userId", status, "statusReason", "workingHours", "dailyCallCap", "maxSimultaneousAssignments", "lastStatusChangeAt", "lastStatusChangedBy", "createdAt", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
     on conflict ("tenantId", "userId") do update
       set status = excluded.status, "statusReason" = excluded."statusReason", "workingHours" = excluded."workingHours",
           "dailyCallCap" = excluded."dailyCallCap", "maxSimultaneousAssignments" = excluded."maxSimultaneousAssignments",
           "lastStatusChangeAt" = excluded."lastStatusChangeAt", "lastStatusChangedBy" = excluded."lastStatusChangedBy",
           "updatedAt" = excluded."updatedAt"
     returning *`,
    [randomUUID(), tenantId, targetUserId, status, statusReason, workingHours, dailyCallCap, maxSimultaneousAssignments, now, user.id, now],
  );
  await createAuditLog(user, "UPDATE", "AGENT_AVAILABILITY", targetUserId, null, row, null).catch(() => undefined);
  return row;
}
