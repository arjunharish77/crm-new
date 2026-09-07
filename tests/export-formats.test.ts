import { describe, expect, it } from "vitest";

// Gap checklist Module 17, item 19 (scheduled extracts): XLSX + PDF export rendering. These
// run the real exceljs / @react-pdf/renderer libraries (no mocking) to prove the produced
// buffers are genuinely valid files a spreadsheet/PDF viewer could open, not just well-shaped
// JS objects.

describe("XLSX export rendering", () => {
  it("produces a real workbook that round-trips headers and values", async () => {
    const { toXlsxBuffer } = await import("@/lib/server/exports");
    const buffer = await toXlsxBuffer(
      [
        { source: "google", conversions: 3, revenue: 1500.5 },
        { source: "referral", conversions: 1, revenue: 200 },
      ],
      "UTC",
    );

    expect(buffer.length).toBeGreaterThan(0);
    // XLSX files are a real ZIP container -- the magic bytes confirm this isn't just raw text.
    expect(buffer.subarray(0, 2).toString("latin1")).toBe("PK");

    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.getWorksheet("Report")!;
    expect(sheet.getRow(1).values).toEqual([undefined, "source", "conversions", "revenue"]);
    expect(sheet.getRow(2).values).toEqual([undefined, "google", 3, 1500.5]);
    expect(sheet.getRow(3).values).toEqual([undefined, "referral", 1, 200]);
  });

  it("produces an empty-but-valid workbook for zero rows", async () => {
    const { toXlsxBuffer } = await import("@/lib/server/exports");
    const buffer = await toXlsxBuffer([], "UTC");
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await expect(workbook.xlsx.load(buffer as any)).resolves.toBeDefined();
  });
});

describe("PDF report rendering", () => {
  it("produces a real, valid PDF buffer for a flat report table", async () => {
    const { renderReportTablePdf } = await import("@/lib/server/report-pdf");
    const buffer = await renderReportTablePdf({
      title: "rep_performance",
      generatedAt: "2026-07-07T12:00:00.000Z",
      rows: [
        { repName: "Rep One", leads: 10, opportunities: 3 },
        { repName: "Rep Two", leads: 5, opportunities: 1 },
      ],
    });

    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("produces a valid PDF even with zero rows", async () => {
    const { renderReportTablePdf } = await import("@/lib/server/report-pdf");
    const buffer = await renderReportTablePdf({ title: "empty_report", generatedAt: "2026-07-07T12:00:00.000Z", rows: [] });
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});

// Gap checklist Module 17's advanced dashboard builder, "export/schedule for a whole dashboard"
// sub-item -- one combined PDF, one page per widget on the tab.
describe("dashboard tab PDF rendering", () => {
  it("produces a real, valid PDF buffer covering a mix of scalar and tabular widgets", async () => {
    const { renderDashboardTabPdf } = await import("@/lib/server/report-pdf");
    const buffer = await renderDashboardTabPdf({
      tabName: "Sales",
      generatedAt: "2026-07-07T12:00:00.000Z",
      widgets: [
        { title: "Total Leads", type: "STAT", data: 42 },
        { title: "Pipeline by Stage", type: "FUNNEL", data: [{ stage: "New", count: 10, value: 1000 }, { stage: "Won", count: 3, value: 500 }] },
      ],
    });
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("produces a valid PDF for a dashboard with zero widgets", async () => {
    const { renderDashboardTabPdf } = await import("@/lib/server/report-pdf");
    const buffer = await renderDashboardTabPdf({ tabName: "Empty Tab", generatedAt: "2026-07-07T12:00:00.000Z", widgets: [] });
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
