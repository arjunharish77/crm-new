"use client";

import { useState } from "react";

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
  universities,
  mode = "edit",
}: {
  course: CourseFormValue;
  universities: UniversityOption[];
  mode?: "create" | "edit";
}) {
  const [dataText, setDataText] = useState(JSON.stringify(course.data || {}, null, 2));
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
      setMessage("Course data JSON is invalid.");
      return;
    }

    const response = await fetch(mode === "create" ? "/api/admin/catalog/courses" : `/api/admin/catalog/courses/${course.id}`, {
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
        isPublished: formData.get("isPublished") === "on",
        data,
      }),
    });

    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as { error?: string } | null;
      setStatus("error");
      setMessage(error?.error || "Could not save course.");
      return;
    }

    setStatus("saved");
    setMessage(mode === "create" ? "Course created." : "Course saved.");
  }

  return (
    <form action={save} className="admin-form-grid">
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
          <option value="PUBLISHED">Published</option>
          <option value="ARCHIVED">Archived</option>
        </select>
      </div>
      <label className="admin-check">
        <input name="ugcApproved" type="checkbox" defaultChecked={course.ugcApproved} />
        UGC approved
      </label>
      <label className="admin-check">
        <input name="isPublished" type="checkbox" defaultChecked={course.isPublished} />
        Visible on public website
      </label>
      <div className="field admin-span-2">
        <label htmlFor="data">Structured data JSON</label>
        <textarea id="data" rows={16} value={dataText} onChange={(event) => setDataText(event.target.value)} />
      </div>
      <button className="btn primary" type="submit" disabled={status === "saving"}>
        {status === "saving" ? "Saving..." : "Save course"}
      </button>
      {message ? <p className={status === "error" ? "admin-error" : "admin-success"}>{message}</p> : null}
    </form>
  );
}
