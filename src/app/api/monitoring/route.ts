import { NextResponse } from "next/server";
import { checkRateLimit, clientIpFromRequest } from "@/lib/server/rate-limit";

// Round-2 plan O5: the browser sends its error reports here and the server forwards them to
// Sentry (Sentry's "tunnel" option). The page's content security policy only allows connections
// to this site, and ad blockers drop requests to sentry.io. Only envelopes for the project in
// SENTRY_DSN_WEB are forwarded, so this can't be used to send anything anywhere else.
export const dynamic = "force-dynamic";

const MAX_BYTES = 1_000_000;

export async function POST(request: Request) {
  const dsn = process.env.SENTRY_DSN_WEB;
  if (!dsn) return new NextResponse(null, { status: 204 });
  const limit = await checkRateLimit({ key: `monitoring:${clientIpFromRequest(request)}`, limit: 120, windowSeconds: 60 });
  if (!limit.allowed) return new NextResponse(null, { status: 429 });

  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_BYTES) return new NextResponse(null, { status: 413 });
  try {
    const firstLine = new TextDecoder().decode(body.slice(0, Math.min(body.byteLength, 4096))).split("\n")[0];
    const header = JSON.parse(firstLine) as { dsn?: string };
    const expected = new URL(dsn);
    const sent = new URL(String(header.dsn ?? ""));
    const projectId = expected.pathname.replace(/^\//, "");
    if (sent.host !== expected.host || sent.pathname.replace(/^\//, "") !== projectId) return new NextResponse(null, { status: 400 });
    const upstream = await fetch(`${expected.protocol}//${expected.host}/api/${projectId}/envelope/`, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/x-sentry-envelope" },
    });
    return new NextResponse(null, { status: upstream.status });
  } catch {
    return new NextResponse(null, { status: 400 });
  }
}
