import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { EmiCalculator } from "@/components/emi-calculator";

const SITE_URL = process.env.NEXT_PUBLIC_UNNATIVIDYA_SITE_URL || "https://unnatividya.com";

export const metadata: Metadata = {
  title: "Online Degree EMI Calculator",
  description: "Calculate the no-cost EMI for any UGC-entitled online MBA, BBA, BCA, MCA, BCom, MCom, BA, or MA program listed on Unnati Vidya.",
  alternates: { canonical: "/tools/emi-calculator" },
};

const FAQS: Array<[string, string]> = [
  [
    "Is the EMI shown here exact, or just an estimate?",
    "It's a simple no-cost EMI estimate — total fee divided by tenure, at 0% interest — matching the EMI structure our listed universities publish on their own program pages. Actual approval, any processing fee, and available tenures depend on the lender and your admission cycle.",
  ],
  [
    "Do I pay any interest on this EMI?",
    "The calculator assumes a no-cost EMI (0% interest), which is the standard structure universities offer through their finance partners. Confirm the exact terms with a counsellor before you commit, since lender approval isn't guaranteed for every applicant.",
  ],
  [
    "What EMI tenures can I choose from?",
    "6, 12, 18, 24, or 36 months. Longer tenures lower your monthly EMI but don't change the total fee, since this is a no-cost (0% interest) structure.",
  ],
  [
    "Will I be charged a processing fee?",
    "Possibly — processing fees depend on the lender and your admission cycle, not on this calculator. Ask a counsellor to confirm the exact fee before you pay.",
  ],
  [
    "Does picking a program from the dropdown auto-fill the correct fee?",
    "Yes — selecting any program from our catalog fills in its actual total fee automatically, so you don't need to know the exact figure to get a useful estimate.",
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

  return (
    <>
      <JsonLd data={[breadcrumbJsonLd, faqJsonLd]} />
      <div style={{ background: "#F7F8F9" }}>
        <div style={{ background: "#fff", borderBottom: "1px solid #EAEAEA" }}>
          <div className="container" style={{ paddingTop: 28, paddingBottom: 28 }}>
            <div className="breadcrumb" style={{ marginBottom: 8 }}>
              <Link href="/">Home</Link> &gt; EMI Calculator
            </div>
            <h1 style={{ color: "#363634", fontSize: 28, fontWeight: 700, margin: 0 }}>Online degree EMI calculator</h1>
            <div style={{ color: "#696868", fontSize: 14, marginTop: 6 }}>
              Estimate the monthly no-cost EMI for any program in our catalog, or enter a fee manually.
            </div>
          </div>
        </div>

        <div className="container" style={{ paddingTop: 28, paddingBottom: 56 }}>
          <EmiCalculator />
          <section className="detail-section" style={{ marginTop: 32 }}>
            <h2>Frequently asked questions</h2>
            <div className="faq-list">
              {FAQS.map(([question, answer]) => (
                <details className="faq-item" name="emi-faq" key={question}>
                  <summary>{question}</summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
