import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageLayout } from "@/components/legal-page-layout";

export const metadata: Metadata = {
  title: "About",
  description: "Unnati Vidya is an independent marketplace for UGC-entitled online degrees.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <LegalPageLayout crumb="About" title="About Unnati Vidya" lastUpdated="12 August 2026">
      <p style={{ fontSize: 15, lineHeight: 1.7, margin: 0 }}>
        Unnati Vidya is an independent marketplace for UGC-entitled online degrees. We list programs from accredited universities, publish verified fees and placement data, and provide free counselling. Universities compensate us equally, so our recommendations carry no commission bias.
      </p>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "#363634", margin: "28px 0 8px" }}>Policies</h2>
      <p style={{ fontSize: 15, lineHeight: 1.7, margin: 0 }}>
        See our <Link href="/privacy">Privacy Policy</Link>, <Link href="/terms">Terms of Use</Link>, and <Link href="/refund-policy">Refund and Cancellation Policy</Link> for full details.
      </p>
    </LegalPageLayout>
  );
}
