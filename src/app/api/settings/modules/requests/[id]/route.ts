import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { forbidden, notFound, serverError, unauthorized } from "@/lib/server/http";
import { withdrawModuleAccessRequest } from "@/lib/server/module-access";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireTenantAdmin(request);
    const { id } = await params;
    return NextResponse.json(await withdrawModuleAccessRequest(user, id));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "MODULE_REQUEST_NOT_FOUND") return notFound("No pending request with that id");
    return serverError("Failed to withdraw module request", error);
  }
}
