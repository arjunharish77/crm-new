import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { getMessagingSettingsForTenant, updateMessagingSettingsForTenant } from "@/lib/server/communications";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    return NextResponse.json(await getMessagingSettingsForTenant(user));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch messaging settings", error);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await updateMessagingSettingsForTenant(user, body ?? {}));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "MESSAGING_SETTINGS_INVALID") return badRequest("requireTemplateApproval must be true or false");
    return serverError("Failed to save messaging settings", error);
  }
}
