import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { validOrigin } from "@/lib/lead-capture";
import { NEWSLETTER_SIGNUP_VERSION, requestSubscription, sendConfirmationEmail } from "@/lib/newsletter";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  // Honeypot: real visitors never see or fill this field.
  website: z.string().max(0).optional(),
}).strict();

// Newsletter sign-up (double opt-in). The answer is the same whether or not the address is
// already subscribed, so the form can't be used to find out who is on the list.
export async function POST(request: Request) {
  if (!validOrigin(request)) return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  if (!checkRateLimit("newsletter-ip", clientIp(request), 5, 10 * 60 * 1000).allowed)
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  let sourcePath: string | null = null;
  try { sourcePath = new URL(request.headers.get("referer") || "").pathname; } catch { /* no referrer */ }
  const db = await pool.connect();
  try {
    await db.query("begin");
    const { token } = await requestSubscription(db, { email: parsed.data.email, source: "SIGNUP_FORM", sourcePath, consentVersion: NEWSLETTER_SIGNUP_VERSION });
    if (token) {
      const sent = await sendConfirmationEmail(parsed.data.email, token);
      if (!sent.ok) { await db.query("rollback"); return NextResponse.json({ error: "We couldn't send the confirmation email. Please try again later." }, { status: 502 }); }
    }
    await db.query("commit");
    return NextResponse.json({ ok: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) { await db.query("rollback"); throw error; }
  finally { db.release(); }
}
