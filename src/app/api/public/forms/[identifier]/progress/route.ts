import { NextResponse } from "next/server";
import { recordFormProgressEvent } from "@/lib/server/crm";

// Fire-and-forget telemetry beacon (see public-form-renderer.tsx) -- always returns success
// even on a malformed/missing body so a lost beacon (very common with navigator.sendBeacon
// on page unload) never surfaces as a console error to a real visitor, and never leaks
// anything about whether the form/tenant actually exists.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ identifier: string }> }
) {
  const { identifier } = await params;
  const body = await request.json().catch(() => null);
  if (body?.sessionId && body?.tabId) {
    await recordFormProgressEvent(identifier, {
      sessionId: String(body.sessionId),
      tabId: String(body.tabId),
      tabIndex: Number(body.tabIndex) || 0,
    }).catch(() => undefined);
  }
  return NextResponse.json({ success: true });
}
