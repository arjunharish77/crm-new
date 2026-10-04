import { describe, expect, it } from "vitest";
import { MAX_ATTACHMENT_BYTES, base64DecodedLength, checkAttachment, safeFileName } from "@/lib/storage/attachment-policy";

describe("attachment policy (round-2 plan S7)", () => {
  it("reduces a name to a safe base name", () => {
    expect(safeFileName("../../../../exports/tenant-b/invoice.pdf")).toBe("invoice.pdf");
    expect(safeFileName("..\\..\\windows\\evil.pdf")).toBe("evil.pdf");
    expect(safeFileName("/abs/path/report.pdf")).toBe("report.pdf");
    expect(safeFileName(".hidden.pdf")).toBe("hidden.pdf");
    expect(safeFileName("na\u0000me<>|?.pdf")).toBe("name----.pdf");
    expect(safeFileName("")).toBe("file");
    expect(safeFileName("Résumé final.docx")).toBe("Résumé final.docx");
    expect(safeFileName(`${"a".repeat(200)}.pdf`)).toHaveLength(120);
    expect(safeFileName(`${"a".repeat(200)}.pdf`).endsWith(".pdf")).toBe(true);
  });

  it("accepts allowed types with the type taken from the extension", () => {
    expect(checkAttachment("Marksheet.PDF", 1000)).toEqual({ ok: true, fileName: "Marksheet.PDF", contentType: "application/pdf" });
  });

  it("refuses pages, scripts, unknown types, empty and oversize files", () => {
    expect(checkAttachment("x.html", 10)).toMatchObject({ ok: false, reason: "TYPE_NOT_ALLOWED" });
    expect(checkAttachment("x.svg", 10)).toMatchObject({ ok: false, reason: "TYPE_NOT_ALLOWED" });
    expect(checkAttachment("x.js", 10)).toMatchObject({ ok: false, reason: "TYPE_NOT_ALLOWED" });
    expect(checkAttachment("noextension", 10)).toMatchObject({ ok: false, reason: "TYPE_NOT_ALLOWED" });
    expect(checkAttachment("x.pdf", 0)).toMatchObject({ ok: false, reason: "EMPTY" });
    expect(checkAttachment("x.pdf", MAX_ATTACHMENT_BYTES + 1)).toMatchObject({ ok: false, reason: "TOO_LARGE" });
  });

  it("works out the decoded size of base64", () => {
    expect(base64DecodedLength(Buffer.from("hello world").toString("base64"))).toBe(11);
    expect(base64DecodedLength(Buffer.from("hi").toString("base64"))).toBe(2);
  });
});
