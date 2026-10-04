// Round-2 plan O2: settings are checked when the web server or the worker starts, not at first
// use. In production a missing required setting stops the process with one clear message (the
// deploy script then puts the previous version back); optional ones only warn.
type Rule = { name: string; why: string; valid?: (value: string) => string | null };

const longSecret = (min: number) => (value: string) => (value.length < min ? `must be at least ${min} characters` : /replace-with/i.test(value) ? "still has the example value" : null);
const url = (protocols: string[]) => (value: string) => {
  try {
    const parsed = new URL(value);
    return protocols.includes(parsed.protocol) ? null : `must start with ${protocols.join(" or ")}`;
  } catch {
    return "isn't a valid address";
  }
};

export const REQUIRED_SETTINGS: Rule[] = [
  { name: "DATABASE_URL", why: "the database", valid: url(["postgresql:", "postgres:"]) },
  { name: "REDIS_URL", why: "background jobs and rate limits", valid: url(["redis:", "rediss:"]) },
  { name: "JWT_SECRET", why: "signing sign-in sessions", valid: longSecret(32) },
  { name: "MARKETPLACE_SECRET_ENCRYPTION_KEY", why: "encrypting stored integration secrets (wave 0, O1)", valid: longSecret(32) },
  { name: "FILE_DOWNLOAD_SIGNING_SECRET", why: "signed download links (wave 0, O1)", valid: longSecret(32) },
  // A bare host is fine: lib/app-url.ts adds https:// the same way.
  { name: "APP_URL", why: "links in emails and pages", valid: (value) => url(["https:", "http:"])(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value.replace(/^['"]+|['"]+$/g, "")}`) },
];

export const RECOMMENDED_SETTINGS: Rule[] = [
  { name: "BOOTSTRAP_TOKEN", why: "first-run setup is turned off without it" },
  { name: "SYSTEM_SMTP_HOST", why: "password-reset emails are turned off without it" },
  { name: "SENTRY_DSN_WEB", why: "server and browser errors aren't reported to Sentry without it" },
  { name: "SENTRY_DSN_WORKER", why: "background-job errors aren't reported to Sentry without it" },
];

export function checkSettings(env: Record<string, string | undefined> = process.env, process_: "web" | "worker" = "web") {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const rule of REQUIRED_SETTINGS) {
    const value = env[rule.name]?.trim();
    if (!value) errors.push(`${rule.name} is missing (needed for ${rule.why})`);
    else {
      const problem = rule.valid?.(value);
      if (problem) errors.push(`${rule.name} ${problem}`);
    }
  }
  for (const rule of RECOMMENDED_SETTINGS) {
    if (rule.name === "SENTRY_DSN_WEB" && process_ !== "web") continue;
    if (rule.name === "SENTRY_DSN_WORKER" && process_ !== "worker") continue;
    if (!env[rule.name]?.trim()) warnings.push(`${rule.name} is not set: ${rule.why}`);
  }
  return { errors, warnings };
}

// Logs the result; in production exits when a required setting is missing or invalid.
export function enforceSettingsAtStartup(process_: "web" | "worker") {
  // `next build` also loads instrumentation while pre-rendering; the image is built without the
  // server's settings, so the check only applies to a running server.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { errors, warnings } = checkSettings(process.env, process_);
  for (const warning of warnings) console.warn(JSON.stringify({ level: "warn", msg: "settings", detail: warning, process: process_ }));
  if (!errors.length) return;
  const message = `Missing or invalid settings in deploy/vps/.env:\n  - ${errors.join("\n  - ")}`;
  if (process.env.NODE_ENV === "production") {
    console.error(JSON.stringify({ level: "fatal", msg: "settings", detail: errors, process: process_ }));
    console.error(message);
    process.exit(1);
  }
  console.warn(message);
}
