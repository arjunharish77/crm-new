export async function register() {
  // Next.js's build tooling specifically recognizes this "positive check, then import"
  // shape in instrumentation.ts and excludes the import from the edge-runtime compilation
  // (needed once src/proxy.ts exists, since that makes an edge build a real target) --
  // an early-return-on-negative-check shape doesn't get the same treatment and pulls
  // db/pool.ts's `pg` dependency (and its Node-only `fs`/`path` requires) into the edge
  // bundle, which fails to build.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { closePool } = await import("@/lib/db/pool");

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
