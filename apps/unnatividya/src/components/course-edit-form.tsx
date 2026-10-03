"use client";

import { useState } from "react";
import { canEditCatalog, type CatalogRole } from "@/lib/catalog-permissions";

type CourseFormValue = {
  id: string;
  slug: string;
  universityId: string;
  name: string;
  shortName: string;
  level: "UG" | "PG";
  programType: string;
  ugcApproved: boolean;
  stream: string;
  feeInr: number | null;
  duration: string;
  status: "DRAFT" | "NEEDS_REVIEW" | "PUBLISHED" | "ARCHIVED";
  isPublished: boolean;
  data: Record<string, unknown>;
};

type UniversityOption = {
  id: string;
  name: string;
};

export function CourseEditForm({
  course,
  role,
  universities,
  mode = "edit",
}: {
  role: CatalogRole;
  course: CourseFormValue;
  universities: UniversityOption[];
  mode?: "create" | "edit";
}) {
  const editable = canEditCatalog(role, mode === "create" ? undefined : course);
  const [dataText, setDataText] = useState(JSON.stringify(course.data || {}, null, 2));
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
      setMessage("Course data JSON is invalid.");
      return;
    }

    let response: Response;
    try {
      response = await fetch(mode === "create" ? "/api/admin/catalog/courses" : `/api/admin/catalog/courses/${course.id}`, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: String(formData.get("slug") || ""),
          id: String(formData.get("id") || course.id),
          universityId: String(formData.get("universityId") || ""),
          name: String(formData.get("name") || ""),
          shortName: String(formData.get("shortName") || ""),
          level: String(formData.get("level") || "UG"),
          programType: String(formData.get("programType") || "DEGREE"),
          ugcApproved: formData.get("ugcApproved") === "on",
          stream: String(formData.get("stream") || ""),
          feeInr: Number(formData.get("feeInr") || 0) || null,
          duration: String(formData.get("duration") || ""),
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
      setMessage([error?.error || "Could not save course.", ...(error?.issues || []).slice(0, 5).map(issue => `${issue.field}: ${issue.message}`)].join(" "));
      return;
    }

    setStatus("saved");
    setMessage(mode === "create" ? "Course created." : "Course saved.");
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
          <label htmlFor="id">Course ID</label>
          <input id="id" name="id" defaultValue={course.id} placeholder="online-mba-example" required />
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="name">Course name</label>
        <input id="name" name="name" defaultValue={course.name} required />
      </div>
      <div className="field">
        <label htmlFor="shortName">Short name</label>
        <input id="shortName" name="shortName" defaultValue={course.shortName} required />
      </div>
      <div className="field">
        <label htmlFor="slug">Slug</label>
        <input id="slug" name="slug" defaultValue={course.slug} required />
      </div>
      <div className="field">
        <label htmlFor="universityId">University</label>
        <select id="universityId" name="universityId" defaultValue={course.universityId}>
          {universities.map((university) => (
            <option value={university.id} key={university.id}>{university.name}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="level">Level</label>
        <select id="level" name="level" defaultValue={course.level}>
          <option value="UG">UG</option>
          <option value="PG">PG</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="stream">Stream</label>
        <input id="stream" name="stream" defaultValue={course.stream} required />
      </div>
      <div className="field">
        <label htmlFor="feeInr">Total fee INR</label>
        <input id="feeInr" name="feeInr" type="number" defaultValue={course.feeInr || ""} />
      </div>
      <div className="field">
        <label htmlFor="duration">Duration</label>
        <input id="duration" name="duration" defaultValue={course.duration} />
      </div>
      <div className="field">
        <label htmlFor="programType">Program type</label>
        <input id="programType" name="programType" defaultValue={course.programType} />
      </div>
      <div className="field">
        <label htmlFor="status">Review status</label>
        <select id="status" name="status" defaultValue={course.status}>
          <option value="DRAFT">Draft</option>
          <option value="NEEDS_REVIEW">Needs review</option>
          {(role === "ADMIN" || !editable) ? <option value="PUBLISHED">Published</option> : null}
          {(role === "ADMIN" || !editable) ? <option value="ARCHIVED">Archived</option> : null}
        </select>
      </div>
      <label className="admin-check">
        <input name="ugcApproved" type="checkbox" defaultChecked={course.ugcApproved} />
        UGC approved
      </label>

      <div className="field admin-span-2">
        <label htmlFor="data">Structured data JSON</label>
        <textarea id="data" rows={16} value={dataText} onChange={(event) => setDataText(event.target.value)} />
      </div>
      <button className="btn primary" type="submit" disabled={status === "saving"}>
        {status === "saving" ? "Saving..." : "Save course"}
      </button>
      </fieldset>
      {message ? <p role="status" className={status === "error" ? "admin-error" : "admin-success"}>{message}</p> : null}
    </form>
  );
}
