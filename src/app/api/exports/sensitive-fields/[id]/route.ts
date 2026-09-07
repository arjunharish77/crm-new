import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";
import { deleteExportSensitiveFieldRuleForTenant } from "@/lib/server/exports";

function hasExportGovernanceAccess(user: any) {
  const rolePermissions = typeof user.role === "object" && user.role ? (user.role as any).permissions : null;
  return Boolean(user.isTenantAdmin || user.isPlatformAdmin || rolePermissions?.modules?.integrations === "full");
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    if (!hasExportGovernanceAccess(user)) return forbidden("You don't have permission to manage export governance rules");
    const { id } = await params;
    await deleteExportSensitiveFieldRuleForTenant(user, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to delete sensitive field rule", error);
  }
}
