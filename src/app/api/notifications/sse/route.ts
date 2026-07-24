import { requireCurrentUser, verifyAuthToken } from "@/lib/server/auth";
import { unauthorized } from "@/lib/server/http";
import { getRealtimePool } from "@/lib/db/pool";
import { query as dbQuery } from "@/lib/db/query";
import { getCurrentUserById } from "@/lib/repositories/auth-admin-postgres";
import type { PoolClient } from "pg";

export const runtime = "nodejs";

async function getRealtimeUser(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (token) {
    const payload = await verifyAuthToken(token);
    if (!payload) return null;
    const user = await getCurrentUserById(payload.sub);
    if (!user) return null;
    return {
      ...user,
      isImpersonating: !!payload.isImpersonating,
      impersonatedBy: payload.impersonatedBy ?? null,
    };
  }

  return requireCurrentUser(request);
}

export async function GET(request: Request) {
  let user: Awaited<ReturnType<typeof getRealtimeUser>>;
  try {
    user = await getRealtimeUser(request);
    if (!user) return unauthorized();
  } catch {
    return unauthorized();
  }

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      let client: PoolClient | null = null;
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

      const onNotification = (message: { channel: string; payload?: string }) => {
        if (message.channel !== "crm_notifications" || !message.payload) return;
        try {
          const payload = JSON.parse(message.payload);
          if (payload.userId !== user.id) return;
          if ((payload.tenantId ?? null) !== (user.tenantId ?? null)) return;
          send({
            id: payload.id,
            type: payload.data?.type || "notification",
            title: payload.title,
            message: payload.message,
            data: payload.data,
            timestamp: payload.createdAt,
          });
        } catch {
          // Ignore malformed database notifications.
        }
      };

      try {
        client = await getRealtimePool().connect();
      } catch {
        clearInterval(heartbeat);
        send({ type: "error", message: "Realtime notifications unavailable" });
        streamClosed = true;
        try {
          controller.close();
        } catch {
          // The browser may already have closed the stream.
        }
        return;
      }

      client.on("notification", onNotification);
      await client.query("listen crm_notifications");
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
        client?.off("notification", onNotification);
        client?.query("unlisten crm_notifications").catch(() => undefined).finally(() => client?.release());
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
