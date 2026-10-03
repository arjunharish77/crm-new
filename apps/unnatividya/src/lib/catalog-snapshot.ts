import { z } from "zod";
import type { Course, CourseEnrichment, University, UniversityEnrichment } from "@/data/catalog";

const text = z.string().trim().min(1);
const slug = text.regex(/^[a-z0-9-]+$/);
const count = z.number().int().nonnegative();
const rating = z.number().min(0).max(5);
const pair = z.tuple([z.string(), z.string()]);
const triple = z.tuple([z.string(), z.string(), z.string()]);
const sources = z.array(z.string().url().refine(value => /^https?:\/\//.test(value), "Use an HTTP(S) source URL"));
const universityId = z.enum(["muj", "smu", "amity"]);
const universitySchema = z.object({
  id: universityId, slug, name: text, shortName: text, city: text,
  established: z.number().int().positive(), rating, reviews: count, learners: text,
  approvals: z.array(text), placement: z.number().min(0).max(100), avgPackage: text,
  highestPackage: text, partners: count, feeFrom: text, about: text,
});
const universityEnrichmentSchema = z.object({
  overview: z.array(text).optional(), factTiles: z.array(pair).optional(),
  rankings: z.array(z.object({ title:text, note:z.string() })).optional(),
  placementSupport:z.array(text).optional(), admissionSteps:z.array(z.object({title:text,copy:text})).optional(),
  scholarships:z.array(triple).optional(), faqs:z.array(pair).optional(), sourceUrls:sources.optional(),
});
const quality = z.enum(["verified", "generic"]).optional();
const courseSchema = z.object({
  id:text, slug, universityId, name:text, shortName:text, level:z.enum(["UG", "PG"]),
  programType:z.literal("DEGREE"), ugcApproved:z.literal(true), stream:text, duration:text,
  fee:z.number().int().positive(), emi:text, rating, reviews:count, specializations:z.array(text),
  eligibility:text, careerRoles:z.array(text),
  dataQuality:z.object({eligibility:quality,specializations:quality,careerRoles:quality,curriculum:quality,faqs:quality,lastAdmissionDate:quality}).optional(),
});
const courseEnrichmentSchema = z.object({
  overview:text.optional(), highlights:z.array(pair).optional(), sourceUrls:sources.optional(),
  feePlans:z.array(triple).optional(), curriculum:z.array(z.object({term:text,subjects:z.array(text)})).optional(),
  scholarships:z.array(triple).optional(), faqs:z.array(pair).optional(), weeklyHours:text.optional(),
  credits:text.optional(), applicationFee:text.optional(), lastAdmissionDate:text.optional(),
});
export type CatalogRow = Record<string, unknown>;
export type CatalogIssue = { entityType:"course"|"university"|"catalog"; entityId:string; field:string; message:string };
export type CatalogSnapshot = {
  universities:University[]; courses:Course[];
  modifiedAt:Record<string,string>;
  universityEnrichmentById:Partial<Record<University["id"],UniversityEnrichment>>;
  courseEnrichmentById:Record<string,CourseEnrichment>;
};

// Pure conversion shared by readiness checks, previews and the future public reader.
// Unknown internal JSON keys are not copied to the snapshot. No static-catalog fallback.
export function buildCatalogSnapshot(universityRows:CatalogRow[], courseRows:CatalogRow[]): {snapshot:CatalogSnapshot|null; issues:CatalogIssue[]} {
  const issues:CatalogIssue[]=[];
  const snapshot:CatalogSnapshot={universities:[],courses:[],modifiedAt:{},universityEnrichmentById:{},courseEnrichmentById:{}};
  function report(type:CatalogIssue["entityType"], id:string, field:string, message:string) { issues.push({entityType:type,entityId:id,field,message}); }
  function data(row:CatalogRow, type:"course"|"university") {
    const parsed=z.record(z.string(),z.unknown()).safeParse(row.data);
    if (!parsed.success) { report(type,String(row.id),"data","Structured data must be an object."); return {}; }
    return parsed.data;
  }
  function unique(rows:CatalogRow[], type:"course"|"university") {
    for (const field of ["id","slug"]) {
      const seen=new Set<unknown>();
      for (const row of rows) { if(seen.has(row[field])) report(type,String(row.id),field,"Duplicate published value."); seen.add(row[field]); }
    }
  }
  function parse<T>(schema:z.ZodType<T>, input:unknown, type:"course"|"university", id:string):T|null {
    const result=schema.safeParse(input);
    if(result.success) return result.data;
    result.error.issues.forEach(issue=>report(type,id,issue.path.map(String).join("."),issue.message));
    return null;
  }
  const published = (row:CatalogRow) => row.status === "PUBLISHED" && row.is_published === true;
  const universities=universityRows.filter(published), courses=courseRows.filter(published);
  unique(universities,"university"); unique(courses,"course");
  for(const [type,rows] of [["university",universities],["course",courses]] as const) {
    for(const row of rows) if(row.updated_at) {
      const timestamp=new Date(row.updated_at as string|Date);
      if(Number.isFinite(timestamp.getTime())) snapshot.modifiedAt[`${type}:${row.id}`]=timestamp.toISOString();
    }
  }
  if(!universities.length) report("catalog","snapshot","universities","No published universities available.");
  if(!courses.length) report("catalog","snapshot","courses","No published courses available.");
  for(const row of universities) {
    const value=data(row,"university"), id=String(row.id);
    const university=parse(universitySchema,{...value,id:row.id,slug:row.slug,name:row.name,shortName:row.short_name,city:row.city},"university",id);
    const enrichment=parse(universityEnrichmentSchema,value,"university",id);
    if(university && enrichment) { snapshot.universities.push(university); snapshot.universityEnrichmentById[university.id]=enrichment; }
  }
  for(const row of courses) {
    const value=data(row,"course"), id=String(row.id);
    const course=parse(courseSchema,{...value,id:row.id,slug:row.slug,name:row.name,shortName:row.short_name,universityId:row.university_id,
      level:row.level,programType:row.program_type,ugcApproved:row.ugc_approved,stream:row.stream,fee:row.fee_inr,duration:row.duration},"course",id);
    const enrichment=parse(courseEnrichmentSchema,value,"course",id);
    if(course && enrichment) {
      const rupees=(value:string) => /^₹[\d,]+$/.test(value.trim()) ? Number(value.replace(/[^\d]/g,"")) : null;
      for(const [index,plan] of (enrichment.feePlans||[]).entries()) {
        if(["Semester-wise","No-cost EMI"].includes(plan[0]) && rupees(plan[1])!==null && rupees(plan[1])!==course.fee) report("course",id,`data.feePlans.${index}`,"Fee plan total differs from the course fee. Review and update or remove stale payment plans.");
      }
      for(const [index,highlight] of (enrichment.highlights||[]).entries()) {
        if(highlight[0]==="Total fee" && rupees(highlight[1])!==null && rupees(highlight[1])!==course.fee) report("course",id,`data.highlights.${index}`,"Total-fee highlight differs from the course fee.");
      }
    }
    if(!snapshot.universities.some(university=>university.id===row.university_id)) report("course",id,"university_id","Published course requires a valid published university.");
    if(course && enrichment) { snapshot.courses.push(course); snapshot.courseEnrichmentById[course.id]=enrichment; }
  }
  return {snapshot:issues.length ? null : snapshot,issues};
}

export { catalogReader, catalogLastModified, type CatalogReader } from "./catalog-reader";
