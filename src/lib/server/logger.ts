import { getTenantContext } from "@/lib/db/tenant-context";

// Round-2 plan O5: one JSON line per event, with the request id, workspace and user when known,
// so a user's "reference" can be found in `docker compose logs` and filtered per workspace.
// Personal data (names, emails, record contents) doesn't go in `fields`.
type Level = "info" | "warn" | "error";

export function logEvent(level: Level, msg: string, fields: Record<string, unknown> = {}) {
  const context = getTenantContext();
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    msg,
    ...(context?.requestId ? { requestId: context.requestId } : {}),
    ...(context?.tenantId ? { tenantId: context.tenantId } : {}),
    ...(context?.userId ? { userId: context.userId } : {}),
    ...fields,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function errorDetail(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message, stack: error.stack?.split("\n").slice(0, 8).join("\n") };
  return { message: String(error) };
}
