// F10 fix (WP05): the SSE route previously opened one dedicated PostgreSQL LISTEN connection
// per browser stream (`getRealtimePool().connect()` inside the route itself), and the realtime
// pool defaults to a maximum of 3 connections -- three sustained browser tabs/users could
// occupy the entire pool, leaving every other stream to wait or fail. This module keeps exactly
// ONE shared LISTEN connection per web process (bounded regardless of subscriber count) and
// fans matched notifications out to every subscriber in-process.
import { getRealtimePool } from "@/lib/db/pool";
import type { PoolClient } from "pg";

export type NotificationSubscriber = {
  userId: string;
  tenantId: string | null;
  send: (payload: unknown) => void;
};

let sharedClient: PoolClient | null = null;
let connecting: Promise<PoolClient> | null = null;
const subscribers = new Set<NotificationSubscriber>();

function handleNotification(message: { channel: string; payload?: string }) {
  if (message.channel !== "crm_notifications" || !message.payload) return;
  let payload: any;
  try {
    payload = JSON.parse(message.payload);
  } catch {
    return; // Ignore malformed database notifications.
  }
  for (const subscriber of subscribers) {
    if (payload.userId !== subscriber.userId) continue;
    if ((payload.tenantId ?? null) !== (subscriber.tenantId ?? null)) continue;
    subscriber.send({
      id: payload.id,
      type: payload.data?.type || "notification",
      title: payload.title,
      message: payload.message,
      data: payload.data,
      timestamp: payload.createdAt,
    });
  }
}

function dropSharedClient() {
  sharedClient = null;
  connecting = null;
}

async function ensureListening(): Promise<PoolClient> {
  if (sharedClient) return sharedClient;
  if (connecting) return connecting;

  connecting = (async () => {
    const client = await getRealtimePool().connect();
    client.on("notification", handleNotification);
    // If the one shared connection itself drops (network blip, server restart), the next
    // subscribe call reconnects instead of silently listening on a dead client forever.
    client.on("error", dropSharedClient);
    client.on("end", dropSharedClient);
    await client.query("listen crm_notifications");
    sharedClient = client;
    connecting = null;
    return client;
  })();

  try {
    return await connecting;
  } catch (error) {
    dropSharedClient();
    throw error;
  }
}

// Registers a subscriber against the shared connection (connecting it on first use) and returns
// an unsubscribe function. Throws if the shared connection cannot be established at all -- the
// caller (the SSE route) already has its own "realtime unavailable" fallback for that case.
export async function subscribeToNotifications(subscriber: NotificationSubscriber): Promise<() => void> {
  await ensureListening();
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
}

// Exposed for observability/tests -- total active SSE subscribers this process is fanning out
// to, which should stay bounded by real connected browsers, not by database connections used.
export function realtimeSubscriberCount() {
  return subscribers.size;
}
