"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { useCatalog } from "@/components/catalog-provider";
import { compareHref, useCompareList } from "@/lib/use-compare-list";

// Bottom compare tray (design Courses "Compare tray", UI redesign Q6). It opens the gated
// /compare tool; it never shows comparison results itself.
export function CompareTray() {
  const pathname = usePathname();
  const { courses, universityById } = useCatalog();
  const { ids, remove, clear } = useCompareList();
  const selected = ids.map(id => courses.find(course => course.id === id)).filter((course): course is NonNullable<typeof course> => Boolean(course));
  if (!selected.length || pathname === "/compare" || pathname.startsWith("/lead")) return null;
  return <aside className="uv-tray" aria-label="Programs selected to compare">
    <ul className="uv-tray-chips">
      {selected.map(course => {
        const short = `${course.name.replace(/^Online /, "")} · ${universityById[course.universityId]?.shortName || ""}`;
        return <li key={course.id} className="uv-tray-chip">
          <span>{short}</span>
          <button type="button" onClick={() => remove(course.id)} aria-label={`Remove ${short} from compare`}><X size={14} aria-hidden="true" /></button>
        </li>;
      })}
    </ul>
    <div className="uv-tray-actions">
      <button type="button" className="uv-tray-clear" onClick={clear}>Clear</button>
      <Link href={compareHref(selected.map(course => course.id))} className="btn on-navy uv-tray-go">Compare {selected.length} →</Link>
    </div>
  </aside>;
}
