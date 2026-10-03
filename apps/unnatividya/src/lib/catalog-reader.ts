import type { Course } from "@/data/catalog";
import type { CatalogSnapshot } from "@/lib/catalog-snapshot";

export function catalogReader(snapshot:CatalogSnapshot) {
  const universityById=Object.fromEntries(snapshot.universities.map(university=>[university.id,university]));
  function courseWithUniversity(course:Course) {
    const university=universityById[course.universityId];
    if(!university) throw new Error("Catalog snapshot contains an unresolved university.");
    return {...course,...snapshot.courseEnrichmentById[course.id],university};
  }
  return {...snapshot,universityById,courseWithUniversity,
    getCourseBySlug(slug:string) { const course=snapshot.courses.find(row=>row.slug===slug||row.id===slug); return course ? courseWithUniversity(course) : null; },
    getUniversityBySlug(slug:string) { return snapshot.universities.find(row=>row.slug===slug||row.id===slug)||null; },
  };
}

export type CatalogReader = ReturnType<typeof catalogReader>;

export function catalogLastModified(catalog:CatalogReader, courseIds:string[]=[], universityIds:string[]=[]) {
  const ids=[...universityIds];
  for(const id of courseIds) {const course=catalog.courses.find(row=>row.id===id);if(course)ids.push(course.universityId);}
  return [...courseIds.map(id=>catalog.modifiedAt[`course:${id}`]),...ids.map(id=>catalog.modifiedAt[`university:${id}`])].filter(Boolean).sort().at(-1);
}
