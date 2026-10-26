# UI redesign: implementation brief for each area

Read this before changing any page. It applies the approved plan ([UI_REDESIGN_PLAN_2026-10.md](../UI_REDESIGN_PLAN_2026-10.md), decisions in its §10) on top of the design system built in phases 1–3.

## Ground rules

1. **UI only.** Keep every route and URL, server data reads, JSON-LD and metadata (`withSocial`, `fitTitle`), analytics attributes (`data-track-event`, `data-track-params`, `trackEvent` names), `data-open-lead` links (real `<a href="/lead?...">` with `rel="nofollow"`), `#sec-*` and other anchor ids, the lead flow, the compare OTP gate, CMS behaviour and published-data rules. Change behaviour only where a §10 decision says so.
2. **Earlier owner decisions win (Q2).** That means:
   - no phone number anywhere;
   - no "Best"/"Lowest"/winner highlighting;
   - placement, package and partners labelled university-wide;
   - no "Save 2%" plan or template credits, exams or ₹500 (use the existing `program-facts` helpers);
   - per-program recognition (`recognitionSummary`), never a blanket "UGC-entitled";
   - no invented reviews, stats or "Who it suits" copy;
   - byline "Content Team, Unnati Vidya";
   - CTA label exactly **Apply now**;
   - contact-first 3-step lead form with one unticked consent;
   - ratings visible but never used for sorting, ranking or emphasis;
   - status labels "CONFIRM WITH THE UNIVERSITY", "SOURCE VERIFIED" and "BEING RE-CHECKED", shown only where the data has that status.
3. **Exact look:** follow your appendix spec (A–D in this folder) for sizes, colours, radii, spacing and copy. Where the spec and an accessibility rule clash, use the accessible version at the same visual size:
   - targets at least 44px;
   - visible focus;
   - real `<button>`, `<table>` and `<details>` elements;
   - labelled form controls;
   - lucide icons with `aria-hidden`;
   - text contrast of 4.5:1 or better (use `--uv-muted` `#6F6D8C` rather than `#8E8CA8` for small text).
4. **Use the design system.** Don't reinvent what exists.
   - **Tokens** (in `src/styles/globals.css` `:root`): colours `--uv-primary`, `--uv-primary-50…250`, `--uv-navy`, `--uv-ink`, `--uv-ink-2`, `--uv-body`, `--uv-muted`, `--uv-faint`, `--uv-border`, `--uv-border-strong`, `--uv-hairline`, `--uv-surface-alt`, `--uv-success*`, `--uv-warning-*`, `--uv-error`, `--uv-rating`, `--uv-on-navy-*`; radii `--uv-radius-*`; shadows `--uv-shadow-*`; layout `--uv-max` (1240), `--uv-gutter`, `--uv-header-h`; z-index `--uv-z-*`; and `--uv-hero-bg`.
   - **Shared CSS** (`src/styles/ui/shell.css`): `.btn` (`primary`, `secondary` = outline, `ghost`, `on-navy`, `outline-on-navy`, `large`), `.uv-link`, `.uv-page-hero` + `.uv-page-hero-inner` + `.uv-breadcrumb` + `.uv-h1` + `.uv-lede` + `.uv-eyebrow`, `.uv-shell` (`.is-reading` = 940px), `.uv-section`, `.uv-section-head`, `.uv-h2` (`.is-inner`), `.uv-section-sub`, `.uv-section-link`, `.uv-stat-strip` (a `<dl>`), `.uv-tabs` + `.uv-tabs-inner` (sticky section tabs, active link `aria-current="true"`), `.uv-empty` with `.uv-empty-art` (two tilted cards, an icon span and two dots) and `.uv-empty-actions`, `.uv-navy-panel`, `.uv-lavender-panel`, `.uv-table-region` + `.uv-table`, `.uv-tag` (`-success`, `-warning`, `-neutral`, `-strong`), `.uv-level`, `.uv-icon-tile`, `.uv-card-grid` (`.is-wide`), `.uv-mobile-bar` (fixed bottom bar below 860px), `.uv-reveal` (CSS-only entrance motion for below-the-fold sections), `.sr-only`.
   - **Shared components:**
     - `CourseCard` (`src/components/course-card.tsx`): the only program card; use it everywhere a program card appears.
     - `FaqAccordion` (`src/components/faq-accordion.tsx`): every FAQ except the Home one. Keep FAQPage JSON-LD beside it.
     - `SaveButton`: bookmark.
     - `CompareToggle`, `useCompareList` and `compareHref` (`src/lib/use-compare-list.ts`).
     - `CompareTray`: already mounted by `PublishedCatalogBoundary`.
     - `STREAM_ICONS` (from `course-card.tsx`).
   - `SectionTabs` (`src/components/section-tabs.tsx`): the design's sticky section tabs with scroll-spy (`items: {label, href:"#sec-…"}[]`, `label`). It replaces `SectionPillNav` on course and university pages.
   - **Reference:** `src/app/page.tsx` (Home) and `src/styles/ui/home.css` show how pages are composed.
5. **Your files only.**
   - Edit your area's route files, area-specific components and **your own stylesheet** `src/styles/ui/<area>.css`. All are already imported by the root layout.
   - **Do not edit** `globals.css`, `shell.css`, `home.css`, `layout.tsx`, `site-header.tsx`, `site-footer.tsx`, `course-card.tsx`, `faq-accordion.tsx`, `save-button.tsx`, `compare-toggle.tsx`, `compare-tray.tsx`, `use-compare-list.ts` or `section-tabs.tsx`. If you need a change there, describe it in your final report.
   - Move page-level inline `style={{…}}` into classes in your stylesheet as you rewrite.
   - Old classes in `globals.css` that your pages stop using can stay; list them in your report.
6. **No new npm dependencies.**
7. **Checks you run:**
   - `npx tsc -p apps/unnatividya --noEmit` and `npx eslint <your files>` from `/Users/arjunh/Documents/crm/crm`.
   - Screenshots against the shared dev server at `http://localhost:3002`, which hot-reloads.
   - **Do not run `next build`**, and don't start or stop any server.
   - Screenshot helper: `node /private/tmp/claude-502/-Users-arjunh-Documents-crm/9f145bdd-eb3e-4788-8208-4b4eac19a678/scratchpad/redesign/shot.cjs <url> <width> <out.png> [height] [css-selector | full | parts] [menu | click:<selector>]`.
     - It emulates reduced motion, so `.uv-reveal` content is visible.
     - `parts` writes 1300px slices (`out-p0.png`, `out-p1.png`, …).
     - Check 390px and 1280px at least, and confirm `overflow: false`.
   - Other agents are editing other areas at the same time. A compile error in a file you don't own is theirs, so retry after a minute.
8. **Smoke tests:** update the smoke suites under `apps/unnatividya/scripts/` that assert your area's markup, classes or copy, so they match the new UI without weakening what they check. Don't run the browser suites (the integrator runs them against a production build). Don't change admin or other areas' suites.
9. **Final report:** files changed, decisions applied, anything you couldn't match exactly and why, requests for shared-file changes, old CSS classes that are now unused, smoke suites updated, and screenshots taken (paths).
