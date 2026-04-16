import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    await requireCurrentUser(request);
    return NextResponse.json([]);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }

    return NextResponse.json([]);
  }
}
