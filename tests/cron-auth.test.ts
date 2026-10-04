import { describe, expect, it } from "vitest";
import { cronSecretMatches } from "@/lib/server/cron-auth";

describe("cron secret check (round-2 plan S13)", () => {
  const request = (headers: Record<string, string>, url = "http://localhost/api/tasks/process-reminders") => new Request(url, { method: "POST", headers });

  it("accepts the secret in its header", () => {
    expect(cronSecretMatches(request({ "x-tasks-cron-secret": "s3cret" }), "x-tasks-cron-secret", "s3cret")).toBe(true);
  });

  it("ignores a secret in the URL, a wrong secret, and an unset one", () => {
    expect(cronSecretMatches(request({}, "http://localhost/api/tasks/process-reminders?secret=s3cret"), "x-tasks-cron-secret", "s3cret")).toBe(false);
    expect(cronSecretMatches(request({ "x-tasks-cron-secret": "s3cre" }), "x-tasks-cron-secret", "s3cret")).toBe(false);
    expect(cronSecretMatches(request({ "x-tasks-cron-secret": "" }), "x-tasks-cron-secret", undefined)).toBe(false);
  });
});
