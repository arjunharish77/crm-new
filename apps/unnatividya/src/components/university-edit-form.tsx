"use client";

import { useState } from "react";
import { canEditCatalog, type CatalogRole } from "@/lib/catalog-permissions";

type UniversityFormValue = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  city: string;
  status: "DRAFT" | "NEEDS_REVIEW" | "PUBLISHED" | "ARCHIVED";
  isPublished: boolean;
  data: Record<string, unknown>;
};

export function UniversityEditForm({ university, role, mode = "edit" }: { role: CatalogRole; university: UniversityFormValue; mode?: "create" | "edit" }) {
  const editable = canEditCatalog(role, mode === "create" ? undefined : university);
  const [dataText, setDataText] = useState(JSON.stringify(university.data || {}, null, 2));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");

  async function save(formData: FormData) {
    if (!editable) return;
    setStatus("saving");
    setMessage("");

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(dataText || "{}") as Record<string, unknown>;
    } catch {
      setStatus("error");
      setMessage("University data JSON is invalid.");
      return;
    }

    let response: Response;
    try {
      response = await fetch(mode === "create" ? "/api/admin/catalog/universities" : `/api/admin/catalog/universities/${university.id}`, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: String(formData.get("slug") || ""),
          id: String(formData.get("id") || university.id),
          name: String(formData.get("name") || ""),
          shortName: String(formData.get("shortName") || ""),
          city: String(formData.get("city") || ""),
          status: String(formData.get("status") || "DRAFT"),
          isPublished: formData.get("status") === "PUBLISHED",
          data,
        }),
      });

    } catch {
      setStatus("error");
      setMessage("Connection failed. Please try saving again.");
      return;
    }
    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as { error?: string; issues?: Array<{field:string;message:string}> } | null;
      setStatus("error");
      setMessage([error?.error || "Could not save university.", ...(error?.issues || []).slice(0, 5).map(issue => `${issue.field}: ${issue.message}`)].join(" "));
      return;
    }

    setStatus("saved");
    setMessage(mode === "create" ? "University created." : "University saved.");
  }

  return (
    <form action={save}>
      {!editable ? <p role="status">Read-only: viewers cannot edit; published and archived records require an administrator. Use Propose or review revisions to suggest changes separately.</p> : role === "EDITOR" ? <p>Save a draft or mark it for review. An administrator must publish it.</p> : null}
      <fieldset className="admin-form-grid admin-catalog-fields" disabled={!editable || status === "saving"}>
      <legend className="sr-only">Catalog details</legend>
      <div style={{ gridColumn: "1 / -1", background: "#FFF4E5", border: "1px solid #F0C36D", borderRadius: 6, padding: "10px 14px", fontSize: 13, color: "#7A5B12", marginBottom: 8 }}>
        Published records appear on the website. Saving changes to a published record updates public pages on the next request.
        Use the revision review workflow to compare changes before applying them. Drafts stay private.
      </div>
      {mode === "create" ? (
        <div className="field">
          <label htmlFor="id">University ID</label>
          <input id="id" name="id" defaultValue={university.id} placeholder="example-university" required />
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="name">University name</label>
        <input id="name" name="name" defaultValue={university.name} required />
      </div>
      <div className="field">
        <label htmlFor="shortName">Short name</label>
        <input id="shortName" name="shortName" defaultValue={university.shortName} required />
      </div>
      <div className="field">
        <label htmlFor="slug">Slug</label>
        <input id="slug" name="slug" defaultValue={university.slug} required />
      </div>
      <div className="field">
        <label htmlFor="city">City</label>
        <input id="city" name="city" defaultValue={university.city} />
      </div>
      <div className="field">
        <label htmlFor="status">Review status</label>
        <select id="status" name="status" defaultValue={university.status}>
          <option value="DRAFT">Draft</option>
          <option value="NEEDS_REVIEW">Needs review</option>
          {(role === "ADMIN" || !editable) ? <option value="PUBLISHED">Published</option> : null}
          {(role === "ADMIN" || !editable) ? <option value="ARCHIVED">Archived</option> : null}
        </select>
      </div>

      <div className="field admin-span-2">
        <label htmlFor="data">Structured data JSON</label>
        <textarea id="data" rows={14} value={dataText} onChange={(event) => setDataText(event.target.value)} />
      </div>
      <button className="btn primary" type="submit" disabled={status === "saving"}>
        {status === "saving" ? "Saving..." : "Save university"}
      </button>
      </fieldset>
      {message ? <p role="status" className={status === "error" ? "admin-error" : "admin-success"}>{message}</p> : null}
    </form>
  );
}
