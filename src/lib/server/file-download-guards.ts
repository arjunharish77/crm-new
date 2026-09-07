import { queryOne } from "@/lib/db/query";

// "Permission recheck at download time, distinct from at request-creation time" (gap checklist
// item). requireCurrentUser's own per-request check (getCurrentUserById) already re-verifies
// tenant suspension on every request, but deliberately does NOT re-verify User.status on every
// single request -- that's checked only at login (see the login-route fix earlier this
// session), so an already-issued JWT for a user deactivated mid-session keeps working until it
// naturally expires. That's an accepted, stated tradeoff for ordinary requests. Downloading a
// file is different: it's the one action in this app that hands raw data out, so it gets an
// EXTRA fresh check beyond the standard per-request one -- called specifically at the moment of
// download, not folded into the general request path.
export async function assertAccountActiveForDownload(user: { id: string; tenantId: string | null; isPlatformAdmin?: boolean }) {
  if (user.isPlatformAdmin) return;
  const row = await queryOne<{ status: string | null; tenantStatus: string | null }>(
    `select u.status, t.status as "tenantStatus" from "User" u left join "Tenant" t on t.id = u."tenantId" where u.id = $1 limit 1`,
    [user.id],
  );
  if (row?.status && row.status !== "ACTIVE") throw new Error("ACCOUNT_DEACTIVATED");
  if (row?.tenantStatus === "SUSPENDED") throw new Error("TENANT_SUSPENDED");
}
