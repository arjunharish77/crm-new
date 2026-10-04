"use client";

// Round-2 plan O5: browser errors go to Sentry when the server has SENTRY_DSN_WEB set. The DSN
// comes from /api/client-config (once per tab), and the Sentry code is only downloaded when a DSN
// is set. Scrubbed like the server: no request bodies or query strings, no console or input
// breadcrumbs, the user as an id only.
type ClientConfig = { sentryDsn: string | null; environment: string; release: string | null };

let started: Promise<boolean> | null = null;

async function loadConfig(): Promise<ClientConfig | null> {
  try {
    const cached = sessionStorage.getItem("crm.clientConfig");
    if (cached) return JSON.parse(cached);
  } catch {
    // Storage blocked: fetch it.
  }
  try {
    const response = await fetch("/api/client-config", { credentials: "same-origin" });
    if (!response.ok) return null;
    const config = (await response.json()) as ClientConfig;
    try { sessionStorage.setItem("crm.clientConfig", JSON.stringify(config)); } catch { /* optional */ }
    return config;
  } catch {
    return null;
  }
}

export function startClientErrorReporting(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  started ??= (async () => {
    const config = await loadConfig();
    if (!config?.sentryDsn) return false;
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn: config.sentryDsn,
      // Sent through this site (api/monitoring), which the content security policy allows.
      tunnel: "/api/monitoring",
      environment: config.environment,
      release: config.release ?? undefined,
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
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      initialScope: { tags: { component: "browser" } },
      beforeBreadcrumb: (crumb) => (crumb.category === "console" || crumb.category === "ui.input" ? null : crumb),
      beforeSend: (event) => {
        if (event.request) {
          delete event.request.cookies;
          delete event.request.data;
          delete event.request.query_string;
          if (event.request.url) event.request.url = event.request.url.split("?")[0];
        }
        if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined;
        return event;
      },
    });
    return true;
  })();
  return started;
}

// For error boundaries: React catches render errors before window.onerror sees them.
export function reportClientError(error: unknown) {
  void startClientErrorReporting().then(async (on) => {
    if (!on) return;
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureException(error);
  });
}
