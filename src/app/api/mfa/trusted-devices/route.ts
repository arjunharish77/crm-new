import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { listTrustedDevicesForUser } from "@/lib/server/mfa";
import { serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const devices = await listTrustedDevicesForUser(user.id);
    return NextResponse.json(devices);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch trusted devices", error);
  }
}
