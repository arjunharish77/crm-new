import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { FaqAccordion } from "@/components/faq-accordion";
import { FeeGroupSwitch, GroupFeeText } from "@/components/fee-group";
import { Byline, ReadingApplyCta, ReadingHero, ReadingToc, RelatedRows } from "@/components/reading-page";
import { getCareerScopeGuideBySlug, getEligibilityGuideBySlug } from "@/data/guide-content";
import type { CatalogReader } from "@/lib/catalog-snapshot";
import { allComparisonPairs } from "@/lib/comparisons";
import { feeGuides } from "@/lib/fee-guides";
import { publishedGuide } from "@/lib/guides-server";
import { listNames } from "@/lib/page-metadata";

const SITE_URL = process.env.NEXT_PUBLIC_UNNATIVIDYA_SITE_URL || "https://unnatividya.com";

export type DegreeFamily = {
  slug: string; tag: string; title: string; deck: string; crumb: string;
  groups: Array<{ id: string; title: string; intro: string; keys: string[] }>;
  faqs: Array<[string, string]>;
  related: Array<{ href: string; label: string }>;
};

// Wave 5 clusters D2 and D3 (decision V4): a degree-family hub read from the published catalog and the
// published guide text (entry requirements and roles as each university states them). Universities
// within a degree are in catalog order by listed tuition; nothing is ranked or recommended.
export async function DegreeFamilyHub({ catalog, family }: { catalog: CatalogReader; family: DegreeFamily }) {
  const guides = new Map(feeGuides(catalog).map(guide => [guide.key, guide]));
  const pairs = allComparisonPairs(catalog);
  const groups = await Promise.all(family.groups.map(async group => ({
    ...group,
    degrees: (await Promise.all(group.keys.map(async key => {
      const guide = guides.get(key);
      if (!guide) return null;
      const eligibilityCode = getEligibilityGuideBySlug(`${key}-eligibility`);
      const careerCode = getCareerScopeGuideBySlug(`${key}-career-scope`);
      const eligibility = eligibilityCode ? await publishedGuide("eligibility", eligibilityCode) : null;
      const career = careerCode ? await publishedGuide("career-scope", careerCode) : null;
      return { key, guide, eligibility, career, comparisons: pairs.filter(pair => pair.key === key) };
    }))).filter(item => item !== null),
  })));
  const programCount = groups.reduce((sum, group) => sum + group.degrees.reduce((n, degree) => n + degree.guide.courses.length, 0), 0);
  const schema = [
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Online Degree Guides", item: `${SITE_URL}/online-degree-guides` },
      { "@type": "ListItem", position: 3, name: family.crumb, item: `${SITE_URL}/online-degree-guides/${family.slug}` },
    ] },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: family.faqs.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) },
  ];

  return <>
    <JsonLd data={schema} />
    <article className="uv-read uv-read-guide">
      <ReadingHero crumbs={[{ label: "Home", href: "/" }, { label: "Online degree guides", href: "/online-degree-guides" }, { label: family.crumb }]} tag={family.tag} title={family.title} deck={family.deck} meta={<Byline />} />
      <div className="uv-read-body">
        <ReadingToc label="On this page" navLabel="Page sections" items={[
          ...groups.map(group => ({ href: `#${group.id}`, label: group.title })),
          { href: "#guide-faq", label: "Frequently asked questions" },
          { href: "#family-related", label: "Tools and guides" },
        ]} />
        <p className="uv-read-caption">{programCount} programs. Within each degree, universities are listed by listed tuition; this is not a ranking. Entry requirements and roles are as each university states them; confirm them for your session.</p>
        <FeeGroupSwitch id={`${family.slug}-fee-group`} className="uv-read-fee-group" />

        {groups.map(group => <section key={group.id} className="uv-read-section" id={group.id} tabIndex={-1} aria-labelledby={`${group.id}-title`}>
          <h2 id={`${group.id}-title`} className="uv-read-h2">{group.title}</h2>
          <div className="uv-read-prose"><p>{group.intro}</p></div>
          {group.degrees.map(({ key, guide, eligibility, career, comparisons }) => <section key={key} className="uv-family-degree" id={`${group.id}-${key}`} aria-labelledby={`${group.id}-${key}-title`}>
            <h3 id={`${group.id}-${key}-title`}>{guide.label}</h3>
            <p className="uv-family-offered">Offered by {listNames(guide.courses.map(course => course.university.shortName))} · {[...new Set(guide.courses.map(course => course.duration))].join(" or ")}</p>
            <div className="uv-read-table" role="region" aria-label={`${guide.label} by university`} tabIndex={0}>
              <table className="is-compact">
                <caption className="sr-only">{guide.label}: tuition, specialisations and entry requirement by university</caption>
                <thead><tr><th scope="col">University</th><th scope="col">Tuition</th><th scope="col">Specialisations</th><th scope="col">Entry requirement</th></tr></thead>
                <tbody>{guide.courses.map(course => {
                  const fact = eligibility?.facts.find(item => item.universityId === course.universityId)?.fact;
                  const specs = course.specializations.filter(spec => !/^general$|\bmedium$/i.test(spec));
                  return <tr key={course.id}>
                    <th scope="row"><Link href={`/courses/${course.slug}`} className="uv-read-table-link">{course.university.shortName}<span className="sr-only">: {course.name}</span></Link></th>
                    <td className="uv-read-num"><GroupFeeText fee={course.fee} categoryFees={course.categoryFees} short /></td>
                    <td>{specs.length ? specs.length : "General"}</td>
                    <td className="uv-family-entry">{fact || "Confirm with the university"}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
            {career ? <p className="uv-family-roles"><strong>Roles the universities name:</strong> {[...new Set(career.universityHighlights.flatMap(item => item.roles))].slice(0, 8).join(", ")}.</p> : null}
            <ul className="uv-family-links">
              <li><Link href={`/online-degree-guides/${guide.slug}`}>Fees</Link></li>
              {eligibility ? <li><Link href={`/online-degree-guides/${eligibility.slug}`}>Eligibility</Link></li> : null}
              {career ? <li><Link href={`/online-degree-guides/${career.slug}`}>Career scope</Link></li> : null}
              {comparisons.map(pair => <li key={pair.slug}><Link href={`/compare/${pair.key}/${pair.slug}`}>{pair.left.university.shortName} vs {pair.right.university.shortName}</Link></li>)}
            </ul>
          </section>)}
        </section>)}

        <div className="uv-read-section"><FaqAccordion id="guide-faq" name={`${family.slug}-faq`} items={family.faqs} subtitle={null} /></div>
        <ReadingApplyCta title="Not sure which degree fits?" copy="A counsellor will go through your qualifications and goals with you, for free." href={`/lead?intent=${family.slug}-guide`} note="Free service · no spam" />
        <RelatedRows id="family-related" title="Tools and guides" items={family.related} />
      </div>
    </article>
  </>;
}
