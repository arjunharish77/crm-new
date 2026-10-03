import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-auth";
import { loadCatalogSnapshot } from "@/lib/catalog-snapshot-server";
import { catalogReader } from "@/lib/catalog-snapshot";
import { formatFee } from "@/lib/catalog-format";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"CMS catalog preview",robots:{index:false,follow:false,nocache:true}};
export default async function CatalogPreviewPage() {
  if(!await getAdminSession()) redirect("/admin/login");
  const result=await loadCatalogSnapshot();
  const reader=result.snapshot ? catalogReader(result.snapshot) : null;
  return <section className="admin-shell"><div className="container">
    <div className="admin-page-head"><div><span className="eyebrow">Private preview</span><h1>CMS catalog readiness</h1>
      <p>This reads the same published CMS records used by public pages, tools and lead dropdowns.</p></div></div>
    <p>These checks validate data structure and relationships. They do not verify university claims, fees or source freshness. Existing ratings and outcome claims retain their pending-verification status.</p>
    {!reader ? <section className="card admin-detail-card"><h2>{result.issues.length} issues block the CMS snapshot</h2>
      <p>Fix the records below through the review workflow. No partial snapshot or static fallback is used.</p>
      <ul>{result.issues.map((issue,index)=><li key={index}><strong>{issue.entityId} · {issue.field}</strong>: {issue.message} {issue.entityType!=="catalog" ? <Link href={`/admin/catalog-revisions?type=${issue.entityType}&id=${encodeURIComponent(issue.entityId)}`}>Review record</Link> : null}</li>)}</ul>
    </section> : <>
      <p role="status">Structurally ready: {reader.universities.length} universities and {reader.courses.length} courses. Official-source verification is separate and remains in progress.</p>
      <h2>Published CMS courses</h2>
      <div className="admin-table-card"><table className="admin-table"><caption>Private preview of current CMS values</caption><thead><tr>{["Course","University","Total fee","Duration","Eligibility","Review"].map(label=><th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{reader.courses.map(course=>{const enriched=reader.courseWithUniversity(course);return <tr key={course.id}><td>{course.name}</td><td>{enriched.university.name}</td><td>{formatFee(course.fee)}</td><td>{course.duration}</td><td>{course.eligibility}</td><td><Link href={`/admin/catalog-revisions?type=course&id=${encodeURIComponent(course.id)}`}>Review content</Link></td></tr>;})}</tbody>
      </table></div>
      <h2>Published CMS universities</h2>
      {reader.universities.map(university=><section className="card admin-detail-card" key={university.id}><h3>{university.name}</h3><p>{university.city}</p><p>{university.about}</p><Link href={`/admin/catalog-revisions?type=university&id=${encodeURIComponent(university.id)}`}>Review content</Link></section>)}
    </>}
  </div></section>;
}
