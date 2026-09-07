import { NextResponse, type NextRequest } from "next/server";

// Gap checklist: "Add security headers and browser protections" -- CSRF protection for
// mutating routes. Confirmed by direct audit that this app's auth model already makes classic
// CSRF (a cross-site page forcing a state change via ambient cookies) a narrow risk rather
// than a demonstrated one: every mutating route requires a Bearer token via
// requireCurrentUser/getCurrentUser, which a cross-site form/fetch can't attach, and the one
// auth cookie is SameSite=Lax (not sent on a cross-site POST at all). This proxy (Next.js 16's
// renamed middleware convention) adds an explicit, defense-in-depth layer on top of that using
// the Fetch Metadata `Sec-Fetch-Site`
// header (sent by every modern browser on every request) rather than parsing Origin/Referer,
// which are easier for a browser or proxy to omit or rewrite.
//
// Routes deliberately exempted below are ones this app expects genuine cross-site traffic to:
// inbound webhook receivers, SCIM (called by an external IdP), the public form submission
// endpoint (submitted from a tenant's OWN external website via the iframe embed feature --
// see EmbedCodeDialog.tsx -- which is unavoidably cross-site from this app's perspective), the
// other public/*: endpoints (unsubscribe links, exports, report/invoice delivery -- all reached
// from outside a logged-in session by design), and the external developer API (/api/v1, API-key
// authenticated, not cookie/session-based at all).
const EXEMPT_PREFIXES = ["/api/communications/webhooks", "/api/scim/", "/api/public/", "/api/v1/"];

function isExempt(pathname: string) {
  if (pathname === "/api/integrations/telephony/webhook" || pathname.startsWith("/api/integrations/telephony/webhook/")) return true;
  return EXEMPT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/") || !MUTATING_METHODS.has(request.method) || isExempt(pathname)) {
    return NextResponse.next();
  }

  // Absent for non-browser clients (server-to-server calls, curl, mobile apps) -- those aren't
  // the CSRF threat model (there's no victim browser carrying ambient credentials), so this
  // only ever blocks an actual cross-site browser request.
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    return NextResponse.json({ message: "Cross-site request blocked" }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
