import { NextResponse } from "next/server";
import { badRequest } from "@/lib/server/http";
import { checkRateLimit, clientIpFromRequest } from "@/lib/server/rate-limit";
import { requestPasswordResetByEmail } from "@/lib/server/password-policy";
import { isSystemEmailConfigured } from "@/lib/server/system-email";

// "Forgot password?" (decision 16). Public. The sign-in page asks whether it's available (the
// deployment has an SMTP account); POST always gives the same answer, whether or not the email
// belongs to an account, and the email is sent after the reply.
export async function GET() {
  return NextResponse.json({ available: isSystemEmailConfigured() });
}

export async function POST(request: Request) {
  const ip = clientIpFromRequest(request);
  const byIp = await checkRateLimit({ key: `forgot-password:ip:${ip}`, limit: 5, windowSeconds: 15 * 60 });
  if (!byIp.allowed) return NextResponse.json({ message: "Too many requests. Try again in a few minutes." }, { status: 429 });
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!email || !email.includes("@") || email.length > 320) return badRequest("Enter your email address");
  const byEmail = await checkRateLimit({ key: `forgot-password:email:${email.toLowerCase()}`, limit: 3, windowSeconds: 60 * 60 });
  if (byEmail.allowed && isSystemEmailConfigured()) {
    // Not awaited: the reply mustn't take longer when the account exists.
    void requestPasswordResetByEmail(email).catch((error) => {
      console.error("[forgot-password] reset email failed", error instanceof Error ? error.message : "unknown error");
    });
  }
  return NextResponse.json({ ok: true, message: "If an account uses that email, we've sent it a link to reset the password. The link works for an hour." });
}
