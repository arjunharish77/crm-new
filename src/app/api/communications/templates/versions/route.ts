import { NextResponse } from "next/server";
import { requireTenantAdmin } from "@/lib/server/auth";
import { listCommunicationTemplateVersionsForTenant } from "@/lib/server/communications";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireTenantAdmin(request);
    const { searchParams } = new URL(request.url);
    const channel = searchParams.get("channel");
    const name = searchParams.get("name");
    if (!channel || !name) return badRequest("channel and name are required");
    const locale = searchParams.get("locale") ?? "en";
    return NextResponse.json(await listCommunicationTemplateVersionsForTenant(user, channel as any, name, locale));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch communication template versions", error);
  }
}
