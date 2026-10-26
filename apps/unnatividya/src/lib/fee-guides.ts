import type { courseWithUniversity } from "@/data/catalog";

import type { CatalogReader } from "@/lib/catalog-snapshot";
import { formatFee } from "@/lib/catalog-format";
import { CONFIRM_WITH_UNIVERSITY, programApplicationFee, programFeePlans } from "@/lib/program-facts";
import { courseKey, courseLabel } from "@/lib/programmatic-seo";
import { formatCheckedDate, publicSourceUrls } from "@/lib/source-checks";

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

export function feeGuides(catalog: CatalogReader): FeeGuide[] {
  const { courseWithUniversity, courses } = catalog;
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

export function getFeeGuideBySlug(catalog: CatalogReader, slug: string) {
  return feeGuides(catalog).find((guide) => guide.slug === slug) || null;
}

export function feeGuideSlugForCourseName(courseName: string) {
  return `${courseKey(courseName)}-fees`;
}

export function feeGuideIntro(guide: FeeGuide): string {
  if (guide.isComparison) {
    const lowest = guide.courses[0];
    const highest = guide.courses[guide.courses.length - 1];
    return `${guide.label} is offered by ${guide.courses.length} universities listed on Unnati Vidya. Listed total tuition for Indian applicants runs from ${formatFee(guide.lowestFee)} at ${lowest.university.shortName} to ${formatFee(guide.highestFee)} at ${highest.university.shortName}, a difference of ${formatFee(guide.feeSpread)}. The amounts below come from our published catalog, with the date each fee was last checked where we have one.`;
  }
  const [only] = guide.courses;
  return `${guide.label} is listed on Unnati Vidya through ${only.university.name}, with listed total tuition of ${formatFee(only.fee)} for Indian applicants over ${only.duration}. Below is what we hold on its fee, payment and scholarships, and what to confirm with the university.`;
}

// Fee facts with a source behind them (Wave 4, hub C2). The seeded payment plans were computed from
// the total, so they show only once a reviewed fee correction is published (it records feeReview).
export function feeCheck(course: FeeGuideCourse) {
  const check = course.feeReview || course.categoryFees;
  return check ? { checkedAt: check.checkedAt, date: formatCheckedDate(check.checkedAt), sourceUrl: check.sourceUrl } : null;
}

export function sourcedFeePlans(course: FeeGuideCourse) {
  return course.feeReview ? programFeePlans(course) : [];
}

// The Indian-applicant semester payment from a published category-fee block.
export function indianSemesterPayment(course: FeeGuideCourse) {
  const row = course.categoryFees?.rows.find(item => item.currency === "INR" && item.total === course.fee);
  return row ? { amount: row.perSemester, semesters: row.semesters } : null;
}

export function outsideIndiaFees(course: FeeGuideCourse) {
  return course.categoryFees?.rows.some(row => row.currency !== "INR") ? course.categoryFees : null;
}

// Official pages behind a guide's fee figures, one entry per program.
// A program with no public page of its own falls back to its university's public pages.
export function feeGuideSources(catalog: CatalogReader, guide: FeeGuide) {
  const pages = (urls: string[] | undefined) => publicSourceUrls(urls)
    .filter(url => /^https:\/\//.test(url) && !/deb\.ugc\.ac\.in\/Uploads\/Notices_Upload\//.test(url));
  return guide.courses.map(course => {
    const check = feeCheck(course);
    const own = pages([...(check ? [check.sourceUrl] : []), ...(course.categoryFees ? [course.categoryFees.sourceUrl] : []), ...(course.sourceUrls || [])]);
    const urls = [...new Set(own.length ? own : pages(catalog.universityEnrichmentById[course.universityId]?.sourceUrls))];
    return { course, urls, check };
  });
}

function durationMonths(duration: string): number {
  const match = duration.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

export function feeGuideFaqs(guide: FeeGuide): Array<[string, string]> {
  const lowest = guide.courses[0];
  const highest = guide.courses[guide.courses.length - 1];
  const applicationFees = guide.courses.map(course => `${course.university.shortName}: ${programApplicationFee(course)}`).join("; ");
  const checked = guide.courses.filter(course => feeCheck(course));
  const freshness: [string, string] = [
    `How current are these ${guide.label} fees?`,
    checked.length
      ? `${checked.map(course => `${course.university.shortName}'s fee was last checked on ${feeCheck(course)!.date}`).join("; ")}. Amounts change when a university publishes a new fee, so confirm the current amount before you pay.`
      : "They are the listed amounts in our published catalog. Universities can change fees between batches, so confirm the current amount with the university before you pay.",
  ];
  const extraCosts: [string, string] = [
    "Are there costs beyond the listed tuition?",
    `Application fee: ${applicationFees}. Ask the university for every other charge that applies to you, such as exam or re-registration fees, before you pay. The total cost planner lets you add these to your own estimate.`,
  ];
  if (guide.isComparison) {
    const shortest = [...guide.courses].sort((a, b) => durationMonths(a.duration) - durationMonths(b.duration))[0];
    return [
      [
        `Which university lists the lowest tuition for ${guide.label}?`,
        `${lowest.university.name} lists ${formatFee(lowest.fee)} for Indian applicants, compared with ${formatFee(highest.fee)} at ${highest.university.name}, a difference of ${formatFee(guide.feeSpread)}. Applicant category, discounts and other charges can change what you pay.`,
      ],
      [
        "Does a higher fee mean a better degree?",
        "Not by itself. Degree validity depends on the program's UGC-DEB entitlement for your admission session, not on its fee. Compare the curriculum, eligibility and support alongside the fee.",
      ],
      [
        "Can I pay in EMI?",
        `Yes. Every university listed offers no-cost EMI, from ${lowest.emi} depending on the program. Approval and terms come from the lender, so check the full terms before you sign.`,
      ],
      extraCosts,
      [
        `Which university lists the shortest ${guide.label}?`,
        `${shortest.university.name} lists ${shortest.duration}. A shorter duration isn't automatically better, so check the curriculum and your own pace before choosing on duration alone.`,
      ],
      freshness,
    ];
  }
  const [only] = guide.courses;
  const plans = sourcedFeePlans(only);
  return [
    [
      `What does the ${guide.label} fee cover?`,
      `${formatFee(only.fee)} is the listed total tuition for Indian applicants for the full ${only.duration}. The application fee is separate (${programApplicationFee(only)}). Ask ${only.university.shortName} which other charges apply to you.`,
    ],
    [
      `Can I pay ${guide.label} fees in installments?`,
      plans.length
        ? `${only.university.name} lists these options: ${plans.map(([label, amount, note]) => `${label} ${amount}${note ? ` (${note})` : ""}`).join("; ")}. EMI approval and terms come from the lender.`
        : `${only.university.name} offers no-cost EMI from ${only.emi}. Approval and terms come from the lender, and the payment schedule for your batch is confirmed at admission.`,
    ],
    [
      `Are scholarships available for ${guide.label}?`,
      only.scholarships?.length
        ? `${only.university.name} lists ${only.scholarships.length} scholarship categories at university level, including ${only.scholarships[0][0].toLowerCase()}. Whether one applies to this program, and the proof needed, is confirmed at admission.`
        : `${only.university.name} may offer scholarships depending on the admission cycle. ${CONFIRM_WITH_UNIVERSITY}.`,
    ],
    [
      `Is the ${guide.label} fee refundable if I discontinue?`,
      "Refunds follow the university's published refund policy and admission-cycle rules. See our refund policy summary, and ask the university before you pay.",
    ],
    freshness,
  ];
}

export { formatFee };
