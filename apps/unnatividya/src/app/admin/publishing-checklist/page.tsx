import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import preparedEligibility from "@/data/prepared-eligibility-drafts.json";
import preparedCurricula from "@/data/prepared-curriculum-drafts.json";
import preparedFeesJson from "@/data/prepared-fee-corrections.json";
import type { PreparedFeeCorrection } from "@/lib/prepared-fee-correction";

const preparedFees = preparedFeesJson as PreparedFeeCorrection[];
import preparedCategoryFees from "@/data/prepared-category-fees.json";
import preparedRecognition from "@/data/prepared-recognition.json";
import preparedProgramDetails from "@/data/prepared-program-details.json";
import preparedEligibilityRules from "@/data/prepared-eligibility-rules.json";
import eligibilityIssues from "@/data/eligibility-review-issues.json";
import { getAdminSession } from "@/lib/admin-auth";
import { pool, query } from "@/lib/db";
import { getPublishPreview } from "@/lib/bulk-publish";
import { PublishReadyButton } from "@/components/publish-ready-button";
import { getCategoryFeeBatchPreview } from "@/lib/category-fee-batch";
import { StageCategoryFeesButton } from "@/components/stage-category-fees-button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Publishing checklist", robots: { index: false, follow: false, nocache: true } };

type Data = Record<string, unknown>;
type State = "applied" | "review" | "todo" | "held";
type Item = { label: string; state: State };

const STATE_LABEL: Record<State, string> = { applied: "Applied", review: "Waiting for review", todo: "To load", held: "On hold" };

// Each prepared item is matched by the source-check date its loader writes, so the list stays
// accurate without extra bookkeeping (next-phase plan §3, wave 2).
const record = (data: Data | undefined, key: string) => (data && typeof data[key] === "object" && data[key] ? data[key] as Data : undefined);
const checkedOn = (data: Data | undefined, key: string, date: string) => record(data, key)?.checkedAt === date;

export default async function PublishingChecklistPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const client = await pool.connect();
  const { publishPreview, feePreview } = await (async () => {
    try { return { publishPreview: await getPublishPreview(client), feePreview: await getCategoryFeeBatchPreview(client) }; }
    finally { client.release(); }
  })();
  const readyFeeIds = feePreview.filter(item => !item.reason).map(item => item.courseId);
  const courses = (await query<{ id: string; name: string; fee_inr: number | null; data: Data }>("select id, name, fee_inr, data from course order by name, id")).rows;
  const proposals = (await query<{ entity_id: string; data: Data | null; fee_inr: number | null }>(
    "select entity_id, proposed_content->'data' as data, (proposed_content->>'fee_inr')::int as fee_inr from catalog_revision where entity_type='course' and status='NEEDS_REVIEW'",
  )).rows;

  const rows = courses.map((course) => {
    const pending = proposals.filter((proposal) => proposal.entity_id === course.id);
    const item = (label: string, applied: boolean, inReview: boolean, held = false): Item => ({ label, state: held ? "held" : applied ? "applied" : inReview ? "review" : "todo" });
    const items: Item[] = [];
    const recognition = preparedRecognition.find((draft) => draft.courseId === course.id);
    if (recognition) {
      const matches = (data: Data | undefined | null) => checkedOn(data || undefined, "recognition", recognition.recognition.checkedAt) && record(data || undefined, "recognition")?.status === recognition.recognition.status;
      items.push(item(`Recognition ${recognition.recognition.academicYear}`, matches(course.data), pending.some((proposal) => matches(proposal.data))));
    }
    const category = preparedCategoryFees.find((draft) => draft.courseId === course.id);
    if (category) items.push(item("Student-category fees", checkedOn(course.data, "categoryFees", category.categoryFees.checkedAt), pending.some((proposal) => checkedOn(proposal.data || undefined, "categoryFees", category.categoryFees.checkedAt))));
    const fee = preparedFees.find((draft) => draft.courseId === course.id);
    if (fee) items.push(item("Fee correction", course.fee_inr === fee.fee, pending.some((proposal) => proposal.fee_inr === fee.fee)));
    const eligibility = preparedEligibility.find((draft) => draft.courseId === course.id);
    const held = eligibilityIssues.find((issue) => issue.courseId === course.id);
    if (eligibility || held) items.push(item("Eligibility", Boolean(eligibility) && checkedOn(course.data, "eligibilityReview", eligibility!.checkedAt), Boolean(eligibility) && pending.some((proposal) => checkedOn(proposal.data || undefined, "eligibilityReview", eligibility!.checkedAt)), Boolean(held)));
    const rule = preparedEligibilityRules.find((draft) => draft.courseId === course.id);
    if (rule) items.push(item("Structured eligibility checker rules", checkedOn(course.data, "eligibilityRules", rule.rules.checkedAt), pending.some((proposal) => checkedOn(proposal.data || undefined, "eligibilityRules", rule.rules.checkedAt))));
    const curriculum = preparedCurricula.find((draft) => draft.courseId === course.id);
    if (curriculum) items.push(item("Semester outline", checkedOn(course.data, "curriculumReview", curriculum.checkedAt), pending.some((proposal) => checkedOn(proposal.data || undefined, "curriculumReview", curriculum.checkedAt))));
    const details = preparedProgramDetails.find((draft) => draft.courseId === course.id);
    if (details) {
      const matches = (data: Data | undefined | null) => Object.entries(details.programDetails).every(([key, detail]) => {
        const published = record(record(data || undefined, "programDetails"), key);
        return published?.checkedAt === detail.checkedAt && published?.sourceUrl === detail.sourceUrl;
      });
      items.push(item("Study, exams and charges", matches(course.data), pending.some((proposal) => matches(proposal.data))));
    }
    return { course, items };
  }).filter((row) => row.items.length);

  const all = rows.flatMap((row) => row.items);
  const count = (state: State) => all.filter((item) => item.state === state).length;

  return <section className="admin-shell"><div className="container">
    <div className="admin-page-head"><div><span className="eyebrow">CMS review</span><h1>Publishing checklist</h1>
      <p>Code changes go live with a deployment. This page handles CMS content: submitted revisions can be published here; working drafts and prepared source files stay private.</p></div></div>
    <section className="card bulk-publish-card" aria-labelledby="bulk-publish-heading">
      <h2 id="bulk-publish-heading">Publish submitted content</h2>
      <p><strong>{publishPreview.ready.length}</strong> ready to publish · <strong>{publishPreview.skipped.length}</strong> submitted but needing individual attention · <strong>{publishPreview.workingCatalogDrafts + publishPreview.workingArticleDrafts + publishPreview.workingGuideDrafts}</strong> unfinished working drafts.</p>
      <p>The button applies every ready course, university, article and guide revision together. If validation fails or the list changes, nothing is published. It does not submit unfinished drafts or load the prepared source files below.</p>
      {publishPreview.ready.length ? <details><summary>See the exact revisions to publish</summary><ul className="bulk-publish-list">{publishPreview.ready.map(item => <li key={item.id}><Link href={item.href}>{item.label}</Link></li>)}</ul></details> : <p>No submitted revisions are ready right now.</p>}
      {session.role === "ADMIN" && publishPreview.ready.length ? <PublishReadyButton revisionIds={publishPreview.ready.map(item => item.id)} /> : session.role !== "ADMIN" ? <p>Only an administrator can publish submitted revisions.</p> : null}
      {publishPreview.skipped.length ? <details><summary>See revisions requiring individual attention</summary><ul className="bulk-publish-list">{publishPreview.skipped.map(item => <li key={item.id}><Link href={item.href}>{item.label}</Link> — {item.reason}</li>)}</ul></details> : null}
    </section>
    <section className="card bulk-publish-card" aria-labelledby="prepared-fees-heading">
      <h2 id="prepared-fees-heading">Review MUJ and SMU applicant-category fees</h2>
      <p><strong>{readyFeeIds.length}</strong> prepared courses can be submitted · <strong>{feePreview.length - readyFeeIds.length}</strong> require individual attention. These are base tuition schedules from the linked 2026–27 prospectuses. Application, examination, resit, tax and other charges may be additional. SMU has no separately confirmed NRI rate; applicants from Nepal, Bhutan, Bangladesh and Sri Lanka need category confirmation.</p>
      <p>Open the university sources and current program pages before submitting. Submitting creates private CMS revisions; it does not change public fees. An administrator must inspect those revisions and then publish them using the separate action above.</p>
      <details><summary>See the {feePreview.length} prepared courses and source links</summary>
        <ul className="bulk-publish-list">{feePreview.map(item => <li key={item.courseId}>
          <Link href={`/admin/catalog-revisions?type=course&id=${encodeURIComponent(item.courseId)}`}>{item.name}</Link> · {item.categories.join(" / ")} · <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">2026–27 prospectus</a> · <a href={item.programUrl} target="_blank" rel="noopener noreferrer">program fee page</a>{item.reason ? ` — ${item.reason}` : " — Ready to submit"}
        </li>)}</ul>
      </details>
      {session.role === "ADMIN" && readyFeeIds.length ? <StageCategoryFeesButton courseIds={readyFeeIds} /> : session.role !== "ADMIN" ? <p>Only an administrator can submit this prepared batch.</p> : null}
    </section>
    <h2>Prepared course updates</h2>
    <p>For each course, open <strong>Catalog revisions</strong>, load the prepared items, check them against their sources and submit one proposal. Submitted proposals then appear in the bulk publish list above.</p>
    <ul className="checklist-summary" aria-label="Progress">
      <li><strong>{count("applied")}</strong> applied</li>
      <li><strong>{count("review")}</strong> waiting for review</li>
      <li><strong>{count("todo")}</strong> to load</li>
      <li><strong>{count("held")}</strong> on hold</li>
    </ul>
    <p>On hold means the university has to answer a question first. The course&apos;s revision page explains what is needed.</p>
    <div className="card admin-table-region">
      <table className="checklist-table">
        <caption className="sr-only">Prepared updates by course</caption>
        <thead><tr><th scope="col">Course</th><th scope="col">Prepared items</th><th scope="col"><span className="sr-only">Action</span></th></tr></thead>
        <tbody>{rows.map(({ course, items }) => <tr key={course.id}>
          <th scope="row">{course.name}<small>{course.id}</small></th>
          <td><ul className="checklist-items">{items.map((entry) => <li key={entry.label} className={`is-${entry.state}`}><span>{entry.label}</span><span className="checklist-state">{STATE_LABEL[entry.state]}</span></li>)}</ul></td>
          <td>{items.every((entry) => entry.state === "applied") ? <span className="checklist-done">Done</span> : <Link className="btn ghost" href={`/admin/catalog-revisions?type=course&id=${encodeURIComponent(course.id)}`}>Open revisions</Link>}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </div></section>;
}
