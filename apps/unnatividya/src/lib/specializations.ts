import type { courseWithUniversity } from "@/data/catalog";

import type { CatalogReader } from "@/lib/catalog-snapshot";
import { formatFee } from "@/lib/catalog-format";
import { type Course } from "@/data/catalog";
import { courseKey, courseLabel } from "@/lib/programmatic-seo";

export type EnrichedCourse = ReturnType<typeof courseWithUniversity>;

export type SpecializationPage = {
  courseKeyPart: string;
  courseLabel: string;
  specialization: string;
  specializationKeyPart: string;
  slug: string;
  isComparison: boolean;
  courses: EnrichedCourse[];
};

export function specializationKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// "General" isn't a real differentiator (§8 of the master plan) — every course that lists it
// alongside real specializations already gets full coverage via those; skip it here.
const SKIPPED_SPECIALIZATIONS = new Set(["general"]);

export function allSpecializationPages(catalog: CatalogReader): SpecializationPage[] {
  const { courseWithUniversity, courses } = catalog;
  const byCourseName = new Map<string, Course[]>();
  for (const course of courses) {
    const key = courseKey(course.name);
    const list = byCourseName.get(key) || [];
    list.push(course);
    byCourseName.set(key, list);
  }

  const pages: SpecializationPage[] = [];
  for (const [cKey, matching] of byCourseName.entries()) {
    const label = courseLabel(matching[0].name);
    const specToCourses = new Map<string, Course[]>();
    for (const course of matching) {
      for (const spec of course.specializations) {
        if (SKIPPED_SPECIALIZATIONS.has(spec.toLowerCase())) continue;
        const list = specToCourses.get(spec) || [];
        list.push(course);
        specToCourses.set(spec, list);
      }
    }
    for (const [spec, specCourses] of specToCourses.entries()) {
      const sKey = specializationKey(spec);
      pages.push({
        courseKeyPart: cKey,
        courseLabel: label,
        specialization: spec,
        specializationKeyPart: sKey,
        slug: `${cKey}-${sKey}`,
        isComparison: specCourses.length > 1,
        courses: specCourses.map(courseWithUniversity).sort((a, b) => a.fee - b.fee),
      });
    }
  }
  return pages.sort((a, b) => a.slug.localeCompare(b.slug));
}

export function getSpecializationPageBySlug(catalog: CatalogReader, slug: string) {
  return allSpecializationPages(catalog).find((page) => page.slug === slug) || null;
}

export function specializationFaqs(page: SpecializationPage): Array<[string, string]> {
  if (page.isComparison) {
    return [
      [
        `How do the fees compare for the ${page.courseLabel} with the ${page.specialization} specialization?`,
        `For Indian applicants, the listed total tuition is ${listNames(page.courses.map(course => `${formatFee(course.fee)} at ${course.university.name}`))}. Fees for NRI and international applicants are different; each program's fee section shows them where the university publishes them.`,
      ],
      [
        `Is the ${page.specialization} specialization the same curriculum at every university?`,
        `No — each university runs its own curriculum for this specialization. Check the individual course page for each university's syllabus before choosing based on specialization alone.`,
      ],
      [
        `Does choosing ${page.specialization} change the degree's validity?`,
        `No. The specialization affects your elective coursework, not the degree's UGC-entitlement status — that's determined by the base ${page.courseLabel} program at each university.`,
      ],
      [
        `What career roles does the ${page.specialization} specialization in ${page.courseLabel} lead to?`,
        page.courses[0].careerRoles.length
          ? `For the ${page.courseLabel}, ${page.courses[0].university.name} names roles such as ${page.courses[0].careerRoles.slice(0, 3).join(", ")}. Each university's program page lists the roles it names; a counsellor can go through how the ${page.specialization} specialization fits your goals.`
          : `Each university's program page outlines the career paths this degree supports. A counsellor can go through how the ${page.specialization} specialization fits your goals.`,
      ],
    ];
  }
  const [only] = page.courses;
  return [
    [
      `Which university offers ${page.courseLabel} with the ${page.specialization} specialization?`,
      `${only.university.name} is currently the only university on this site listing the ${page.specialization} specialization within its ${page.courseLabel} program, at a listed total tuition of ${formatFee(only.fee)} for Indian applicants.`,
    ],
    [
      `Is this specialization only available at ${only.university.name}?`,
      `Among the universities compared on this site, yes — ${only.university.name} is the only one listing the ${page.specialization} specialization for ${page.courseLabel}. Other universities may offer differently-named specializations covering similar ground; check each course page's full specialization list.`,
    ],
    [
      `What career roles does this specialization lead to?`,
      only.careerRoles.length
        ? `For its ${page.courseLabel}, ${only.university.name} names roles such as ${only.careerRoles.slice(0, 3).join(", ")}. A counsellor can go through how the ${page.specialization} specialization fits your goals.`
        : `${only.university.name}'s program page outlines the career paths this degree supports. A counsellor can go through how this specialization fits your goals.`,
    ],
  ];
}

const TITLE_SUFFIX = " | Unnati Vidya";
const TITLE_LIMIT = 60;

// The longest title that still fits in ~60 characters (next-phase plan T8): the old
// "— Compared Across Universities" titles ran to 70-90 characters and were cut off in results.
// Long specialization names fall back to dropping "Online", then the site-name suffix.
export function specializationTitle(page: SpecializationPage): { absolute: string } {
  const base = `${page.courseLabel} in ${page.specialization}`;
  const short = base.replace(/^Online /, "");
  const candidates = page.isComparison
    ? [`${base}: ${page.courses.length} Universities Compared`, `${base}: Compared`, base, short]
    : [`${base} at ${page.courses[0].university.shortName}: Fees`, `${base} at ${page.courses[0].university.shortName}`, base, short];
  const withSuffix = candidates.find((title) => (title + TITLE_SUFFIX).length <= TITLE_LIMIT);
  if (withSuffix) return { absolute: withSuffix + TITLE_SUFFIX };
  return { absolute: [base, short].find((title) => title.length <= TITLE_LIMIT) || short };
}

function listNames(names: string[]) {
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names.join("");
}

// Page-specific description built from this page's own fee, duration and university data.
export function specializationDescription(page: SpecializationPage) {
  if (page.isComparison) {
    const fees = page.courses.map((course) => course.fee);
    return `${page.courseLabel} with the ${page.specialization} specialization at ${listNames(page.courses.map((course) => course.university.shortName))}: listed fees from ${formatFee(Math.min(...fees))} to ${formatFee(Math.max(...fees))}, duration and EMI compared.`;
  }
  const [only] = page.courses;
  return `${page.courseLabel} with the ${page.specialization} specialization at ${only.university.name}: listed fee ${formatFee(only.fee)}, ${only.duration}, EMI from ${only.emi}.`;
}

// The other specializations each university lists in the same program, so every page carries
// information that is specific to it rather than the shared template text.
export function siblingSpecializations(page: SpecializationPage) {
  return page.courses.map((course) => ({
    course,
    others: course.specializations
      .filter((spec) => spec !== page.specialization && !SKIPPED_SPECIALIZATIONS.has(spec.toLowerCase()))
      .map((spec) => ({ label: spec, slug: `${page.courseKeyPart}-${specializationKey(spec)}` })),
  }));
}
