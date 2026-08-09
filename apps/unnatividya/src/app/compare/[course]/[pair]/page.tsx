import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { allComparisonPairs, buildComparisonRows, comparisonFaqs, getComparisonPair } from "@/lib/comparisons";
import { getEligibilityGuideBySlug } from "@/data/guide-content";

const SITE_URL = process.env.NEXT_PUBLIC_UNNATIVIDYA_SITE_URL || "https://unnatividya.com";

export function generateStaticParams() {
  return allComparisonPairs().map((pair) => ({ course: pair.key, pair: pair.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ course: string; pair: string }> }): Promise<Metadata> {
  const { course, pair: pairSlug } = await params;
  const pair = getComparisonPair(course, pairSlug);
  if (!pair) return {};
  return {
    title: `${pair.label}: ${pair.left.university.shortName} vs ${pair.right.university.shortName} Compared`,
    description: `${pair.label} at ${pair.left.university.name} vs ${pair.right.university.name} — fees, eligibility, placement, and approvals compared side by side, from our own verified course catalog.`,
    alternates: { canonical: `/compare/${course}/${pairSlug}` },
  };
}

export default async function ComparisonPage({ params }: { params: Promise<{ course: string; pair: string }> }) {
  const { course, pair: pairSlug } = await params;
  const pair = getComparisonPair(course, pairSlug);
  if (!pair) notFound();

  const rows = buildComparisonRows([pair.left, pair.right]);
  const faqs = comparisonFaqs(pair);
  const eligibilityGuide = getEligibilityGuideBySlug(`${pair.key}-eligibility`);

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Compare", item: `${SITE_URL}/compare` },
      { "@type": "ListItem", position: 3, name: `${pair.label}: ${pair.left.university.shortName} vs ${pair.right.university.shortName}`, item: `${SITE_URL}/compare/${course}/${pairSlug}` },
    ],
  };
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })),
  };

  return (
    <>
      <JsonLd data={[breadcrumbJsonLd, faqJsonLd]} />
      <div style={{ background: "#F7F8F9" }}>
        <div style={{ background: "#fff", borderBottom: "1px solid #EAEAEA" }}>
          <div className="container" style={{ paddingTop: 28, paddingBottom: 28 }}>
            <div className="breadcrumb" style={{ marginBottom: 8 }}>
              <Link href="/">Home</Link> &gt; <Link href="/compare">Compare</Link> &gt; {pair.left.university.shortName} vs {pair.right.university.shortName}
            </div>
            <h1 style={{ color: "#363634", fontSize: 28, fontWeight: 700, margin: 0 }}>
              {pair.label}: {pair.left.university.shortName} vs {pair.right.university.shortName}
            </h1>
            <div style={{ color: "#696868", fontSize: 13, marginTop: 8 }}>Compared using our own verified course catalog · last reviewed August 2026</div>
          </div>
        </div>

        <div className="container detail-layout">
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <section className="detail-section">
              <h2>Side-by-side comparison</h2>
              <div className="compare-table">
                <div className="compare-grid" style={{ gridTemplateColumns: "180px 1fr 1fr" }}>
                  <div className="compare-head">CRITERIA</div>
                  {[pair.left, pair.right].map((course) => (
                    <div className="compare-head compare-program" key={course.id}>
                      <strong>{course.name}</strong>
                      <small>{course.university.name}</small>
                    </div>
                  ))}
                  {rows.flatMap((row) => [
                    <div className="compare-cell compare-row-label" key={`${row.label}-label`}>{row.label}</div>,
                    ...row.cells.map((cell, index) => (
                      <div
                        className="compare-cell"
                        style={cell.best ? { fontWeight: 700, background: "rgba(46,125,50,0.08)" } : undefined}
                        key={`${row.label}-${index}`}
                      >
                        {cell.value}
                      </div>
                    )),
                  ])}
                </div>
              </div>
              <div style={{ fontSize: 13, color: "#707070", marginTop: 10 }}>
                Both programs are UGC-entitled online degrees with equal degree validity. A higher fee doesn&apos;t mean a better degree — it usually reflects university brand, placement support scale, and included learner services.
              </div>
            </section>

            <section className="detail-section">
              <h2>View each program in full</h2>
              <div style={{ display: "flex", gap: 12 }}>
                <Link href={`/courses/${pair.left.slug}`} style={{ flex: 1, textAlign: "center", border: "1.5px solid #544CC8", borderRadius: 4, height: 44, lineHeight: "44px", fontSize: 14, fontWeight: 700, color: "#544CC8" }}>
                  {pair.left.university.shortName} program page
                </Link>
                <Link href={`/courses/${pair.right.slug}`} style={{ flex: 1, textAlign: "center", border: "1.5px solid #544CC8", borderRadius: 4, height: 44, lineHeight: "44px", fontSize: 14, fontWeight: 700, color: "#544CC8" }}>
                  {pair.right.university.shortName} program page
                </Link>
              </div>
            </section>

            <section className="detail-section">
              <h2>Related guides</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Link href={`/online-degree-guides/${pair.key}-fees`} style={{ color: "#544CC8", fontWeight: 600, fontSize: 14 }}>{pair.label} fees →</Link>
                {eligibilityGuide ? (
                  <Link href={`/online-degree-guides/${pair.key}-eligibility`} style={{ color: "#544CC8", fontWeight: 600, fontSize: 14 }}>{pair.label} eligibility →</Link>
                ) : null}
              </div>
            </section>

            <section className="detail-section">
              <h2>Frequently asked questions</h2>
              <div className="faq-list">
                {faqs.map(([question, answer]) => (
                  <details className="faq-item" name="comparison-faq" key={question}>
                    <summary>{question}</summary>
                    <p>{answer}</p>
                  </details>
                ))}
              </div>
            </section>
          </div>

          <aside className="right-rail">
            <div style={{ background: "#fff", border: "1px solid #CFDAE6", borderRadius: 8, padding: 22, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#363634" }}>Still not sure which is right for you?</div>
              <div style={{ fontSize: 13, color: "#696868", margin: "6px 0 14px", lineHeight: 1.5 }}>A counsellor will help you weigh {pair.left.university.shortName} vs {pair.right.university.shortName} against your own goals and budget.</div>
              <Link href={`/lead?intent=comparison&course=${pair.key}`} className="btn primary" style={{ width: "100%", height: 44, fontSize: 15 }} data-open-lead>Ask a counsellor</Link>
              <div style={{ fontSize: 11, color: "#707070", marginTop: 10 }}>Free service · no spam · unbiased advice</div>
            </div>
            <Link href={`/compare?add=${pair.left.id},${pair.right.id}`} style={{ display: "block", textAlign: "center", border: "1.5px solid #555", borderRadius: 4, height: 44, lineHeight: "44px", fontSize: 14, fontWeight: 700, color: "#555", background: "#fff", marginTop: 12 }}>
              Add a 3rd program to compare
            </Link>
          </aside>
        </div>
      </div>
    </>
  );
}
