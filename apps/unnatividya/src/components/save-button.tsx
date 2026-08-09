"use client";

import { Heart } from "lucide-react";
import { useShortlist } from "@/lib/use-shortlist";

export function SaveButton({ courseId, size = 36 }: { courseId: string; size?: number }) {
  const { isSaved, toggle } = useShortlist();
  const saved = isSaved(courseId);

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggle(courseId);
      }}
      aria-label={saved ? "Remove from shortlist" : "Save to shortlist"}
      aria-pressed={saved}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: "50%",
        border: `1.5px solid ${saved ? "#544CC8" : "#CFDAE6"}`,
        background: saved ? "rgba(84,76,200,0.08)" : "#fff",
        color: saved ? "#544CC8" : "#707070",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      <Heart size={size * 0.45} strokeWidth={2} fill={saved ? "#544CC8" : "none"} aria-hidden="true" />
    </button>
  );
}
