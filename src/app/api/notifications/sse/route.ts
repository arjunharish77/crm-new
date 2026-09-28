import { requireCurrentUser } from "@/lib/server/auth";
import { unauthorized } from "@/lib/server/http";
import { query as dbQuery } from "@/lib/db/query";
import { subscribeToNotifications } from "@/lib/server/realtime-notifications";
import { validateSession } from "@/lib/server/sessions";
import { isTenantSuspended } from "@/lib/repositories/auth-admin-postgres";

export const runtime = "nodejs";

// F05 fix (WP05): the connection-time checks (WP02) confirm the session/tenant are valid when a
// stream OPENS, but a long-lived SSE connection could previously keep delivering notifications
// indefinitely after a mid-connection revocation (logout elsewhere, admin-revoked session,
// tenant suspended) until the browser happened to reconnect on its own. Rechecked on this
// interval instead -- comfortably under the audit's own "auth revocation propagation <=60s"
// target (section 9) while not meaningfully more expensive than the existing heartbeat.
const REAUTH_INTERVAL_MS = 30_000;

export async function GET(request: Request) {
  // F06 fix (WP05): a session token in a URL query string ends up in server/proxy access logs,
  // browser history and Referer headers -- this route previously accepted one as a fallback
  // (needed only because EventSource can't set a custom Authorization header). Now that
  // sessions are an HttpOnly cookie the browser attaches automatically, EventSource carries it
  // like any other same-origin request, so the token-in-URL path is removed rather than left as
  // still-working-but-deprecated: a stale bookmark or logged URL should not remain a live
  // credential.
  let user: Awaited<ReturnType<typeof requireCurrentUser>>;
  try {
    user = await requireCurrentUser(request);
    if (!user) return unauthorized();
  } catch {
    return unauthorized();
  }

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      let unsubscribe: (() => void) | null = null;
      let streamClosed = false;
      let cleanedUp = false;
      const send = (payload: unknown) => {
        if (streamClosed) return false;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          return true;
        } catch {
          streamClosed = true;
          cleanup?.();
          return false;
        }
      };
      const heartbeat = setInterval(() => send({ type: "heartbeat" }), 25_000);

      const closeUnauthorized = () => {
        send({ type: "error", message: "Session no longer valid" });
        streamClosed = true;
        cleanup?.();
        try {
          controller.close();
        } catch {
          // The browser may already have closed the stream.
        }
      };
      const reauth = setInterval(async () => {
        try {
          if (user.sessionId) {
            const validation = await validateSession(user.sessionId);
            if (!validation.valid) {
              closeUnauthorized();
              return;
            }
          }
          if (user.tenantId && !user.isPlatformAdmin && (await isTenantSuspended(user.tenantId))) {
            closeUnauthorized();
          }
        } catch {
          // A transient DB error during the recheck shouldn't kill an otherwise-healthy stream;
          // the next interval tick (or the connection's own natural reconnect) tries again.
        }
      }, REAUTH_INTERVAL_MS);

      try {
        // F10 fix: one shared LISTEN connection per web process (see realtime-notifications.ts),
        // not one dedicated connection per browser stream -- this stays bounded regardless of
        // how many streams are open, instead of exhausting the (default max-3) realtime pool.
        unsubscribe = await subscribeToNotifications({ userId: user.id, tenantId: user.tenantId, send });
      } catch {
        clearInterval(heartbeat);
        clearInterval(reauth);
        send({ type: "error", message: "Realtime notifications unavailable" });
        streamClosed = true;
        try {
          controller.close();
        } catch {
          // The browser may already have closed the stream.
        }
        return;
      }

      const unread = await dbQuery(
        user.tenantId
          ? `select id, title, message, data, "createdAt" from "Notification" where "userId"::text = $1 and "isRead" = false and "tenantId"::text = $2 order by "createdAt" desc limit 20`
          : `select id, title, message, data, "createdAt" from "Notification" where "userId"::text = $1 and "isRead" = false and "tenantId" is null order by "createdAt" desc limit 20`,
        user.tenantId ? [String(user.id), String(user.tenantId)] : [String(user.id)],
      );
      send({ type: "snapshot", notifications: unread });
      send({ type: "heartbeat" });
      cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        streamClosed = true;
        cleanup = null;
        clearInterval(heartbeat);
        clearInterval(reauth);
        unsubscribe?.();
      };
      request.signal.addEventListener("abort", () => cleanup?.(), { once: true });
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
