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

// Pages that need a signed-in user. Without the session cookie, the request goes to /login with
// ?from= so the user comes back here after signing in (UI/UX plan B16). This used to live in a
// second proxy.ts at the project root, which Next.js never ran (with a src/ directory only
// src/proxy.ts runs), so the redirect and the return link were both silently off. The cookie's
// validity is still checked by each API route; an expired cookie reaches the page, whose first
// API call gets 401 and goes to /login with ?from= (lib/api.ts).
const SIGNED_IN_PREFIXES = ["/dashboard", "/platform-admin"];

function pageRedirect(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/register" || pathname.startsWith("/register/")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  const needsSignIn = SIGNED_IN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (needsSignIn && !request.cookies.get("token")?.value) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }
  return null;
}

// Round-2 plan O5: every API request gets an id (a caller's own x-request-id is kept when it
// looks like one). It's passed to the route (logs, Sentry, the "reference" in error replies) and
// returned in the x-request-id response header.
function requestIdFor(request: NextRequest) {
  const supplied = request.headers.get("x-request-id");
  return supplied && /^[A-Za-z0-9._-]{8,64}$/.test(supplied) ? supplied : crypto.randomUUID();
}

function continueWithRequestId(request: NextRequest, requestId: string) {
  const headers = new Headers(request.headers);
  headers.set("x-request-id", requestId);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("x-request-id", requestId);
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/")) {
    return pageRedirect(request) ?? NextResponse.next();
  }
  const requestId = requestIdFor(request);
  if (!MUTATING_METHODS.has(request.method) || isExempt(pathname)) {
    return continueWithRequestId(request, requestId);
  }

  // Absent for non-browser clients (server-to-server calls, curl, mobile apps) -- those aren't
  // the CSRF threat model (there's no victim browser carrying ambient credentials), so this
  // only ever blocks an actual cross-site browser request.
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    const blocked = NextResponse.json({ message: "Cross-site request blocked" }, { status: 403 });
    blocked.headers.set("x-request-id", requestId);
    return blocked;
  }

  return continueWithRequestId(request, requestId);
}

export const config = {
  matcher: [
    "/api/:path*",
    "/dashboard/:path*",
    "/platform-admin/:path*",
    "/register/:path*",
  ],
};
