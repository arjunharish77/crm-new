import { query, queryOne, type Queryable } from "@/lib/db/query";
import type { TransactionClient } from "@/lib/db/transaction";
import { getTenantTimeZone, zonedWallClockParts } from "@/lib/server/date-format";

// Per-tenant usage limits (Module 21; decisions confirmed 2026-09-29). A NULL limit is unlimited.
// Tenant and platform admins are notified at 80% and 100%; at 100% only NEW usage is refused --
// existing users, files and data keep working, and transactional messages are never counted.

export type UsageMetric = "ACTIVE_USERS" | "PARTNER_LOGINS" | "STORAGE" | "MONTHLY_MESSAGES";

export type TenantUsageLimits = {
  maxActiveUsers: number | null;
  maxPartnerLogins: number | null;
  maxStorageMb: number | null;
  maxMonthlyMessages: number | null;
};

const METRIC_LABEL: Record<UsageMetric, string> = {
  ACTIVE_USERS: "active users",
  PARTNER_LOGINS: "partner logins",
  STORAGE: "file storage",
  MONTHLY_MESSAGES: "messages this month",
};

// Outbox sourceTypes that are NOT counted toward the monthly message limit: internal test sends,
// staff report deliveries and automatic case acknowledgements. Everything else (campaigns,
// automations and journeys, one-to-one user/AI/case replies, surveys) counts. Transactional mail
// such as password resets does not go through this outbox at all.
const UNCOUNTED_MESSAGE_SOURCES = new Set(["MARKETING_CAMPAIGN_TEST", "REPORT_SCHEDULE", "CASE_AUTO_ACK"]);

export class UsageLimitError extends Error {
  constructor(readonly metric: UsageMetric, readonly limit: number, readonly explanation: string) {
    super(`USAGE_LIMIT_REACHED:${metric}`);
  }
}

export async function getTenantUsageLimits(tenantId: string, client?: Queryable): Promise<TenantUsageLimits> {
  const row = await queryOne<TenantUsageLimits>(
    `select "maxActiveUsers", "maxPartnerLogins", "maxStorageMb", "maxMonthlyMessages" from "TenantUsageLimit" where "tenantId" = $1`,
    [tenantId],
    client,
  );
  return row ?? { maxActiveUsers: null, maxPartnerLogins: null, maxStorageMb: null, maxMonthlyMessages: null };
}

export async function setTenantUsageLimits(actor: { id: string }, tenantId: string, input: Partial<TenantUsageLimits>) {
  const clean = (value: unknown, min: number) => {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    if (!Number.isInteger(number) || number < min || number > 10_000_000) throw new Error("USAGE_LIMIT_INVALID");
    return number;
  };
  const next = {
    maxActiveUsers: clean(input.maxActiveUsers, 1),
    maxPartnerLogins: clean(input.maxPartnerLogins, 0),
    maxStorageMb: clean(input.maxStorageMb, 1),
    maxMonthlyMessages: clean(input.maxMonthlyMessages, 0),
  };
  await query(
    `insert into "TenantUsageLimit" ("tenantId", "maxActiveUsers", "maxPartnerLogins", "maxStorageMb", "maxMonthlyMessages", "updatedBy", "updatedAt")
     values ($1, $2, $3, $4, $5, $6, now())
     on conflict ("tenantId") do update set "maxActiveUsers" = excluded."maxActiveUsers", "maxPartnerLogins" = excluded."maxPartnerLogins",
       "maxStorageMb" = excluded."maxStorageMb", "maxMonthlyMessages" = excluded."maxMonthlyMessages", "updatedBy" = excluded."updatedBy", "updatedAt" = now()`,
    [tenantId, next.maxActiveUsers, next.maxPartnerLogins, next.maxStorageMb, next.maxMonthlyMessages, actor.id],
  );
  // A lowered/raised limit may cross a threshold; re-arm warnings for seats/storage accordingly.
  const usage = await getTenantUsage(tenantId);
  for (const metric of ["ACTIVE_USERS", "PARTNER_LOGINS", "STORAGE"] as const) {
    await evaluateThresholds(tenantId, metric, usage.used[metric], usageLimitFor(usage.limits, metric), "current");
  }
  return usage;
}

function usageLimitFor(limits: TenantUsageLimits, metric: UsageMetric) {
  if (metric === "ACTIVE_USERS") return limits.maxActiveUsers;
  if (metric === "PARTNER_LOGINS") return limits.maxPartnerLogins;
  if (metric === "STORAGE") return limits.maxStorageMb === null ? null : limits.maxStorageMb * 1024 * 1024;
  return limits.maxMonthlyMessages;
}

async function monthPeriod(tenantId: string) {
  const { year, month } = zonedWallClockParts(new Date(), await getTenantTimeZone(tenantId));
  return `${year}-${String(month).padStart(2, "0")}`;
}

async function countSeats(tenantId: string, client?: Queryable) {
  const row = await queryOne<{ internal: number; partner: number }>(
    `select count(*) filter (where coalesce((r.permissions ->> 'isPartnerRole')::boolean, false) = false)::int as internal,
            count(*) filter (where coalesce((r.permissions ->> 'isPartnerRole')::boolean, false) = true)::int as partner
     from "User" u left join "Role" r on r.id = u."roleId"
     where u."tenantId" = $1 and u."deletedAt" is null and coalesce(u.status, 'ACTIVE') = 'ACTIVE'`,
    [tenantId],
    client,
  );
  return { internal: row?.internal ?? 0, partner: row?.partner ?? 0 };
}

async function storageBytes(tenantId: string) {
  const row = await queryOne<{ bytes: string | null }>(`select coalesce(sum("byteSize"), 0)::text as bytes from "FileObject" where "tenantId" = $1`, [tenantId]);
  return Number(row?.bytes ?? 0);
}

/** Current usage and limits for the platform-admin tenant page and the tenant's own Modules page. */
export async function getTenantUsage(tenantId: string) {
  const [limits, seats, bytes, period] = await Promise.all([getTenantUsageLimits(tenantId), countSeats(tenantId), storageBytes(tenantId), monthPeriod(tenantId)]);
  const counter = await queryOne<{ count: number }>(`select count from "TenantUsageCounter" where "tenantId" = $1 and metric = 'MONTHLY_MESSAGES' and period = $2`, [tenantId, period]);
  return {
    limits,
    period,
    used: { ACTIVE_USERS: seats.internal, PARTNER_LOGINS: seats.partner, STORAGE: bytes, MONTHLY_MESSAGES: counter?.count ?? 0 } as Record<UsageMetric, number>,
  };
}

// ------------------------------------------------------------------------------ enforcement

export async function lockTenantSeats(tx: TransactionClient, tenantId: string) {
  await tx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`tenant-seats:${tenantId}`]);
}

async function isPartnerRole(roleId: string | null | undefined, client?: Queryable) {
  if (!roleId) return false;
  const row = await queryOne<{ partner: boolean }>(`select coalesce((permissions ->> 'isPartnerRole')::boolean, false) as partner from "Role" where id = $1`, [roleId], client);
  return !!row?.partner;
}

/**
 * Refuses a new ACTIVE seat (a created user, a reactivation, or a role change that moves a user
 * between internal and partner) when it would exceed the limit. Call inside a transaction that
 * holds lockTenantSeats(), before the write, with the user's resulting role and status.
 */
export async function assertSeatAvailable(tx: TransactionClient, tenantId: string, change: { roleId: string | null | undefined; becomesActive: boolean; previous?: { roleId: string | null; active: boolean } }) {
  if (!change.becomesActive) return;
  const [limits, partner] = await Promise.all([getTenantUsageLimits(tenantId, tx), isPartnerRole(change.roleId, tx)]);
  const limit = partner ? limits.maxPartnerLogins : limits.maxActiveUsers;
  if (limit === null) return;
  // Unchanged seat (already active with the same kind of role): nothing new is consumed.
  if (change.previous?.active && (await isPartnerRole(change.previous.roleId, tx)) === partner) return;
  const seats = await countSeats(tenantId, tx);
  const used = partner ? seats.partner : seats.internal;
  const metric: UsageMetric = partner ? "PARTNER_LOGINS" : "ACTIVE_USERS";
  if (used + 1 > limit) {
    await evaluateThresholds(tenantId, metric, used, limit, "current");
    throw new UsageLimitError(metric, limit, `This workspace has reached its limit of ${limit} ${METRIC_LABEL[metric]}. Deactivate one, or ask your platform administrator to raise the limit.`);
  }
  await evaluateThresholds(tenantId, metric, used + 1, limit, "current").catch(() => undefined);
}

/** Refuses a new upload that would take stored files past the limit. */
export async function assertStorageAvailable(tenantId: string, addBytes: number) {
  const { maxStorageMb } = await getTenantUsageLimits(tenantId);
  if (maxStorageMb === null) return;
  const limitBytes = maxStorageMb * 1024 * 1024;
  const used = await storageBytes(tenantId);
  if (used + Math.max(0, addBytes) > limitBytes) {
    await evaluateThresholds(tenantId, "STORAGE", used, limitBytes, "current");
    throw new UsageLimitError("STORAGE", maxStorageMb, `This workspace has used its ${maxStorageMb} MB of file storage. Remove files, or ask your platform administrator to raise the limit.`);
  }
  await evaluateThresholds(tenantId, "STORAGE", used + addBytes, limitBytes, "current").catch(() => undefined);
}

/**
 * Reserves one message against this month's limit. Returns false (do not send) when the limit is
 * reached. Atomic: the increment only happens while the counter is below the limit. Uncounted
 * sources always return true. Pass the caller's transaction client so a rolled-back send does
 * not consume the allowance.
 */
export async function reserveMonthlyMessage(tenantId: string, sourceType: string | null | undefined, client?: Queryable) {
  if (sourceType && UNCOUNTED_MESSAGE_SOURCES.has(sourceType)) return true;
  const [{ maxMonthlyMessages: limit }, period] = await Promise.all([getTenantUsageLimits(tenantId, client), monthPeriod(tenantId)]);
  const row = limit === null
    ? await queryOne<{ count: number }>(
        `insert into "TenantUsageCounter" ("tenantId", metric, period, count) values ($1, 'MONTHLY_MESSAGES', $2, 1)
         on conflict ("tenantId", metric, period) do update set count = "TenantUsageCounter".count + 1 returning count`,
        [tenantId, period],
        client,
      )
    : await queryOne<{ count: number }>(
        `insert into "TenantUsageCounter" ("tenantId", metric, period, count) select $1, 'MONTHLY_MESSAGES', $2, 1 where $3::int > 0
         on conflict ("tenantId", metric, period) do update set count = "TenantUsageCounter".count + 1 where "TenantUsageCounter".count < $3::int
         returning count`,
        [tenantId, period, limit],
        client,
      );
  if (limit !== null) await evaluateThresholds(tenantId, "MONTHLY_MESSAGES", row ? row.count : limit, limit, period).catch(() => undefined);
  return !!row;
}

// ---------------------------------------------------------------------------- notifications

/** Sends each 80% / 100% notice once per period; re-arms seat/storage notices below the level. */
async function evaluateThresholds(tenantId: string, metric: UsageMetric, used: number, limit: number | null, period: string) {
  if (limit === null || limit <= 0) return;
  for (const level of [80, 100] as const) {
    const reached = used >= Math.ceil((limit * level) / 100);
    if (!reached) {
      if (period === "current") await query(`delete from "TenantUsageAlert" where "tenantId" = $1 and metric = $2 and period = $3 and level = $4`, [tenantId, metric, period, level]);
      continue;
    }
    const inserted = await queryOne<{ level: number }>(
      `insert into "TenantUsageAlert" ("tenantId", metric, period, level) values ($1, $2, $3, $4) on conflict do nothing returning level`,
      [tenantId, metric, period, level],
    );
    if (!inserted) continue;
    const shown = metric === "STORAGE" ? `${Math.round(limit / 1024 / 1024)} MB` : String(limit);
    const title = level === 100 ? `Limit reached: ${METRIC_LABEL[metric]}` : `80% of ${METRIC_LABEL[metric]} limit used`;
    const message = level === 100
      ? `This workspace has reached its limit (${shown} ${METRIC_LABEL[metric]}). New ${metric === "MONTHLY_MESSAGES" ? "messages are not sent" : metric === "STORAGE" ? "uploads are refused" : "activations are refused"} until the limit is raised${metric === "MONTHLY_MESSAGES" ? " or the month resets" : ""}. Existing data keeps working.`
      : `This workspace has used 80% of its limit of ${shown} ${METRIC_LABEL[metric]}.`;
    await notifyAdmins(tenantId, title, message, { event: level === 100 ? "USAGE_LIMIT_REACHED" : "USAGE_LIMIT_WARNING", metric, level, limit });
  }
}

async function notifyAdmins(tenantId: string, title: string, message: string, data: Record<string, unknown>) {
  const { createUserNotification } = await import("@/lib/server/notifications");
  const [platformAdmins, tenantAdmins] = await Promise.all([
    query<{ userId: string }>(`select "userId" from "PlatformAdmin" where "isActive" = true`, []),
    query<{ id: string }>(
      `select u.id from "User" u join "Role" r on r.id = u."roleId"
       where u."tenantId" = $1 and u."deletedAt" is null and coalesce(u.status, 'ACTIVE') = 'ACTIVE'
         and (r.permissions -> 'modules' ->> 'admin' = 'full' or r.permissions ->> 'recordAccess' = 'ALL')`,
      [tenantId],
    ),
  ]);
  for (const { userId } of platformAdmins) await createUserNotification({ tenantId: null, userId, title, message, data: { ...data, tenantId } }).catch(() => undefined);
  for (const { id } of tenantAdmins) await createUserNotification({ tenantId, userId: id, title, message, data }).catch(() => undefined);
}
