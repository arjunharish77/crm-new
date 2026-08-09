import fs from "fs";
import path from "path";
import { universities, courses, universityEnrichmentById, courseEnrichmentById } from "../src/data/catalog";

// Build-time step only -- run via `npm run export-catalog` (tsx) during `next build`, not at
// runtime. The production container never has src/ available, only compiled Next.js output and
// the scripts/ + migrations/ directories, so scripts/sync-catalog-to-db.js (a plain
// require()-based script, like every other script here) reads this pre-baked JSON instead of
// importing catalog.ts directly. See 22_UNNATIVIDYA_PLATFORM_ENHANCEMENTS_PLAN.md §4.
const output = {
  universities: universities.map((university) => ({
    id: university.id,
    slug: university.slug,
    name: university.name,
    shortName: university.shortName,
    city: university.city,
    data: {
      established: university.established,
      rating: university.rating,
      reviews: university.reviews,
      learners: university.learners,
      approvals: university.approvals,
      placement: university.placement,
      avgPackage: university.avgPackage,
      highestPackage: university.highestPackage,
      partners: university.partners,
      feeFrom: university.feeFrom,
      about: university.about,
      ...(universityEnrichmentById[university.id] || {}),
    },
  })),
  courses: courses.map((course) => ({
    id: course.id,
    slug: course.slug,
    universityId: course.universityId,
    name: course.name,
    shortName: course.shortName,
    level: course.level,
    programType: course.programType,
    ugcApproved: course.ugcApproved,
    stream: course.stream,
    fee: course.fee,
    duration: course.duration,
    data: {
      emi: course.emi,
      rating: course.rating,
      reviews: course.reviews,
      specializations: course.specializations,
      eligibility: course.eligibility,
      careerRoles: course.careerRoles,
      dataQuality: course.dataQuality || {},
      ...(courseEnrichmentById[course.id] || {}),
    },
  })),
};

const outPath = path.join(__dirname, "catalog-export.json");
fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
console.log(`export-catalog: wrote ${output.universities.length} universities and ${output.courses.length} courses to ${outPath}`);
