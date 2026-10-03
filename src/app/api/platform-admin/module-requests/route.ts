import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";
import { listModuleAccessRequests } from "@/lib/server/module-access";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    return NextResponse.json(await listModuleAccessRequests({ tenantId: url.searchParams.get("tenantId"), status: status && ["PENDING", "APPROVED", "DECLINED", "WITHDRAWN"].includes(status) ? status : null }));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to load module requests", error);
  }
}
