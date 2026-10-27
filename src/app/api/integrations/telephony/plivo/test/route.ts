import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { assertTenantModule } from "@/lib/server/module-entitlements";
import { queryOne } from "@/lib/db/query";
import { decryptSecretAtRest } from "@/lib/server/secret-encryption";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const permissions = typeof user.role === "object" && user.role ? (user.role as any).permissions : null;
    if (!user.tenantId || !(user.isTenantAdmin || user.isPlatformAdmin || permissions?.modules?.integrations === "full")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    await assertTenantModule(user, "TELEPHONY");
    const setting = await queryOne<{ config: { provider?: string; plivoAuthId?: string; plivoAuthTokenEncrypted?: string } }>(
      `select config from "IntegrationSetting" where "tenantId" = $1 and type = 'TELEPHONY' limit 1`, [user.tenantId],
    );
    const config = setting?.config;
    if (config?.provider !== "plivo" || !config.plivoAuthId || !config.plivoAuthTokenEncrypted) return NextResponse.json({ error: "Save Plivo credentials first" }, { status: 400 });
    const response = await fetch(`https://api.plivo.com/v1/Account/${encodeURIComponent(config.plivoAuthId)}/`, {
      headers: { Authorization: `Basic ${Buffer.from(`${config.plivoAuthId}:${decryptSecretAtRest(config.plivoAuthTokenEncrypted)}`).toString("base64")}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return NextResponse.json({ error: `Plivo account check failed (${response.status})` }, { status: 502 });
    const account = await response.json().catch(() => ({}));
    return NextResponse.json({ connected: true, accountName: account.name ?? null, accountType: account.account_type ?? null });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Could not verify Plivo credentials" }, { status: 500 });
  }
}
