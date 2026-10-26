export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BriefcaseBusiness } from "lucide-react";
import { CourseCard, STREAM_ICONS } from "@/components/course-card";
import { FaqAccordion } from "@/components/faq-accordion";
import { SectionTabs } from "@/components/section-tabs";
import { universityMedia } from "@/data/media";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { formatFee } from "@/lib/catalog-format";
import { getSpecializationPageBySlug, siblingSpecializations, specializationDescription, specializationFaqs, specializationTitle } from "@/lib/specializations";
import { getCareerScopeGuideBySlug, getEligibilityGuideBySlug } from "@/data/guide-content";
import { withSocial } from "@/lib/page-metadata";
import { FeeGroupSwitch } from "@/components/fee-group";

const SITE_URL = process.env.NEXT_PUBLIC_UNNATIVIDYA_SITE_URL || "https://unnatividya.com";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const catalog = await getPublishedCatalog();
  const { slug } = await params;
  const page = getSpecializationPageBySlug(catalog, slug);
  if (!page) return {};
  return withSocial({ title: specializationTitle(page), description: specializationDescription(page), alternates: { canonical: `/specializations/${slug}` } });
}

export default async function SpecializationPage({ params }: { params: Promise<{ slug: string }> }) {
  const catalog = await getPublishedCatalog();
  const { slug } = await params;
  const page = getSpecializationPageBySlug(catalog, slug);
  if (!page) notFound();

  const faqs = specializationFaqs(page);
  const siblings = siblingSpecializations(page).filter((entry) => entry.others.length);
  const eligibilityGuide = getEligibilityGuideBySlug(`${page.courseKeyPart}-eligibility`);
  const careerScopeGuide = getCareerScopeGuideBySlug(`${page.courseKeyPart}-career-scope`);

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Specializations", item: `${SITE_URL}/specializations` },
      { "@type": "ListItem", position: 3, name: `${page.courseLabel} in ${page.specialization}`, item: `${SITE_URL}/specializations/${slug}` },
    ],
  };
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })),
  };

  const first = page.courses[0];
  const Icon = STREAM_ICONS[first.stream] || BriefcaseBusiness;
  const universityNames = [...new Set(page.courses.map((course) => course.university.name))];
  const fees = page.courses.map((course) => course.fee);
  const minFee = Math.min(...fees);
  const maxFee = Math.max(...fees);
  const emiValue = (emi: string) => Number(emi.replace(/[^\d.]/g, "")) || Infinity;
  const lowestEmi = [...page.courses].sort((a, b) => emiValue(a.emi) - emiValue(b.emi))[0]?.emi;
  const months = [...new Set(page.courses.map((course) => parseInt(course.duration, 10)).filter((value) => Number.isFinite(value) && value > 0))].sort((a, b) => a - b);
  const duration = months.length > 1 ? `${months[0]}–${months[months.length - 1]} months` : months.length ? `${months[0]} months` : first.duration;
  const compareIds = page.courses.slice(0, 3).map((course) => course.id);
  // Same format as compareHref (use-compare-list.ts), which is a client module.
  const compareLink = `/compare?add=${compareIds.map(encodeURIComponent).join(",")}`;

  return <PublishedCatalogBoundary>{(
    <div className="uvs-page">
      <JsonLd data={[breadcrumbJsonLd, faqJsonLd]} />
      <section className="uvs-detail-hero">
        <div className="uvs-detail-hero-inner">
          <nav aria-label="Breadcrumb">
            <ol className="uv-breadcrumb">
              <li><Link href="/">Home</Link></li>
              <li><Link href="/specializations">Specializations</Link></li>
              <li><span aria-current="page">{page.courseLabel} in {page.specialization}</span></li>
            </ol>
          </nav>
          <div className="uvs-identity">
            <span className="uvs-identity-tile" aria-hidden="true"><Icon size={32} /></span>
            <div>
              <p className="uvs-eyebrow">{first.level === "PG" ? "Postgraduate" : "Undergraduate"} · {first.stream}</p>
              <h1 className="uvs-detail-title">{page.courseLabel} in {page.specialization}</h1>
            </div>
          </div>
          <p className="uvs-detail-desc">
            The {page.specialization} specialization within the {page.courseLabel}, listed by {listNames(universityNames)} in our catalog. Fees, EMI and duration below refer to the base degree.
          </p>
          <dl className="uv-stat-strip uvs-stats">
            <div><dt>{universityNames.length === 1 ? "university lists it" : "universities list it"}</dt><dd>{universityNames.length}</dd></div>
            <div><dt>listed degree tuition (Indian applicants)</dt><dd>{minFee === maxFee ? formatFee(minFee) : `${formatFee(minFee)} – ${formatFee(maxFee)}`}</dd></div>
            {lowestEmi ? <div><dt>EMI from (Indian applicants)</dt><dd>{lowestEmi}</dd></div> : null}
            <div><dt>duration</dt><dd>{duration}</dd></div>
          </dl>
        </div>
      </section>

      <SectionTabs
        label="Specialization sections"
        items={[
          { label: "Fees & duration", href: "#specialization-fees" },
          ...(siblings.length ? [{ label: "Other specializations", href: "#specialization-siblings" as const }] : []),
          { label: "Career paths", href: "#specialization-careers" },
          { label: "Related guides", href: "#specialization-guides" },
          { label: "Questions", href: "#specialization-faq" },
        ]}
      />

      <div className="uv-shell uvs-detail-main">
        <section id="specialization-fees" aria-labelledby="specialization-fees-title" tabIndex={-1}>
          <div className="uv-section-head uvs-offer-head">
            <h2 id="specialization-fees-title" className="uv-h2 is-inner">Universities offering {page.specialization}</h2>
            {page.courses.length > 1 ? <div>
              <Link href={compareLink} className="btn primary uvs-compare">Compare these programs <ArrowRight size={18} aria-hidden="true" /></Link>
              <p className="uvs-compare-note">Verify your email to see the full comparison.</p>
            </div> : null}
          </div>
          <FeeGroupSwitch id="specialization-fee-group" className="uvs-fee-group" />
          <div className="uv-card-grid">
            {page.courses.map((course) => <CourseCard key={course.id} course={course} trackSource="specialization_detail" />)}
          </div>
          <p className="uvs-offer-note">
            Fee, EMI and duration refer to the base {page.courseLabel} program. Confirm specialization availability, selection timing, current tuition and any additional fees with the university.
          </p>
        </section>

        <div className="uvs-cards">
          {siblings.length ? (
            <section className="uvs-panel" id="specialization-siblings" aria-labelledby="specialization-siblings-title" tabIndex={-1}>
              <h2 id="specialization-siblings-title">Other {page.courseLabel} specializations</h2>
              {siblings.map(({ course, others }) => {
                const logo = universityMedia[course.universityId]?.logo;
                return <div className="uvs-sibling" key={course.id}>
                  <p className="uvs-sibling-name">
                    {logo ? <Image src={logo} alt="" width={22} height={22} /> : null}
                    <span>{course.university.name} lists {others.length + 1} specializations for {page.courseLabel}, including {page.specialization}. The others:</span>
                  </p>
                  <ul className="uvs-chips">
                    {others.map((other) => <li key={other.slug}><Link href={`/specializations/${other.slug}`}>{other.label}</Link></li>)}
                  </ul>
                </div>;
              })}
            </section>
          ) : null}

          <div className="uvs-stack">
            <section className="uvs-panel" id="specialization-careers" aria-labelledby="specialization-careers-title" tabIndex={-1}>
              <h2 id="specialization-careers-title">Career paths</h2>
              <p>
                Specialization-specific career outcomes aren&apos;t independently published by these universities — the career paths below are for {page.courseLabel} graduates generally, not verified as specific to the {page.specialization} track.
                {careerScopeGuide ? (
                  <> See the full <Link href={`/online-degree-guides/${careerScopeGuide.slug}`}>{page.courseLabel} career scope guide</Link> for real, source-attributed detail.</>
                ) : null}
              </p>
              <ul className="uvs-roles">
                {[...new Set(page.courses.flatMap((course) => course.careerRoles))].map((role) => <li key={role}>{role}</li>)}
              </ul>
            </section>

            <section className="uvs-panel" id="specialization-guides" aria-labelledby="specialization-guides-title" tabIndex={-1}>
              <h2 id="specialization-guides-title">Related guides</h2>
              <ul className="uvs-guides">
                <li><Link href={`/online-degree-guides/${page.courseKeyPart}-fees`}>{page.courseLabel} fees <ArrowRight size={18} aria-hidden="true" /></Link></li>
                {eligibilityGuide ? (
                  <li><Link href={`/online-degree-guides/${eligibilityGuide.slug}`}>{page.courseLabel} eligibility <ArrowRight size={18} aria-hidden="true" /></Link></li>
                ) : null}
              </ul>
            </section>
          </div>
        </div>

        <section className="uvu-navy-strip" aria-labelledby="specialization-help-title">
          <div>
            <h2 id="specialization-help-title">Not sure this specialization is right for you?</h2>
            <p>A counsellor can walk you through the {page.specialization} track against your career goals. Free service · no spam.</p>
          </div>
          <div className="uvu-navy-actions">
            <Link href={`/lead?intent=specialization&course=${page.courseKeyPart}`} rel="nofollow" className="btn on-navy" data-open-lead>Apply now</Link>
            <Link href={`/specializations?q=${encodeURIComponent(page.specialization)}`} className="btn outline-on-navy">Explore related specializations</Link>
          </div>
        </section>

        <FaqAccordion items={faqs} name="specialization-faq" id="specialization-faq" subtitle={`About the ${page.courseLabel} in ${page.specialization}.`} />
      </div>
    </div>
  )}</PublishedCatalogBoundary>;
}

function listNames(names: string[]) {
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names.join("");
}
