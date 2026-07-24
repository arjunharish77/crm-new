import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { listUserBadges } from "@/lib/server/badges";
import { serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const badges = await listUserBadges(user, user.id);
    return NextResponse.json(badges);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch badges", error);
  }
}
