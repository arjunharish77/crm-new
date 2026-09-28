import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/auth";
import { revokeSession } from "@/lib/server/sessions";

// F06/F05 fix (WP05): this only ever cleared the browser's cookie -- the underlying UserSession
// row (and the JWT's own validity, since it carries no other revocation check besides that row)
// stayed live until its natural 7-day expiry. A copied/leaked token would keep working after
// "logout" until it expired on its own. Now revokes the actual session server-side too.
export async function POST(request: Request) {
  const user = await getCurrentUser(request).catch(() => null);
  if (user?.sessionId) {
    await revokeSession(user.id, user.sessionId, user.id, "USER_LOGOUT").catch(() => undefined);
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set("token", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
  return response;
}
