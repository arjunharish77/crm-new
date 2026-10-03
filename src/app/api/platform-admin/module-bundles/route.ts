import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";
import { listModuleBundles } from "@/lib/server/module-access";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    return NextResponse.json(await listModuleBundles());
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to load module bundles", error);
  }
}
