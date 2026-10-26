export const dynamic = "force-dynamic";
import { PublishedCatalogBoundary } from "@/components/published-catalog-boundary";
import { getPublishedCatalog } from "@/lib/catalog-snapshot-server";
import type { Metadata } from "next";
import Link from "next/link";
import { Calculator } from "lucide-react";
import { JsonLd } from "@/components/json-ld";
import { FaqAccordion } from "@/components/faq-accordion";
import { Byline, ReadingApplyCta, ReadingHero, ReadingToc, RelatedRows } from "@/components/reading-page";
import { feeCheck, feeGuides, formatFee, indianSemesterPayment } from "@/lib/fee-guides";
import { CONFIRM_WITH_UNIVERSITY, programApplicationFee } from "@/lib/program-facts";
import { formatCategoryFee } from "@/lib/prepared-category-fees";
import { formatCheckedDate } from "@/lib/source-checks";
import { listNames, withSocial } from "@/lib/page-metadata";
import { FeeGroupSwitch, GroupFeeText } from "@/components/fee-group";

const SITE_URL = process.env.NEXT_PUBLIC_UNNATIVIDYA_SITE_URL || "https://unnatividya.com";

export const metadata: Metadata = withSocial({
  title: "Online Degree Fees 2026-27: MUJ, SMU and Amity",
  description: "Listed tuition for every online degree we list at Manipal University Jaipur, Sikkim Manipal University and Amity Online, with semester payments where reviewed and what the fee leaves out.",
  alternates: { canonical: "/online-degree-guides/fees" },
});

// Wave 4 hub C2 (decision W7): every program's listed fee, read from the published catalog so it
// always matches the course pages. Grouped by degree, in catalog order within each group; nothing
// is ranked or highlighted.
export default async function OnlineDegreeFeesPage() {
  return <PublishedCatalogBoundary><FeesHub /></PublishedCatalogBoundary>;
}

async function FeesHub() {
  const catalog = await getPublishedCatalog();
  const guides = feeGuides(catalog);
  const courses = guides.flatMap(guide => guide.courses);
  const universities = [...new Map(courses.map(course => [course.universityId, course.university])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const fees = courses.map(course => course.fee);
  const checks = courses.map(course => feeCheck(course)).filter(check => check !== null);
  const latestCheck = checks.map(check => check.checkedAt).sort().at(-1);
  const applicationFees = universities.map(university => {
    const values = [...new Set(courses.filter(course => course.universityId === university.id).map(course => programApplicationFee(course)))];
    return `${university.shortName}: ${values.length === 1 ? values[0] : "varies by program"}`;
  });

  const faqs: Array<[string, string]> = [
    ["Why does the same degree cost different amounts at different universities?", "Each university sets its own fee. A higher fee does not by itself mean a better or more valid degree: validity depends on the program's UGC-DEB entitlement for your admission session. Compare the curriculum, eligibility and support alongside the fee."],
    ["Is the listed fee the amount I will pay?", "Not always. The listed amount is total tuition for Indian applicants. Your applicant category, any discount or scholarship, the application fee and other charges the university confirms can change what you pay."],
    ["Do NRI and international applicants pay a different fee?", "They can. MUJ and SMU list NRI and foreign-national fees in US dollars. Where a reviewed category fee is published, the degree's fee guide shows it in the university's own currency. Otherwise, confirm your category's fee with the university."],
    ["How current are these fees?", latestCheck
      ? `They are the amounts in our published catalog. Each program shows the date its fee was last checked against the official page where we have one; the most recent check was on ${formatCheckedDate(latestCheck)}. Confirm the current amount before you pay.`
      : "They are the amounts in our published catalog. Universities can change fees between batches, so confirm the current amount before you pay."],
  ];
  const schema = [
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Online Degree Guides", item: `${SITE_URL}/online-degree-guides` },
      { "@type": "ListItem", position: 3, name: "Online degree fees 2026-27", item: `${SITE_URL}/online-degree-guides/fees` },
    ] },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) },
  ];

  return <>
    <JsonLd data={schema} />
    <article className="uv-read uv-read-guide uv-fees-hub">
      <ReadingHero
        crumbs={[{ label: "Home", href: "/" }, { label: "Online degree guides", href: "/online-degree-guides" }, { label: "Fees 2026-27" }]}
        tag="Fees"
        title="Online degree fees 2026-27 at MUJ, SMU and Amity"
        deck={`Listed tuition for all ${courses.length} programs we list at ${listNames(universities.map(university => university.shortName))}, from our published catalog. Confirm current fees and other charges with the university.`}
        meta={<Byline />}
      />
      <div className="uv-read-body">
        <ReadingToc label="On this page" navLabel="Page sections" items={[
          { href: "#fees-glance", label: "At a glance" },
          { href: "#fees-by-degree", label: "Fees by degree" },
          { href: "#fees-extra", label: "What the listed fee leaves out" },
          { href: "#fees-paying", label: "Paying in parts" },
          { href: "#guide-faq", label: "Frequently asked questions" },
          { href: "#fees-related", label: "Tools and guides" },
        ]} />

        <section className="uv-read-section" id="fees-glance" tabIndex={-1} aria-labelledby="fees-glance-title">
          <h2 id="fees-glance-title" className="uv-read-h2">At a glance</h2>
          <dl className="uv-fees-glance">
            <div><dt>Programs</dt><dd>{courses.length} programs in {guides.length} degrees, at {universities.length} universities</dd></div>
            <div><dt>Listed tuition</dt><dd>{formatFee(Math.min(...fees))} to {formatFee(Math.max(...fees))} for the full program, Indian applicants</dd></div>
            <div><dt>Application fee</dt><dd>{applicationFees.join("; ")}</dd></div>
            <div><dt>Fees checked</dt><dd>{checks.length ? `${checks.length} of ${courses.length} programs show a dated check against the official page; the latest was on ${formatCheckedDate(latestCheck!)}` : "Dates appear on each program as its fee is reviewed against the official page"}</dd></div>
          </dl>
          <p className="uv-read-caption">The order within each degree follows the listed tuition. It is not a ranking.</p>
        </section>

        <section className="uv-read-section" id="fees-by-degree" tabIndex={-1} aria-labelledby="fees-by-degree-title">
          <h2 id="fees-by-degree-title" className="uv-read-h2">Fees by degree</h2>
          <FeeGroupSwitch id="hub-fee-group" className="uv-read-fee-group" />
          <nav aria-label="Jump to a degree" className="uv-fees-jump">
            <ul>{guides.map(guide => <li key={guide.key}><a href={`#fees-${guide.key}`}>{guide.label}</a></li>)}</ul>
          </nav>
          {guides.map(guide => {
            const showSemester = guide.courses.some(course => indianSemesterPayment(course));
            return <section key={guide.key} id={`fees-${guide.key}`} tabIndex={-1} className="uv-fees-degree" aria-labelledby={`fees-${guide.key}-title`}>
              <h3 id={`fees-${guide.key}-title`}>{guide.label}</h3>
              <div className="uv-read-table" role="region" aria-label={`${guide.label} fees`} tabIndex={0}>
                <table className="is-compact">
                  <caption className="sr-only">{guide.label}: listed total tuition for Indian applicants, by university</caption>
                  <thead><tr>
                    <th scope="col">University</th>
                    <th scope="col">Listed tuition</th>
                    {showSemester ? <th scope="col">Per semester</th> : null}
                    <th scope="col">Duration</th>
                  </tr></thead>
                  <tbody>{guide.courses.map(course => {
                    const check = feeCheck(course);
                    const semester = indianSemesterPayment(course);
                    return <tr key={course.id}>
                      <th scope="row">
                        <Link href={`/courses/${course.slug}`} className="uv-read-table-link">{course.university.shortName}<span className="sr-only">: {course.name}</span></Link>
                        {check ? <span className="uv-read-cell-source">Checked {check.date}</span> : null}
                      </th>
                      <td className="uv-read-num"><GroupFeeText fee={course.fee} categoryFees={course.categoryFees} /></td>
                      {showSemester ? <td>{semester ? <GroupFeeText fee={course.fee} categoryFees={course.categoryFees} variant="semester" /> : CONFIRM_WITH_UNIVERSITY}</td> : null}
                      <td>{course.duration}</td>
                    </tr>;
                  })}</tbody>
                </table>
              </div>
              <p className="uv-fees-guide-link"><Link href={`/online-degree-guides/${guide.slug}`}>{guide.label} fee guide: payment, EMI and outside-India fees →</Link></p>
            </section>;
          })}
        </section>

        <section className="uv-read-section" id="fees-extra" tabIndex={-1} aria-labelledby="fees-extra-title">
          <h2 id="fees-extra-title" className="uv-read-h2">What the listed fee leaves out</h2>
          <div className="uv-read-prose">
            <ul>
              <li><strong>Application fee.</strong> {applicationFees.join("; ")}.</li>
              <li><strong>Your applicant category.</strong> NRI and international applicants can pay a different fee; MUJ and SMU list theirs in US dollars. Each degree&apos;s fee guide shows it where a reviewed amount is published.</li>
              <li><strong>Discounts and scholarships.</strong> They are listed at university level and confirmed at admission, so the amount you pay can be lower than the listed fee.</li>
              <li><strong>Other charges.</strong> Ask the university about exam, re-registration or other charges that apply to you before you pay.</li>
              <li><strong>Your own costs.</strong> A laptop, internet and study time are not in any university fee.</li>
            </ul>
          </div>
          <div className="uv-read-compare">
            <div>
              <p className="uv-read-compare-title">Add it up for up to three programs</p>
              <p className="uv-read-compare-copy">The total cost planner shows published tuition and semester schedules, and lets you add other costs yourself. Free, no sign-up.</p>
            </div>
            <Link href="/tools/total-cost" className="btn secondary guide-cost-link"><Calculator size={18} aria-hidden="true" />Open the total cost planner</Link>
          </div>
        </section>

        <section className="uv-read-section" id="fees-paying" tabIndex={-1} aria-labelledby="fees-paying-title">
          <h2 id="fees-paying-title" className="uv-read-h2">Paying in parts</h2>
          <div className="uv-read-prose">
            <p>Every university listed offers no-cost EMI. The monthly amount for each program is on its course page and fee guide. Approval and terms come from the lender, so ask for the full terms in writing, including any processing fee, before you sign.</p>
            <p>Where a program&apos;s fee has been reviewed against the official page, its fee guide also lists the university&apos;s semester, annual and one-time payment options.</p>
          </div>
        </section>

        <div className="uv-read-section"><FaqAccordion id="guide-faq" name="fees-hub-faq" items={faqs} subtitle={null} /></div>

        <ReadingApplyCta
          title="Get the exact fee for your category"
          copy="A counsellor will confirm the current fee, payment plan and scholarship eligibility for the program you choose."
          href="/lead?intent=fee-guide"
          note="Free service · no spam"
        />

        <RelatedRows id="fees-related" title="Tools and guides" items={[
          { href: "/tools/total-cost", label: "Total cost planner" },
          { href: "/tools/emi-calculator", label: "EMI calculator" },
          { href: "/online-degree-guides/international", label: "Fees and documents for NRIs and international learners" },
          { href: "/online-degree-guides/mba-fees", label: "Online MBA fees compared" },
          { href: "/how-we-verify", label: "How we verify our data" },
        ]} />
      </div>
    </article>
  </>;
}
