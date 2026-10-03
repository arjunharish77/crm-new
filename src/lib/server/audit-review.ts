import { randomUUID } from "crypto";
import { query, queryOne, execute } from "@/lib/db/query";

type TenantUser = { id: string; tenantId: string | null; isTenantAdmin?: boolean; isPlatformAdmin?: boolean };

// Reviewing the audit log (status, comments, legal hold) is an admin task; the routes check
// this too.
function assertAuditAdmin(user: TenantUser) {
  if (!user.isTenantAdmin && !user.isPlatformAdmin) throw new Error("FORBIDDEN");
}

export type AuditReviewStatus = "UNREVIEWED" | "IN_REVIEW" | "RESOLVED";

export async function updateAuditLogReview(
  user: TenantUser,
  auditLogId: string,
  patch: { reviewStatus?: AuditReviewStatus; reviewerId?: string | null; reviewNote?: string | null },
) {
  assertAuditAdmin(user);
  const existing = await queryOne<{ id: string }>(
    `select id from "AuditLog" where id = $1 and "tenantId" = $2`,
    [auditLogId, user.tenantId],
  );
  if (!existing) throw new Error("AUDIT_LOG_NOT_FOUND");

  const columns: string[] = [];
  const values: unknown[] = [];
  if (patch.reviewStatus) {
    values.push(patch.reviewStatus);
    columns.push(`"reviewStatus" = $${values.length}`);
    if (patch.reviewStatus === "RESOLVED") {
      values.push(user.id);
      columns.push(`"reviewedBy" = $${values.length}`);
      values.push(new Date().toISOString());
      columns.push(`"reviewedAt" = $${values.length}`);
    }
  }
  if ("reviewerId" in patch) {
    values.push(patch.reviewerId ?? null);
    columns.push(`"reviewerId" = $${values.length}`);
  }
  if ("reviewNote" in patch) {
    values.push(patch.reviewNote ?? null);
    columns.push(`"reviewNote" = $${values.length}`);
  }
  if (!columns.length) return existing;

  values.push(auditLogId);
  const updated = await queryOne<{ id: string }>(
    `update "AuditLog" set ${columns.join(", ")} where id = $${values.length} returning id`,
    values,
  );
  if (!updated) throw new Error("AUDIT_LOG_NOT_FOUND");
  return updated;
}

export async function setAuditLogLegalHold(user: TenantUser, auditLogId: string, legalHold: boolean) {
  assertAuditAdmin(user);
  const updated = await queryOne<{ id: string }>(
    `update "AuditLog" set "legalHold" = $1 where id = $2 and "tenantId" = $3 returning id`,
    [legalHold, auditLogId, user.tenantId],
  );
  if (!updated) throw new Error("AUDIT_LOG_NOT_FOUND");
  return updated;
}

export async function addAuditLogComment(user: TenantUser, auditLogId: string, body: string) {
  assertAuditAdmin(user);
  const log = await queryOne<{ id: string }>(`select id from "AuditLog" where id = $1 and "tenantId" = $2`, [auditLogId, user.tenantId]);
  if (!log) throw new Error("AUDIT_LOG_NOT_FOUND");
  const trimmed = body.trim();
  if (!trimmed) throw new Error("COMMENT_REQUIRED");

  const id = randomUUID();
  await execute(
    `insert into "AuditLogComment" (id, "tenantId", "auditLogId", "authorId", body, "createdAt") values ($1, $2, $3, $4, $5, $6)`,
    [id, user.tenantId, auditLogId, user.id, trimmed, new Date().toISOString()],
  );
  return { id };
}

export async function listAuditLogComments(user: TenantUser, auditLogId: string) {
  assertAuditAdmin(user);
  return query<{ id: string; body: string; createdAt: string; authorId: string | null; authorName: string | null; authorEmail: string | null }>(
    `select c.id, c.body, c."createdAt", c."authorId", u.name as "authorName", u.email as "authorEmail"
     from "AuditLogComment" c
     left join "User" u on u.id = c."authorId"
     where c."auditLogId" = $1 and c."tenantId" = $2
     order by c."createdAt" asc`,
    [auditLogId, user.tenantId],
  );
}
