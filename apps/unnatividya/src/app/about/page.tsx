import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About",
  description: "Unnati Vidya is an independent marketplace for UGC-entitled online degrees.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <section style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px 64px", flex: 1 }}>
      <div style={{ fontSize: 12, color: "#707070", marginBottom: 8 }}>
        <Link href="/" style={{ color: "#707070" }}>Home</Link> &gt; About
      </div>
      <h1 style={{ fontSize: 30, fontWeight: 700, color: "#363634", margin: "0 0 24px" }}>About Unnati Vidya</h1>
      <p style={{ fontSize: 15, lineHeight: 1.7, margin: 0 }}>
        Unnati Vidya is an independent marketplace for UGC-entitled online degrees. We list programs from accredited universities, publish verified fees and placement data, and provide free counselling. Universities compensate us equally, so our recommendations carry no commission bias.
      </p>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "#363634", margin: "28px 0 8px" }}>Policies</h2>
      <p style={{ fontSize: 15, lineHeight: 1.7, margin: 0 }}>
        See our <Link href="/privacy">Privacy Policy</Link>, <Link href="/terms">Terms of Use</Link>, and <Link href="/refund-policy">Refund and Cancellation Policy</Link> for full details.
      </p>
      <div style={{ marginTop: 36, background: "#F4F3FC", border: "1px solid #CFDAE6", borderRadius: 8, padding: 20, fontSize: 14 }}>
        Questions? Call <b style={{ color: "#363634" }}>1800-120-4050</b> (toll-free, 9 am – 9 pm) or use the callback button on any page.
      </div>
    </section>
  );
}
