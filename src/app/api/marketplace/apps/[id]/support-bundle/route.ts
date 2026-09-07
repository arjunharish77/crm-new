import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { generateAppSupportBundle } from "@/lib/server/marketplace-diagnostics";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    const bundle = await generateAppSupportBundle(user, id);
    return new NextResponse(JSON.stringify(bundle, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="app-${id}-support-bundle.json"`,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "MARKETPLACE_APP_NOT_FOUND") return badRequest("App not found");
    return serverError("Failed to generate support bundle", error);
  }
}
