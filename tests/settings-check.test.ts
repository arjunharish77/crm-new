import { describe, expect, it } from "vitest";
import { checkSettings } from "@/lib/server/settings-check";

const good = {
  DATABASE_URL: "postgresql://crm_app:x@postgres:5432/crm",
  REDIS_URL: "redis://:x@redis:6379",
  JWT_SECRET: "a".repeat(40),
  MARKETPLACE_SECRET_ENCRYPTION_KEY: "b".repeat(40),
  FILE_DOWNLOAD_SIGNING_SECRET: "c".repeat(40),
  APP_URL: "https://app.unnatify.com",
};

describe("settings check at start-up (round-2 plan O2)", () => {
  it("passes with every required setting", () => {
    expect(checkSettings(good).errors).toEqual([]);
  });

  it("names each missing or invalid required setting", () => {
    const { errors } = checkSettings({ ...good, REDIS_URL: "", JWT_SECRET: "short", APP_URL: "https://exa mple", MARKETPLACE_SECRET_ENCRYPTION_KEY: "replace-with-a-long-random-secret-value-here" });
    expect(errors).toEqual([
      expect.stringContaining("REDIS_URL is missing"),
      expect.stringContaining("JWT_SECRET must be at least 32"),
      expect.stringContaining("MARKETPLACE_SECRET_ENCRYPTION_KEY still has the example value"),
      expect.stringContaining("APP_URL isn't a valid address"),
    ]);
  });

  it("accepts a bare host for APP_URL, as the app does", () => {
    expect(checkSettings({ ...good, APP_URL: "app.unnatify.com" }).errors).toEqual([]);
  });

  it("only warns about optional settings, per process", () => {
    expect(checkSettings(good, "web").warnings.some((w) => w.startsWith("SENTRY_DSN_WEB"))).toBe(true);
    expect(checkSettings(good, "web").warnings.some((w) => w.startsWith("SENTRY_DSN_WORKER"))).toBe(false);
    expect(checkSettings(good, "worker").warnings.some((w) => w.startsWith("SENTRY_DSN_WORKER"))).toBe(true);
  });
});
