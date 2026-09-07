import { NextResponse } from "next/server";
import { requireCurrentUser, requireTenantAdmin } from "@/lib/server/auth";
import { getNextBestActionStrategyForModule, upsertNextBestActionStrategy } from "@/lib/server/next-best-action";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

function isValidModule(value: string): value is "LEAD" | "OPPORTUNITY" {
  return value === "LEAD" || value === "OPPORTUNITY";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ module: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { module } = await params;
    if (!isValidModule(module)) return badRequest("Invalid module");
    const strategy = await getNextBestActionStrategyForModule(user, module);
    return NextResponse.json(strategy);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch Next-Best-Action strategy", error);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ module: string }> }
) {
  try {
    const user = await requireTenantAdmin(request);
    const { module } = await params;
    if (!isValidModule(module)) return badRequest("Invalid module");
    const body = await request.json().catch(() => ({}));
    const strategy = await upsertNextBestActionStrategy(user, module, body);
    return NextResponse.json(strategy);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to save Next-Best-Action strategy", error);
  }
}
