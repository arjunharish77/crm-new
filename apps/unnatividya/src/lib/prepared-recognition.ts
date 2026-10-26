import type { Recognition } from "@/data/catalog";

// 2026-27 UGC-DEB online-list results (docs/UGC_DEB_RECOGNITION_2026-27_2026-10-05.md). Loading
// changes only the unsaved proposal; an administrator applies it (next-phase plan §3).
export type PreparedRecognition = { courseId: string; recognition: Recognition };

export function loadPreparedRecognition(content: Record<string, unknown>, draft: PreparedRecognition) {
  const data = content.data as Record<string, unknown>;
  const sources = Array.isArray(data.sourceUrls) ? data.sourceUrls : [];
  return { ...content, data: { ...data,
    recognition: { ...draft.recognition },
    sourceUrls: [...new Set([...sources, draft.recognition.sourceUrl])],
  } };
}
