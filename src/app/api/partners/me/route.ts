import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { getPartnerProfileForUser } from "@/lib/server/partners";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);

    if (!user.isPartner) {
      return forbidden("Not a partner account");
    }

    const profile = await getPartnerProfileForUser(user);
    return NextResponse.json(profile);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch partner profile", error);
  }
}
