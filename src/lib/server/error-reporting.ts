import * as Sentry from "@sentry/node";
import { getTenantContext } from "@/lib/db/tenant-context";

// Round-2 plan O5 and question 11: errors go to Sentry when a DSN is set (SENTRY_DSN_WEB for the
// web server, SENTRY_DSN_WORKER for the worker), with personal data scrubbed: no cookies,
// headers, request bodies, IP addresses or console breadcrumbs, and the user as an id only.
// Without a DSN every function here does nothing.
export function scrubEvent<T extends { request?: any; user?: any; breadcrumbs?: any[] }>(event: T): T {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.query_string;
    if (event.request.headers) event.request.headers = { "user-agent": event.request.headers["user-agent"] };
  }
  if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined;
  if (Array.isArray(event.breadcrumbs)) event.breadcrumbs = event.breadcrumbs.filter((crumb) => crumb?.category !== "console");
  return event;
}

export function sentryOptions(dsn: string, component: "web" | "worker") {
  return {
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || "production",
    release: process.env.CRM_VERSION || undefined,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { allow: ["user-agent"] }, response: false },
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
    },
    tracesSampleRate: 0,
    initialScope: { tags: { component } },
    beforeSend: (event: any) => scrubEvent(event),
    beforeBreadcrumb: (crumb: any) => (crumb?.category === "console" ? null : crumb),
  };
}

function enabled() {
  return Boolean(Sentry.getClient());
}

function withContext(scope: Sentry.Scope, extra?: Record<string, unknown>) {
  const context = getTenantContext();
  if (context?.requestId) scope.setTag("requestId", context.requestId);
  if (context?.tenantId) scope.setTag("tenantId", context.tenantId);
  if (context?.userId) scope.setUser({ id: context.userId });
  if (extra) for (const [key, value] of Object.entries(extra)) scope.setTag(key, String(value));
}

export function reportError(error: unknown, tags?: Record<string, unknown>) {
  if (!enabled()) return;
  Sentry.withScope((scope) => {
    withContext(scope, tags);
    Sentry.captureException(error);
  });
}

// A warning grouped by `fingerprint`, so a repeating problem is one Sentry issue (and one alert).
export function reportWarning(message: string, fingerprint: string, tags?: Record<string, unknown>) {
  if (!enabled()) return;
  Sentry.withScope((scope) => {
    withContext(scope, tags);
    scope.setLevel("warning");
    scope.setFingerprint([fingerprint]);
    Sentry.captureMessage(message);
  });
}
