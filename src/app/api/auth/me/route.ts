import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);

    if (!user) {
      return unauthorized();
    }

    return NextResponse.json(user);
  } catch (error) {
    return serverError("Failed to fetch current user", error);
  }
}
