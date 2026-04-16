import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  const user = await getCurrentUser(request);

  if (!user) {
    return unauthorized();
  }

  return NextResponse.json(user);
}
