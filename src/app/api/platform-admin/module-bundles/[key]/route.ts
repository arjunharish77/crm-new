import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { badRequest, forbidden, moduleDependencyConflict, serverError, unauthorized } from "@/lib/server/http";
import { saveModuleBundle } from "@/lib/server/module-access";

export async function PUT(request: Request, { params }: { params: Promise<{ key: string }> }) {
  try {
    const user = await requirePlatformAdmin(request);
    const { key } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body.name !== "string" || !Array.isArray(body.modules) || !body.modules.every((m: unknown) => typeof m === "string")) {
      return badRequest("name and modules[] are required");
    }
    return NextResponse.json(await saveModuleBundle(user, key, { name: body.name, description: typeof body.description === "string" ? body.description : null, modules: body.modules, sortOrder: Number.isInteger(body.sortOrder) ? body.sortOrder : 0 }));
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    if (error instanceof Error && error.message === "BUNDLE_KEY_INVALID") return badRequest("Bundle key must be UPPER_SNAKE_CASE");
    if (error instanceof Error && error.message === "BUNDLE_NAME_INVALID") return badRequest("Bundle name is required (up to 80 characters)");
    if (error instanceof Error && error.message.startsWith("BUNDLE_INVALID: ")) return moduleDependencyConflict(error.message.slice("BUNDLE_INVALID: ".length), 400);
    return serverError("Failed to save module bundle", error);
  }
}
