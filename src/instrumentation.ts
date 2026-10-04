export async function register() {
  // Next.js's build tooling specifically recognizes this "positive check, then import"
  // shape in instrumentation.ts and excludes the import from the edge-runtime compilation
  // (needed once src/proxy.ts exists, since that makes an edge build a real target) --
  // an early-return-on-negative-check shape doesn't get the same treatment and pulls
  // db/pool.ts's `pg` dependency (and its Node-only `fs`/`path` requires) into the edge
  // bundle, which fails to build.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { closePool } = await import("@/lib/db/pool");

    // Round-2 plan O2: settings are checked at start-up; production stops on a missing
    // required one (see settings-check.ts and docs/SETUP_REQUIREMENTS_GUIDE.md section 1).
    const { enforceSettingsAtStartup } = await import("@/lib/server/settings-check");
    enforceSettingsAtStartup("web");

    // Round-2 plan O5: Sentry for the web server when SENTRY_DSN_WEB is set (scrubbed; see
    // error-reporting.ts). Without it, errors are only in the logs.
    if (process.env.SENTRY_DSN_WEB) {
      const Sentry = await import("@sentry/nextjs");
      const { sentryOptions } = await import("@/lib/server/error-reporting");
      Sentry.init(sentryOptions(process.env.SENTRY_DSN_WEB, "web"));
    }

    let shuttingDown = false;
    const shutdown = async (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`[instrumentation] Received ${signal}, closing DB pool before exit...`);
      try {
        await closePool();
      } catch (error) {
        console.error("[instrumentation] Error while closing DB pool:", error);
      } finally {
        process.exit(0);
      }
    };

    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    process.on("SIGINT", () => void shutdown("SIGINT"));
  }
}

// Errors thrown while rendering pages or in route handlers go to Sentry (does nothing without a DSN).
export async function onRequestError(...args: unknown[]) {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.SENTRY_DSN_WEB) return;
  const Sentry = await import("@sentry/nextjs");
  (Sentry.captureRequestError as (...a: unknown[]) => void)(...args);
}
