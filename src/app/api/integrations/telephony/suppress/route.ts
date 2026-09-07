import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { listPhoneSuppressionsForTenant, suppressPhoneNumberForTenant } from "@/lib/server/communications";

function hasTelephonyAdminAccess(user: any) {
  const rolePermissions = typeof user.role === "object" && user.role ? (user.role as any).permissions : null;
  return Boolean(user.isTenantAdmin || user.isPlatformAdmin || rolePermissions?.modules?.integrations === "full");
}

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!hasTelephonyAdminAccess(user)) return forbidden("You don't have permission to view the do-not-call list");
    const suppressions = await listPhoneSuppressionsForTenant(user);
    return NextResponse.json(suppressions);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch do-not-call list", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!hasTelephonyAdminAccess(user)) return forbidden("You don't have permission to manage the do-not-call list");
    const body = await request.json().catch(() => null);
    if (!body?.phoneNumber) return badRequest("phoneNumber is required");
    const suppression = await suppressPhoneNumberForTenant(user, body.phoneNumber, body.reason);
    return NextResponse.json(suppression);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "RECIPIENT_REQUIRED") return badRequest("phoneNumber is required");
    return serverError("Failed to add number to do-not-call list", error);
  }
}
