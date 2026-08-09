import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";

const SITE_URL = process.env.NEXT_PUBLIC_UNNATIVIDYA_SITE_URL || "https://unnatividya.com";

export const metadata: Metadata = {
  title: "How We Verify Our Data",
  description: "Unnati Vidya's editorial standards — how we source, verify, and flag online-degree fee, eligibility, career, and UGC-approval facts before publishing them.",
  alternates: { canonical: "/how-we-verify" },
};

const PRINCIPLES: Array<{ title: string; copy: string }> = [
  {
    title: "We prefer primary sources over marketing pages",
    copy:
      "Wherever possible, we verify facts against a primary, independent source rather than a university's own marketing page — for example, UGC-DEB entitlement status is checked directly against the official UGC-DEB \"Entitled Online\" list (deb.ugc.ac.in), not just a university's own \"UGC approved\" claim.",
  },
  {
    title: "We say explicitly when something is only a claim, not a verified fact",
    copy:
      "Career-outcome and salary figures are the clearest example: most placement percentages and salary ranges we found during research exist only on a university's own marketing page, or on a third-party aggregator site that isn't independently corroborated. Our career-scope guides say so directly — attributing each figure to its actual source — instead of presenting it as our own verified number.",
  },
  {
    title: "Every guide shows a 'last reviewed' date",
    copy:
      "Fees, eligibility rules, and approval status change by admission cycle. Every guide page states when it was last checked, so you know how current the information is before you rely on it.",
  },
  {
    title: "We flag inconsistencies instead of smoothing them over",
    copy:
      "When a university's own published pages disagree with each other — for example, differing minimum-percentage figures for the same program on different pages — we say so explicitly rather than picking one number and presenting it as settled.",
  },
  {
    title: "We don't publish thin or duplicated pages to inflate page count",
    copy:
      "Every comparison, eligibility, career-scope, and UGC-approval page on this site exists because we found a genuine, source-verified difference worth explaining — not because we swapped a variable in a template. Where two universities' programs don't differ in any meaningful way, we don't build a page pretending otherwise.",
  },
];

const FAQS: Array<[string, string]> = [
  [
    "How does Unnati Vidya verify UGC-DEB entitlement status?",
    "We check it directly against the official UGC-DEB \"Entitled Online\" list at deb.ugc.ac.in, not just a university's own \"UGC approved\" marketing claim. A university's own page is a starting point, not the final word.",
  ],
  [
    "Are the career-outcome and salary figures on this site independently verified?",
    "Not always, and we say so explicitly when they aren't. Most placement percentages and salary ranges we found during research exist only on a university's own marketing page or a third-party aggregator, without independent corroboration — our career-scope guides attribute each figure to its actual source rather than presenting it as our own verified number.",
  ],
  [
    "How do I know if a guide's information is still current?",
    "Every guide page states a \"last reviewed\" date, since fees, eligibility rules, and approval status change by admission cycle. Check that date before relying on a figure, and confirm anything time-sensitive with a counsellor.",
  ],
  [
    "What happens when a university's own pages contradict each other?",
    "We flag the inconsistency instead of quietly picking one number — for example, if two of a university's own pages show differing minimum-percentage eligibility figures for the same program, our guide says so directly rather than presenting one as settled fact.",
  ],
  [
    "Why doesn't Unnati Vidya have a comparison page for every possible pair of programs?",
    "Because we only publish a comparison, eligibility, career-scope, or UGC-approval page where we found a genuine, source-verified difference worth explaining. Swapping a variable into a template to inflate page count isn't something we do.",
  ],
];

export default function HowWeVerifyPage() {
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "How We Verify Our Data", item: `${SITE_URL}/how-we-verify` },
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
              <Link href="/">Home</Link> &gt; How We Verify Our Data
            </div>
            <h1 style={{ color: "#363634", fontSize: 28, fontWeight: 700, margin: 0 }}>How we verify our data</h1>
            <div style={{ color: "#696868", fontSize: 14, marginTop: 6 }}>
              Unnati Vidya is an aggregator, not a university — every fact we publish about a program has to earn its place.
            </div>
          </div>
        </div>

        <div className="container" style={{ paddingTop: 28, paddingBottom: 56, maxWidth: 760 }}>
          <p style={{ margin: "0 0 28px", color: "#555", fontSize: 15, lineHeight: 1.65 }}>
            We compare UGC-entitled online degrees from Manipal University Jaipur, Sikkim Manipal University, and Amity
            University Online. Because a wrong fee, eligibility rule, or approval claim can cost you real money and time,
            we hold ourselves to a specific, checkable process rather than just promising to &quot;do our best.&quot;
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {PRINCIPLES.map((principle) => (
              <section className="detail-section" key={principle.title}>
                <h2>{principle.title}</h2>
                <p style={{ margin: 0, color: "#555", fontSize: 15, lineHeight: 1.65 }}>{principle.copy}</p>
              </section>
            ))}
          </div>

          <section className="detail-section" style={{ marginTop: 8 }}>
            <h2>See it in practice</h2>
            <p style={{ margin: "0 0 12px", color: "#555", fontSize: 15, lineHeight: 1.65 }}>
              Our eligibility, career-scope, and UGC-approval guides are the clearest examples of this process — each one
              names its sources, flags what&apos;s unverified, and states when it was last checked.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Link href="/online-degree-guides/mba-eligibility" style={{ color: "#544CC8", fontWeight: 600, fontSize: 14 }}>Online MBA eligibility →</Link>
              <Link href="/online-degree-guides/mba-career-scope" style={{ color: "#544CC8", fontWeight: 600, fontSize: 14 }}>Online MBA career scope →</Link>
              <Link href="/online-degree-guides/mba-ugc-approval" style={{ color: "#544CC8", fontWeight: 600, fontSize: 14 }}>Is Online MBA UGC approved? →</Link>
            </div>
          </section>

          <section className="detail-section" style={{ marginTop: 8 }}>
            <h2>Frequently asked questions</h2>
            <div className="faq-list">
              {FAQS.map(([question, answer]) => (
                <details className="faq-item" name="verify-faq" key={question}>
                  <summary>{question}</summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </section>

          <div style={{ fontSize: 13, color: "#707070", marginTop: 28, paddingTop: 20, borderTop: "1px solid #EAEAEA" }}>
            Found something on this site that looks wrong or outdated? <Link href="/lead?intent=data-correction" data-open-lead style={{ color: "#544CC8", fontWeight: 600 }}>Tell us</Link> — we&apos;d rather fix it than leave it.
          </div>
        </div>
      </div>
    </>
  );
}
