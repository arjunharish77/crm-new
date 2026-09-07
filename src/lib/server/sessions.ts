import { randomUUID } from "crypto";
import { query, queryOne, execute } from "@/lib/db/query";
import { getEffectiveSecurityPolicy } from "@/lib/server/security-policy";

const ABSOLUTE_SESSION_DAYS = 7;
const IMPERSONATION_SESSION_HOURS = 4;
// A "touch" (lastActiveAt bump) only writes if the recorded value is at least this stale --
// updating on literally every request would be a write on every single authenticated request.
const TOUCH_DEBOUNCE_MS = 5 * 60 * 1000;

// "Blocked sensitive actions" (gap checklist item's own named sub-item) -- previously "the
// isImpersonating JWT claim is set and read but never actually checked anywhere to block a
// sensitive action." A platform admin impersonating a tenant user is already prevented from
// reaching platform-admin-only routes (impersonateTenantUser always signs a non-admin token),
// but a tenant ADMIN's own sensitive actions -- rotating a credential, approving a payout,
// deleting personal data -- are still reachable if the impersonated user happens to hold that
// role. This is the single shared guard those specific call sites use; deliberately narrow
// (named, individually-justified actions) rather than a blanket "impersonation can never
// write anything" rule, which would make impersonation useless for the support/investigation
// work it exists for in the first place.
export function assertNotImpersonating(user: { isImpersonating?: boolean }, action: string) {
  if (user.isImpersonating) throw new Error(`IMPERSONATION_BLOCKED:${action}`);
}

export type SessionRow = {
  id: string;
  tenantId: string | null;
  userId: string;
  userAgent: string | null;
  ipAddress: string | null;
  isImpersonation: boolean;
  impersonatedBy: string | null;
  reason: string | null;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokedBy: string | null;
  revokedReason: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
};

const COLUMNS =
  'id, "tenantId", "userId", "userAgent", "ipAddress", "isImpersonation", "impersonatedBy", reason, "createdAt", "lastActiveAt", "expiresAt", "revokedAt", "revokedBy", "revokedReason", "reviewedAt", "reviewedBy", "reviewNote"';

export async function createUserSession(input: {
  userId: string;
  tenantId: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  isImpersonation?: boolean;
  impersonatedBy?: string | null;
  reason?: string | null;
}) {
  const id = randomUUID();
  const now = new Date();
  const hours = input.isImpersonation ? IMPERSONATION_SESSION_HOURS : ABSOLUTE_SESSION_DAYS * 24;
  const expiresAt = new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();

  await execute(
    `insert into "UserSession" (id, "tenantId", "userId", "userAgent", "ipAddress", "isImpersonation", "impersonatedBy", reason, "createdAt", "lastActiveAt", "expiresAt")
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10)`,
    [id, input.tenantId, input.userId, input.userAgent ?? null, input.ipAddress ?? null, !!input.isImpersonation, input.impersonatedBy ?? null, input.reason ?? null, now.toISOString(), expiresAt],
  );

  if (!input.isImpersonation) {
    const policy = await getEffectiveSecurityPolicy(input.tenantId);
    await enforceMaxConcurrentSessions(input.userId, policy.maxConcurrentSessions);
  }

  return { id, expiresAt, expiresInSeconds: Math.round((new Date(expiresAt).getTime() - now.getTime()) / 1000) };
}

// Oldest-first eviction: when a new session pushes the user over their policy's concurrent-
// session limit, the LEAST recently active sessions are revoked, not the newest (the one that
// was just created is definitionally the one the user is currently using).
async function enforceMaxConcurrentSessions(userId: string, maxConcurrentSessions: number) {
  if (!Number.isFinite(maxConcurrentSessions) || maxConcurrentSessions <= 0) return;
  const active = await query<{ id: string }>(
    `select id from "UserSession"
     where "userId" = $1 and "revokedAt" is null and "expiresAt" > now() and "isImpersonation" = false
     order by "lastActiveAt" desc`,
    [userId],
  );
  const toRevoke = active.slice(maxConcurrentSessions).map((row) => row.id);
  if (toRevoke.length === 0) return;
  await execute(
    `update "UserSession" set "revokedAt" = $1, "revokedBy" = 'system', "revokedReason" = 'MAX_CONCURRENT_SESSIONS' where id = any($2::text[])`,
    [new Date().toISOString(), toRevoke],
  );
}

export type SessionValidation = { valid: true; row: SessionRow } | { valid: false; reason: "NOT_FOUND" | "REVOKED" | "EXPIRED" | "IDLE_TIMEOUT" };

// Called from getCurrentUser on every request carrying a "sid" claim -- the actual enforcement
// point for revocation and both timeout types. Idle timeout is policy-driven and only applied
// when the policy's own enforceSessionTimeout is on; absolute timeout is the row's own
// expiresAt, always enforced (it mirrors the JWT's own expiry, so this rarely fires first).
export async function validateSession(sessionId: string): Promise<SessionValidation> {
  const row = await queryOne<SessionRow>(`select ${COLUMNS} from "UserSession" where id = $1 limit 1`, [sessionId]);
  if (!row) return { valid: false, reason: "NOT_FOUND" };
  if (row.revokedAt) return { valid: false, reason: "REVOKED" };
  if (new Date(row.expiresAt).getTime() <= Date.now()) return { valid: false, reason: "EXPIRED" };

  if (!row.isImpersonation) {
    const policy = await getEffectiveSecurityPolicy(row.tenantId);
    if (policy.enforceSessionTimeout) {
      const idleMs = Date.now() - new Date(row.lastActiveAt).getTime();
      if (idleMs > policy.sessionTimeoutMinutes * 60 * 1000) return { valid: false, reason: "IDLE_TIMEOUT" };
    }
  }

  return { valid: true, row };
}

export async function touchSessionIfStale(sessionId: string, lastActiveAt: string) {
  if (Date.now() - new Date(lastActiveAt).getTime() < TOUCH_DEBOUNCE_MS) return;
  await execute(`update "UserSession" set "lastActiveAt" = $1 where id = $2 and "revokedAt" is null`, [new Date().toISOString(), sessionId]).catch(() => undefined);
}

export async function listSessionsForUser(userId: string) {
  return query<SessionRow>(
    `select ${COLUMNS} from "UserSession"
     where "userId" = $1 and "revokedAt" is null and "expiresAt" > now()
     order by "lastActiveAt" desc`,
    [userId],
  );
}

export async function revokeSession(userId: string, sessionId: string, revokedBy: string, reason = "USER_REVOKED") {
  const updated = await queryOne<{ id: string }>(
    `update "UserSession" set "revokedAt" = $1, "revokedBy" = $2, "revokedReason" = $3
     where id = $4 and "userId" = $5 and "revokedAt" is null
     returning id`,
    [new Date().toISOString(), revokedBy, reason, sessionId, userId],
  );
  if (!updated) throw new Error("SESSION_NOT_FOUND");
}

export async function revokeAllOtherSessions(userId: string, currentSessionId: string, revokedBy: string) {
  const result = await execute(
    `update "UserSession" set "revokedAt" = $1, "revokedBy" = $2, "revokedReason" = 'USER_REVOKED_ALL_OTHERS'
     where "userId" = $3 and id <> $4 and "revokedAt" is null`,
    [new Date().toISOString(), revokedBy, userId, currentSessionId],
  );
  return { revoked: result };
}

// Admin-side visibility/control -- tenant-scoped, so a tenant admin can only see/revoke
// sessions for users in their own tenant (platform admins bypass this at the route layer,
// matching every other admin surface's convention in this app).
export async function listSessionsForUserAsAdmin(tenantId: string, userId: string) {
  return query<SessionRow>(
    `select ${COLUMNS} from "UserSession"
     where "userId" = $1 and "tenantId" = $2 and "revokedAt" is null and "expiresAt" > now()
     order by "lastActiveAt" desc`,
    [userId, tenantId],
  );
}

export async function revokeSessionAsAdmin(tenantId: string, userId: string, sessionId: string, revokedBy: string, reason = "ADMIN_REVOKED") {
  const updated = await queryOne<{ id: string }>(
    `update "UserSession" set "revokedAt" = $1, "revokedBy" = $2, "revokedReason" = $3
     where id = $4 and "userId" = $5 and "tenantId" = $6 and "revokedAt" is null
     returning id`,
    [new Date().toISOString(), revokedBy, reason, sessionId, userId, tenantId],
  );
  if (!updated) throw new Error("SESSION_NOT_FOUND");
}

// Used by password-reset-via-token (password-policy.ts) -- unlike revokeAllOtherSessions,
// there's no "current session" to spare here: a reset performed via a token (out-of-band,
// possibly from a browser that never had a session at all) should invalidate every existing
// login, on the assumption the old password may have been compromised.
export async function revokeAllSessionsForUser(userId: string, reason: string) {
  await execute(
    `update "UserSession" set "revokedAt" = $1, "revokedBy" = $2, "revokedReason" = $3
     where "userId" = $2 and "revokedAt" is null`,
    [new Date().toISOString(), userId, reason],
  );
}

// Login history: every session row IS a successful-login record (createdAt = login time,
// userAgent/ipAddress = device info) -- no separate table needed. Includes revoked/expired
// sessions too, unlike listSessionsForUser above (which is "what's live right now").
export async function listLoginHistoryForUser(userId: string, limit = 20) {
  return query<SessionRow>(
    `select ${COLUMNS} from "UserSession" where "userId" = $1 order by "createdAt" desc limit $2`,
    [userId, Math.min(100, Math.max(1, limit))],
  );
}

// ---------------------------------------------------------------------------------------------
// Impersonation governance: platform-admin review workflow (gap checklist item's own named
// sub-item, "platform-admin review" -- previously "no separate platform-admin review step for
// a completed impersonation session beyond it appearing in the general audit log").
// ---------------------------------------------------------------------------------------------

export async function listImpersonationSessions(opts: { reviewed?: boolean; limit?: number } = {}) {
  const clauses = ['"isImpersonation" = true'];
  if (opts.reviewed === true) clauses.push('"reviewedAt" is not null');
  if (opts.reviewed === false) clauses.push('"reviewedAt" is null');
  return query<SessionRow & { userName: string; userEmail: string; impersonatedByName: string | null; tenantName: string | null }>(
    `select s.${COLUMNS.split(", ").join(', s.')}, u.name as "userName", u.email as "userEmail", admin.name as "impersonatedByName", t.name as "tenantName"
     from "UserSession" s
     join "User" u on u.id = s."userId"
     left join "User" admin on admin.id = s."impersonatedBy"
     left join "Tenant" t on t.id = s."tenantId"
     where ${clauses.join(" and ")}
     order by s."createdAt" desc
     limit $1`,
    [Math.min(200, Math.max(1, opts.limit ?? 100))],
  );
}

export async function markImpersonationSessionReviewed(sessionId: string, reviewedBy: string, reviewNote: string | null) {
  const updated = await queryOne<{ id: string }>(
    `update "UserSession" set "reviewedAt" = $1, "reviewedBy" = $2, "reviewNote" = $3
     where id = $4 and "isImpersonation" = true
     returning id`,
    [new Date().toISOString(), reviewedBy, reviewNote, sessionId],
  );
  if (!updated) throw new Error("SESSION_NOT_FOUND");
}

// How many actions (AuditLog rows) were actually taken during a given impersonation session --
// the review page's own way of answering "was anything actually done, and does it warrant a
// closer look" without an admin having to cross-reference the audit log by hand. Scoped by the
// session's own time window and its impersonatedBy tag (see leads-postgres.ts's createAuditLog
// change), not just "any action by this user in this time range," which could double-count
// actions the user took organically right before/after the impersonated window.
export async function countAuditActionsDuringSession(session: { userId: string; impersonatedBy: string | null; createdAt: string; revokedAt: string | null; expiresAt: string }) {
  const endTime = session.revokedAt ?? session.expiresAt;
  const row = await queryOne<{ count: string }>(
    `select count(*) as count from "AuditLog"
     where "userId" = $1 and "createdAt" >= $2 and "createdAt" <= $3 and metadata->>'impersonatedBy' = $4`,
    [session.userId, session.createdAt, endTime, session.impersonatedBy],
  );
  return Number(row?.count ?? 0);
}
