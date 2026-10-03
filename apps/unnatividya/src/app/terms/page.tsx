export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import type { Metadata } from "next";
import { LegalPageLayout } from "@/components/legal-page-layout";

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
      "Fees, eligibility, approvals, curriculum, and admission details are collected from source pages and CMS review. Where our page and the university's own page disagree, the university's page governs. Learners should verify final admission, fee, refund, and eligibility details directly with the relevant university before making payment or enrollment decisions.",
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
  return <PublishedCatalogBoundary>{(
    <LegalPageLayout crumb="Terms" title="Terms of Use" lastUpdated="12 August 2026" sections={sections.map((section, index) => ({ id: `policy-section-${index + 1}`, title: section.title }))}>
      <p style={{ fontSize: 15, lineHeight: 1.7, margin: 0 }}>
        These terms describe the basic rules for using the Unnati Vidya website and its
        counselling and comparison services.
      </p>
      {sections.map((section, index) => (
        <section key={section.title} aria-labelledby={`policy-section-${index + 1}`}>
          <h2 id={`policy-section-${index + 1}`} tabIndex={-1} style={{ fontSize: 20, fontWeight: 700, color: "#363634", margin: "28px 0 8px" }}>{section.title}</h2>
          <p style={{ fontSize: 15, lineHeight: 1.7, margin: 0 }}>{section.copy}</p>
        </section>
      ))}
    </LegalPageLayout>
  )}</PublishedCatalogBoundary>;
}
