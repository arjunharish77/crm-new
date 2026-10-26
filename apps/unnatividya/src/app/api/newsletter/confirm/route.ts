import { NextResponse } from "next/server";

// Relative Location: behind the proxy request.url is the container's bind address, not the site.
const seeOther = (location: string) => new NextResponse(null, { status: 303, headers: { Location: location } });
import { pool } from "@/lib/db";
import { validOrigin } from "@/lib/lead-capture";
import { confirmSubscription } from "@/lib/newsletter";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

// Confirmation is a POST from the confirm page's button, never the emailed GET link itself, so
// mail scanners that open links can't confirm on someone's behalf.
export async function POST(request: Request) {
  const back = (status: string) => seeOther(`/newsletter/confirm?status=${status}`);
  if (!validOrigin(request)) return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  if (!checkRateLimit("newsletter-confirm", clientIp(request), 20, 10 * 60 * 1000).allowed) return back("try-later");
  const token = String((await request.formData().catch(() => null))?.get("token") || "");
  if (!token || token.length > 100) return back("invalid");
  const db = await pool.connect();
  try { return back((await confirmSubscription(db, token)) ? "confirmed" : "invalid"); }
  finally { db.release(); }
}
