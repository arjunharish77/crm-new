export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ExternalLink, Headset, Plus } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { ComparisonTable } from "@/components/comparison-table";
import { FaqAccordion } from "@/components/faq-accordion";
import { SectionTabs } from "@/components/section-tabs";
import { universityMedia } from "@/data/media";
import { comparisonFaqs, comparisonSources, comparisonSummary, getComparisonPair } from "@/lib/comparisons";
import { formatCheckedDate, sourceHost } from "@/lib/source-checks";
import { formatFee } from "@/lib/catalog-format";
import { getEligibilityGuideBySlug } from "@/data/guide-content";
import { withSocial } from "@/lib/page-metadata";
import { GroupFeeText } from "@/components/fee-group";

const SITE_URL = process.env.NEXT_PUBLIC_UNNATIVIDYA_SITE_URL || "https://unnatividya.com";

export async function generateMetadata({ params }: { params: Promise<{ course: string; pair: string }> }): Promise<Metadata> {
  const catalog = await getPublishedCatalog();
  const { course, pair: pairSlug } = await params;
  const pair = getComparisonPair(catalog, course, pairSlug);
  if (!pair) return {};
  return withSocial({
    title: `${pair.label}: ${pair.left.university.shortName} vs ${pair.right.university.shortName} Compared`,
    description: `${pair.label} at ${pair.left.university.name} vs ${pair.right.university.name} — fees, eligibility, placement, and approvals compared side by side, using listed course catalog information.`,
    alternates: { canonical: `/compare/${course}/${pairSlug}` },
  });
}

// Editorial comparison (public, no gate; plan B §3.3 item 10): the Compare hero, table and tokens,
// with the byline, section tabs, program and guide links, FAQ and right rail.
export default async function ComparisonPage({ params }: { params: Promise<{ course: string; pair: string }> }) {
  const catalog = await getPublishedCatalog();
  const { course, pair: pairSlug } = await params;
  const pair = getComparisonPair(catalog, course, pairSlug);
  if (!pair) notFound();

  const faqs = comparisonFaqs(pair);
  const summary = comparisonSummary(pair);
  const sources = comparisonSources(catalog, pair);
  const eligibilityGuide = getEligibilityGuideBySlug(`${pair.key}-eligibility`);
  const programs = [pair.left, pair.right];
  const versus = `${pair.left.university.shortName} vs ${pair.right.university.shortName}`;

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Compare", item: `${SITE_URL}/compare` },
      { "@type": "ListItem", position: 3, name: `${pair.label}: ${versus}`, item: `${SITE_URL}/compare/${course}/${pairSlug}` },
    ],
  };
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })),
  };

  return <PublishedCatalogBoundary>{(
    <div className="uv-cmp-page is-editorial">
      <JsonLd data={[breadcrumbJsonLd, faqJsonLd]} />
      <section className="uv-page-hero uv-cmp-hero" aria-labelledby="editorial-title">
        <div className="uv-page-hero-inner">
          <ol className="uv-breadcrumb" aria-label="Breadcrumb">
            <li><Link href="/">Home</Link></li>
            <li><Link href="/compare">Compare</Link></li>
            <li aria-current="page">{versus}</li>
          </ol>
          <h1 id="editorial-title" className="uv-h1"><span className="uv-cmp-accent">{pair.label}</span>: {versus}</h1>
          <p className="uv-cmp-byline">By <Link href="/authors/content-team">Content Team, Unnati Vidya</Link></p>
          <p className="uv-cmp-lede">Compared using listed catalog information. Confirm current fees, eligibility and recognition for your admission session.</p>
          <ul className="uv-cmp-versus" aria-label="Programs compared">
            {programs.map(item => <li key={item.id}>
              <span className="uv-cmp-logo"><Image src={universityMedia[item.universityId]?.logo || "/brand/favicon-32x32.png"} alt="" width={34} height={34} /></span>
              <span><strong>{item.university.name}</strong><small>{item.name} · <GroupFeeText fee={item.fee} categoryFees={item.categoryFees} short /> · {item.duration}</small></span>
            </li>)}
          </ul>
        </div>
      </section>

      <SectionTabs label="Comparison article sections" items={[
        { label: "At a glance", href: "#editorial-summary" },
        { label: "Comparison", href: "#editorial-comparison" },
        { label: "Specialisations", href: "#editorial-specialisations" },
        { label: "Program pages", href: "#editorial-programs" },
        { label: "Sources", href: "#editorial-sources" },
        { label: "Related guides", href: "#editorial-guides" },
        { label: "Questions", href: "#editorial-faq" },
      ]} />

      <div className="uv-shell uv-cmp-editorial">
        <div className="uv-cmp-editorial-main">
          <section className="uv-cmp-block" id="editorial-summary" tabIndex={-1} aria-labelledby="editorial-summary-title">
            <h2 id="editorial-summary-title" className="uv-h2 is-inner">At a glance</h2>
            <dl className="uv-cmp-summary">
              {summary.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.text}</dd></div>)}
            </dl>
            <p className="uv-cmp-footnote">This page doesn&apos;t rank the programs. The right choice depends on your marks, budget, the specialisation you want and the session you are joining.</p>
          </section>

          <section className="uv-cmp-block" id="editorial-comparison" tabIndex={-1} aria-labelledby="editorial-comparison-title">
            <h2 id="editorial-comparison-title" className="uv-h2 is-inner">Side-by-side comparison</h2>
            <ComparisonTable courses={programs} caption={`${pair.label}: listed details for ${pair.left.university.shortName} and ${pair.right.university.shortName}`} regionLabel="University program comparison" />
            <p className="uv-cmp-footnote">Use these details as a starting point. Check current fees, eligibility, recognition and available support on the course and official university pages before deciding.</p>
          </section>

          <section className="uv-cmp-block" id="editorial-specialisations" tabIndex={-1} aria-labelledby="editorial-specialisations-title">
            <h2 id="editorial-specialisations-title" className="uv-h2 is-inner">Specialisations side by side</h2>
            <div className="uv-cmp-specs">
              {programs.map(item => <div key={item.id} className="uv-cmp-specs-col">
                <h3>{item.university.shortName}<small>{item.specializations.length ? `${item.specializations.length} listed` : "General program"}</small></h3>
                {item.specializations.length ? <ul>{item.specializations.map(name => <li key={name}>{name}</li>)}</ul> : <p>No specialisations are listed for this program.</p>}
              </div>)}
            </div>
          </section>

          <section className="uv-cmp-block" id="editorial-programs" tabIndex={-1} aria-labelledby="editorial-programs-title">
            <h2 id="editorial-programs-title" className="uv-h2 is-inner">View each program in full</h2>
            <div className="editorial-program-actions">
              {programs.map(item => <Link key={item.id} href={`/courses/${item.slug}`} className="uv-cmp-program-link">
                <span className="uv-cmp-logo"><Image src={universityMedia[item.universityId]?.logo || "/brand/favicon-32x32.png"} alt="" width={34} height={34} /></span>
                <span><strong>{item.university.shortName} program page</strong><small>{item.name}, {item.university.name}</small></span>
                <ArrowRight size={18} aria-hidden="true" />
              </Link>)}
            </div>
          </section>

          <section className="uv-cmp-block" id="editorial-sources" tabIndex={-1} aria-labelledby="editorial-sources-title">
            <h2 id="editorial-sources-title" className="uv-h2 is-inner">Sources</h2>
            <ul className="uv-cmp-sources">
              {sources.map(({ course: item, urls, checkedAt }) => <li key={item.id}>
                <strong>{item.university.name}</strong>{checkedAt ? <small> · fee checked {formatCheckedDate(checkedAt)}</small> : null}
                <ul>{urls.map(url => <li key={url}><a href={url} target="_blank" rel="noopener noreferrer">{sourceHost(url)}<ExternalLink size={13} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a></li>)}</ul>
              </li>)}
            </ul>
            <p className="uv-cmp-footnote"><Link href="/how-we-verify">How we verify information</Link></p>
          </section>

          <section className="uv-cmp-block" id="editorial-guides" tabIndex={-1} aria-labelledby="editorial-guides-title">
            <h2 id="editorial-guides-title" className="uv-h2 is-inner">Related guides</h2>
            <ul className="uv-cmp-guide-links">
              <li><Link href={`/online-degree-guides/${pair.key}-fees`}>{pair.label} fees <ArrowRight size={16} aria-hidden="true" /></Link></li>
              {eligibilityGuide ? <li><Link href={`/online-degree-guides/${pair.key}-eligibility`}>{pair.label} eligibility <ArrowRight size={16} aria-hidden="true" /></Link></li> : null}
            </ul>
          </section>

          <div className="uv-cmp-block">
            <FaqAccordion items={faqs} name="comparison-faq" id="editorial-faq" subtitle={`Common questions about ${pair.label} at ${versus}.`} />
          </div>
        </div>

        <aside className="uv-cmp-rail" aria-label="Next steps">
          <div className="uv-cmp-rail-card">
            <span className="uv-cmp-rail-icon" aria-hidden="true"><Headset size={24} /></span>
            <h2>Still not sure which is right for you?</h2>
            <p>A counsellor will help you weigh {versus} against your own goals and budget.</p>
            <Link href={`/lead?intent=comparison&course=${pair.key}`} rel="nofollow" className="btn primary large" data-open-lead>Apply now</Link>
            <p className="uv-cmp-rail-note">Free counselling · no hidden charges</p>
          </div>
          <Link href={`/compare?add=${pair.left.id},${pair.right.id}`} className="btn secondary uv-cmp-rail-more">
            <Plus size={18} aria-hidden="true" />Add a 3rd program to compare
          </Link>
        </aside>
      </div>
    </div>
  )}</PublishedCatalogBoundary>;
}
