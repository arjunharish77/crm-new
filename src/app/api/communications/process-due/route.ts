import { NextResponse } from "next/server";
import { processCommunicationOutbox } from "@/lib/server/communications";
import { forbidden, serverError } from "@/lib/server/http";
import { cronSecretMatches } from "@/lib/server/cron-auth";

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const cronSecret = process.env.COMMUNICATIONS_CRON_SECRET;
    if (!cronSecret) return forbidden("Communications cron secret is not configured");
    if (!cronSecretMatches(request, "x-communications-cron-secret", cronSecret)) return forbidden("Invalid communications cron secret");
    const limit = Number(url.searchParams.get("limit") ?? 50);
    return NextResponse.json(await processCommunicationOutbox(limit));
  } catch (error) {
    return serverError("Failed to process communication outbox", error);
  }
}
