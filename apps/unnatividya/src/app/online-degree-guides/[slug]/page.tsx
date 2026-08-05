import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { feeGuideFaqs, feeGuideIntro, feeGuides, formatFee, getFeeGuideBySlug } from "@/lib/fee-guides";

export function generateStaticParams() {
  return feeGuides().map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const guide = getFeeGuideBySlug(slug);
  if (!guide) return {};
  const title = guide.isComparison
    ? `${guide.label} Fees Compared Across Universities`
    : `${guide.label} Fees Explained`;
  const description = guide.isComparison
    ? `${guide.label} fees across ${guide.courses.length} UGC-entitled universities: ${formatFee(guide.lowestFee)} to ${formatFee(guide.highestFee)}, with EMI and duration for each.`
    : `${guide.label} fee breakdown at ${guide.courses[0].university.name}: total fee ${formatFee(guide.courses[0].fee)}, EMI, and scholarship options.`;
  return {
    title,
    description,
    alternates: { canonical: `/online-degree-guides/${slug}` },
  };
}

export default async function FeeGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = getFeeGuideBySlug(slug);
  if (!guide) notFound();
  const siteUrl = process.env.NEXT_PUBLIC_UNNATIVIDYA_SITE_URL || "https://unnatividya.com";
  const faqs = feeGuideFaqs(guide);
  const intro = feeGuideIntro(guide);

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "Online Degree Guides", item: `${siteUrl}/online-degree-guides` },
      { "@type": "ListItem", position: 3, name: `${guide.label} Fees`, item: `${siteUrl}/online-degree-guides/${guide.slug}` },
    ],
  };
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };

  return (
    <>
      <JsonLd data={[breadcrumbJsonLd, faqJsonLd]} />
      <div style={{ background: "#F7F8F9" }}>
        <div style={{ background: "#fff", borderBottom: "1px solid #EAEAEA" }}>
          <div className="container" style={{ paddingTop: 28, paddingBottom: 28 }}>
            <div className="breadcrumb" style={{ marginBottom: 8 }}>
              <Link href="/">Home</Link> &gt; <Link href="/online-degree-guides">Online Degree Guides</Link> &gt; {guide.label} Fees
            </div>
            <h1 style={{ color: "#363634", fontSize: 28, fontWeight: 700, margin: 0 }}>
              {guide.isComparison ? `${guide.label} fees compared across universities` : `${guide.label} fees explained`}
            </h1>
            <div style={{ color: "#696868", fontSize: 13, marginTop: 8 }}>Fees last reviewed: July 2026 admission cycle</div>
          </div>
        </div>

        <div className="container" style={{ paddingTop: 28, paddingBottom: 56, display: "grid", gridTemplateColumns: "1fr 300px", gap: 40 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <section className="detail-section">
              <p style={{ margin: 0, color: "#555", fontSize: 15, lineHeight: 1.65 }}>{intro}</p>
            </section>

            <section className="detail-section">
              <h2>{guide.isComparison ? "Fee, EMI, and duration by university" : "Fee and EMI breakdown"}</h2>
              <div style={{ border: "1px solid #CFDAE6", borderRadius: 8, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 0.9fr 1fr", background: "#F5F5F5", fontSize: 12, fontWeight: 700, color: "#696868", padding: "12px 18px", letterSpacing: 0.3 }}>
                  <span>UNIVERSITY</span><span>TOTAL FEE</span><span>EMI FROM</span><span>DURATION</span><span></span>
                </div>
                {guide.courses.map((course) => (
                  <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 0.9fr 1fr", padding: "14px 18px", borderTop: "1px solid #EAEAEA", fontSize: 14, alignItems: "center" }} key={course.id}>
                    <span style={{ fontWeight: 600, color: "#363634" }}>{course.university.name}</span>
                    <span style={{ fontWeight: 700, color: course.fee === guide.lowestFee ? "#2E7D32" : "#363634" }}>{formatFee(course.fee)}</span>
                    <span>{course.emi}</span>
                    <span>{course.duration}</span>
                    <Link href={`/courses/${course.slug}`} style={{ color: "#544CC8", fontWeight: 700, fontSize: 13 }}>View program</Link>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 13, color: "#707070", marginTop: 10 }}>
                All programs listed above are UGC-entitled online degrees. Confirm the current admission-cycle fee with a counsellor before you pay.
              </div>
            </section>

            {!guide.isComparison && guide.courses[0].scholarships?.length ? (
              <section className="detail-section">
                <h2>Scholarships available</h2>
                <div style={{ border: "1px solid #CFDAE6", borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1.2fr", background: "#F5F5F5", fontSize: 12, fontWeight: 700, color: "#696868", padding: "12px 18px", letterSpacing: 0.3 }}>
                    <span>CATEGORY</span><span>DISCOUNT</span><span>PROOF REQUIRED</span>
                  </div>
                  {guide.courses[0].scholarships.map((row) => (
                    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1.2fr", padding: "14px 18px", borderTop: "1px solid #EAEAEA", fontSize: 14, alignItems: "center" }} key={row[0]}>
                      <span style={{ fontWeight: 600, color: "#363634" }}>{row[0]}</span>
                      <span>{row[1]}</span>
                      <span style={{ color: "#707070", fontSize: 13 }}>{row[2]}</span>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 13, color: "#707070", marginTop: 10 }}>
                  Scholarship eligibility and proof requirements can change by admission cycle. See our <Link href="/refund-policy" style={{ color: "#544CC8" }}>refund policy</Link> for what happens if you discontinue after admission.
                </div>
              </section>
            ) : null}

            <section className="detail-section">
              <h2>Frequently asked questions</h2>
              <div className="faq-list">
                {faqs.map(([question, answer]) => (
                  <details className="faq-item" name="fee-guide-faq" key={question}>
                    <summary>{question}</summary>
                    <p>{answer}</p>
                  </details>
                ))}
              </div>
            </section>
          </div>

          <aside className="right-rail">
            <div style={{ background: "#fff", border: "1px solid #CFDAE6", borderRadius: 8, padding: 22, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#363634" }}>Get the exact fee breakup</div>
              <div style={{ fontSize: 13, color: "#696868", margin: "6px 0 14px", lineHeight: 1.5 }}>A counsellor will confirm the current fee, EMI plan, and scholarship eligibility for {guide.label}.</div>
              <Link href={`/lead?intent=fee-guide&course=${guide.key}`} className="btn primary" style={{ width: "100%", height: 44, fontSize: 15 }} data-open-lead>Ask a counsellor</Link>
              <div style={{ fontSize: 11, color: "#AAAAAA", marginTop: 10 }}>Free service · no spam · unbiased advice</div>
            </div>
            {guide.isComparison ? (
              <Link href={`/compare?add=${guide.courses[0].id}`} style={{ display: "block", textAlign: "center", border: "1.5px solid #555", borderRadius: 4, height: 44, lineHeight: "44px", fontSize: 14, fontWeight: 700, color: "#555", background: "#fff" }}>
                Compare {guide.label} side by side
              </Link>
            ) : null}
          </aside>
        </div>
      </div>
    </>
  );
}
