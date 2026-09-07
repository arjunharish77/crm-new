import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { matchesCombo, comboLabel, isTypingContext, resolveShortcutMatch, type ShortcutDefinition } from "@/lib/keyboard-shortcuts";

function fakeEvent(overrides: Partial<{ key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }>) {
  return { key: "", metaKey: false, ctrlKey: false, shiftKey: false, ...overrides } as KeyboardEvent;
}

// Gap checklist Module 10's keyboard shortcut system -- "conflict handling" hinges on this
// matching logic being exactly right, so it gets direct unit coverage (this app's test suite is
// otherwise backend/service-layer only, with no React component tests, per this same module's
// earlier command-palette pass -- these are pure functions, not component rendering).
describe("matchesCombo", () => {
  it("matches a bare key with no modifiers", () => {
    expect(matchesCombo(fakeEvent({ key: "r" }), { key: "r" })).toBe(true);
  });

  it("does not match a bare-key combo when a modifier is actually held", () => {
    expect(matchesCombo(fakeEvent({ key: "r", metaKey: true }), { key: "r" })).toBe(false);
    expect(matchesCombo(fakeEvent({ key: "r", ctrlKey: true }), { key: "r" })).toBe(false);
  });

  it("matches a meta-required combo via either metaKey or ctrlKey (cross-platform)", () => {
    expect(matchesCombo(fakeEvent({ key: "k", metaKey: true }), { key: "k", meta: true })).toBe(true);
    expect(matchesCombo(fakeEvent({ key: "k", ctrlKey: true }), { key: "k", meta: true })).toBe(true);
  });

  it("does not match a meta-required combo when no modifier is held", () => {
    expect(matchesCombo(fakeEvent({ key: "k" }), { key: "k", meta: true })).toBe(false);
  });

  it("requires shift to match exactly when the combo declares it", () => {
    expect(matchesCombo(fakeEvent({ key: "?", shiftKey: true }), { key: "?", shift: true })).toBe(true);
    expect(matchesCombo(fakeEvent({ key: "?", shiftKey: false }), { key: "?", shift: true })).toBe(false);
    expect(matchesCombo(fakeEvent({ key: "a", shiftKey: true }), { key: "a" })).toBe(false);
  });

  it("compares the key case-insensitively", () => {
    expect(matchesCombo(fakeEvent({ key: "K", metaKey: true }), { key: "k", meta: true })).toBe(true);
  });

  it("does not match a different key entirely", () => {
    expect(matchesCombo(fakeEvent({ key: "x" }), { key: "r" })).toBe(false);
  });
});

describe("comboLabel", () => {
  it("renders a bare key uppercased", () => {
    expect(comboLabel({ key: "r" })).toBe("R");
  });

  it("renders multi-character keys (like Escape or ?) unchanged", () => {
    expect(comboLabel({ key: "?", shift: true })).toContain("?");
  });
});

// `isTypingContext` checks `target instanceof HTMLElement`, which isn't available in this
// suite's plain Node test environment (no jsdom) -- a tiny local stub class stands in for it so
// this WCAG 2.1.4 "don't hijack keys while typing" logic gets real unit coverage without adding
// jsdom/RTL as a project dependency just for one function.
class FakeHTMLElement {
  tagName: string;
  isContentEditable: boolean;
  constructor(tagName: string, isContentEditable = false) {
    this.tagName = tagName;
    this.isContentEditable = isContentEditable;
  }
}

describe("isTypingContext", () => {
  const originalHTMLElement = (globalThis as any).HTMLElement;

  beforeAll(() => {
    (globalThis as any).HTMLElement = FakeHTMLElement;
  });

  afterAll(() => {
    (globalThis as any).HTMLElement = originalHTMLElement;
  });

  it("returns false for a null target", () => {
    expect(isTypingContext(null)).toBe(false);
  });

  it("returns false for a non-HTMLElement target", () => {
    expect(isTypingContext({} as any)).toBe(false);
  });

  it("returns true for INPUT/TEXTAREA/SELECT tags", () => {
    expect(isTypingContext(new FakeHTMLElement("INPUT") as any)).toBe(true);
    expect(isTypingContext(new FakeHTMLElement("TEXTAREA") as any)).toBe(true);
    expect(isTypingContext(new FakeHTMLElement("SELECT") as any)).toBe(true);
  });

  it("returns true for a contentEditable element regardless of tag", () => {
    expect(isTypingContext(new FakeHTMLElement("DIV", true) as any)).toBe(true);
  });

  it("returns false for an ordinary, non-editable element like a button", () => {
    expect(isTypingContext(new FakeHTMLElement("BUTTON") as any)).toBe(false);
  });
});

function fakeShortcut(overrides: Partial<ShortcutDefinition>): ShortcutDefinition {
  return {
    id: "test-shortcut",
    combo: { key: "r" },
    description: "Test",
    group: "Global",
    handler: () => undefined,
    ...overrides,
  };
}

describe("resolveShortcutMatch", () => {
  it("returns null when no registered shortcut matches the event", () => {
    const shortcuts = [fakeShortcut({ combo: { key: "r" } })];
    expect(resolveShortcutMatch(shortcuts, fakeEvent({ key: "x" }), false)).toBeNull();
  });

  it("returns the single matching shortcut", () => {
    const shortcut = fakeShortcut({ id: "refresh", combo: { key: "r" } });
    expect(resolveShortcutMatch([shortcut], fakeEvent({ key: "r" }), false)).toBe(shortcut);
  });

  it("conflict handling: the most-recently-registered (last in the array) shortcut wins on a combo collision", () => {
    const first = fakeShortcut({ id: "global-r", combo: { key: "r" } });
    const second = fakeShortcut({ id: "page-scoped-r", combo: { key: "r" } });
    expect(resolveShortcutMatch([first, second], fakeEvent({ key: "r" }), false)).toBe(second);
  });

  it("skips a bare-key shortcut while typing (WCAG 2.1.4), but still finds an earlier meta-modified match", () => {
    const bareKey = fakeShortcut({ id: "bare-r", combo: { key: "r" } });
    const metaKey = fakeShortcut({ id: "meta-k", combo: { key: "k", meta: true } });
    expect(resolveShortcutMatch([metaKey, bareKey], fakeEvent({ key: "r" }), true)).toBeNull();
    expect(resolveShortcutMatch([metaKey, bareKey], fakeEvent({ key: "k", metaKey: true }), true)).toBe(metaKey);
  });

  it("does not skip a meta-modified shortcut while typing", () => {
    const metaKey = fakeShortcut({ id: "meta-s", combo: { key: "s", meta: true } });
    expect(resolveShortcutMatch([metaKey], fakeEvent({ key: "s", metaKey: true }), true)).toBe(metaKey);
  });

  it("returns null for an empty shortcut list", () => {
    expect(resolveShortcutMatch([], fakeEvent({ key: "r" }), false)).toBeNull();
  });
});
