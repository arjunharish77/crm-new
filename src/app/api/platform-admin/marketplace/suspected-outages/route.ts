import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { getSuspectedProviderOutages } from "@/lib/server/marketplace-events";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

// Gap checklist Module 16's connector health monitoring, "provider outage marker" sub-item --
// hostnames (parsed from app webhookUrls) where 2+ different apps are simultaneously
// ERROR/DEGRADED, a likely provider-wide outage rather than one app's own bug.
export async function GET(request: Request) {
  try {
    await requirePlatformAdmin(request);
    const outages = await getSuspectedProviderOutages();
    return NextResponse.json(outages);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "FORBIDDEN") return forbidden();
    return serverError("Failed to fetch suspected provider outages", error);
  }
}
