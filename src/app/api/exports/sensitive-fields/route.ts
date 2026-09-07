import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { createExportSensitiveFieldRuleForTenant, listExportSensitiveFieldRulesForTenant } from "@/lib/server/exports";

function hasExportGovernanceAccess(user: any) {
  const rolePermissions = typeof user.role === "object" && user.role ? (user.role as any).permissions : null;
  return Boolean(user.isTenantAdmin || user.isPlatformAdmin || rolePermissions?.modules?.integrations === "full");
}

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const rules = await listExportSensitiveFieldRulesForTenant(user);
    return NextResponse.json(rules);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch sensitive field rules", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!hasExportGovernanceAccess(user)) return forbidden("You don't have permission to manage export governance rules");
    const body = await request.json().catch(() => null);
    if (!body?.moduleName || !body?.fieldKey) return badRequest("moduleName and fieldKey are required");
    const rule = await createExportSensitiveFieldRuleForTenant(user, body);
    return NextResponse.json(rule);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "DUPLICATE_SENSITIVE_FIELD_RULE") return badRequest("This field is already flagged for this module");
    return serverError("Failed to create sensitive field rule", error);
  }
}
