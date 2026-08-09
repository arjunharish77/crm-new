import { courseWithUniversity, courses, formatFee, type Course } from "@/data/catalog";
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

export function allSpecializationPages(): SpecializationPage[] {
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

export function getSpecializationPageBySlug(slug: string) {
  return allSpecializationPages().find((page) => page.slug === slug) || null;
}

export function specializationFaqs(page: SpecializationPage): Array<[string, string]> {
  if (page.isComparison) {
    const cheapest = page.courses[0];
    const priciest = page.courses[page.courses.length - 1];
    return [
      [
        `Which university offers the cheapest ${page.courseLabel} with a ${page.specialization} specialization?`,
        `${cheapest.university.name} currently lists the lowest total fee for this ${page.courseLabel} specialization at ${formatFee(cheapest.fee)}, compared to ${formatFee(priciest.fee)} at ${priciest.university.name}.`,
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
        `What career roles does a ${page.specialization} specialization in ${page.courseLabel} lead to?`,
        page.courses[0].careerRoles.length
          ? `The base ${page.courseLabel} program these universities offer commonly leads to roles such as ${page.courses[0].careerRoles.slice(0, 3).join(", ")} — a ${page.specialization} specialization sharpens your fit for these roles rather than opening entirely different ones.`
          : `Each university's program page outlines the career paths this degree supports — a counsellor can walk you through how the ${page.specialization} specialization fits.`,
      ],
    ];
  }
  const [only] = page.courses;
  return [
    [
      `Which university offers ${page.courseLabel} with a ${page.specialization} specialization?`,
      `${only.university.name} is currently the only university on this site listing a ${page.specialization} specialization within its ${page.courseLabel} program, at a total fee of ${formatFee(only.fee)}.`,
    ],
    [
      `Is this specialization only available at ${only.university.name}?`,
      `Among the universities compared on this site, yes — ${only.university.name} is the only one listing a ${page.specialization} specialization for ${page.courseLabel}. Other universities may offer differently-named specializations covering similar ground; check each course page's full specialization list.`,
    ],
    [
      `What career roles does this specialization lead to?`,
      only.careerRoles.length
        ? `${only.university.name}'s ${page.courseLabel} program commonly leads to roles such as ${only.careerRoles.slice(0, 3).join(", ")} — the ${page.specialization} specialization sharpens your fit for these rather than opening entirely different roles.`
        : `${only.university.name}'s program page outlines the career paths this degree supports — a counsellor can walk you through how this specialization fits.`,
    ],
  ];
}
