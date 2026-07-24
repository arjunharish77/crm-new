import React from "react";
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { formatTenantDate } from "@/lib/server/date-format";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  logo: { width: 100, height: 40, objectFit: "contain" },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 4 },
  section: { marginBottom: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  label: { color: "#666", fontSize: 8, textTransform: "uppercase", marginBottom: 2 },
  value: { fontSize: 10 },
  table: { borderTop: "1pt solid #ddd", borderBottom: "1pt solid #ddd", marginTop: 8 },
  tableRow: { flexDirection: "row", paddingVertical: 6, borderBottom: "1pt solid #eee" },
  tableHeader: { flexDirection: "row", paddingVertical: 6, backgroundColor: "#f5f5f5", fontWeight: 700 },
  colDescription: { flex: 3 },
  colHsn: { flex: 1, textAlign: "center" },
  colAmount: { flex: 1, textAlign: "right" },
  totalsBlock: { marginTop: 12, alignItems: "flex-end" },
  totalsRow: { flexDirection: "row", width: 220, justifyContent: "space-between", marginBottom: 3 },
  grandTotal: { fontSize: 12, fontWeight: 700 },
  footer: { marginTop: 30, fontSize: 9, color: "#666" },
  gstBadge: { fontSize: 9, color: "#666", marginTop: 4 },
});

type InvoicePdfProps = {
  invoice: {
    invoiceNumber: string;
    invoiceDate: string;
    supplierSnapshot: { legalBusinessName: string; gstin: string | null; registeredAddress: any; registeredState: string | null };
    recipientSnapshot: { companyLegalName: string; companyGstin: string | null; companyAddress: any; companyState: string | null };
    lineItems: Array<{ description: string; hsnSac: string | null; amount: number }>;
    taxableValue: number;
    cgstAmount: number;
    sgstAmount: number;
    igstAmount: number;
    totalAmount: number;
    isGstInvoice: boolean;
  };
  cycleLabel: string;
  template: { logoUrl?: string | null; footerNotes?: string | null; signatoryName?: string | null } | null;
};

function formatAddress(address: any) {
  if (!address || typeof address !== "object") return "";
  return [address.line1, address.line2, address.city, address.pincode].filter(Boolean).join(", ");
}

function formatMoney(value: unknown) {
  return Number(value ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 });
}

function parseJsonValue<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return (value ?? fallback) as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeInvoicePdfProps(props: InvoicePdfProps): InvoicePdfProps {
  const supplierSnapshot = parseJsonValue(props.invoice.supplierSnapshot, props.invoice.supplierSnapshot);
  const recipientSnapshot = parseJsonValue(props.invoice.recipientSnapshot, props.invoice.recipientSnapshot);
  const lineItems = parseJsonValue(props.invoice.lineItems, []);

  return {
    ...props,
    invoice: {
      ...props.invoice,
      supplierSnapshot,
      recipientSnapshot,
      lineItems: Array.isArray(lineItems) ? lineItems : [],
      taxableValue: Number(props.invoice.taxableValue ?? 0),
      cgstAmount: Number(props.invoice.cgstAmount ?? 0),
      sgstAmount: Number(props.invoice.sgstAmount ?? 0),
      igstAmount: Number(props.invoice.igstAmount ?? 0),
      totalAmount: Number(props.invoice.totalAmount ?? 0),
    },
  };
}

function escapePdfText(value: unknown) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function renderFallbackPdf({ invoice, cycleLabel }: InvoicePdfProps) {
  const lines = [
    invoice.isGstInvoice ? "Tax Invoice" : "Receipt (Non-GST)",
    `Invoice #${invoice.invoiceNumber}`,
    `Date: ${formatTenantDate(invoice.invoiceDate)}`,
    `Cycle: ${cycleLabel}`,
    "",
    "Supplier (Partner)",
    invoice.supplierSnapshot.legalBusinessName,
    formatAddress(invoice.supplierSnapshot.registeredAddress),
    `State: ${invoice.supplierSnapshot.registeredState ?? "-"}`,
    invoice.supplierSnapshot.gstin ? `GSTIN: ${invoice.supplierSnapshot.gstin}` : "Unregistered - no GSTIN",
    "",
    "Recipient",
    invoice.recipientSnapshot.companyLegalName,
    formatAddress(invoice.recipientSnapshot.companyAddress),
    `State: ${invoice.recipientSnapshot.companyState ?? "-"}`,
    invoice.recipientSnapshot.companyGstin ? `GSTIN: ${invoice.recipientSnapshot.companyGstin}` : "",
    "",
    "Line Items",
    ...(invoice.lineItems.length
      ? invoice.lineItems.map((item) => `${item.description} | ${item.hsnSac ?? "-"} | INR ${formatMoney(item.amount)}`)
      : ["No ledger line items attached"]),
    "",
    `Taxable Value: INR ${formatMoney(invoice.taxableValue)}`,
    `CGST: INR ${formatMoney(invoice.cgstAmount)}`,
    `SGST: INR ${formatMoney(invoice.sgstAmount)}`,
    `IGST: INR ${formatMoney(invoice.igstAmount)}`,
    `Total: INR ${formatMoney(invoice.totalAmount)}`,
  ].filter((line) => line !== null && line !== undefined);

  const textOperations = lines
    .slice(0, 42)
    .map((line, index) => `BT /F1 10 Tf 40 ${790 - index * 16} Td (${escapePdfText(line)}) Tj ET`)
    .join("\n");
  const stream = `${textOperations}\n`;
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
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

function InvoiceDocument({ invoice, cycleLabel, template }: InvoicePdfProps) {
  const { supplierSnapshot, recipientSnapshot } = invoice;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{invoice.isGstInvoice ? "Tax Invoice" : "Receipt (Non-GST)"}</Text>
            <Text style={styles.value}>Invoice #{invoice.invoiceNumber}</Text>
            <Text style={styles.value}>Date: {formatTenantDate(invoice.invoiceDate)}</Text>
            <Text style={styles.value}>Cycle: {cycleLabel}</Text>
          </View>
          {template?.logoUrl ? <Image src={template.logoUrl} style={styles.logo} /> : <View style={styles.logo} />}
        </View>

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Supplier (Partner)</Text>
            <Text style={styles.value}>{supplierSnapshot.legalBusinessName}</Text>
            <Text style={styles.value}>{formatAddress(supplierSnapshot.registeredAddress)}</Text>
            <Text style={styles.value}>State: {supplierSnapshot.registeredState ?? "-"}</Text>
            <Text style={styles.gstBadge}>
              {supplierSnapshot.gstin ? `GSTIN: ${supplierSnapshot.gstin}` : "Unregistered — no GSTIN"}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Recipient</Text>
            <Text style={styles.value}>{recipientSnapshot.companyLegalName}</Text>
            <Text style={styles.value}>{formatAddress(recipientSnapshot.companyAddress)}</Text>
            <Text style={styles.value}>State: {recipientSnapshot.companyState ?? "-"}</Text>
            <Text style={styles.gstBadge}>{recipientSnapshot.companyGstin ? `GSTIN: ${recipientSnapshot.companyGstin}` : " "}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colDescription}>Description</Text>
            <Text style={styles.colHsn}>HSN/SAC</Text>
            <Text style={styles.colAmount}>Amount</Text>
          </View>
          {invoice.lineItems.map((item, index) => (
            <View style={styles.tableRow} key={index}>
              <Text style={styles.colDescription}>{item.description}</Text>
              <Text style={styles.colHsn}>{item.hsnSac ?? "-"}</Text>
              <Text style={styles.colAmount}>{formatMoney(item.amount)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text>Taxable Value</Text>
            <Text>{formatMoney(invoice.taxableValue)}</Text>
          </View>
          {invoice.isGstInvoice ? (
            <View>
              <View style={styles.totalsRow}>
                <Text>CGST</Text>
                <Text>{formatMoney(invoice.cgstAmount)}</Text>
              </View>
              <View style={styles.totalsRow}>
                <Text>SGST</Text>
                <Text>{formatMoney(invoice.sgstAmount)}</Text>
              </View>
              <View style={styles.totalsRow}>
                <Text>IGST</Text>
                <Text>{formatMoney(invoice.igstAmount)}</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.gstBadge}>No GST applicable — unregistered supplier</Text>
          )}
          <View style={[styles.totalsRow, { marginTop: 6, borderTop: "1pt solid #ccc", paddingTop: 6 }]}>
            <Text style={styles.grandTotal}>Total</Text>
            <Text style={styles.grandTotal}>{formatMoney(invoice.totalAmount)}</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={{ marginBottom: 8 }}>{template?.footerNotes ?? " "}</Text>
          <Text>
            {template?.signatoryName
              ? `For ${supplierSnapshot.legalBusinessName}, Authorized Signatory: ${template.signatoryName}`
              : " "}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderPartnerInvoicePdf(props: InvoicePdfProps): Promise<Buffer> {
  const normalizedProps = normalizeInvoicePdfProps(props);
  try {
    return await renderToBuffer(<InvoiceDocument {...normalizedProps} />);
  } catch (error) {
    console.error("PARTNER_INVOICE_REACT_PDF_FAILED", error);
    return renderFallbackPdf(normalizedProps);
  }
}
