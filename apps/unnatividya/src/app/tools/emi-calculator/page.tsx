import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { EmiCalculator } from "@/components/emi-calculator";
import { StickyMobileBar } from "@/components/sticky-mobile-bar";

const SITE_URL = process.env.NEXT_PUBLIC_UNNATIVIDYA_SITE_URL || "https://unnatividya.com";

export const metadata: Metadata = {
  title: "Online Degree EMI Calculator",
  description: "Calculate the no-cost EMI for any UGC-entitled online MBA, BBA, BCA, MCA, BCom, MCom, BA, or MA program listed on Unnati Vidya.",
  alternates: { canonical: "/tools/emi-calculator" },
};

const FAQS: Array<[string, string]> = [
  [
    "Is the EMI shown here exact, or just an estimate?",
    "It's an estimate using the standard reducing-balance EMI formula (or a simple fee ÷ tenure split when you set the rate to 0%). Actual approval, processing fees, and available tenures depend on the lender and your admission cycle.",
  ],
  [
    "What interest rate should I use?",
    "Set it to 0% to model the no-cost EMI plans our listed universities publish on their own program pages — that's the default. Move the slider up to 16% to model a standard education loan instead, if that's what you're comparing against.",
  ],
  [
    "What EMI tenures can I choose from?",
    "6 to 48 months, in steps of 3. Longer tenures lower your monthly EMI but increase total interest paid whenever the rate is above 0%.",
  ],
  [
    "What does the down payment slider do?",
    "It reduces the loan amount the EMI is calculated on — principal is the total fee minus your down payment. A larger down payment means a smaller loan and a lower EMI at the same tenure and rate.",
  ],
  [
    "Will I be charged a processing fee?",
    "Possibly — processing fees depend on the lender and your admission cycle, not on this calculator. Ask a counsellor to confirm the exact fee before you pay.",
  ],
  [
    "Does picking a program from the dropdown auto-fill the correct fee?",
    "Yes — selecting any program from our catalog fills in its actual total fee and typical tenure automatically, so you don't need to know the exact figures to get a useful estimate.",
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
              Pick a real program from the catalog, or enter your own numbers. No-cost EMI means 0% interest — the rate
              slider only matters if you&apos;re modelling a standard education loan instead.
            </div>
          </div>
        </div>

        <EmiCalculator />
        <div className="container" style={{ paddingBottom: 56 }}>
          <section className="detail-section" style={{ marginTop: 8 }}>
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
      <StickyMobileBar primary={{ label: "Get exact loan terms", href: "/lead?intent=emi-calculator", openLead: true }} />
    </>
  );
}
