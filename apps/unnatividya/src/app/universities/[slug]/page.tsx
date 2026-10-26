export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight, Award, BookOpen, Briefcase, BriefcaseBusiness, CalendarDays, ChevronRight, ClipboardCheck, CreditCard, ExternalLink,
  FileText, GraduationCap, Headset, Banknote, Gift, Medal, MapPin, MessagesSquare, PiggyBank, ShieldCheck, UserCheck, Users, type LucideIcon,
} from "lucide-react";
import { STREAM_ICONS } from "@/components/course-card";
import { FaqAccordion } from "@/components/faq-accordion";
import { JsonLd } from "@/components/json-ld";
import { SaveButton } from "@/components/save-button";
import { SectionTabs } from "@/components/section-tabs";
import { formatFee } from "@/lib/catalog-format";
import { universityMedia } from "@/data/media";
import { nirfUniversityRankings } from "@/data/nirf-rankings";
import { publicAssetExists } from "@/lib/asset-exists";
import { approvalIconWidth, getApprovalIcon } from "@/lib/approval-icons";
import { withSocial } from "@/lib/page-metadata";
import { publicSourceUrls } from "@/lib/source-checks";
import { FeeGroupSwitch, GroupEmiPill, GroupFeeText } from "@/components/fee-group";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const catalog = await getPublishedCatalog();
  const { getUniversityBySlug } = catalog;
  const { slug } = await params;
  const university = getUniversityBySlug(slug);
  if (!university) return {};
  const title = `${university.name} Online Degrees`;
  const description = `Explore ${university.name} online degrees, fees, approvals, career support, and eligibility.`;
  return withSocial({
    title,
    description,
    alternates: { canonical: `/universities/${university.slug}` },
    openGraph: { title, description, images: [universityMedia[university.id].src] },
  });
}

// Icons picked from each published label, so the content stays the CMS's own (spec C §2.3 #7–8).
function supportIcon(label: string): LucideIcon {
  const text = label.toLowerCase();
  if (text.includes("resume")) return FileText;
  if (text.includes("interview")) return MessagesSquare;
  if (text.includes("job")) return Briefcase;
  if (text.includes("alumni") || text.includes("network")) return Users;
  return Headset;
}

function scholarshipIcon(label: string): LucideIcon {
  const text = label.toLowerCase();
  if (text.includes("merit")) return Medal;
  if (text.includes("emi")) return CreditCard;
  if (text.includes("defence")) return ShieldCheck;
  if (text.includes("alumni")) return GraduationCap;
  if (text.includes("abled")) return Users;
  if (text.includes("northeast") || text.includes("regional")) return MapPin;
  return Gift;
}

// Hostname plus path, so two pages on the same site stay distinguishable.
function sourceLabel(url: string) {
  const { hostname, pathname } = new URL(url);
  return `${hostname.replace(/^www\./, "")}${pathname === "/" ? "" : pathname}`;
}

// "2–3 years" from the listed durations, without the design's "2–2 years" edge case.
function durationRange(durations: string[]) {
  const months = [...new Set(durations.map((value) => parseInt(value, 10)).filter((value) => Number.isFinite(value) && value > 0))].sort((a, b) => a - b);
  if (!months.length) return null;
  const inYears = months.every((value) => value % 12 === 0);
  const format = (value: number) => String(inYears ? value / 12 : value);
  const unit = inYears ? (months[months.length - 1] === 12 ? "year" : "years") : "months";
  return months.length === 1 ? `${format(months[0])} ${unit}` : `${format(months[0])}–${format(months[months.length - 1])} ${unit}`;
}

export default async function UniversityDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const catalog = await getPublishedCatalog();
  const { courses, getUniversityBySlug, universities, universityEnrichmentById } = catalog;
  const { slug } = await params;
  const university = getUniversityBySlug(slug);
  if (!university) notFound();

  const universityCourses = courses.filter((course) => course.universityId === university.id);
  const undergraduateCourses = universityCourses.filter((course) => course.level === "UG");
  const postgraduateCourses = universityCourses.filter((course) => course.level === "PG");
  const fees = universityCourses.map((course) => course.fee).filter((fee) => Number.isFinite(fee) && fee > 0);
  const lowestTuition = Math.min(...fees);
  const highestTuition = Math.max(...fees);
  const duration = durationRange(universityCourses.map((course) => course.duration));
  const otherUniversities = universities.filter((other) => other.id !== university.id);
  const enrichment = universityEnrichmentById[university.id] || {};
  const nirfRanking = nirfUniversityRankings[university.id];
  const media = universityMedia[university.id];
  const availablePartnerLogos = media.partnerLogos.filter((logo) => publicAssetExists(logo));
  const sources = publicSourceUrls(enrichment.sourceUrls);
  const displayedFaqs: Array<[string, string]> = enrichment.faqs || [
    [`Are ${university.shortName} online degrees UGC-entitled?`, `${university.name} programs listed on Unnati Vidya are maintained for UGC-entitled online degree comparison and should be verified for the current admission cycle before enrolment.`],
    ["Can I compare all programs from this university?", "Yes. Use the listed program cards or the compare page to place up to three programs side by side."],
    ["Does Unnati Vidya charge counselling fees?", "No. Counselling is free for learners."],
  ];
  const factTiles: Array<[string, string]> = enrichment.factTiles || [
    ["Established", String(university.established)],
    ["Location", university.city],
    ["Online learners", university.learners],
    ["Annual fee from", university.feeFrom],
    ["Batches", "January & July"],
    ["Exams", "Online proctored"],
  ];
  // Learner counts are a deferred claim (claims register), so Key highlights leave them out (UI redesign Q19).
  // "Annual fee from" was a hand-entered figure with no source that disagreed with the catalog; the
  // listed tuition range below is worked out from the published programs instead.
  const shownTiles = factTiles.filter(([label]) => !["online learners", "annual fee from"].includes(label.trim().toLowerCase()));
  const highlights: Array<[string, string]> = [
    ...shownTiles.slice(0, 2),
    ...(fees.length ? [["Listed total tuition (Indian applicants)", lowestTuition === highestTuition ? formatFee(lowestTuition) : `${formatFee(lowestTuition)} – ${formatFee(highestTuition)}`] as [string, string]] : []),
    ...shownTiles.slice(2),
  ];
  const siteUrl = process.env.NEXT_PUBLIC_UNNATIVIDYA_SITE_URL || "https://unnatividya.com";
  const universityJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollegeOrUniversity",
    name: university.name,
    alternateName: university.shortName,
    url: `${siteUrl}/universities/${university.slug}`,
    address: university.city,
    foundingDate: String(university.established),
    description: university.about,
    // No aggregateRating: the visible rating isn't backed by reviews shown on the page, which
    // Google's review-snippet rules require (next-phase plan T1, owner decision 4). Stars stay visible.
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: `${university.shortName} online degrees`,
      itemListElement: universityCourses.map((course) => ({
        "@type": "Course",
        name: course.name,
        url: `${siteUrl}/courses/${course.slug}`,
      })),
    },
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "Universities", item: `${siteUrl}/universities` },
      { "@type": "ListItem", position: 3, name: university.name, item: `${siteUrl}/universities/${university.slug}` },
    ],
  };
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: displayedFaqs.map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };
  const heroStats: Array<[LucideIcon, string, string]> = [
    [BookOpen, `${universityCourses.length} program${universityCourses.length === 1 ? "" : "s"}`, "Online degrees"],
    [GraduationCap, `${undergraduateCourses.length} UG · ${postgraduateCourses.length} PG`, "Degree levels"],
    ...(duration ? [[CalendarDays, duration, "Program duration"] as [LucideIcon, string, string]] : []),
    [Banknote, fees.length ? `${formatFee(lowestTuition)}+` : "Confirm", "Listed tuition from (Indian applicants)"],
    [Briefcase, `${university.placement}%`, "Placement assistance, university-wide"],
  ];

  return <PublishedCatalogBoundary>{(
    <div className="uvu-page">
      <JsonLd data={[universityJsonLd, breadcrumbJsonLd, faqJsonLd]} />
      <section className="uvu-detail-hero">
        <div className="uvu-detail-hero-inner">
          <nav aria-label="Breadcrumb">
            <ol className="uv-breadcrumb">
              <li><Link href="/">Home</Link></li>
              <li><Link href="/universities">Universities</Link></li>
              <li><span aria-current="page">{university.name}</span></li>
            </ol>
          </nav>
          <div className="uvu-detail-grid">
            <div>
              <span className="uvu-logo-tile is-large"><Image src={media.logo} alt={`${university.shortName} logo`} width={46} height={46} /></span>
              <h1 className="uvu-detail-title">{university.name}</h1>
              <p className="uvu-detail-tagline">{university.city} · Established {university.established}</p>
              <p className="uvu-detail-rating"><span aria-hidden="true">★</span> <b>{university.rating}</b><span className="sr-only"> out of 5</span> ({university.reviews.toLocaleString("en-IN")} reviews)</p>
              <p className="uvu-detail-about">{university.about}</p>
              <div className="uvu-detail-actions">
                <Link href={`/lead?university=${university.id}`} rel="nofollow" className="btn primary large" data-open-lead>Apply now</Link>
                <Link href={`/courses?university=${university.id}`} className="btn secondary large">Compare {university.shortName} programs <ArrowRight size={18} aria-hidden="true" /></Link>
              </div>
            </div>
            <div className="uvu-detail-media">
              <Image src={media.src} alt={media.alt} fill sizes="(max-width: 960px) calc(100vw - 32px), 580px" priority />
            </div>
          </div>
          <ul className="uvu-stat-strip" aria-label={`${university.shortName} at a glance`}>
            {heroStats.map(([Icon, value, label]) => <li key={label}>
              <span className="uvu-stat-icon" aria-hidden="true"><Icon size={22} /></span>
              <span><strong>{value}</strong><small>{label}</small></span>
            </li>)}
          </ul>
        </div>
      </section>

      <SectionTabs
        label="University sections"
        items={[
          { label: "Overview", href: "#sec-about" },
          { label: "Online programs", href: "#sec-programs" },
          { label: "Recognition", href: "#sec-rankings" },
          { label: "Admission", href: "#sec-admission" },
          { label: "Placements", href: "#sec-placements" },
          { label: "Scholarships", href: "#sec-scholarships" },
          { label: "FAQs", href: "#sec-faq" },
        ]}
      />

      <div className="uv-shell uvu-detail-main">
        <div className="uvu-pair" id="sec-about" tabIndex={-1}>
          <section className="uvu-card-panel" aria-labelledby="about-title">
            <h2 id="about-title" className="uvu-panel-title">About {university.shortName} online</h2>
            {(enrichment.overview || [university.about]).map((paragraph) => <p className="uvu-panel-copy" key={paragraph}>{paragraph}</p>)}
            <a href="#sec-rankings" className="uvu-inline-link">University-level approvals and NIRF result <ArrowRight size={16} aria-hidden="true" /></a>
          </section>
          <section className="uvu-card-panel" aria-labelledby="highlights-title">
            <h2 id="highlights-title" className="uvu-panel-title">Key highlights</h2>
            <dl className="uvu-highlights">
              {highlights.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
            </dl>
          </section>
        </div>

        <section className="uvu-block" id="sec-programs" aria-labelledby="programs-title" tabIndex={-1}>
          <div className="uv-section-head uvu-block-head">
            <div>
              <h2 id="programs-title" className="uv-h2 is-inner">Online programs at {university.name}</h2>
              <p className="uvu-block-sub">The figures below are each program&apos;s listed total tuition for the applicant group you choose. Open a course to check eligibility, applicant-category fees, recognition and the current intake.</p>
              <FeeGroupSwitch id="university-fee-group" className="uvu-fee-group" />
            </div>
            <Link href={`/courses?university=${university.id}`} className="uv-section-link">View all programs <span aria-hidden="true">→</span></Link>
          </div>
          {([["Undergraduate degrees", undergraduateCourses], ["Postgraduate degrees", postgraduateCourses]] as const).filter(([, group]) => group.length).map(([title, group]) => <div className="uvu-prog-group" key={title}>
            <h3>{title}</h3>
            <div className="uvu-prog-grid">
              {group.map((course) => {
                const Icon = STREAM_ICONS[course.stream] || BriefcaseBusiness;
                const specs = course.specializations.filter((spec) => spec.toLowerCase() !== "general");
                return <article className="uvu-prog" key={course.id} aria-labelledby={`university-program-${course.id}`}>
                  <span className="uv-icon-tile" aria-hidden="true"><Icon size={24} /></span>
                  <div className="uvu-prog-body">
                    <h4 id={`university-program-${course.id}`}><Link href={`/courses/${course.slug}`} className="uvu-prog-link">{course.name}</Link></h4>
                    <p className="uvu-prog-meta"><span className="sr-only">Duration: </span>{course.duration} · <span className="sr-only">Listed total tuition: </span><GroupFeeText fee={course.fee} categoryFees={catalog.courseWithUniversity(course).categoryFees} short /></p>
                    <p className="uvu-prog-meta"><GroupEmiPill emi={course.emi} /></p>
                    <p className="uvu-prog-specs">{specs.length ? `${specs.length} specialisation${specs.length === 1 ? "" : "s"}` : "General program"}</p>
                  </div>
                  <SaveButton courseId={course.id} label={`${course.name}, ${university.shortName}`} />
                  <ChevronRight size={20} className="uvu-prog-chevron" aria-hidden="true" />
                </article>;
              })}
            </div>
          </div>)}
          {!universityCourses.length && <p className="uvu-block-sub">There are no published programs for this university yet.</p>}
        </section>

        <section className="uvu-card-panel uvu-block" id="sec-rankings" aria-labelledby="rankings-title" tabIndex={-1}>
          <div className="uvu-panel-head"><span className="uv-icon-tile" aria-hidden="true"><ShieldCheck size={22} /></span><h2 id="rankings-title" className="uvu-panel-title">Rankings &amp; recognition</h2></div>
          <p className="uvu-panel-sub">These are university-level claims. A program&apos;s online-mode listing depends on its awarding institution and academic session; check the Recognition section of the specific course before enrolment.</p>
          {nirfRanking ? <div className="uvu-nirf">
            <div className="uvu-nirf-rank">
              <p className="uvu-nirf-label"><Award size={16} aria-hidden="true" /> NIRF {nirfRanking.year}</p>
              <p className="uvu-nirf-result">{nirfRanking.result}</p>
              <p className="uvu-nirf-category">{nirfRanking.category} category</p>
            </div>
            <div className="uvu-nirf-body">
              <p><strong>Ranked institution:</strong> {nirfRanking.institution}</p>
              {nirfRanking.note ? <p>{nirfRanking.note}</p> : null}
              <p>NIRF ranks the institution, not its online courses or mode of delivery.</p>
              <a href={nirfRanking.sourceUrl} target="_blank" rel="noopener noreferrer" className="uvu-external">Check the official NIRF {nirfRanking.year} University table <ExternalLink size={15} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>
            </div>
          </div> : null}
          <h3 className="uvu-subhead">University-level approvals</h3>
          <ul className="uvu-badges">
            {(enrichment.rankings || university.approvals.slice(0, 4).map((approval) => ({ title: approval, note: "institutional recognition" }))).map((ranking) => {
              const icon = getApprovalIcon(ranking.title);
              return <li key={ranking.title}>
                <span className="uvu-badge-mark" aria-hidden="true">{icon ? <Image src={icon} alt="" width={approvalIconWidth(icon, 30)} height={30} className="uvu-badge-logo" /> : <Award size={22} />}</span>
                <strong>{ranking.title}</strong>
                <span>{ranking.note}</span>
              </li>;
            })}
          </ul>
        </section>

        <section className="uvu-card-panel uvu-block" id="sec-admission" aria-labelledby="admission-title" tabIndex={-1}>
          <div className="uvu-panel-head"><span className="uv-icon-tile" aria-hidden="true"><UserCheck size={22} /></span><h2 id="admission-title" className="uvu-panel-title">Admission process</h2></div>
          <p className="uvu-panel-sub">How an application usually moves at {university.shortName}. Confirm the current session&apos;s steps and documents with the university.</p>
          <ol className="uvu-steps">
            {(enrichment.admissionSteps || [
              { title: "Apply online", copy: "Fill the application on the university portal." },
              { title: "Upload documents", copy: "Mark sheets, ID proof and a photo, as the university requests." },
              { title: "Pay the fee", copy: "Pay the first instalment through the university's payment options." },
              { title: "University approval", copy: "The university reviews your documents and confirms admission." },
            ]).map((step) => <li key={step.title}>
              <strong>{step.title}</strong>
              <span>{step.copy}</span>
            </li>)}
          </ol>
        </section>

        <section className="uvu-card-panel uvu-block" id="sec-placements" aria-labelledby="placements-title" tabIndex={-1}>
          <div className="uvu-panel-head"><span className="uv-icon-tile" aria-hidden="true"><Briefcase size={22} /></span><h2 id="placements-title" className="uvu-panel-title">Placements &amp; career support</h2></div>
          <p className="uvu-panel-sub">Career support differs from a guaranteed job. The figures below are university-wide claims; their cohort, collection method and online-program scope are still being reviewed.</p>
          <dl className="uvu-outcomes">
            <div><dt>Placement assistance rate (university-wide)</dt><dd>{university.placement}%</dd></div>
            <div><dt>Average package (university-wide)</dt><dd>{university.avgPackage}</dd></div>
            <div><dt>Highest package (university-wide)</dt><dd>{university.highestPackage}</dd></div>
            <div><dt>Hiring partners (university-wide)</dt><dd>{university.partners}+</dd></div>
          </dl>
          <h3 className="uvu-subhead">Career support</h3>
          <ul className="uvu-support">
            {(enrichment.placementSupport || ["Resume clinics", "Mock interviews", "Job board access"]).map((support) => {
              const Icon = supportIcon(support);
              return <li key={support}><Icon size={20} aria-hidden="true" />{support}</li>;
            })}
          </ul>
          {availablePartnerLogos.length ? <>
            <h3 className="uvu-subhead">Hiring partners</h3>
            <ul className="uvu-partners" aria-label={`${university.shortName} hiring partners`}>
              {availablePartnerLogos.map((logo, index) => <li key={logo}><Image src={logo} alt={`${university.shortName} hiring partner ${index + 1}`} fill sizes="160px" /></li>)}
            </ul>
          </> : null}
          <p className="uvu-note">Placement assistance, not a guaranteed offer — as stated on the university&apos;s own pages.</p>
        </section>

        <section className="uvu-card-panel uvu-block" id="sec-scholarships" aria-labelledby="scholarships-title" tabIndex={-1}>
          <div className="uvu-panel-head"><span className="uv-icon-tile" aria-hidden="true"><PiggyBank size={22} /></span><h2 id="scholarships-title" className="uvu-panel-title">Scholarships &amp; fee concessions</h2></div>
          {enrichment.scholarships?.length ? <ul className="uvu-scholarships">
            {enrichment.scholarships.map((row, index) => {
              const Icon = scholarshipIcon(row[0]);
              return <li key={`${row[0]}-${index}`}>
                <Icon size={24} aria-hidden="true" />
                <h3>{row[0]}</h3>
                <dl><div><dt>Listed concession</dt><dd>{row[1]}</dd></div><div><dt>Proof required</dt><dd>{row[2]}</dd></div></dl>
              </li>;
            })}
          </ul> : <p className="uvu-panel-sub">Scholarship details are not listed yet. Confirm current offers and eligibility with the university.</p>}
          <p className="uvu-note">Confirm the current admission session, eligibility, required documents and whether concessions can be combined directly with the university.</p>
        </section>

        <section className="uvu-card-panel uvu-block uvu-before" aria-labelledby="before-title">
          <div className="uvu-panel-head"><span className="uv-icon-tile" aria-hidden="true"><ClipboardCheck size={22} /></span><h2 id="before-title" className="uvu-panel-title">Before choosing {university.shortName}</h2></div>
          <ul className="uvu-checklist">
            <li><a href="#sec-programs">Choose the exact degree and check its eligibility.</a></li>
            <li><a href="#sec-rankings">Check program recognition separately from university badges.</a></li>
            <li><a href="#sec-scholarships">Confirm your total payable and any concession terms.</a></li>
          </ul>
          {sources.length ? <div className="uvu-sources-row">
            <h3 id="sources-title" className="uvu-subhead">Sources</h3>
            <ul className="uvu-sources" aria-labelledby="sources-title">
              {sources.map((url) => <li key={url}><a href={url} target="_blank" rel="noopener noreferrer">{sourceLabel(url)}<ExternalLink size={14} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a></li>)}
              <li><Link href="/how-we-verify" className="is-strong">How we verify our data →</Link></li>
            </ul>
          </div> : null}
        </section>

        <section className="uvu-navy-strip uvu-block" aria-labelledby="apply-title">
          <div>
            <h2 id="apply-title">Get {university.shortName} brochure &amp; fee details</h2>
            <p>Talk to a counsellor about eligibility, scholarships and the next batch.</p>
          </div>
          <div className="uvu-navy-actions">
            <Link href={`/lead?university=${university.id}`} rel="nofollow" className="btn on-navy" data-open-lead>Apply now</Link>
            <Link href="/compare" className="btn outline-on-navy">Compare with others</Link>
          </div>
        </section>

        <div className="uvu-block">
          <FaqAccordion items={displayedFaqs} name="university-faq" id="sec-faq" subtitle={`Quick answers about ${university.name} and its online programs.`} />
        </div>

        {otherUniversities.length ? (
          <section className="uvu-block" aria-labelledby="others-title">
            <h2 id="others-title" className="uv-h2 is-inner uvu-others-title">Other universities to consider</h2>
            <div className="uvu-others">
              {otherUniversities.map((other) => {
                const otherFees = courses.filter((course) => course.universityId === other.id).map((course) => course.fee).filter((fee) => Number.isFinite(fee) && fee > 0);
                const otherMedia = universityMedia[other.id];
                return <Link href={`/universities/${other.slug}`} className="uvu-other" key={other.id}>
                  {otherMedia ? <span className="uvu-other-thumb"><Image src={otherMedia.src} alt="" fill sizes="110px" /></span> : null}
                  <span className="uvu-other-body">
                    <strong>{other.name}</strong>
                    <small>{other.city} · <span className="uvu-rating" aria-hidden="true">★</span> {other.rating}<span className="sr-only"> out of 5</span></small>
                    {otherFees.length ? <em>Listed tuition from {formatFee(Math.min(...otherFees))} (Indian applicants)</em> : null}
                  </span>
                  <ArrowRight size={20} className="uvu-other-arrow" aria-hidden="true" />
                </Link>;
              })}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )}</PublishedCatalogBoundary>;
}
