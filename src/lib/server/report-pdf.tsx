import React from "react";
import { Document, Page, View, Text, StyleSheet, renderToBuffer } from "@react-pdf/renderer";

// Gap checklist Module 17, item 4/19: dashboard/report PDF rendering. Reuses the exact
// @react-pdf/renderer + raw-PDF-fallback pattern already established in invoice-pdf.tsx --
// that library is a real, pre-existing dependency (partner invoices already render real PDFs
// with it), so this is wiring an existing capability to a new surface, not adding PDF support
// from scratch (a prior checklist note claiming "no PDF library exists anywhere in this
// codebase" was factually wrong, confirmed by direct check before writing this).

const MAX_ROWS = 200;
const MAX_COLUMNS = 8;

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: "Helvetica" },
  title: { fontSize: 16, fontWeight: 700, marginBottom: 4 },
  subtitle: { fontSize: 9, color: "#666", marginBottom: 16 },
  table: { borderTop: "1pt solid #ddd", borderBottom: "1pt solid #ddd" },
  headerRow: { flexDirection: "row", backgroundColor: "#f5f5f5", paddingVertical: 5, fontWeight: 700 },
  row: { flexDirection: "row", paddingVertical: 4, borderBottom: "1pt solid #eee" },
  cell: { flex: 1, paddingHorizontal: 3 },
  note: { marginTop: 10, fontSize: 8, color: "#999" },
});

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function ReportTableDocument({ title, generatedAt, rows }: { title: string; generatedAt: string; rows: Record<string, unknown>[] }) {
  const columns = rows.length ? Object.keys(rows[0]).slice(0, MAX_COLUMNS) : [];
  const visibleRows = rows.slice(0, MAX_ROWS);

  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>Generated {new Date(generatedAt).toLocaleString()}</Text>
        {columns.length ? (
          <View style={styles.table}>
            <View style={styles.headerRow}>
              {columns.map((column) => (
                <Text key={column} style={styles.cell}>
                  {column}
                </Text>
              ))}
            </View>
            {visibleRows.map((row, index) => (
              <View style={styles.row} key={index}>
                {columns.map((column) => (
                  <Text key={column} style={styles.cell}>
                    {cellText(row[column])}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        ) : (
          <Text>No data available for this report.</Text>
        )}
        {rows.length > MAX_ROWS || (rows.length && Object.keys(rows[0]).length > MAX_COLUMNS) ? (
          <Text style={styles.note}>
            Showing {Math.min(rows.length, MAX_ROWS)} of {rows.length} rows and up to {MAX_COLUMNS} columns. Use CSV/XLSX export for the full data.
          </Text>
        ) : null}
      </Page>
    </Document>
  );
}

function escapePdfText(value: unknown) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function renderFallbackPdf(title: string, generatedAt: string, rows: Record<string, unknown>[]) {
  const columns = rows.length ? Object.keys(rows[0]).slice(0, MAX_COLUMNS) : [];
  const lines = [
    title,
    `Generated ${new Date(generatedAt).toLocaleString()}`,
    "",
    columns.join(" | "),
    ...rows.slice(0, MAX_ROWS).map((row) => columns.map((column) => cellText(row[column])).join(" | ")),
  ];
  const textOperations = lines
    .slice(0, 55)
    .map((line, index) => `BT /F1 9 Tf 30 ${560 - index * 12} Td (${escapePdfText(line)}) Tj ET`)
    .join("\n");
  const stream = `${textOperations}\n`;
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}endstream\nendobj\n`,
  ];
  let offset = "%PDF-1.4\n".length;
  const xref = objects.map((object) => {
    const current = offset;
    offset += Buffer.byteLength(object, "utf8");
    return current;
  });
  const body = objects.join("");
  const xrefStart = Buffer.byteLength("%PDF-1.4\n", "utf8") + Buffer.byteLength(body, "utf8");
  const trailer = [
    "xref",
    `0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...xref.map((item) => `${String(item).padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefStart),
    "%%EOF",
    "",
  ].join("\n");
  return Buffer.from(`%PDF-1.4\n${body}${trailer}`, "utf8");
}

export async function renderReportTablePdf(props: { title: string; generatedAt: string; rows: Record<string, unknown>[] }): Promise<Buffer> {
  try {
    return await renderToBuffer(<ReportTableDocument {...props} />);
  } catch (error) {
    console.error("REPORT_TABLE_REACT_PDF_FAILED", error);
    return renderFallbackPdf(props.title, props.generatedAt, props.rows);
  }
}

// Gap checklist Module 17's advanced dashboard builder, "export/schedule for a whole dashboard"
// sub-item -- per explicit user direction, one combined PDF (not a scheduled digest email).
// "Dashboard" here is a DashboardTab (see the versioning bullet's own note on this) -- one page
// per widget currently on that tab, in the same combined document, reusing this file's existing
// table styles rather than inventing a second visual language.
export type DashboardPdfWidget = { title: string; type: string; data: unknown };

function widgetRowsFrom(data: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  return null;
}

function DashboardTabDocument({ tabName, generatedAt, widgets }: { tabName: string; generatedAt: string; widgets: DashboardPdfWidget[] }) {
  return (
    <Document>
      {widgets.length === 0 ? (
        <Page size="A4" orientation="landscape" style={styles.page}>
          <Text style={styles.title}>{tabName}</Text>
          <Text style={styles.subtitle}>Generated {new Date(generatedAt).toLocaleString()}</Text>
          <Text>This dashboard has no widgets yet.</Text>
        </Page>
      ) : (
        widgets.map((widget, index) => {
          const rows = widgetRowsFrom(widget.data);
          const columns = rows?.length ? Object.keys(rows[0]).slice(0, MAX_COLUMNS) : [];
          const visibleRows = rows ? rows.slice(0, MAX_ROWS) : [];
          return (
            <Page key={index} size="A4" orientation="landscape" style={styles.page}>
              <Text style={styles.title}>{tabName}</Text>
              <Text style={styles.subtitle}>
                {widget.title} ({widget.type}) &middot; Generated {new Date(generatedAt).toLocaleString()}
              </Text>
              {rows === null ? (
                <Text>Value: {cellText(widget.data)}</Text>
              ) : columns.length ? (
                <View style={styles.table}>
                  <View style={styles.headerRow}>
                    {columns.map((column) => (
                      <Text key={column} style={styles.cell}>
                        {column}
                      </Text>
                    ))}
                  </View>
                  {visibleRows.map((row, rowIndex) => (
                    <View style={styles.row} key={rowIndex}>
                      {columns.map((column) => (
                        <Text key={column} style={styles.cell}>
                          {cellText(row[column])}
                        </Text>
                      ))}
                    </View>
                  ))}
                </View>
              ) : (
                <Text>No data available for this widget.</Text>
              )}
              {rows && rows.length > MAX_ROWS ? (
                <Text style={styles.note}>Showing {MAX_ROWS} of {rows.length} rows.</Text>
              ) : null}
            </Page>
          );
        })
      )}
    </Document>
  );
}

function renderFallbackDashboardPdf(tabName: string, generatedAt: string, widgets: DashboardPdfWidget[]) {
  const lines = [
    tabName,
    `Generated ${new Date(generatedAt).toLocaleString()}`,
    "",
    ...widgets.flatMap((widget) => {
      const rows = widgetRowsFrom(widget.data);
      const header = `${widget.title} (${widget.type})`;
      if (rows === null) return [header, `  Value: ${cellText(widget.data)}`, ""];
      const columns = rows.length ? Object.keys(rows[0]).slice(0, MAX_COLUMNS) : [];
      return [header, `  ${columns.join(" | ")}`, ...rows.slice(0, MAX_ROWS).map((row) => `  ${columns.map((column) => cellText(row[column])).join(" | ")}`), ""];
    }),
  ];
  const textOperations = lines
    .slice(0, 55)
    .map((line, index) => `BT /F1 9 Tf 30 ${560 - index * 12} Td (${escapePdfText(line)}) Tj ET`)
    .join("\n");
  const stream = `${textOperations}\n`;
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}endstream\nendobj\n`,
  ];
  let offset = "%PDF-1.4\n".length;
  const xref = objects.map((object) => {
    const current = offset;
    offset += Buffer.byteLength(object, "utf8");
    return current;
  });
  const body = objects.join("");
  const xrefStart = Buffer.byteLength("%PDF-1.4\n", "utf8") + Buffer.byteLength(body, "utf8");
  const trailer = [
    "xref",
    `0 ${objects.length + 1}`,
    "0000000000 65535 f ",
    ...xref.map((item) => `${String(item).padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefStart),
    "%%EOF",
    "",
  ].join("\n");
  return Buffer.from(`%PDF-1.4\n${body}${trailer}`, "utf8");
}

export async function renderDashboardTabPdf(props: { tabName: string; generatedAt: string; widgets: DashboardPdfWidget[] }): Promise<Buffer> {
  try {
    return await renderToBuffer(<DashboardTabDocument {...props} />);
  } catch (error) {
    console.error("DASHBOARD_TAB_REACT_PDF_FAILED", error);
    return renderFallbackDashboardPdf(props.tabName, props.generatedAt, props.widgets);
  }
}
