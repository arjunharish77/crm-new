import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { createPrivacyRequestForContact } from "@/lib/server/privacy";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const body = await request.json().catch(() => ({}));
    if (!body?.contactEmail) return badRequest("contactEmail is required");
    const result = await createPrivacyRequestForContact(user, body);
    return NextResponse.json({
      id: result.requestId,
      contactEmail: body.contactEmail,
      type: body.type === "DELETE" ? "DELETE" : "EXPORT",
      status: result.status,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "CONTACT_EMAIL_REQUIRED") return badRequest("contactEmail is required");
    if (error instanceof Error && error.message === "NO_MATCHING_RECORD") return badRequest("No lead found with this email address");
    return serverError("Failed to create privacy request", error);
  }
}
