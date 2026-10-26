import type { courseWithUniversity } from "@/data/catalog";

import type { CatalogReader } from "@/lib/catalog-snapshot";
import { formatFee } from "@/lib/catalog-format";
import { RECOGNITION_STATUS_2026_27, recognitionSummary } from "@/lib/program-facts";
import { formatCheckedDate, publicSourceUrls } from "@/lib/source-checks";
import { formatCategoryFee } from "@/lib/prepared-category-fees";
import { type Course } from "@/data/catalog";
import { courseKey, courseLabel } from "@/lib/programmatic-seo";

export type EnrichedCourse = ReturnType<typeof courseWithUniversity>;

export type ComparisonPair = {
  key: string;
  label: string;
  slug: string;
  left: EnrichedCourse;
  right: EnrichedCourse;
};

export function allComparisonPairs(catalog: CatalogReader): ComparisonPair[] {
  const { courseWithUniversity, courses } = catalog;
  const byKey = new Map<string, Course[]>();
  for (const course of courses) {
    const key = courseKey(course.name);
    const list = byKey.get(key) || [];
    list.push(course);
    byKey.set(key, list);
  }

  const pairs: ComparisonPair[] = [];
  for (const [key, matching] of byKey.entries()) {
    const enriched = matching.map(courseWithUniversity).sort((a, b) => a.universityId.localeCompare(b.universityId));
    for (let i = 0; i < enriched.length; i++) {
      for (let j = i + 1; j < enriched.length; j++) {
        const left = enriched[i];
        const right = enriched[j];
        pairs.push({
          key,
          label: courseLabel(matching[0].name),
          slug: `${left.university.slug}-vs-${right.university.slug}`,
          left,
          right,
        });
      }
    }
  }
  return pairs;
}

export function getComparisonPair(catalog: CatalogReader, courseKeyParam: string, pairSlug: string) {
  return allComparisonPairs(catalog).find((pair) => pair.key === courseKeyParam && pair.slug === pairSlug) || null;
}

// No "best" flags: the old rows highlighted a winner on unverified ratings, university-wide
// placement figures and specialisation counts (next-phase plan T3). `same` drives the
// "differences only" view.
export type ComparisonRow = { label: string; same: boolean; cells: Array<{ value: string }> };

// Shared with the interactive /compare (query-param) tool so both surfaces show identical
// comparison criteria — don't let them drift into two different definitions of "compare."
export function buildComparisonRows(selected: Array<Pick<EnrichedCourse, "fee" | "emi" | "duration" | "level" | "rating" | "reviews" | "specializations" | "university" | "eligibility" | "categoryFees">>): ComparisonRow[] {
  const row = (label: string, values: string[]): ComparisonRow => ({ label, same: values.every((value) => value === values[0]), cells: values.map((value) => ({ value })) });
  return [
    row("Total fee", selected.map((course) => formatFee(course.fee))),
    // Published category fees only, in the university's own currency; never converted.
    row("Fee outside India", selected.map((course) => {
      const abroad = (course.categoryFees?.rows || []).filter((fee) => fee.currency !== "INR");
      return abroad.length ? abroad.map((fee) => `${fee.category}: ${formatCategoryFee(fee.currency, fee.total)}`).join(" · ") : "Confirm with the university";
    })),
    row("EMI from", selected.map((course) => course.emi)),
    row("Duration", selected.map((course) => course.duration)),
    row("Level", selected.map((course) => `${course.level} degree`)),
    row("Rating", selected.map((course) => `${course.rating} ★ (${course.reviews.toLocaleString("en-IN")} reviews)`)),
    row("University approvals", selected.map((course) => course.university.approvals.join(", "))),
    row("Placement rate (university-wide)", selected.map((course) => `${course.university.placement}%`)),
    row("Average package (university-wide)", selected.map((course) => course.university.avgPackage)),
    row("Hiring partners (university-wide)", selected.map((course) => `${course.university.partners}+`)),
    row("Specialisations", selected.map((course) => `${course.specializations.length} tracks`)),
    row("Eligibility", selected.map((course) => course.eligibility)),
  ];
}

function durationMonths(duration: string): number {
  const match = duration.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

// Wave 4 part C: the enriched editorial comparison. Facts only, from the published catalog: no
// winner, no ranking, and nothing that is not on both course pages.
export function comparisonSummary(pair: ComparisonPair): Array<{ label: string; text: string }> {
  const { left, right } = pair;
  const name = (course: EnrichedCourse) => course.university.shortName;
  const items: Array<{ label: string; text: string }> = [];
  if (left.fee === right.fee) items.push({ label: "Listed tuition", text: `Both list ${formatFee(left.fee)} for Indian applicants.` });
  else {
    const [lower, higher] = left.fee < right.fee ? [left, right] : [right, left];
    items.push({ label: "Listed tuition", text: `${name(lower)} lists ${formatFee(lower.fee)} and ${name(higher)} ${formatFee(higher.fee)} for Indian applicants, a difference of ${formatFee(higher.fee - lower.fee)}.` });
  }
  items.push({ label: "Duration", text: left.duration === right.duration ? `Both run for ${left.duration}.` : `${name(left)} runs for ${left.duration}; ${name(right)} for ${right.duration}.` });
  const count = (course: EnrichedCourse) => course.specializations.length ? `${course.specializations.length} specialisation option${course.specializations.length === 1 ? "" : "s"}` : "a general program without listed specialisations";
  items.push({ label: "Specialisations", text: `${name(left)} lists ${count(left)}; ${name(right)} lists ${count(right)}.` });
  const [leftStatus, rightStatus] = [recognitionSummary(left).chip, recognitionSummary(right).chip];
  items.push({ label: "2026-27 recognition", text: leftStatus === rightStatus ? `Both: ${leftStatus}.` : `${name(left)}: ${leftStatus}. ${name(right)}: ${rightStatus}.` });
  return items;
}

// Official sources behind each program's listed details, with the date the fee was last checked.
// Older UGC-DEB notice tables are left out: they are not the online-programme lists for 2026-27.
// Machine endpoints are hidden as everywhere else; a program left with no page of its own falls
// back to its university's public pages.
export function comparisonSources(catalog: CatalogReader, pair: ComparisonPair) {
  const pages = (urls: string[] | undefined) => publicSourceUrls(urls)
    .filter(url => /^https:\/\//.test(url) && !/deb\.ugc\.ac\.in\/Uploads\/Notices_Upload\//.test(url));
  return [pair.left, pair.right].map(course => {
    const own = pages([...(course.sourceUrls || []), ...(course.recognition ? [course.recognition.sourceUrl] : [])]);
    const urls = [...new Set(own.length ? own : pages(catalog.universityEnrichmentById[course.universityId]?.sourceUrls))];
    return { course, urls, checkedAt: course.feeReview?.checkedAt || null };
  });
}

export function comparisonFaqs(pair: ComparisonPair): Array<[string, string]> {
  const cheaper = pair.left.fee <= pair.right.fee ? pair.left : pair.right;
  const pricier = cheaper === pair.left ? pair.right : pair.left;
  const betterPlacement = pair.left.university.placement >= pair.right.university.placement ? pair.left : pair.right;
  const shorter = durationMonths(pair.left.duration) <= durationMonths(pair.right.duration) ? pair.left : pair.right;
  const longer = shorter === pair.left ? pair.right : pair.left;
  const moreSpecializations = pair.left.specializations.length >= pair.right.specializations.length ? pair.left : pair.right;
  return [
    [
      `Which is cheaper, ${pair.label} at ${pair.left.university.shortName} or ${pair.right.university.shortName}?`,
      `${cheaper.university.name} is cheaper at ${formatFee(cheaper.fee)} total, compared to ${formatFee(pricier.fee)} at ${pricier.university.name} — a difference of ${formatFee(Math.abs(pair.left.fee - pair.right.fee))}.`,
    ],
    [
      `Which has better placement support, ${pair.left.university.shortName} or ${pair.right.university.shortName}?`,
      `${betterPlacement.university.name} reports a higher placement rate (${betterPlacement.university.placement}%) across its programs — this is a university-wide figure, not specific to ${pair.label} alone, so ask a counsellor for program-specific outcomes.`,
    ],
    [
      `Are both ${pair.label} programs UGC-entitled?`,
      recognitionAnswer(pair),
    ],
    [
      `Does a higher fee mean a better degree?`,
      `Not by itself. Degree validity depends on the program's UGC-DEB entitlement for your admission session, not on its fee. Fee differences usually reflect university brand, support and included learner services, so compare the curriculum, eligibility and support alongside the fee.`,
    ],
    [
      `Which has a shorter duration, ${pair.left.university.shortName} or ${pair.right.university.shortName}?`,
      shorter.duration === longer.duration
        ? `Both list the same duration for ${pair.label}: ${shorter.duration}.`
        : `${shorter.university.name} lists a shorter duration (${shorter.duration}) than ${longer.university.name} (${longer.duration}) for ${pair.label}. A shorter duration isn't automatically better — check the curriculum pace fits you before deciding on that alone.`,
    ],
    [
      `Which offers more specializations, ${pair.left.university.shortName} or ${pair.right.university.shortName}?`,
      pair.left.specializations.length === pair.right.specializations.length
        ? `Both list the same number of specializations (${pair.left.specializations.length}) for ${pair.label}.`
        : `${moreSpecializations.university.name} lists more specializations (${moreSpecializations.specializations.length} vs. ${(moreSpecializations === pair.left ? pair.right : pair.left).specializations.length}) for ${pair.label} — check whether your specific area of interest is actually offered before choosing based on count alone.`,
    ],
  ];
}

// Built from each program's published UGC-DEB result (wave 2); "being re-checked" until applied.
function recognitionAnswer(pair: ComparisonPair) {
  const approvals = ` The approvals listed here (${pair.left.university.approvals.join(", ")} / ${pair.right.university.approvals.join(", ")}) are university-level and come from each university's own pages.`;
  const [left, right] = [pair.left, pair.right];
  if (left.recognition?.status === "listed" && right.recognition?.status === "listed" && left.recognition.academicYear === right.recognition.academicYear) {
    return `Yes, for the ${left.recognition.academicYear} session. Both ${pair.label} programs are on the UGC-DEB online list (checked ${formatCheckedDate(left.recognition.checkedAt)}). Check deb.ugc.ac.in again before you enrol.${approvals}`;
  }
  if (!left.recognition && !right.recognition) {
    return `${RECOGNITION_STATUS_2026_27.replace("this program", `both ${pair.label} programs`).replace("the program's entitlement", "each program's entitlement")}${approvals}`;
  }
  const line = (course: EnrichedCourse) => course.recognition
    ? course.recognition.status === "listed"
      ? `${course.university.shortName}: on the UGC-DEB ${course.recognition.academicYear} online list (checked ${formatCheckedDate(course.recognition.checkedAt)}).`
      : `${course.university.shortName}: listed for ${course.recognition.academicYear} only under ${course.recognition.listedUnder}; confirm the awarding university.`
    : `${course.university.shortName}: our 2026-27 check is still in progress.`;
  return `Not the same for both. ${line(left)} ${line(right)} Check deb.ugc.ac.in before you enrol.${approvals}`;
}
