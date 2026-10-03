import { afterEach, describe, expect, it } from "vitest";
import { appBaseUrlString, appUrl } from "@/lib/app-url";

const original = process.env.APP_URL;
afterEach(() => { process.env.APP_URL = original; });

describe("appUrl", () => {
  it("reads a normal value", () => {
    process.env.APP_URL = "https://app.example.com/";
    expect(appBaseUrlString()).toBe("https://app.example.com");
  });

  it("tolerates a bare host and stray quotes from hand-edited .env files", () => {
    process.env.APP_URL = "app.example.com";
    expect(appUrl().origin).toBe("https://app.example.com");
    process.env.APP_URL = "'https://app.example.com'";
    expect(appUrl().origin).toBe("https://app.example.com");
    process.env.APP_URL = '"https://app.example.com"';
    expect(appUrl().origin).toBe("https://app.example.com");
  });

  it("never throws: unparseable or missing falls back to localhost", () => {
    process.env.APP_URL = "https://";
    expect(appUrl().origin).toBe("http://localhost:3000");
    delete process.env.APP_URL;
    expect(appBaseUrlString()).toBe("http://localhost:3000");
  });
});
