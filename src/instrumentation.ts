export async function register() {
  // Only wire this up in the actual Node.js server runtime, not the edge
  // runtime or during `next build`'s static analysis pass.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

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
