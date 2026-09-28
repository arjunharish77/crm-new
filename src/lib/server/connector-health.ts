import { queryOne } from "@/lib/db/query";
import { getQueueByClass } from "@/lib/server/job-queue";
import { QUEUE_NAME_BY_CLASS, type JobQueueClass } from "@/lib/server/job-registry";
import { getFileStorageDriver, storageRoot } from "@/lib/storage/file-storage";
import { listWebhooksForTenant, getTelephonySettingsForTenant } from "@/lib/server/crm";
import { listCommunicationProvidersForTenant } from "@/lib/server/communications";
import { promises as fs } from "fs";

type TenantUser = {
  id: string;
  tenantId: string | null;
  role?: { permissions?: any } | string | null;
};

export type ConnectorHealthStatus = "ok" | "degraded" | "error" | "not_configured";

export type ConnectorHealthCheck = {
  key: string;
  label: string;
  status: ConnectorHealthStatus;
  detail?: string;
  latencyMs?: number;
};

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; latencyMs: number }> {
  const start = Date.now();
  const result = await fn();
  return { result, latencyMs: Date.now() - start };
}

async function checkDatabase(): Promise<ConnectorHealthCheck> {
  try {
    const { result, latencyMs } = await timed(() => queryOne<{ ok: number }>("select 1 as ok"));
    return result?.ok === 1
      ? { key: "database", label: "Database (Postgres)", status: "ok", latencyMs }
      : { key: "database", label: "Database (Postgres)", status: "error", detail: "Unexpected response" };
  } catch (error) {
    return { key: "database", label: "Database (Postgres)", status: "error", detail: errorMessage(error) };
  }
}

// WP10 (F18): FOUR independent BullMQ queues now (realtime/operational/heavy/ml -- see
// job-registry.ts), each with its own Worker concurrency budget, so this reports each queue's own
// backlog/failure counts separately -- a large "waiting" count on the heavy queue (e.g.
// mid-import) is expected and not itself a problem, whereas the same on the realtime queue means
// dispatch-critical work is backed up.
const QUEUE_HEALTH_LABEL_BY_CLASS: Record<JobQueueClass, string> = {
  realtime: "Worker Queue - Realtime (BullMQ)",
  operational: "Worker Queue - Operational (BullMQ)",
  heavy: "Worker Queue - Heavy/Export-Import-Report (BullMQ)",
  ml: "Worker Queue - ML (BullMQ)",
};
const QUEUE_HEALTH_CLASSES: JobQueueClass[] = ["realtime", "operational", "heavy", "ml"];

async function checkRedisAndQueue(): Promise<[ConnectorHealthCheck, ...ConnectorHealthCheck[]]> {
  const queueChecksNotConfigured = () =>
    QUEUE_HEALTH_CLASSES.map(
      (queueClass): ConnectorHealthCheck => ({
        key: `worker_queue_${queueClass}`,
        label: QUEUE_HEALTH_LABEL_BY_CLASS[queueClass],
        status: "not_configured",
        detail: "REDIS_URL is not set",
      }),
    );
  if (!process.env.REDIS_URL) {
    return [{ key: "redis", label: "Redis", status: "not_configured", detail: "REDIS_URL is not set" }, ...queueChecksNotConfigured()];
  }
  try {
    const queues = QUEUE_HEALTH_CLASSES.map((queueClass) => ({ queueClass, queue: getQueueByClass(queueClass) }));
    const { result: redisClient, latencyMs: connectLatencyMs } = await timed(() => queues[0].queue.client);
    // BullMQ >= 5.7x types queue.client as its adapter-neutral IRedisClient, which does not
    // declare ping(). A GET of a key that never exists is an equally real round trip and is
    // part of that interface for every adapter.
    const { latencyMs: pingLatencyMs } = await timed(() => redisClient.get("crm:connector-health:ping"));
    const redisCheck: ConnectorHealthCheck = { key: "redis", label: "Redis", status: "ok", latencyMs: connectLatencyMs + pingLatencyMs };

    const allCounts = await Promise.all(queues.map(({ queue }) => queue.getJobCounts("waiting", "active", "completed", "failed", "delayed")));
    const queueChecks: ConnectorHealthCheck[] = queues.map(({ queueClass }, index) => {
      const counts = allCounts[index];
      return {
        key: `worker_queue_${queueClass}`,
        label: QUEUE_HEALTH_LABEL_BY_CLASS[queueClass],
        status: (counts.failed ?? 0) > 0 ? "degraded" : "ok",
        detail: `waiting: ${counts.waiting ?? 0}, active: ${counts.active ?? 0}, failed: ${counts.failed ?? 0}, delayed: ${counts.delayed ?? 0}`,
      };
    });
    return [redisCheck, ...queueChecks];
  } catch (error) {
    const detail = errorMessage(error);
    return [
      { key: "redis", label: "Redis", status: "error", detail },
      ...QUEUE_HEALTH_CLASSES.map(
        (queueClass): ConnectorHealthCheck => ({ key: `worker_queue_${queueClass}`, label: QUEUE_HEALTH_LABEL_BY_CLASS[queueClass], status: "error", detail }),
      ),
    ];
  }
}

async function checkMlService(): Promise<ConnectorHealthCheck> {
  const url = process.env.ML_SERVICE_URL;
  if (!url) return { key: "ml_service", label: "ML Service", status: "not_configured", detail: "ML_SERVICE_URL is not set" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const { result: response, latencyMs } = await timed(() =>
      fetch(`${url.replace(/\/$/, "")}/health`, { signal: controller.signal }),
    );
    return response.ok
      ? { key: "ml_service", label: "ML Service", status: "ok", latencyMs }
      : { key: "ml_service", label: "ML Service", status: "error", detail: `HTTP ${response.status}` };
  } catch (error) {
    return { key: "ml_service", label: "ML Service", status: "error", detail: errorMessage(error) };
  } finally {
    clearTimeout(timeout);
  }
}

// Local driver gets a real write-access probe; S3 is reported as configured without a live
// probe (no S3 client is wired up anywhere in this codebase to test against yet).
async function checkStorage(): Promise<ConnectorHealthCheck> {
  const driver = getFileStorageDriver();
  if (driver === "s3") {
    return { key: "storage", label: "File Storage", status: "ok", detail: "Driver: s3 (not live-probed)" };
  }
  try {
    const root = storageRoot();
    await fs.mkdir(root, { recursive: true });
    await fs.access(root, fs.constants.W_OK);
    return { key: "storage", label: "File Storage", status: "ok", detail: `Driver: local (${root})` };
  } catch (error) {
    return { key: "storage", label: "File Storage", status: "error", detail: errorMessage(error) };
  }
}

// Messaging/telephony/webhook connectors don't have cheap external liveness probes (most
// transactional-message providers have no no-op healthcheck endpoint, and this dashboard
// shouldn't burn provider API quota just to render a status page), so these report
// "is a provider configured and active" rather than a live external round-trip.
async function checkCommunicationChannels(user: TenantUser): Promise<ConnectorHealthCheck[]> {
  const providers = await listCommunicationProvidersForTenant(user);
  return (["EMAIL", "WHATSAPP", "SMS"] as const).map((channel) => {
    const configured = providers.filter((provider: any) => provider.channel === channel);
    const active = configured.find((provider: any) => provider.isActive);
    const label = channel === "EMAIL" ? "SMTP / Email" : channel === "WHATSAPP" ? "WhatsApp" : "SMS";
    if (!configured.length) return { key: `channel_${channel.toLowerCase()}`, label, status: "not_configured" as const };
    return {
      key: `channel_${channel.toLowerCase()}`,
      label,
      status: active ? ("ok" as const) : ("degraded" as const),
      detail: active ? `Active provider: ${active.providerType || active.name}` : "Configured but not active",
    };
  });
}

async function checkTelephony(user: TenantUser): Promise<ConnectorHealthCheck> {
  const settings: any = await getTelephonySettingsForTenant(user);
  if (!settings.config?.provider) return { key: "telephony", label: "Telephony", status: "not_configured" };
  return {
    key: "telephony",
    label: "Telephony",
    status: settings.isActive ? "ok" : "degraded",
    detail: settings.isActive ? `Provider: ${settings.config.provider}` : "Configured but not active",
  };
}

async function checkWebhooks(user: TenantUser): Promise<ConnectorHealthCheck> {
  const webhooks: any[] = await listWebhooksForTenant(user);
  if (!webhooks.length) return { key: "webhooks", label: "Outbound Webhooks", status: "not_configured" };
  const activeCount = webhooks.filter((wh) => wh.isActive).length;
  return {
    key: "webhooks",
    label: "Outbound Webhooks",
    status: activeCount > 0 ? "ok" : "degraded",
    detail: `${activeCount} of ${webhooks.length} subscription(s) active`,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

export async function getConnectorHealthForTenant(user: TenantUser): Promise<ConnectorHealthCheck[]> {
  const [database, redisAndQueues, mlService, storage, channels, telephony, webhooks] = await Promise.all([
    checkDatabase(),
    checkRedisAndQueue(),
    checkMlService(),
    checkStorage(),
    checkCommunicationChannels(user),
    checkTelephony(user),
    checkWebhooks(user),
  ]);
  return [database, ...redisAndQueues, mlService, storage, ...channels, telephony, webhooks];
}
