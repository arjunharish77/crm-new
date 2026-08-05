import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "Terms for using the Unnati Vidya online degree discovery and enquiry website.",
  alternates: { canonical: "/terms" },
};

const sections = [
  {
    title: "Use of the website",
    copy:
      "Unnati Vidya helps learners discover and compare online degree programs. The website is an information and enquiry platform, not a university, awarding body, or admission guarantee.",
  },
  {
    title: "Course and university information",
    copy:
      "Fees, eligibility, approvals, curriculum, and admission details are collected from source pages and CMS review. Learners should verify final admission, fee, refund, and eligibility details directly with the relevant university before making payment or enrollment decisions.",
  },
  {
    title: "Enquiries and counselling",
    copy:
      "Submitting an enquiry allows Unnati Vidya or its authorized counselling process to contact you using the details and consent you provide. Submitting a form does not guarantee admission, scholarship, fee waiver, or seat availability.",
  },
  {
    title: "User responsibility",
    copy:
      "You agree to provide accurate contact and academic information, avoid misuse of OTP or lead forms, and not attempt unauthorized access to the CMS, API, database, or integrations.",
  },
  {
    title: "Limitation",
    copy:
      "Unnati Vidya is not liable for changes made by universities, including fee changes, admission rule changes, program availability, refund outcomes, or policy updates after information was reviewed.",
  },
];

export default function TermsPage() {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px 64px", flex: 1 }}>
      <div style={{ fontSize: 12, color: "#707070", marginBottom: 8 }}>
        <Link href="/" style={{ color: "#707070" }}>Home</Link> &gt; Terms
      </div>
      <h1 style={{ fontSize: 30, fontWeight: 700, color: "#363634", margin: "0 0 24px" }}>Terms of Use</h1>
      <p style={{ fontSize: 15, lineHeight: 1.7, margin: 0 }}>
          These terms describe the basic rules for using the Unnati Vidya website and its
          counselling and comparison services.
      </p>
      {sections.map((section) => (
        <section key={section.title}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#363634", margin: "28px 0 8px" }}>{section.title}</h2>
          <p style={{ fontSize: 15, lineHeight: 1.7, margin: 0 }}>{section.copy}</p>
        </section>
      ))}
      <div style={{ marginTop: 36, background: "#F4F3FC", border: "1px solid #CFDAE6", borderRadius: 8, padding: 20, fontSize: 14 }}>
        Questions? Call <b style={{ color: "#363634" }}>1800-120-4050</b> (toll-free, 9 am – 9 pm) or use the callback button on any page.
      </div>
    </main>
  );
}
