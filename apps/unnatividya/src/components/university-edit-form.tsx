"use client";

import { useState } from "react";

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

export function UniversityEditForm({ university, mode = "edit" }: { university: UniversityFormValue; mode?: "create" | "edit" }) {
  const [dataText, setDataText] = useState(JSON.stringify(university.data || {}, null, 2));
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");

  async function save(formData: FormData) {
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

    const response = await fetch(mode === "create" ? "/api/admin/catalog/universities" : `/api/admin/catalog/universities/${university.id}`, {
      method: mode === "create" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: String(formData.get("slug") || ""),
        id: String(formData.get("id") || university.id),
        name: String(formData.get("name") || ""),
        shortName: String(formData.get("shortName") || ""),
        city: String(formData.get("city") || ""),
        status: String(formData.get("status") || "DRAFT"),
        isPublished: formData.get("isPublished") === "on",
        data,
      }),
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as { error?: string } | null;
      setStatus("error");
      setMessage(error?.error || "Could not save university.");
      return;
    }

    setStatus("saved");
    setMessage(mode === "create" ? "University created." : "University saved.");
  }

  return (
    <form action={save} className="admin-form-grid">
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
          <option value="PUBLISHED">Published</option>
          <option value="ARCHIVED">Archived</option>
        </select>
      </div>
      <label className="admin-check">
        <input name="isPublished" type="checkbox" defaultChecked={university.isPublished} />
        Visible on public website
      </label>
      <div className="field admin-span-2">
        <label htmlFor="data">Structured data JSON</label>
        <textarea id="data" rows={14} value={dataText} onChange={(event) => setDataText(event.target.value)} />
      </div>
      <button className="btn primary" type="submit" disabled={status === "saving"}>
        {status === "saving" ? "Saving..." : "Save university"}
      </button>
      {message ? <p className={status === "error" ? "admin-error" : "admin-success"}>{message}</p> : null}
    </form>
  );
}
