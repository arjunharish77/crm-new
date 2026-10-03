"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CatalogContentEditor } from "@/components/catalog-content-editor";
import { normalizeEditorialContent } from "@/lib/catalog-editor";
import { canEditCatalog, type CatalogRole } from "@/lib/catalog-permissions";

export function CatalogCreateForm({ entityType, role, universities = [] }: {
  entityType: "course" | "university"; role: CatalogRole; universities?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [content, setContent] = useState(JSON.stringify({ name: "", short_name: "", ...(entityType === "course" ? { duration: "", stream: "", fee_inr: null } : { city: "" }), data: { sourceUrls: [], ...(entityType === "course" ? { eligibility: "", curriculum: [], specializations: [], careerRoles: [], faqs: [] } : { approvals: [] }) } }, null, 2));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const editable = canEditCatalog(role);
  const missingUniversity = entityType === "course" && !universities.length;
  async function create(form: FormData) {
    if (!editable || busy || missingUniversity) return;
    setMessage("");
    let value: Record<string, unknown>;
    try {
      const parsed = JSON.parse(content);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !parsed.data || typeof parsed.data !== "object" || Array.isArray(parsed.data)) throw Error();
      value = normalizeEditorialContent(parsed);
    } catch { setMessage("Repair the JSON in Advanced structured content before creating the draft."); return; }
    const slug = String(form.get("slug") || "").trim();
    const body = { id: slug, slug, name: value.name, shortName: value.short_name,
      status: "DRAFT", isPublished: false, data: value.data,
      ...(entityType === "course" ? { universityId: String(form.get("universityId") || ""), level: String(form.get("level") || "UG"), programType: "DEGREE", ugcApproved: form.get("ugcApproved") === "on", stream: value.stream, feeInr: value.fee_inr ?? null, duration: value.duration } : { city: value.city }) };
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/catalog/${entityType === "course" ? "courses" : "universities"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Could not create the draft.");
      router.push(`/admin/${entityType === "course" ? "courses" : "universities"}/${encodeURIComponent(result.id)}`);
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Connection failed. Your entries are retained; try again."); setBusy(false); }
  }
  return <form action={create} className="admin-form-grid">
    <p className="admin-notice admin-span-2">Create a private draft. You can complete missing details later; an administrator must review publication separately. Blank fees stay unknown, not zero.</p>
    {!editable ? <p className="admin-span-2">Read-only: your role cannot create catalog records.</p> : null}
    {missingUniversity ? <p className="admin-error admin-span-2">No universities are available. Create a university draft first, then return to add its courses.</p> : null}
    <fieldset className="admin-form-grid admin-catalog-fields admin-span-2" disabled={!editable || busy}>
      <legend>Record setup</legend>
      <div className="field"><label htmlFor="new-slug">URL slug</label><input id="new-slug" name="slug" required minLength={2} pattern="[a-z0-9-]+" placeholder={entityType === "course" ? "online-mba-example" : "example-university"} aria-describedby="new-slug-help"/><small id="new-slug-help">Use a unique lowercase name with hyphens. This also becomes the permanent record ID.</small></div>
      {entityType === "course" ? <>
        <div className="field"><label htmlFor="new-university">University</label><select id="new-university" name="universityId" required defaultValue=""><option value="" disabled>Select a university</option>{universities.map(university => <option value={university.id} key={university.id}>{university.name}</option>)}</select></div>
        <div className="field"><label htmlFor="new-level">Level</label><select id="new-level" name="level" defaultValue="UG"><option value="UG">Undergraduate</option><option value="PG">Postgraduate</option></select></div>
        <label className="admin-check"><input name="ugcApproved" type="checkbox"/>UGC approval verified for this program and admission session</label>
      </> : null}
    </fieldset>
    <CatalogContentEditor entityType={entityType} value={content} onChange={setContent} disabled={!editable || busy} allowIncomplete/>
    <button className="btn primary" disabled={!editable || busy || missingUniversity}>{busy ? "Creating draft…" : `Create ${entityType} draft`}</button>
    {message ? <p role="alert" className="admin-error admin-span-2">{message}</p> : null}
  </form>;
}
