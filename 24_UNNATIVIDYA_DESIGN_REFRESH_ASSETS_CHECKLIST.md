# Unnati Vidya — New Assets Checklist (Design Refresh, `23_UNNATIVIDYA_DESIGN_SEO_ENHANCEMENT_PLAN.md`)

Companion to `14_UNNATIVIDYA_ASSET_CHECKLIST.md` (original asset list) and `21_UNNATIVIDYA_NEW_ASSETS_CHECKLIST.md` (content/SEO expansion assets) — those two documents are still the source of truth for everything that existed before this pass. This document covers **only what's new or changed** as a result of the design-refresh build in `23_...` (Home/Courses/Course-detail/Universities/Compare/Recommender/Blog/Guides/Specializations/Shortlist/How-We-Verify/Legal/Admin restyles, the responsive pass, and this session's follow-up fixes).

Status as of 12/08/2026: **this pass needed zero new imagery.** Confirmed by grepping every component touched during the redesign for `Image`/asset-path references — every visual change was CSS, copy, or re-wiring of catalog data that already existed (logos, campus photos, approval marks). The only asset-relevant item to re-flag from this pass is the approval-badge crop fix below, re-listed in full per request since it's the one place the redesign touched an actual asset file, not just code.

---

## 1. Approval badges — re-listed with updated status (no new files needed, one open item)

Same 5 files as originally listed in `14_` §"Approval badges" — not new files, but their **`viewBox` was corrected during this pass** (`23_...` §2.2) to crop out baked-in letterboxing, so the status below supersedes `14_`'s entry for these 5 paths specifically.

| File path | Corrected `viewBox` | Current file size | Status |
|---|---|---|---|
| `public/approvals/ugc.svg` | `4 19.62 40 8.75` | 1.6 KB | Renders tight — no further action |
| `public/approvals/naac.svg` | `4 7.80 40 32.41` | 8.3 KB | Renders tight — no further action |
| `public/approvals/aicte.svg` | `4 20.04 40 7.92` | 2.2 KB | **Still not pixel-tight** — see below |
| `public/approvals/wes.svg` | `10.47 4 59.07 40` | 5.1 KB | Renders tight — no further action |
| `public/approvals/aiu.svg` | `19.79 4 40.42 40` | 7.7 KB | Renders tight — no further action |

**Open item — `aicte.svg` only**: the crop above is a `viewBox` (metadata-only) fix — it changes which region of the existing artwork is displayed, but can't remove blank space that's baked into the artwork itself beyond that region. Confirmed this file specifically still has real padding beyond what a viewBox crop alone can trim, so it reads as "a smaller badge" rather than a stretched one (cosmetically minor, not broken — every approval badge already renders through `object-fit: contain` in a fixed box) but isn't pixel-tight the way the other four now are. If you want it pixel-tight: source a fresh AICTE mark SVG with its artwork already trimmed to its own bounding box (no viewBox trick will fix this one further), same spec as the row below.

Format/size spec for a replacement, if sourced: SVG, transparent background, artwork filling its own viewBox with no internal padding, ≤10 KB. Already wired (`components/approval-badge.tsx`) — dropping in a replacement file at the same path takes effect with no code change.

**Not re-listed here, still open from `14_`, not part of this pass**: the 18 hiring-partner logo files (6 slots × 3 universities) flagged in `14_` as still needed — unaffected by the design refresh, carried forward unchanged.

---

## 2. Everything else touched by the redesign — confirmed no new assets

| Area | Why no new asset |
|---|---|
| Home hero floating stat cards, "Browse by stream" tiles, UnnatiAI section | Text/CSS over existing catalog data (`catalog.ts` fee/EMI/package figures) — no image at all |
| Courses listing restyle | Reuses the same per-university logo files already tracked in `14_` |
| Course/University detail additions (Eligibility card, Admission-process steps, Sources card, Recognitions grid, etc.) | Text/table sections reading already-populated `catalog.ts`/`universityEnrichmentById` fields |
| Compare picker rebuild | Reuses `universityMedia[...].logo` — same files as everywhere else these logos render |
| Recommender visual restyle | CSS/copy only — badges are colored `<span>` pills, not images |
| Admin dashboard rebuild | Data tables, KPI cards, a CSS sidebar — no imagery in the design or the build |
| EMI calculator extension, responsive pass, Shortlist/How-We-Verify/Legal rebuilds | Same pattern — forms, tables, accordions, sticky-sidebar utility classes, all CSS |

This matches the same pattern `21_` already observed for the content/SEO expansion: new page sections and interactions here were deliberately built from existing design tokens and existing catalog data, not new photography or illustration.
