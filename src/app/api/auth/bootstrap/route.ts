import { NextResponse } from "next/server";
import { bootstrapPlatformAdmin } from "@/lib/server/admin";
import { badRequest, serverError } from "@/lib/server/http";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);

    if (!body?.name || !body?.email || !body?.password) {
      return badRequest("Name, email, and password are required");
    }

    await bootstrapPlatformAdmin(body);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "BOOTSTRAP_ALREADY_COMPLETE") {
      return badRequest("Bootstrap already completed");
    }

    return serverError("Failed to bootstrap platform admin");
  }
}
