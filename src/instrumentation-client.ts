import { startClientErrorReporting } from "@/lib/client-error-reporting";

// Runs in the browser before the app starts (round-2 plan O5). Does nothing unless the server
// has SENTRY_DSN_WEB set.
void startClientErrorReporting();
