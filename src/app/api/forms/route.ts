import { NextResponse } from "next/server";
import { createFormForTenant, listFormsForTenant } from "@/lib/server/crm";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { requireCurrentUser } from "@/lib/server/auth";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const forms = await listFormsForTenant(user);
    return NextResponse.json(forms);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch forms");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    if (!user.tenantId) return forbidden("Tenant context required");
    const body = await request.json().catch(() => null);
    if (!body?.name) return badRequest("Form name is required");
    const form = await createFormForTenant(user, body);
    return NextResponse.json(form);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    console.error("Form create failed", error);
    return serverError("Failed to create form", error);
  }
}
