export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { buildComparisonRows, comparisonFaqs, getComparisonPair } from "@/lib/comparisons";
import { getEligibilityGuideBySlug } from "@/data/guide-content";

const SITE_URL = process.env.NEXT_PUBLIC_UNNATIVIDYA_SITE_URL || "https://unnatividya.com";

export async function generateMetadata({ params }: { params: Promise<{ course: string; pair: string }> }): Promise<Metadata> {
  const catalog = await getPublishedCatalog();
  const { course, pair: pairSlug } = await params;
  const pair = getComparisonPair(catalog, course, pairSlug);
  if (!pair) return {};
  return {
    title: `${pair.label}: ${pair.left.university.shortName} vs ${pair.right.university.shortName} Compared`,
    description: `${pair.label} at ${pair.left.university.name} vs ${pair.right.university.name} — fees, eligibility, placement, and approvals compared side by side, using listed course catalog information.`,
    alternates: { canonical: `/compare/${course}/${pairSlug}` },
  };
}

export default async function ComparisonPage({ params }: { params: Promise<{ course: string; pair: string }> }) {
  const catalog = await getPublishedCatalog();
  const { course, pair: pairSlug } = await params;
  const pair = getComparisonPair(catalog, course, pairSlug);
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

  return <PublishedCatalogBoundary>{(
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
          <p className="lead-help">By <Link href="/authors/content-team">Content Team, Unnati Vidya</Link></p>
            <div style={{ color: "#696868", fontSize: 13, marginTop: 8 }}>Compared using listed catalog information. Confirm current fees, eligibility and recognition for your admission session.</div>
          </div>
        </div>

        <div className="container detail-layout guide-reading-layout editorial-comparison">
          <div className="guide-reading-main">
            <nav className="guide-detail-nav" aria-label="Comparison article sections"><a href="#editorial-comparison">Comparison</a><a href="#editorial-programs">Program pages</a><a href="#editorial-guides">Related guides</a><a href="#editorial-faq">Questions</a></nav>
            <section className="detail-section" id="editorial-comparison" tabIndex={-1}>
              <h2>Side-by-side comparison</h2>
              <div className="comparison-data-region" role="region" aria-label="University program comparison" tabIndex={0}>
                <table className="comparison-data">
                  <caption>{pair.label}: listed details for {pair.left.university.shortName} and {pair.right.university.shortName}</caption>
                  <thead><tr><th scope="col">Criteria</th>{[pair.left,pair.right].map(item => <th scope="col" key={item.id}>{item.name}<small>{item.university.name}</small></th>)}</tr></thead>
                  <tbody>{rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th>{row.cells.map((cell,index) => <td key={index}><span className="comparison-mobile-label" aria-hidden="true">{[pair.left,pair.right][index].university.name}</span>{cell.value}</td>)}</tr>)}</tbody>
                </table>
              </div>
              <div style={{ fontSize: 13, color: "#707070", marginTop: 10 }}>
                Use these details as a starting point. Check current fees, eligibility, recognition and available support on the course and official university pages before deciding.
              </div>
            </section>

            <section className="detail-section" id="editorial-programs" tabIndex={-1}>
              <h2>View each program in full</h2>
              <div className="editorial-program-actions">
                <Link href={`/courses/${pair.left.slug}`} className="btn secondary guide-compare-link">
                  {pair.left.university.shortName} program page
                </Link>
                <Link href={`/courses/${pair.right.slug}`} className="btn secondary guide-compare-link">
                  {pair.right.university.shortName} program page
                </Link>
              </div>
            </section>

            <section className="detail-section" id="editorial-guides" tabIndex={-1}>
              <h2>Related guides</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Link href={`/online-degree-guides/${pair.key}-fees`} style={{ color: "#544CC8", fontWeight: 600, fontSize: 14 }}>{pair.label} fees →</Link>
                {eligibilityGuide ? (
                  <Link href={`/online-degree-guides/${pair.key}-eligibility`} style={{ color: "#544CC8", fontWeight: 600, fontSize: 14 }}>{pair.label} eligibility →</Link>
                ) : null}
              </div>
            </section>

            <section className="detail-section" id="editorial-faq" tabIndex={-1}>
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
              <Link href={`/lead?intent=comparison&course=${pair.key}`} className="btn primary" style={{ width: "100%", height: 44, fontSize: 15 }} data-open-lead>Apply now</Link>
              <div style={{ fontSize: 11, color: "#707070", marginTop: 10 }}>Free service · no spam · unbiased advice</div>
            </div>
            <Link href={`/compare?add=${pair.left.id},${pair.right.id}`} className="btn secondary guide-compare-link">
              Add a 3rd program to compare
            </Link>
          </aside>
        </div>
      </div>
    </>
  )}</PublishedCatalogBoundary>;
}
