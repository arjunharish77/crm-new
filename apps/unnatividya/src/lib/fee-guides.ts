import { courseWithUniversity, courses, formatFee } from "@/data/catalog";
import { courseKey, courseLabel } from "@/lib/programmatic-seo";

export type FeeGuideCourse = ReturnType<typeof courseWithUniversity>;

export type FeeGuide = {
  key: string;
  slug: string;
  label: string;
  isComparison: boolean;
  courses: FeeGuideCourse[];
  lowestFee: number;
  highestFee: number;
  feeSpread: number;
};

export function feeGuides(): FeeGuide[] {
  const byKey = new Map<string, typeof courses>();
  for (const course of courses) {
    const key = courseKey(course.name);
    const list = byKey.get(key) || [];
    list.push(course);
    byKey.set(key, list);
  }

  return [...byKey.entries()]
    .map(([key, matching]) => {
      const enriched = matching.map(courseWithUniversity).sort((a, b) => a.fee - b.fee);
      const lowestFee = enriched[0].fee;
      const highestFee = enriched[enriched.length - 1].fee;
      return {
        key,
        slug: `${key}-fees`,
        label: courseLabel(matching[0].name),
        isComparison: enriched.length > 1,
        courses: enriched,
        lowestFee,
        highestFee,
        feeSpread: highestFee - lowestFee,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function getFeeGuideBySlug(slug: string) {
  return feeGuides().find((guide) => guide.slug === slug) || null;
}

export function feeGuideSlugForCourseName(courseName: string) {
  return `${courseKey(courseName)}-fees`;
}

export function feeGuideIntro(guide: FeeGuide): string {
  if (guide.isComparison) {
    const cheapest = guide.courses[0];
    const priciest = guide.courses[guide.courses.length - 1];
    return `${guide.label} is offered by ${guide.courses.length} UGC-entitled universities listed on Unnati Vidya, with total program fees ranging from ${formatFee(guide.lowestFee)} at ${cheapest.university.shortName} to ${formatFee(guide.highestFee)} at ${priciest.university.shortName} — a difference of ${formatFee(guide.feeSpread)}. Below is the exact fee, EMI, and duration for each program, verified against its individual program page.`;
  }
  const [only] = guide.courses;
  return `${guide.label} is currently listed on Unnati Vidya through ${only.university.name}, with a total program fee of ${formatFee(only.fee)} for the full ${only.duration} program. Here is exactly how that fee breaks down, and what scholarship and EMI options are available.`;
}

export function feeGuideFaqs(guide: FeeGuide): Array<[string, string]> {
  const cheapest = guide.courses[0];
  const priciest = guide.courses[guide.courses.length - 1];
  if (guide.isComparison) {
    return [
      [
        `Which university offers the cheapest ${guide.label}?`,
        `${cheapest.university.name} currently lists the lowest total fee for ${guide.label} at ${formatFee(cheapest.fee)}, compared to ${formatFee(priciest.fee)} at ${priciest.university.name} — a difference of ${formatFee(guide.feeSpread)}.`,
      ],
      [
        "Does a higher fee mean a better degree?",
        "No. All universities listed here offer UGC-entitled online degrees with equal degree validity. Fee differences usually reflect university brand, placement support scale, and included learner services — compare the placement rate and average package alongside the fee before deciding.",
      ],
      [
        "Can I pay in EMI?",
        `Yes. Every university listed offers no-cost EMI, starting from ${cheapest.emi} per month depending on the program and lender approval.`,
      ],
      [
        "Are there hidden costs beyond the listed program fee?",
        "A separate application fee applies at most universities, and exam or re-evaluation fees can apply in specific cases. Confirm the full cost breakdown with a counsellor before you pay.",
      ],
    ];
  }
  const [only] = guide.courses;
  return [
    [
      `What does the ${guide.label} fee include?`,
      `The ${formatFee(only.fee)} total fee at ${only.university.name} covers tuition, LMS access, and online proctored exams for the full ${only.duration} program. Application fee and any re-exam fee are charged separately.`,
    ],
    [
      `Can I pay ${guide.label} fees in installments?`,
      `Yes. ${only.university.name} offers full payment, semester-wise payment, and no-cost EMI from ${only.emi} per month, subject to lender approval.`,
    ],
    [
      `Are scholarships available for ${guide.label}?`,
      only.scholarships?.length
        ? `Yes. ${only.university.name} lists ${only.scholarships.length} scholarship categories for this program, including ${only.scholarships[0][0].toLowerCase()}. Exact eligibility and proof requirements are confirmed during admission.`
        : `${only.university.name} may offer scholarships depending on the admission cycle — a counsellor can confirm current eligibility.`,
    ],
    [
      `Is the ${guide.label} fee refundable if I discontinue?`,
      "Refund eligibility follows the university's published refund policy and admission-cycle rules. See our refund policy summary or ask a counsellor before you pay.",
    ],
  ];
}

export { formatFee };
