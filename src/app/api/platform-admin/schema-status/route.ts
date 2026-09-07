import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";
import { getMigrationStatus } from "@/lib/server/schema-governance";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const report = await getMigrationStatus();
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch schema status", error);
  }
}
