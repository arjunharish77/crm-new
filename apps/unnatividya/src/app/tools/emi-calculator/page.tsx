export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { EmiCalculator } from "@/components/emi-calculator";
import { FaqAccordion } from "@/components/faq-accordion";
import { withSocial } from "@/lib/page-metadata";

const SITE_URL = process.env.NEXT_PUBLIC_UNNATIVIDYA_SITE_URL || "https://unnatividya.com";

export const metadata: Metadata = withSocial({
  title: "Online Degree EMI Calculator",
  description: "Estimate monthly repayments, interest and overall payment for an online degree using your fee, down payment, repayment period and annual interest rate.",
  alternates: { canonical: "/tools/emi-calculator" },
});

const FAQS: Array<[string, string]> = [
  [
    "Is the EMI shown here exact, or just an estimate?",
    "It's an estimate using the standard reducing-balance EMI formula (or loan amount ÷ repayment months when you set the rate to 0%). Actual approval, processing fees, and available tenures depend on the lender and your admission cycle.",
  ],
  [
    "What interest rate should I use?",
    "Enter the annual interest rate quoted by your lender. The default 0% is an interest-free scenario, not confirmation of an available offer. The calculator accepts rates from 0% to 50%.",
  ],
  [
    "What EMI tenures can I choose from?",
    "Enter a whole number from 1 to 120 months. Course duration and loan repayment period are different; confirm the available term with your lender.",
  ],
  [
    "How does the down payment affect the estimate?",
    "It reduces the loan amount the EMI is calculated on — principal is the total fee minus your down payment. A larger down payment means a smaller loan and a lower EMI at the same tenure and rate.",
  ],
  [
    "Will I be charged a processing fee?",
    "Possibly — processing fees depend on the lender and your admission cycle, not on this calculator. Confirm charges directly with the lender before committing. They are excluded unless you include them in the amount entered.",
  ],
  [
    "Does picking a program from the dropdown auto-fill the correct fee?",
    "Selecting a program fills its listed INR tuition or a published INR applicant-category amount without changing your repayment period. It is not a live university quote; confirm current tuition and any additional charges. Editing the fee switches back to manual entry.",
  ],
  [
    "Can I use an NRI or international fee in US dollars here?",
    "No. This calculator estimates INR loan repayments and never converts a USD university fee to rupees. Use the total cost planner to view the published amount in its original currency, then ask a lender for a separate INR quote if needed.",
  ],
];

export default function EmiCalculatorPage() {
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "EMI Calculator", item: `${SITE_URL}/tools/emi-calculator` },
    ],
  };
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })),
  };

  return <PublishedCatalogBoundary>{(
    <>
      <JsonLd data={[breadcrumbJsonLd, faqJsonLd]} />
      <section className="uv-page-hero uvt-page-hero" aria-labelledby="emi-title">
        <div className="uv-page-hero-inner">
          <ol className="uv-breadcrumb" aria-label="Breadcrumb">
            <li><Link href="/">Home</Link></li>
            <li><span>Tools</span></li>
            <li><span aria-current="page">EMI calculator</span></li>
          </ol>
          <h1 id="emi-title" className="uv-h1">Online degree EMI calculator</h1>
          <p className="uv-lede">Choose a listed program or enter your own fee. See monthly repayments, interest and the overall payment including your down payment.</p>
        </div>
      </section>
      <div className="uv-shell uvt-page">
        <EmiCalculator />
        <div className="uvt-faq">
          <FaqAccordion items={FAQS} name="emi-faq" title="EMI questions" subtitle="How the estimate works and what to confirm with your lender." id="sec-faq" />
        </div>
      </div>
    </>
  )}</PublishedCatalogBoundary>;
}
