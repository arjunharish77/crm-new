import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LEGACY_REDIRECTS } from "@/lib/legacy-routes";
import { SETTINGS_PAGES } from "@/lib/settings-pages";

// /dashboard/settings/teams/:id → src/app/dashboard/settings/teams/[id]/page.tsx
function pageFileFor(path: string) {
    const clean = path.split(/[?#]/)[0].replace(/:(\w+)/g, "[$1]");
    return join(process.cwd(), "src/app", clean, "page.tsx");
}

describe("legacy redirects", () => {
    it("every destination is a real page", () => {
        const missing = LEGACY_REDIRECTS.filter((entry) => !existsSync(pageFileFor(entry.destination)));
        expect(missing).toEqual([]);
    });

    it("no source is listed twice", () => {
        const sources = LEGACY_REDIRECTS.map((entry) => entry.source);
        expect(sources.filter((source, index) => sources.indexOf(source) !== index)).toEqual([]);
    });

    it("no source hides a page that still exists (redirects run before pages)", () => {
        expect(LEGACY_REDIRECTS.filter((entry) => existsSync(pageFileFor(entry.source))).map((entry) => entry.source)).toEqual([]);
    });

    it("no redirect points at another redirect", () => {
        const sources = new Set(LEGACY_REDIRECTS.map((entry) => entry.source));
        expect(LEGACY_REDIRECTS.filter((entry) => sources.has(entry.destination.split(/[?#]/)[0])).map((entry) => entry.source)).toEqual([]);
    });
});

describe("settings registry", () => {
    it("every Settings page in the menu exists", () => {
        expect(SETTINGS_PAGES.filter((page) => !existsSync(pageFileFor(page.href))).map((page) => page.href)).toEqual([]);
    });

    it("each page has its own icon", () => {
        const icons = SETTINGS_PAGES.map((page) => page.icon);
        expect(SETTINGS_PAGES.filter((page, index) => icons.indexOf(page.icon) !== index).map((page) => page.title)).toEqual([]);
    });
});
