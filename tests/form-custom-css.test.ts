import { describe, expect, it } from "vitest";
import { safeFormCss } from "@/lib/forms/custom-css";

describe("safeFormCss", () => {
  it("leaves ordinary CSS alone", () => {
    const css = ".form-theme-default { --primary: #0a7; } input > label { color: red; }";
    expect(safeFormCss(css)).toBe(css);
  });

  it("can't close the style element", () => {
    const css = "body{}</style><script>alert(1)</script>";
    const safe = safeFormCss(css);
    expect(safe).not.toContain("<");
    expect(safe).toBe("body{}\\3C /style>\\3C script>alert(1)\\3C /script>");
  });

  it("handles missing CSS", () => {
    expect(safeFormCss(undefined)).toBe("");
    expect(safeFormCss(null)).toBe("");
  });
});
