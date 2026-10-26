import { NextResponse } from "next/server";

// Relative Location: behind the proxy request.url is the container's bind address, not the site.
const seeOther = (location: string) => new NextResponse(null, { status: 303, headers: { Location: location } });
import { z } from "zod";
import { pool } from "@/lib/db";
import { validOrigin } from "@/lib/lead-capture";
import { unsubscribe, validUnsubscribeToken } from "@/lib/newsletter";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

// Two ways in: the unsubscribe page's button (a same-site form post), and RFC 8058 one-click
// unsubscribe from mail providers (a POST of "List-Unsubscribe=One-Click" to the link itself,
// with no Origin). Both need the HMAC token, so a guessed id does nothing.
export async function POST(request: Request) {
  const url = new URL(request.url);
  const form = await request.formData().catch(() => null);
  const oneClick = form?.get("List-Unsubscribe") === "One-Click";
  if (!oneClick && !validOrigin(request)) return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  if (!checkRateLimit("newsletter-unsubscribe", clientIp(request), 30, 10 * 60 * 1000).allowed) return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  const id = String(form?.get("id") || url.searchParams.get("id") || "");
  const token = String(form?.get("token") || url.searchParams.get("token") || "");
  const valid = z.string().uuid().safeParse(id).success && token.length <= 100 && validUnsubscribeToken(id, token);
  if (!valid) return oneClick ? NextResponse.json({ error: "Invalid link." }, { status: 400 }) : seeOther("/newsletter/unsubscribe?status=invalid");
  const db = await pool.connect();
  try {
    await db.query("begin");
    await unsubscribe(db, id);
    await db.query("commit");
  } catch (error) { await db.query("rollback"); throw error; }
  finally { db.release(); }
  return oneClick ? NextResponse.json({ ok: true }) : seeOther("/newsletter/unsubscribe?status=done");
}
