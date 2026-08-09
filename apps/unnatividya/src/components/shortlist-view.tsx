"use client";

import Link from "next/link";
import { CourseCard } from "@/components/course-card";
import { useShortlist } from "@/lib/use-shortlist";
import type { Course } from "@/data/catalog";

export function ShortlistView({ courses }: { courses: Course[] }) {
  const { ids } = useShortlist();
  const saved = courses.filter((course) => ids.includes(course.id));

  if (!saved.length) {
    return (
      <div style={{ background: "#fff", border: "1px dashed #CFDAE6", borderRadius: 8, padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#363634" }}>Nothing saved yet</div>
        <div style={{ fontSize: 14, color: "#696868", marginTop: 8, marginBottom: 20 }}>
          Tap the heart icon on any course card to save it here for later — it stays on this device until you remove it.
        </div>
        <Link href="/courses" className="btn primary" style={{ display: "inline-flex", height: 44, alignItems: "center", padding: "0 22px" }}>
          Browse courses
        </Link>
      </div>
    );
  }

  return (
    <div className="grid three">
      {saved.map((course) => (
        <CourseCard course={course} key={course.id} />
      ))}
    </div>
  );
}
