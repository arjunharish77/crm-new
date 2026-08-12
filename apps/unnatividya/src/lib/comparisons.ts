import { courseWithUniversity, courses, formatFee, type Course } from "@/data/catalog";
import { courseKey, courseLabel } from "@/lib/programmatic-seo";

export type EnrichedCourse = ReturnType<typeof courseWithUniversity>;

export type ComparisonPair = {
  key: string;
  label: string;
  slug: string;
  left: EnrichedCourse;
  right: EnrichedCourse;
};

export function allComparisonPairs(): ComparisonPair[] {
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

export function getComparisonPair(courseKeyParam: string, pairSlug: string) {
  return allComparisonPairs().find((pair) => pair.key === courseKeyParam && pair.slug === pairSlug) || null;
}

export type ComparisonRow = { label: string; cells: Array<{ value: string; best?: boolean }> };

// Shared with the interactive /compare (query-param) tool so both surfaces show identical
// comparison criteria — don't let them drift into two different definitions of "compare."
export function buildComparisonRows(selected: Array<Pick<EnrichedCourse, "fee" | "emi" | "duration" | "level" | "rating" | "reviews" | "specializations" | "university" | "eligibility">>): ComparisonRow[] {
  const bestFee = Math.min(...selected.map((course) => course.fee));
  const bestRating = Math.max(...selected.map((course) => course.rating));
  const bestPlacement = Math.max(...selected.map((course) => course.university.placement));
  const mostSpecializations = Math.max(...selected.map((course) => course.specializations.length));
  return [
    { label: "Total fee", cells: selected.map((course) => ({ value: formatFee(course.fee), best: selected.length > 1 && course.fee === bestFee })) },
    { label: "EMI from", cells: selected.map((course) => ({ value: course.emi })) },
    { label: "Duration", cells: selected.map((course) => ({ value: course.duration })) },
    { label: "Level", cells: selected.map((course) => ({ value: `${course.level} degree` })) },
    { label: "Rating", cells: selected.map((course) => ({ value: `${course.rating} ★ (${course.reviews.toLocaleString("en-IN")} reviews)`, best: selected.length > 1 && course.rating === bestRating })) },
    { label: "Approvals", cells: selected.map((course) => ({ value: course.university.approvals.join(", ") })) },
    { label: "Placement rate", cells: selected.map((course) => ({ value: `${course.university.placement}%`, best: selected.length > 1 && course.university.placement === bestPlacement })) },
    { label: "Average package", cells: selected.map((course) => ({ value: course.university.avgPackage })) },
    { label: "Hiring partners", cells: selected.map((course) => ({ value: `${course.university.partners}+` })) },
    { label: "Specialisations", cells: selected.map((course) => ({ value: `${course.specializations.length} tracks`, best: selected.length > 1 && course.specializations.length === mostSpecializations })) },
    { label: "Eligibility", cells: selected.map((course) => ({ value: course.eligibility })) },
  ];
}

function durationMonths(duration: string): number {
  const match = duration.match(/\d+/);
  return match ? Number(match[0]) : 0;
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
      `Yes — both ${pair.left.university.name} and ${pair.right.university.name} list their ${pair.label} programs as UGC-entitled online degrees. Approvals shown here (${pair.left.university.approvals.join(", ")} / ${pair.right.university.approvals.join(", ")}) come from each university's own catalog data; verify current entitlement before enrolling.`,
    ],
    [
      `Does a higher fee mean a better degree?`,
      `No. Both universities offer UGC-entitled online degrees with equal degree validity. Fee differences usually reflect university brand, placement support scale, and included learner services — compare placement rate and average package alongside fee before deciding.`,
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
