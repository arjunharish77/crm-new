export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowRight, Calculator, ClipboardCheck, ExternalLink, TriangleAlert } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { FaqAccordion } from "@/components/faq-accordion";
import { Byline, GUIDE_TOPICS, ReadingApplyCta, ReadingHero, ReadingToc, RelatedRows } from "@/components/reading-page";
import { feeCheck, feeGuideFaqs, feeGuideIntro, feeGuideSources, formatFee, getFeeGuideBySlug, indianSemesterPayment, outsideIndiaFees, sourcedFeePlans } from "@/lib/fee-guides";
import { programApplicationFee, RECOGNITION_STATUS_2026_27, recognitionSummary } from "@/lib/program-facts";
import { formatCheckedDate, publicSourceUrls, sourceCheckLine, sourceHost } from "@/lib/source-checks";
import { formatCategoryFee } from "@/lib/prepared-category-fees";
import { courseKey } from "@/lib/programmatic-seo";
import { guidePreview, publishedGuide } from "@/lib/guides-server";
import { mergeGuide } from "@/lib/guide-cms";
import {
  getCareerScopeGuideBySlug,
  getEligibilityGuideBySlug,
  getUgcApprovalGuideBySlug,
} from "@/data/guide-content";
import { fitTitle, lakh, listNames, withSocial } from "@/lib/page-metadata";
import { FeeGroupSwitch, GroupEmiText, GroupFeeText } from "@/components/fee-group";

const SITE_URL = process.env.NEXT_PUBLIC_UNNATIVIDYA_SITE_URL || "https://unnatividya.com";
type GuideType = (typeof GUIDE_TOPICS)[number]["type"];
const TAG: Record<GuideType, string> = Object.fromEntries(GUIDE_TOPICS.map(topic => [topic.type, topic.short])) as Record<GuideType, string>;

// The universities that actually list this program, for descriptions ("at MUJ and SMU").
function offeredBy(catalog: Awaited<ReturnType<typeof getPublishedCatalog>>, key: string) {
  const names = [...new Set(catalog.courses.filter((course) => courseKey(course.name) === key).map((course) => catalog.universityById[course.universityId]?.shortName).filter(Boolean))] as string[];
  return names.length ? listNames(names) : "the universities we list";
}

// Page descriptions, shown as the hero deck and used for the meta description.
const eligibilityDescription = (label: string, offered: string) => `${label} eligibility at ${offered}: minimum marks, work experience and entrance-test rules, from each university's own admission page.`;
const careerDescription = (label: string, offered: string) => `${label} career scope at ${offered}: the roles and industries each university names, with unverified salary claims flagged rather than promised.`;
const ugcDescription = (label: string, offered: string) => `${label} UGC-DEB online-list status for the 2026-27 session at ${offered}, with the exact entry, the official source and the date we checked it.`;

export async function generateMetadata({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  // A CMS preview link (Wave 5 C3) is never indexed.
  if ((await searchParams).preview !== undefined) return { robots: { index: false, follow: false, nocache: true } };
  const catalog = await getPublishedCatalog();
  const { slug } = await params;

  if (slug.endsWith("-fees")) {
    const guide = getFeeGuideBySlug(catalog, slug);
    if (!guide) return {};
    const title = guide.isComparison
      ? fitTitle(`${guide.label} Fees: ${guide.courses.map(course => course.university.shortName).join(" vs ")} Compared`, `${guide.label} Fees Compared`)
      : fitTitle(`${guide.label} Fees at ${guide.courses[0].university.shortName}: ${lakh(guide.courses[0].fee)} Total`, `${guide.label} Fees at ${guide.courses[0].university.shortName}`, `${guide.label} Fees`);
    const description = guide.isComparison
      ? `${guide.label} fees across ${guide.courses.length} UGC-entitled universities: ${formatFee(guide.lowestFee)} to ${formatFee(guide.highestFee)}, with EMI and duration for each.`
      : `${guide.label} fee breakdown at ${guide.courses[0].university.name}: total fee ${formatFee(guide.courses[0].fee)}, EMI, and scholarship options.`;
    return withSocial({ title, description, alternates: { canonical: `/online-degree-guides/${slug}` } });
  }

  if (slug.endsWith("-eligibility")) {
    const guide = getEligibilityGuideBySlug(slug);
    if (!guide) return {};
    return withSocial({
      title: fitTitle(`${guide.label} Eligibility: Marks, Work Experience, Entrance`, `${guide.label} Eligibility and Admission`, `${guide.label} Eligibility`),
      description: eligibilityDescription(guide.label, offeredBy(catalog, guide.key)),
      alternates: { canonical: `/online-degree-guides/${slug}` },
    });
  }

  if (slug.endsWith("-career-scope")) {
    const guide = getCareerScopeGuideBySlug(slug);
    if (!guide) return {};
    return withSocial({
      title: fitTitle(`${guide.label} Career Scope: Roles and Industries`, `${guide.label} Career Scope`),
      description: careerDescription(guide.label, offeredBy(catalog, guide.key)),
      alternates: { canonical: `/online-degree-guides/${slug}` },
    });
  }

  if (slug.endsWith("-ugc-approval")) {
    const guide = getUgcApprovalGuideBySlug(slug);
    if (!guide) return {};
    return withSocial({
      title: fitTitle(`Is ${guide.label} UGC Approved? 2026-27 Status`, `Is ${guide.label} UGC Approved?`),
      description: ugcDescription(guide.label, offeredBy(catalog, guide.key)),
      alternates: { canonical: `/online-degree-guides/${slug}` },
    });
  }

  return {};
}

export default async function GuidePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const previewParam = (await searchParams).preview;
  const preview = typeof previewParam === "string" ? previewParam : undefined;

  if (slug.endsWith("-fees")) return <PublishedCatalogBoundary>{<FeeGuideContent slug={slug} />}</PublishedCatalogBoundary>;
  if (slug.endsWith("-eligibility")) return <PublishedCatalogBoundary>{<EligibilityGuideContent slug={slug} preview={preview} />}</PublishedCatalogBoundary>;
  if (slug.endsWith("-career-scope")) return <PublishedCatalogBoundary>{<CareerScopeGuideContent slug={slug} preview={preview} />}</PublishedCatalogBoundary>;
  if (slug.endsWith("-ugc-approval")) return <PublishedCatalogBoundary>{<UgcApprovalGuideContent slug={slug} />}</PublishedCatalogBoundary>;
  notFound();
}

// Same-degree guides of the other types, only where they exist.
function crossLinks(courseKey: string, label: string, current: GuideType) {
  return [
    { type: "fees" as const, href: `/online-degree-guides/${courseKey}-fees`, label: `${label} fees`, guard: null as (() => unknown) | null },
    { type: "eligibility" as const, href: `/online-degree-guides/${courseKey}-eligibility`, label: `${label} eligibility`, guard: () => getEligibilityGuideBySlug(`${courseKey}-eligibility`) },
    { type: "career-scope" as const, href: `/online-degree-guides/${courseKey}-career-scope`, label: `${label} career scope`, guard: () => getCareerScopeGuideBySlug(`${courseKey}-career-scope`) },
    { type: "ugc-approval" as const, href: `/online-degree-guides/${courseKey}-ugc-approval`, label: `Is ${label} UGC approved?`, guard: () => getUgcApprovalGuideBySlug(`${courseKey}-ugc-approval`) },
  ].filter((link) => link.type !== current && (!link.guard || link.guard())).map(({ href, label }) => ({ href, label }));
}

function breadcrumbJsonLd(name: string, slug: string) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Online Degree Guides", item: `${SITE_URL}/online-degree-guides` },
      { "@type": "ListItem", position: 3, name, item: `${SITE_URL}/online-degree-guides/${slug}` },
    ],
  };
}

function faqJsonLd(faqs: Array<[string, string]>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })),
  };
}

// The shared guide layout: hero, "In this guide", body, FAQ, Apply now, sources, related guides.
function GuideReading({ type, crumb, title, deck, reviewed, sources, toc, faqs, faqName, related, cta, children }: {
  type: GuideType;
  crumb: string;
  title: string;
  deck: ReactNode;
  reviewed?: string;
  sources?: ReactNode;
  toc: Array<{ href: string; label: string }>;
  faqs: Array<[string, string]>;
  faqName: string;
  related: Array<{ href: string; label: string }>;
  cta: ReactNode;
  children: ReactNode;
}) {
  const hasSources = Boolean(sources);
  const contents = [
    ...toc,
    ...(faqs.length ? [{ href: "#guide-faq", label: "Frequently asked questions" }] : []),
    ...(hasSources ? [{ href: "#guide-sources", label: "Sources" }] : []),
    ...(related.length ? [{ href: "#guide-related", label: "Related guides" }] : []),
  ];
  return <article className="uv-read uv-read-guide">
    <ReadingHero
      crumbs={[{ label: "Home", href: "/" }, { label: "Online degree guides", href: "/online-degree-guides" }, { label: crumb }]}
      tag={TAG[type]}
      title={title}
      deck={deck}
      meta={<>
        <Byline />
        {reviewed ? <span>Last reviewed: {reviewed}</span> : null}
        {hasSources ? <a href="#guide-sources" className="uv-read-meta-link">Sources</a> : null}
      </>}
    />
    <div className="uv-read-body">
      <ReadingToc label="In this guide" navLabel="Guide sections" items={contents} />
      {children}
      {faqs.length ? <div className="uv-read-section"><FaqAccordion id="guide-faq" name={faqName} items={faqs} subtitle={null} /></div> : null}
      {cta}
      {sources}
      <RelatedRows id="guide-related" title="Related guides" items={related} />
    </div>
  </article>;
}

function SourceList({ urls, guideSlug }: { urls: string[]; guideSlug: string }) {
  return (
    <section id="guide-sources" tabIndex={-1} className="uv-read-section uv-read-sources" aria-labelledby="guide-sources-title">
      <h2 id="guide-sources-title" className="uv-read-h2 is-small">Sources</h2>
      <ul className="uv-read-source-list">
        {urls.map((url) => {
          const hostname = new URL(url).hostname;
          return (
            <li key={url}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                data-track-event="source_link_click"
                data-track-params={JSON.stringify({ source_hostname: hostname, guide_slug: guideSlug })}
              >
                {hostname}
              </a>
            </li>
          );
        })}
      </ul>
      <p className="uv-read-verify"><Link href="/how-we-verify">How we verify our data →</Link></p>
    </section>
  );
}

const CTA_NOTE = "Free service · no spam";

async function FeeGuideContent({ slug }: { slug: string }) {
  const catalog = await getPublishedCatalog();
  const guide = getFeeGuideBySlug(catalog, slug);
  if (!guide) notFound();
  const faqs = feeGuideFaqs(guide);
  const intro = feeGuideIntro(guide);
  const scholarships = !guide.isComparison && guide.courses[0].scholarships?.length ? guide.courses[0].scholarships : null;
  const showOutside = guide.courses.some(course => outsideIndiaFees(course));
  const showSemester = guide.courses.some(course => indianSemesterPayment(course));
  const plans = guide.courses.map(course => ({ course, plans: sourcedFeePlans(course) })).filter(item => item.plans.length);
  const sources = feeGuideSources(catalog, guide).filter(item => item.urls.length);
  const plannerHref = `/tools/total-cost?course=${guide.courses.slice(0, 3).map(course => course.id).join(",")}`;

  return (
    <>
      <JsonLd data={[breadcrumbJsonLd(`${guide.label} Fees`, guide.slug), faqJsonLd(faqs)]} />
      <GuideReading
        type="fees"
        crumb={`${guide.label} fees`}
        title={guide.isComparison ? `${guide.label} fees compared across universities` : `${guide.label} fees explained`}
        deck="Listed tuition from our published catalog, with the date each fee was checked. Confirm current fees and other charges with the university."
        sources={sources.length ? <FeeSourceList sources={sources} guideSlug={slug} /> : null}
        toc={[
          { href: "#guide-overview", label: "Overview" },
          { href: "#guide-fees", label: "Fees by university" },
          ...(plans.length ? [{ href: "#guide-plans", label: "Payment options" }] : []),
          ...(scholarships ? [{ href: "#guide-scholarships", label: "Scholarships available" }] : []),
          { href: "#guide-cost", label: "Plan the full cost" },
        ]}
        faqs={faqs}
        faqName="fee-guide-faq"
        related={[{ href: "/online-degree-guides/fees", label: "Online degree fees 2026-27: all programs" }, ...crossLinks(guide.key, guide.label, "fees")]}
        cta={<ReadingApplyCta
          title="Get the exact fee breakup"
          copy={`A counsellor will confirm the current fee, EMI plan, and scholarship eligibility for ${guide.label}.`}
          href={`/lead?intent=fee-guide&course=${guide.key}`}
          note={CTA_NOTE}
        />}
      >
        <section className="uv-read-section" id="guide-overview" tabIndex={-1}>
          <div className="uv-read-prose"><p>{intro}</p></div>
        </section>

        <section className="uv-read-section" id="guide-fees" tabIndex={-1} aria-labelledby="guide-fees-title">
          <h2 id="guide-fees-title" className="uv-read-h2">{guide.isComparison ? "Fee, EMI, and duration by university" : "Fee and EMI breakdown"}</h2>
          <FeeGroupSwitch id="guide-fee-group" className="uv-read-fee-group" />
          <div className="uv-read-table" role="region" aria-label={`${guide.label} fees by university`} tabIndex={0}>
            <table className={showOutside || showSemester ? "is-wide" : undefined}>
              <caption className="sr-only">{guide.label}: listed total tuition, application fee, EMI and duration by university</caption>
              <thead>
                <tr>
                  <th scope="col">University</th>
                  <th scope="col">Listed total tuition</th>
                  {showSemester ? <th scope="col">Per semester</th> : null}
                  <th scope="col">Application fee</th>
                  <th scope="col">EMI from</th>
                  <th scope="col">Duration</th>
                  {showOutside ? <th scope="col">Outside India</th> : null}
                </tr>
              </thead>
              <tbody>
                {guide.courses.map(course => {
                  const outside = outsideIndiaFees(course);
                  const semester = indianSemesterPayment(course);
                  const check = feeCheck(course);
                  return <tr key={course.id}>
                    <th scope="row">
                      <span className="uv-read-table-uni">{course.university.name}</span>
                      {check ? <span className="uv-read-cell-source">Fee checked {check.date}</span> : null}
                      <Link href={`/courses/${course.slug}`} className="uv-read-table-link">View program<span className="sr-only">: {course.name}, {course.university.shortName}</span></Link>
                    </th>
                    <td className="uv-read-num"><GroupFeeText fee={course.fee} categoryFees={course.categoryFees} /></td>
                    {showSemester ? <td>{semester ? <GroupFeeText fee={course.fee} categoryFees={course.categoryFees} variant="semester" /> : <><span aria-hidden="true">—</span><span className="sr-only">No reviewed semester schedule in our catalog</span></>}</td> : null}
                    <td>{programApplicationFee(course)}</td>
                    <td><GroupEmiText emi={course.emi} /></td>
                    <td>{course.duration}</td>
                    {showOutside ? <td>
                      {outside ? <>
                        <ul className="uv-read-cell-list">{outside.rows.filter(row => row.currency !== "INR").map(row => <li key={row.category}>{row.category} {formatCategoryFee(row.currency, row.total)}</li>)}</ul>
                        <span className="uv-read-cell-source">(<a href={outside.sourceUrl} target="_blank" rel="noopener noreferrer">source</a>, checked {formatCheckedDate(outside.checkedAt)})</span>
                      </> : <><span aria-hidden="true">—</span><span className="sr-only">No outside-India fee in our catalog</span></>}
                    </td> : null}
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
          <p className="uv-read-caption">Tuition is for Indian applicants unless marked. Confirm current tuition, applicant category, recognition and available payment terms with the university before applying.</p>
          {guide.isComparison ? (
            <div className="uv-read-compare">
              <div>
                <p className="uv-read-compare-title">See these programs side by side</p>
                <p className="uv-read-compare-copy">Fees, EMI and approvals in one table. Verify your email to see the full comparison.</p>
              </div>
              <Link href={`/compare?add=${guide.courses.slice(0, 3).map(course => course.id).join(",")}`} className="btn primary guide-compare-link">
                Compare {guide.label} side by side <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
          ) : null}
        </section>

        {plans.length ? (
          <section className="uv-read-section" id="guide-plans" tabIndex={-1} aria-labelledby="guide-plans-title">
            <h2 id="guide-plans-title" className="uv-read-h2">Payment options</h2>
            <p className="uv-read-caption">Shown for programs whose fee has been reviewed against the official page. For the others, the program page or the university confirms the schedule.</p>
            {plans.map(({ course, plans: rows }) => (
              <div key={course.id} className="uv-read-table" role="region" aria-label={`${course.university.shortName} payment options`} tabIndex={0}>
                <table>
                  <caption>{course.university.name}</caption>
                  <thead><tr><th scope="col">Option</th><th scope="col">Amount</th><th scope="col">Details</th></tr></thead>
                  <tbody>{rows.map(([label, amount, note]) => <tr key={label}><th scope="row">{label}</th><td className="uv-read-num">{amount}</td><td>{note}</td></tr>)}</tbody>
                </table>
              </div>
            ))}
          </section>
        ) : null}

        {scholarships ? (
          <section className="uv-read-section" id="guide-scholarships" tabIndex={-1} aria-labelledby="guide-scholarships-title">
            <h2 id="guide-scholarships-title" className="uv-read-h2">Scholarships available</h2>
            <div className="uv-read-table" role="region" aria-label="Scholarships table" tabIndex={0}>
              <table>
                <caption className="sr-only">Scholarships listed by {guide.courses[0].university.name}</caption>
                <thead><tr><th scope="col">Scholarship</th><th scope="col">Listed discount</th><th scope="col">Proof required</th></tr></thead>
                <tbody>
                  {scholarships.map((row, index) => <tr key={`${row[0]}-${index}`}><th scope="row">{row[0]}</th><td>{row[1]}</td><td>{row[2]}</td></tr>)}
                </tbody>
              </table>
            </div>
            <p className="uv-read-caption">
              These are listed at university level. Scholarship eligibility and proof requirements can change by admission cycle. See our <Link href="/refund-policy">refund policy</Link> for what happens if you discontinue after admission.
            </p>
          </section>
        ) : null}

        <section className="uv-read-section" id="guide-cost" tabIndex={-1} aria-labelledby="guide-cost-title">
          <h2 id="guide-cost-title" className="uv-read-h2">Plan the full cost</h2>
          <div className="uv-read-prose"><p>Tuition is only part of the cost. Add the application fee, any exam or re-registration charges the university confirms, and your own costs such as a laptop or internet. The total cost planner shows each program&apos;s published tuition and semester schedule side by side, and lets you add these yourself.</p></div>
          <div className="uv-read-compare">
            <div>
              <p className="uv-read-compare-title">{guide.isComparison ? `Plan the full cost of ${guide.label} at ${guide.courses.slice(0, 3).map(course => course.university.shortName).join(", ")}` : `Plan the full cost of ${guide.label}`}</p>
              <p className="uv-read-compare-copy">Free, no sign-up. A planning aid, not a university quote.</p>
            </div>
            <Link href={plannerHref} className="btn secondary guide-cost-link"><Calculator size={18} aria-hidden="true" />Open the total cost planner</Link>
          </div>
        </section>
      </GuideReading>
    </>
  );
}

// Fee sources, grouped by program, with the date each fee was checked.
function FeeSourceList({ sources, guideSlug }: { sources: ReturnType<typeof feeGuideSources>; guideSlug: string }) {
  return (
    <section id="guide-sources" tabIndex={-1} className="uv-read-section uv-read-sources" aria-labelledby="guide-sources-title">
      <h2 id="guide-sources-title" className="uv-read-h2 is-small">Sources</h2>
      <ul className="uv-read-source-list">
        {sources.flatMap(({ course, urls, check }) => urls.map(url => (
          <li key={`${course.id}-${url}`}>
            <a href={url} target="_blank" rel="noopener noreferrer" data-track-event="source_link_click" data-track-params={JSON.stringify({ source_hostname: sourceHost(url), guide_slug: guideSlug })}>
              {course.university.shortName} · {sourceHost(url)}<ExternalLink size={13} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span>
            </a>
            {check && url === check.sourceUrl ? <span className="uv-read-source-date">Fee checked {check.date}</span> : null}
          </li>
        )))}
      </ul>
      <p className="uv-read-verify"><Link href="/how-we-verify">How we verify our data →</Link></p>
    </section>
  );
}

async function EligibilityGuideContent({ slug, preview }: { slug: string; preview?: string }) {
  const catalog = await getPublishedCatalog();
  const { universityById } = catalog;
  const codeEligibility = getEligibilityGuideBySlug(slug);
  if (!codeEligibility) notFound();
  // Wave 5 C3: the published CMS text, or the code text until a guide has a CMS row.
  const previewContent = await guidePreview("eligibility", codeEligibility.key, preview);
  const guide = previewContent ? mergeGuide(codeEligibility, previewContent) : await publishedGuide("eligibility", codeEligibility);
  const firstMatchingCourse = catalog.courses.find(course => courseKey(course.name) === guide.key);
  // Decision W10: a course whose prepared eligibility correction an admin has applied (it records
  // eligibilityReview) shows that published text by applicant category; others keep the guide's fact.
  const cards = guide.facts.map(row => {
    const course = catalog.courses.find(item => item.universityId === row.universityId && courseKey(item.name) === guide.key);
    const enriched = course ? catalog.courseWithUniversity(course) : null;
    const check = enriched?.eligibilityReview && enriched.eligibility ? sourceCheckLine(enriched.eligibilityReview) : null;
    return { universityId: row.universityId, paragraphs: check ? enriched!.eligibility.split(/\n\s*\n/).map(text => text.trim()).filter(Boolean) : [row.fact], check };
  });
  const sources = publicSourceUrls([...new Set([...cards.flatMap(card => card.check ? [card.check.href] : []), ...guide.sourceUrls])]);

  return (
    <>
      <JsonLd data={[breadcrumbJsonLd(`${guide.label} Eligibility`, guide.slug), faqJsonLd(guide.faqs)]} />
      {previewContent ? <p className="article-preview-banner" role="status">Preview. This is not live until an administrator publishes it.</p> : null}
      <GuideReading
        type="eligibility"
        crumb={`${guide.label} eligibility`}
        title={`${guide.label} eligibility and admission process`}
        deck={eligibilityDescription(guide.label, offeredBy(catalog, guide.key))}
        reviewed={guide.lastReviewed}
        sources={sources.length ? <SourceList urls={sources} guideSlug={slug} /> : null}
        toc={[
          { href: "#guide-overview", label: "Eligibility by university" },
          { href: "#guide-differences", label: "What's different between universities" },
        ]}
        faqs={guide.faqs}
        faqName="eligibility-guide-faq"
        related={[{ href: "/online-degree-guides/admissions", label: "How to apply: eligibility, documents and steps" }, ...crossLinks(guide.key, guide.label, "eligibility")]}
        cta={<ReadingApplyCta
          title="Not sure you qualify?"
          copy={`A counsellor will check your specific background against ${guide.label}'s current eligibility rules at each university.`}
          href={`/lead?intent=eligibility-guide&course=${guide.key}`}
          note={CTA_NOTE}
        />}
      >
        <section className="uv-read-section" id="guide-overview" tabIndex={-1} aria-labelledby="guide-overview-title">
          <h2 id="guide-overview-title" className="uv-read-h2">Eligibility by university</h2>
          <div className="uv-read-tool">
            <span className="uv-read-tool-icon" aria-hidden="true"><ClipboardCheck size={22} /></span>
            <p>Want to check your own qualification and marks? <Link href={`/tools/eligibility-checker${firstMatchingCourse ? `?course=${encodeURIComponent(firstMatchingCourse.id)}` : ""}`}>Use the free eligibility checker</Link>. It shows where a reviewed rule is available and where the university still needs to confirm your case.</p>
          </div>
          <ul className="uv-read-cards">
            {cards.map((card) => (
              <li key={card.universityId} className="uv-read-card">
                <h3>{universityById[card.universityId].name}</h3>
                {card.paragraphs.map(text => {
                  const label = text.match(/^([A-Z][A-Za-z /-]{2,40} applicants): (.*)$/s);
                  return <p key={text}>{label ? <><strong>{label[1]}:</strong> {label[2]}</> : text}</p>;
                })}
                {card.check ? <p className="uv-read-card-source">From the course record: <a href={card.check.href} target="_blank" rel="noopener noreferrer">{card.check.host}</a>, checked {card.check.date}</p> : null}
              </li>
            ))}
          </ul>
          {cards.some(card => card.check) ? <p className="uv-read-caption">Where a card shows a checked date, it is the university&apos;s current published requirement and takes precedence over the notes and questions below, which were last reviewed in {guide.lastReviewed}.</p> : null}
        </section>

        <section className="uv-read-section" id="guide-differences" tabIndex={-1} aria-labelledby="guide-differences-title">
          <h2 id="guide-differences-title" className="uv-read-h2">What&apos;s actually different between universities</h2>
          <div className="uv-read-prose"><p>{guide.differentiatorNote}</p></div>
        </section>
      </GuideReading>
    </>
  );
}

async function CareerScopeGuideContent({ slug, preview }: { slug: string; preview?: string }) {
  const catalog = await getPublishedCatalog();
  const { universityById } = catalog;
  const codeCareer = getCareerScopeGuideBySlug(slug);
  if (!codeCareer) notFound();
  const previewContent = await guidePreview("career-scope", codeCareer.key, preview);
  const guide = previewContent ? mergeGuide(codeCareer, previewContent) : await publishedGuide("career-scope", codeCareer);
  const sources = publicSourceUrls(guide.sourceUrls);

  return (
    <>
      <JsonLd data={[breadcrumbJsonLd(`${guide.label} Career Scope`, guide.slug), faqJsonLd(guide.faqs)]} />
      {previewContent ? <p className="article-preview-banner" role="status">Preview. This is not live until an administrator publishes it.</p> : null}
      <GuideReading
        type="career-scope"
        crumb={`${guide.label} career scope`}
        title={`${guide.label} career scope, roles, and salary`}
        deck={careerDescription(guide.label, offeredBy(catalog, guide.key))}
        reviewed={guide.lastReviewed}
        sources={sources.length ? <SourceList urls={sources} guideSlug={slug} /> : null}
        toc={[
          { href: "#guide-overview", label: "Roles and industries, by university" },
          { href: "#guide-verify", label: "What we could and couldn't verify" },
        ]}
        faqs={guide.faqs}
        faqName="career-scope-guide-faq"
        related={crossLinks(guide.key, guide.label, "career-scope")}
        cta={<ReadingApplyCta
          title="Want a realistic outcome estimate?"
          copy="A counsellor can give you role- and experience-specific guidance instead of an unverified average."
          href={`/lead?intent=career-scope-guide&course=${guide.key}`}
          note={CTA_NOTE}
        />}
      >
        <section className="uv-read-section" id="guide-overview" tabIndex={-1} aria-labelledby="guide-overview-title">
          <h2 id="guide-overview-title" className="uv-read-h2">Roles and industries, by university</h2>
          <ul className="uv-read-cards">
            {guide.universityHighlights.map((row) => (
              <li key={row.universityId} className="uv-read-card">
                <h3>{universityById[row.universityId].name}</h3>
                <ul className="uv-read-chips" aria-label={`Roles named by ${universityById[row.universityId].shortName}`}>
                  {row.roles.map((role) => <li key={role}>{role}</li>)}
                </ul>
                {row.industries ? <p className="uv-read-card-muted">Industries: {row.industries.join(", ")}</p> : null}
              </li>
            ))}
          </ul>
        </section>

        <section className="uv-read-section" id="guide-verify" tabIndex={-1} aria-labelledby="guide-verify-title">
          <h2 id="guide-verify-title" className="uv-read-h2 is-warning">What we could and couldn&apos;t verify</h2>
          <div className="uv-read-warning">
            <TriangleAlert size={20} aria-hidden="true" />
            <p>{guide.unverifiedClaimsNote}</p>
          </div>
        </section>
      </GuideReading>
    </>
  );
}

async function UgcApprovalGuideContent({ slug }: { slug: string }) {
  const catalog = await getPublishedCatalog();
  const guide = getUgcApprovalGuideBySlug(slug);
  if (!guide) notFound();
  // Program status comes from each course's published UGC-DEB result (wave 2), never from text
  // written into this guide: the old hard-coded "Yes" answers overstated what had been checked.
  const programs = catalog.courses
    .filter((course) => courseKey(course.name) === guide.key)
    .map(catalog.courseWithUniversity)
    .map((course) => ({ course, summary: recognitionSummary(course), notes: guide.approvals.find((row) => row.universityId === course.universityId) }));
  const results = programs.map((item) => item.summary.recognition).filter((item): item is NonNullable<typeof item> => item !== null);
  const allListed = programs.length > 0 && programs.every((item) => item.summary.recognition?.status === "listed");
  const checkedAt = results.map((item) => item.checkedAt).sort().at(-1);
  const sources = [...new Set(results.length ? results.map((item) => item.sourceUrl) : ["https://deb.ugc.ac.in/"])];
  const faqs: Array<[string, string]> = [
    ...programs.map(({ course, summary }): [string, string] => [`Is the ${course.name} from ${course.university.name} UGC-entitled?`, summary.answer]),
    [`How can I check ${guide.label} entitlement myself?`, "Open deb.ugc.ac.in, go to Recognition, choose Online and the academic year you will be admitted in, and open the list. Find the university by its exact legal name and state, then find your exact programme name under it. A university's own \"UGC approved\" badge is not proof."],
    [`Is an online ${guide.label.replace(/^Online /, "")} valid for government jobs?`, "An online degree from an entitled program is treated the same as an on-campus degree under the UGC (Open and Distance Learning Programmes and Online Programmes) Regulations, 2020. Individual recruiters can set their own rules, so check the job notification too."],
  ];

  return (
    <>
      <JsonLd data={[breadcrumbJsonLd(`Is ${guide.label} UGC Approved`, guide.slug), faqJsonLd(faqs)]} />
      <GuideReading
        type="ugc-approval"
        crumb={`Is ${guide.label} UGC approved`}
        title={`Is ${guide.label} UGC approved? Validity explained`}
        deck={ugcDescription(guide.label, offeredBy(catalog, guide.key))}
        reviewed={checkedAt ? formatCheckedDate(checkedAt) : guide.lastReviewed}
        sources={<SourceList urls={sources} guideSlug={slug} />}
        toc={[{ href: "#guide-overview", label: "Status by university" }]}
        faqs={faqs}
        faqName="ugc-approval-guide-faq"
        related={crossLinks(guide.key, guide.label, "ugc-approval")}
        cta={<ReadingApplyCta
          title="Still unsure about validity?"
          copy={`A counsellor can walk you through the exact entitlement documentation for ${guide.label}.`}
          href={`/lead?intent=ugc-approval-guide&course=${guide.key}`}
          note={CTA_NOTE}
        />}
      >
        <section className="uv-read-section" id="guide-overview" tabIndex={-1} aria-labelledby="guide-overview-title">
          {allListed ? (
            <p className="uv-read-banner is-listed">
              Every program below is on the official UGC-DEB online list for {results[0].academicYear} (checked {formatCheckedDate(checkedAt!)}). Check deb.ugc.ac.in again before you enrol.
            </p>
          ) : (
            <p className="uv-read-banner">
              Not every program below has a confirmed {results[0]?.academicYear || "2026-27"} listing yet. Read each university&apos;s status before relying on it.
            </p>
          )}
          <h2 id="guide-overview-title" className="uv-read-h2">Status by university</h2>
          <ul className="uv-read-cards">
            {programs.map(({ course, summary, notes }) => (
              <li key={course.id} className="uv-read-card">
                <div className="uv-read-card-head">
                  <h3><Link href={`/courses/${course.slug}#sec-recognition`}>{course.university.name}</Link></h3>
                  <span className={`uv-tag uv-tag-strong ${summary.recognition?.status === "listed" ? "uv-tag-success" : summary.recognition ? "uv-tag-warning" : "uv-tag-neutral"}`}>
                    {summary.recognition?.status === "listed" ? `On the ${summary.recognition.academicYear} list` : summary.recognition ? "Confirm awarding university" : "Check in progress"}
                  </span>
                </div>
                {summary.recognition ? (
                  <>
                    <dl className="uv-read-facts">
                      <div><dt>Listed under</dt><dd>{summary.recognition.listedUnder}</dd></div>
                      <div><dt>Programme as printed</dt><dd>{summary.recognition.listedProgramme}</dd></div>
                    </dl>
                    {summary.recognition.note ? <p className="uv-read-card-warning">{summary.recognition.note}</p> : null}
                    <p className="source-check">Source: <a href={summary.recognition.sourceUrl} target="_blank" rel="noopener noreferrer">official UGC-DEB list</a> · checked {formatCheckedDate(summary.recognition.checkedAt)}</p>
                  </>
                ) : <p>{RECOGNITION_STATUS_2026_27}</p>}
                {notes?.naac || notes?.aicte ? <dl className="uv-read-facts is-muted">
                  {notes?.naac ? <div><dt>NAAC (university level)</dt><dd>{notes.naac}</dd></div> : null}
                  {notes?.aicte ? <div><dt>AICTE (university level)</dt><dd>{notes.aicte}</dd></div> : null}
                </dl> : null}
              </li>
            ))}
          </ul>
        </section>
      </GuideReading>
    </>
  );
}
