# E. Current-state technical inventory: Unnati Vidya website (pre-redesign)

App root: `/Users/arjunh/Documents/crm/crm/apps/unnatividya` (below, paths are relative to it unless absolute).
Stack: Next.js 16.3.8 (webpack build, `output: "standalone"`), React 19.2.3. Dependencies: `lucide-react ^0.563.0`, `pg`, `zod`. There is no Tailwind, no CSS Modules and no UI library.
Measured 2026-10-10. The page-weight numbers come from the production server that was already running on `localhost:3100`. Its build hash differs from the local `.next`, so treat the numbers as approximate.

---

## 1. Routes

### 1.1 Public routes (28 `page.tsx` outside `/admin`)

Nearly every public page is wrapped in `PublishedCatalogBoundary`. The boundary loads the DB catalog snapshot, provides `CatalogProvider` and mounts `LeadWizardModal`. The only exceptions are the `/newsletter/*` pages and `[...slug]`.
`layout.tsx` adds the skip link, `Analytics`, Organization+WebSite JSON-LD, `SiteHeader`, `<main id="main-content" tabIndex={-1}>`, and `HideOnAdmin`, which wraps `SiteFooter` and `StickyCtas`.

| Route | File (lines / `style={{` count) | Main components and notes |
|---|---|---|
| `/` | `src/app/page.tsx` (457 / 118) | Mostly inline markup. Uses `ApprovalBadge`, `JsonLd`, `SaveButton`, `StickyMobileBar` and `next/image` (`learningMedia` hero, `/hero/recommender-preview.webp`, `/streams/*.webp`, university media). H2 sections: Start with your goals and budget / Popular online degrees / Browse by stream / Universities we cover / How UnnatiVidya works / What learners say / Questions we get every day. Has `data-track-event` ×3. |
| `/courses` | `courses/page.tsx` (89 / 16) | `CourseExplorer` (client, 304 lines, 37 inline styles), `JsonLd`. URL state: `q, level (UG/PG), stream, university, maxFee, sort (relevance/feeAsc/feeDesc)`. |
| `/courses/[slug]` | `courses/[slug]/page.tsx` (541 / 69) | `SectionPillNav`, `SaveButton`, `StickyMobileBar`, `CourseEnquiryCard`, `CategoryFeeSelector`, `JsonLd`. Section ids: `sec-overview, sec-eligibility, sec-specialisations, sec-curriculum, sec-fees, sec-recognition, sec-admission, sec-careers, sec-related-guides, sec-certificate, sec-faq` (tests and pill nav depend on them). |
| `/universities` | `universities/page.tsx` (116 / 4) | `ApprovalBadge`, cards built inline. |
| `/universities/[slug]` | `universities/[slug]/page.tsx` (365 / 48) | `ApprovalBadge`, `SectionPillNav`, `SaveButton`, `StickyMobileBar`, `JsonLd`, NIRF card (`src/data/nirf-rankings.ts`), partner logos filtered through `publicAssetExists`. Section ids: `sec-about, sec-rankings, sec-programs, sec-placements, sec-admission, sec-scholarships, sec-faq`. |
| `/compare` | `compare/page.tsx` (85 / 16) | `ComparePicker` (client), which wraps `CompareGate`. Gated by OTP (see §4). |
| `/compare/[course]/[pair]` | `compare/[course]/[pair]/page.tsx` (138 / 15) | Public editorial comparison, server-rendered table, `JsonLd`. Uses the same `.comparison-*` classes and the CSS-only differences toggle. |
| `/shortlist` | `shortlist/page.tsx` (35 / 7) | `ShortlistView` (client). |
| `/recommender` | `recommender/page.tsx` (52 / 1) | `RecommenderQuiz` (client, Groq: 5 hard-filter questions, AI ranking, follow-up chat), `JsonLd`. |
| `/lead` | `lead/page.tsx` (33 / 0) | `LeadFormLoader`, which loads `LeadForm` through `next/dynamic` (3-step contact-first form with OTP). noindex (robots and Caddy). |
| `/newsletter/confirm`, `/newsletter/unsubscribe` | 34 / 0, 26 / 0 | Plain server pages with no catalog boundary, so `data-open-lead` falls back to normal `/lead` navigation here. |
| `/online-degree-guides` | `online-degree-guides/page.tsx` (32 / 0) | `GuideExplorer` (client), `JsonLd`. |
| `/online-degree-guides/[slug]` | `online-degree-guides/[slug]/page.tsx` (565 / 73) | All-inline guide templates (fee, eligibility, career, UGC guides), `JsonLd`, `data-open-lead` ×4, `data-track-event="source_link_click"`. |
| `/blog` | `blog/page.tsx` (56 / 14) | `BlogExplorer` (client). |
| `/blog/[slug]` | `blog/[slug]/page.tsx` (83 / 0) | `ArticleView` (server, 21 inline styles, includes `NewsletterSignup variant="article"`), `JsonLd` (Article). |
| `/specializations` | `specializations/page.tsx` (67 / 8) | `SpecializationExplorer` (client), `JsonLd`. |
| `/specializations/[slug]` | `specializations/[slug]/page.tsx` (155 / 23) | Inline markup, `JsonLd`. 101 pages, indexable. |
| `/tools/emi-calculator` | 98 / 8 | `EmiCalculator` (client), `StickyMobileBar`, `JsonLd`. |
| `/tools/total-cost` | 44 / 0 | `TotalCostPlanner` (client), `JsonLd`. Has print CSS. |
| `/tools/eligibility-checker` | 37 / 0 | `EligibilityChecker` (client), `JsonLd`. |
| `/about` | 68 / 1 | `LegalPageLayout`. |
| `/how-we-verify` | 84 / 0 | `LegalPageLayout`, `JsonLd`. |
| `/authors/content-team` | 50 / 0 | `LegalPageLayout`. |
| `/privacy`, `/terms`, `/refund-policy` | 78 / 3, 56 / 3, 56 / 3 | `LegalPageLayout` (13 inline styles). |
| `/[...slug]` | 44 / 0 | Not a page: DB redirect fallback (`seo_redirect` table), otherwise `notFound()`. |
| Special files | `not-found.tsx` (has its own `role="search"` course search), `error.tsx` and `global-error.tsx` (`PageErrorView` + `src/styles/page-recovery.css`, 18 lines), `robots.ts` (disallows `/admin`, `/api`, `/lead`), `sitemap.ts`, `sitemap-index.xml/route.ts`, `sitemaps/{blog,career-guides,comparisons,courses,eligibility-guides,guides,specializations,static,ugc-guides,universities}.xml/route.ts`, `indexnow-key/route.ts`, `[indexNowKey].txt`. | No `opengraph-image`, `icon` or `manifest` route files. Icons and OG come from `/brand/*` in `layout.tsx` metadata. |

### 1.2 Admin and API (out of scope)
- `/admin/*`: 27 `page.tsx` plus `admin/layout.tsx` (articles, catalog-preview, catalog-revisions, content-quality, courses, crm-sync{,/history,/mappings}, leads, login, newsletter, programmatic-seo, publishing-checklist, redirects, setup, source-imports, universities).
- `/api/*`: 41 `route.ts`. The 11 public ones are `compare-access`, `health`, `leads`, `leads/[id]`, `newsletter{,/confirm,/unsubscribe}`, `otp/send`, `otp/verify`, `recommender`, `recommender/follow-up`. The other 30 are under `api/admin/*`.
- **Admin shares `src/styles/globals.css` with the public site** (see §2.1). About 295 of 1,416 rules (25.5 KB of the 133 KB of rule text) have admin-like selectors. Admin also reuses shared classes (`.btn`, `.text-link`, `.container`, `.form-grid`), which admin smoke tests assert.

---

## 2. Styling system

### 2.1 Organisation
- There is a single global stylesheet, `src/styles/globals.css`, imported in `src/app/layout.tsx`. It has **4,658 lines**, **1,416 style rules** (1,658 selectors), **620 distinct class names**, **63 `@media` blocks**, **7 `@keyframes`**, 53 `!important`, and 0 `@font-face`, `@import` or `@supports`. The built CSS is one file of about 114 KB raw / 20 KB gzip, loaded on every page, admin included.
- `src/styles/page-recovery.css` (18 lines) is imported only by `page-error-view.tsx`.
- Naming is ad hoc BEM-ish with no methodology: the `.uv-*` prefix (`uv-public-header`, `uv-home-hero-grid`, `uv-course-list-card`, `uv-sticky-ctas`, `uv-mobile-action-bar`) is mixed with generic names (`.btn.primary/secondary/ghost`, `.card`, `.container`, `.pill-nav`, `.grid.three`) and feature names (`comparison-*`, `shortlist-*`, `lead-*`, `guide-*`, `total-cost-*`).
- `.container` is `width: min(100% - 48px, var(--uv-max))` with `--uv-max: 1200px`. The design uses 1240px with `clamp(16px,3vw,32px)` padding.
- Body text is `font-size: 15px; line-height: 1.55; color: var(--uv-body)`. **The design standard requires 16px body.**
- **Inline styles:** 579 `style={{` occurrences in 46 `.tsx` files, against 1,342 `className=`. Rendered HTML counts of `style="` attributes: `/courses` 731, `/` 348, `/courses/mba-muj` 233, `/universities/manipal-university-jaipur` 166, `/compare` 76, `/privacy` 67.

**Top 20 files by `style={{` occurrences**

| # | Count | File |
|---|---|---|
| 1 | 118 | `src/app/page.tsx` |
| 2 | 73 | `src/app/online-degree-guides/[slug]/page.tsx` |
| 3 | 69 | `src/app/courses/[slug]/page.tsx` |
| 4 | 48 | `src/app/universities/[slug]/page.tsx` |
| 5 | 37 | `src/components/course-explorer.tsx` |
| 6 | 32 | `src/components/site-footer.tsx` |
| 7 | 23 | `src/app/specializations/[slug]/page.tsx` |
| 8 | 21 | `src/components/article-view.tsx` |
| 9 | 16 | `src/components/admin-sidebar.tsx` (admin) |
| 10 | 16 | `src/app/courses/page.tsx` |
| 11 | 16 | `src/app/compare/page.tsx` |
| 12 | 15 | `src/app/compare/[course]/[pair]/page.tsx` |
| 13 | 14 | `src/app/blog/page.tsx` |
| 14 | 13 | `src/components/legal-page-layout.tsx` |
| 15 | 8 | `src/app/tools/emi-calculator/page.tsx` |
| 16 | 8 | `src/app/specializations/page.tsx` |
| 17 | 7 | `src/app/shortlist/page.tsx` |
| 18 | 5 | `src/app/admin/page.tsx` (admin) |
| 19 | 4 | `src/app/universities/page.tsx` |
| 20 | 3 | `src/components/sticky-ctas.tsx` |

`SaveButton` (`save-button.tsx`) and `ApprovalBadge` also style themselves inline with hard-coded hex values (`#544CC8`, `#CFDAE6`, `#707070`).

### 2.2 CSS custom properties (all in `:root`, top of `globals.css`)

| Token | Value | Uses in CSS |
|---|---|---|
| `--uv-primary` | `#544cc8` | 44 |
| `--uv-primary-hover` | `#453db8` | 2 |
| `--uv-primary-soft` | `#f4f3fc` | 6 |
| `--uv-gradient` | `linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)` | 6 |
| `--uv-ink` | `#363634` | 53 |
| `--uv-body` | `#555555` | 7 |
| `--uv-muted` | `#707070` | 5 |
| `--uv-faint` | `#aaaaaa` | 2 |
| `--uv-border` | `#cfdae6` | 33 |
| `--uv-hairline` | `#eaeaea` | 16 |
| `--uv-chip` | `#d8d7d6` | 2 |
| `--uv-page` | `#f7f8f9` | 4 |
| `--uv-dark` | `#263238` | 6 |
| `--uv-dark-text` | `#b8c4ca` | 6 |
| `--uv-success` | `#2e7d32` | 3 |
| `--uv-rating` | `#fdb515` | 4 |
| `--uv-whatsapp` | `#25d366` | 1 |
| `--uv-radius-card` | `8px` | 2 |
| `--uv-radius-control` | `4px` | 6 |
| `--uv-shadow` | `0 1px 3px rgba(0,0,0,0.06)` | 3 |
| `--uv-shadow-hover` | `0 4px 8px rgba(36,36,36,0.12)` | 4 |
| `--uv-shadow-lg` | `0 8px 24px rgba(0,0,0,0.16)` | 0 |
| `--uv-header-shadow` | `0 3px 6px rgba(194,194,194,0.16)` | 2 |
| `--uv-max` | `1200px` | 1 |

- **Bug:** `var(--uv-gold)` is used at `globals.css:1185` (`.home-degree-rating::first-letter`) but never defined.
- **No `.tsx` file uses `var(--uv-*)`.** Inline styles hard-code hex values. Most CSS also uses literal hex: 550 hex literals across 89 distinct colours, against about 230 `var(--uv-*)` uses.
- There is no dark mode, no `prefers-color-scheme`, and no spacing, type or z-index tokens.

### 2.3 Hex colour frequency
**`globals.css`** (550 literals, 89 distinct). Top 30: `#fff` 96 · `#555` 75 · `#544cc8` 57 · `#cfdae6` 47 · `#363634` 32 · `#707070` 29 · `#696868` 22 · `#f4f3fc` 15 · `#eaeaea` 15 · `#f5f5f5` 11 · `#4b43b6` 11 · `#f7f8f9` 10 · `#2e7d32` 6 · `#e5e7eb` 5 · `#92400e` 5 · `#59667a` 5 · `#fdb515` 4 · `#777` 4 · `#626262` 4 · `#fffbeb` 3 · `#fde68a` 3 · `#f7f8fa` 3 · `#dbe2ed` 3 · `#b8c4ca` 3 · `#526076` 3 · `#263238` 3 · `#ffc857` 2 · `#eef0f3` 2 · `#ebf2f6` 2 · `#d8d7d6` 2.

**All `.tsx`** (480 literals, 33 distinct; only 15 are in admin files). Top 30: `#fff` 64 · `#363634` 63 · `#707070` 53 · `#544cc8` 49 · `#555` 43 · `#cfdae6` 42 · `#b8c4ca` 32 (footer) · `#696868` 32 · `#eaeaea` 24 · `#f7f8f9` 16 · `#fdb515` 7 · `#f5f5f5` 7 · `#f4f3fc` 7 · `#4f46e5` 5 · `#7c3aed` 4 · `#263238` 4 · `#0f5bb8` 4 · `#2e7d32` 3 · `#fff4e5` 2 · `#fafafa` 2 · `#f0c36d` 2 · `#8b7cf0` 2 · `#7a5b12` 2 · `#4d00ff` 2 · `#fffbeb` 1 · `#fde68a` 1 · `#f0f0f0` 1 · `#ebf2f6` 1 · `#d8d7d6` 1 · `#b45309` 1.

Current brand vs target: primary `#544CC8` becomes `#5B4CF0`. Text greys `#363634/#555/#707070/#696868` become the navy and ink scale `#16133F/#2B2950/#4A4867/#6F6D8C`. Borders `#CFDAE6` become `#E8E6F3`. The footer `#263238` becomes `#1A1646`. Because almost all colour is literal, the swap needs a sweep across CSS and TSX; changing tokens alone will not do it.

### 2.4 Fonts
- `body { font-family: "DM Sans", Inter, ui-sans-serif, system-ui, … }` (`globals.css:574`).
- **No font is actually loaded.** There is no `next/font`, no `@font-face`, and no Google Fonts `<link>`. DM Sans is never shipped, so visitors get whatever is installed locally, usually the system UI font.
- Monospace is used only in admin (`globals.css:2835`, `4239`).
- Target: Plus Jakarta Sans 400–800 and Material Symbols Rounded. See §5 for how to load them.

### 2.5 Icons
- **lucide-react** is imported in 4 files and uses **6 distinct icons**:
  - `Heart`: `site-header.tsx`, `save-button.tsx`
  - `Menu`, `X`, `ChevronDown`: `site-header.tsx`
  - `SlidersHorizontal`: `course-explorer.tsx`
  - `ArrowRight`: `sticky-ctas.tsx`
- One inline `<svg>` (WhatsApp, `sticky-ctas.tsx`, behind `SHOW_WHATSAPP = false`).
- Approval logos are SVG images through `src/lib/approval-icons.ts`, mapping UGC, NAAC, AICTE, WES and AIU to `/approvals/*.svg`.
- Unicode glyphs act as icons: `→` (about 25 occurrences, mostly `courses/[slug]`), `★` (about 11, ratings on home, university and course pages), `×`/`✕` (remove and close buttons in `compare-picker`, `course-explorer`, `category-fee-selector`, `total-cost-planner`, `lead-wizard-modal`).
- The handoff uses about 60 Material Symbols names: `school, verified, compare_arrows, bookmark, bookmark_added, menu, close, search, help, add, remove, tune, calculate, payments, savings, workspace_premium, support_agent, …`.

### 2.6 Breakpoints (distinct `@media` in `globals.css`, normalised)

| Query | Count |
|---|---|
| `(max-width: 640px)` | 27 (16 spaced and 11 unspaced spellings) |
| `(max-width: 900px)` | 9 |
| `(max-width: 850px)` | 4 |
| `(max-width: 1000px)` | 4 |
| `(max-width: 1100px)` | 3 |
| `(max-width: 700px)` | 3 |
| `(max-width: 800px)` | 2 |
| `(prefers-reduced-motion: reduce)` | 5 |
| `(min-width: 901px)`, `(min-width: 1101px)`, `(max-width: 1050px)`, `(max-width: 680px)`, `(max-width: 480px)`, `(max-width: 420px)`, `print` | 1 each |

JS breakpoints:
- `site-header.tsx` uses `matchMedia("(max-width: 1100px)")`, so desktop nav starts at 1101px. The design wants 1080px.
- `admin-sidebar.tsx` uses 850px.
- There are no container queries.

### 2.7 Animation and reduced motion
- Keyframes: `uvspin` (spinner), `uvStepIn` (`.lead-step-enter`), `uvFadeUp` (`.recommender-results`; this class is not referenced in any `.tsx`, so it is probably dead), `uvShimmer` (`.uv-skeleton::after`, `.lead-form-skeleton div::after`), `uvModalIn` (`.lead-modal-backdrop`), `uvModalPanelIn` (`.lead-modal`), `uvSheetIn` (`.lead-modal` on mobile).
- There are 7 transition declarations (`.card`, `.btn`, `.pill-nav a`, `.stream-card`, `.decision-guide-card`, `.total-cost-card`, `.lead-interest`) and hover `transform` lifts.
- **Reduced motion is handled per selector, with no global catch-all.** The 5 blocks are at lines 3566 (lead modal and steps), 3694 (`.stream-card`), 3946 (`html { scroll-behavior: auto }`, overriding the global `scroll-behavior: smooth`), 4602 (fade, spinner, skeleton, card, btn, pill-nav, decision-guide) and 4657 (`.total-cost-card`). Any new animated class must be added to these lists. A global `*{animation-duration:…}` rule would be simpler.
- There is no scroll-reveal and no `IntersectionObserver`. Content is visible without JavaScript.

---

## 3. Shared components (`src/components`, 56 files)

There are 45 `"use client"` files in `src/components`. 20 are admin-only, which leaves **25 public client components**. Outside `src/components`, `src/app/error.tsx`, `src/app/global-error.tsx` and the hook `src/lib/use-shortlist.ts` are also client modules.

### 3.1 Public and shared components

| Component | C/S | Purpose | Used by |
|---|---|---|---|
| `site-header` | client | Sticky header. Flat links (Courses, Universities, Compare), disclosure groups "Resources" (Degree guides, Articles, How we verify) and "Tools" (Find my course, EMI calculator, Total cost planner, Eligibility checker), "Saved courses (n)" link, "Apply now" (`data-open-lead`), mobile panel `nav[aria-label="Mobile navigation"]`. Returns `null` on `/admin`. | `layout.tsx` |
| `site-footer` | server | Footer: white logo, UGC/NAAC/AICTE badges, link columns, `NewsletterSignup`, Apply link. 32 inline styles. | `layout.tsx` (through `HideOnAdmin`) |
| `sticky-ctas` | client | Floating desktop "Apply now" pill (right:20/bottom:20, z 150). Hidden on `/lead` and through the `uv-hide-sticky-ctas` event. WhatsApp disabled. | `layout.tsx` |
| `sticky-mobile-bar` | server | Mobile bottom action bar (`.uv-mobile-action-bar`) with primary and secondary actions. | `/`, `/courses/[slug]`, `/universities/[slug]`, `/tools/emi-calculator` |
| `hide-on-admin` | client | Hides its children on `/admin*`. | `layout.tsx` |
| `analytics` | client | GA4 lazy `gtag`, `trackEvent()`, delegated `[data-track-event]` and `data-track-params` click tracking. | `layout.tsx`, many clients |
| `track-on-mount` | client | Fires one event on mount. **Unused.** | none |
| `json-ld` | server | `<script type="application/ld+json">` with `<` escaped. | 15 routes and the layout |
| `published-catalog-boundary` | server | Loads the snapshot, renders `CatalogProvider` and `LeadWizardModal`. | 25 public pages and admin article preview |
| `catalog-provider` | client | React context holding the **whole** `CatalogSnapshot`, plus `useCatalog()`. | boundary, `lead-form`, `lead-wizard-modal`, `recommender-quiz`, `emi-calculator`, `eligibility-checker`, `shortlist-view`, `total-cost-planner` |
| `lead-wizard-modal` | client | Global `[data-open-lead]` click capture opens the dialog (portal, siblings set `inert`, focus trap, Escape, focus return, `uv-close-lead` event). | boundary |
| `lead-form-loader` | client | `next/dynamic` wrapper with skeleton. | `/lead`, `lead-wizard-modal` |
| `lead-form` | client | 3-step contact-first form, OTP, success state (`/states/application-enquiry-received.webp`). Dispatches `uv-lead-unlocked`. | `lead-form-loader` |
| `course-enquiry-card` | server | Course-page "Apply now" aside. | `/courses/[slug]` |
| `category-fee-selector` | client | Indian/NRI/Foreign fee radios (owner-required feature). | `/courses/[slug]` |
| `section-pill-nav` | client | In-page section nav (pills on desktop, `<select>` on mobile). | `/courses/[slug]`, `/universities/[slug]` |
| `save-button` | client | Heart toggle for the shortlist (`aria-pressed`), **36px by default (below the 44px target)**, inline styles. | `/`, `/courses/[slug]`, `/universities/[slug]`, `course-explorer` |
| `approval-badge` | server | Label plus approval SVG icon. | `/`, `/universities`, `/universities/[slug]` |
| `course-explorer` | client | Course listing, URL-synced filters and sort, mobile filter drawer, "+ Add to compare" link (`/compare?add=id`), empty state image. | `/courses` |
| `compare-picker` | client | Compare selection (URL `?add=`), picker panel, table. | `/compare` |
| `compare-gate` | client | OTP unlock gate around the comparison table. | `compare-picker` |
| `shortlist-view` | client | Saved list, choose 2–3 to compare, undo removal, empty state. | `/shortlist` |
| `recommender-quiz` | client | Groq recommender, follow-up chat. | `/recommender` |
| `emi-calculator` | client | EMI tool. | `/tools/emi-calculator` |
| `total-cost-planner` | client | Applicant-category cost planner. | `/tools/total-cost` |
| `eligibility-checker` | client | Eligibility tool. | `/tools/eligibility-checker` |
| `guide-explorer`, `blog-explorer`, `specialization-explorer` | client | URL-param filters for their listings. | `/online-degree-guides`, `/blog`, `/specializations` |
| `article-view` | server | Article body, TOC, byline, cover image, newsletter. | `/blog/[slug]`, admin preview |
| `newsletter-signup` | client | Double opt-in sign-up (variants `footer` and `article`). | `site-footer`, `article-view` |
| `legal-page-layout` | server | Text-page shell with related-links rail. | `/privacy`, `/terms`, `/refund-policy`, `/about`, `/how-we-verify`, `/authors/content-team` |
| `page-error-view` | client | Error recovery UI. | `error.tsx`, `global-error.tsx` |

### 3.2 Admin-only components (out of scope)
`admin-login-form`, `admin-logout-button` (unused), `admin-sidebar`, `article-editor`, `article-review-actions`, `catalog-content-editor`, `catalog-create-form`, `catalog-revision-panel`, `catalog-review-queue` (server), `course-edit-form`, `crm-mapping-form`, `crm-sync-config-form`, `eligibility-review-notice` (server), `eligibility-rule-editor`, `fee-review-notice` (server), `manual-crm-push-button`, `prepared-eligibility-panel`, `publish-ready-button`, `redirect-manager-actions`, `setup-form`, `source-import-item-actions`, `stage-category-fees-button`, `university-edit-form`.

There is **no shared program-card component**. Course cards (`.uv-course-list-card`, home `.home-degree-card`, university program cards, shortlist cards) are rendered inline in each page. Neither is there an FAQ accordion component: each page uses native `<details>`/`<summary>`. The design's `UVCard` and `UVFaq` would be new components.

---

## 4. Shortlist, compare and lead state

**Shortlist** (`src/lib/use-shortlist.ts`)
- `localStorage["uv_shortlist"]` holds a JSON array of course ids, deduplicated, with failures swallowed silently.
- Writes dispatch `window` event **`uv-shortlist-changed`**. Every `useShortlist()` instance listens to it and to `storage`, so tabs stay in sync.
- The hook exposes `{ids, ready, count, isSaved, toggle, setSaved}` and fires `trackEvent("shortlist_add"|"shortlist_remove", {course_id})`.
- Consumers: `site-header` (count, `aria-label="Saved courses, n saved"`), `save-button`, `shortlist-view`.
- **This is the only `localStorage` key in the app.**

**Compare selection**
- The selection is **not persisted**. It lives only in the URL: `/compare?add=a,b,c` (repeated `add` params are also accepted). It is capped at 3, unknown ids are dropped, and `history.pushState` is called on add or remove.
- Entry points: `course-explorer` "+ Add to compare" (`/compare?add=<id>`, `data-track-event="compare_course_added"`) and `shortlist-view` "Compare selected (n)".
- No compare tray or global compare store exists. The design's persistent "+ Compare / ✓ In compare" toggle and floating compare tray would need new client state, for example a second localStorage key plus an event that mirrors `uv_shortlist`.
- The picker dispatches `uv-hide-sticky-ctas` and `uv-show-sticky-ctas` while it is open.
- The differences-only toggle is CSS-only: `.comparison-diff-scope:has(.comparison-diff-toggle input:checked) tr[data-same]` (`globals.css` around line 4295). It also works on the server-rendered editorial pages.
- Comparison rows come from `src/lib/comparisons.ts` → `buildComparisonRows`.

**Compare OTP gate** (`compare-gate.tsx`, `api/compare-access/route.ts`, `api/otp/verify/route.ts`)
1. With fewer than 2 programs selected, the gate shows "Select at least two programs above to start comparing."
2. Otherwise it calls `GET /api/compare-access` (no-store). The route reads the httpOnly cookie **`uv_compare_access`** = `<leadId>.<64-hex token>`. It returns `unlocked: true` only when the `lead_capture` row has `email_otp_verified` and `preferences_completed_at`, and `ownsLead(token)` passes (edit-token hash, unexpired).
3. While locked, the gate renders `.comparison-access-card` with the "Apply now" link `/lead?intent=compare-unlock` and `data-open-lead`. The comparison table is not rendered at all; it is client-rendered only after unlock.
4. `POST /api/otp/verify` sets the cookie (`httpOnly`, `secure` in production, `sameSite=lax`, `maxAge` 86400 = 24 h). `lead-form.tsx` then dispatches **`uv-lead-unlocked`**. The gate re-checks on that event and on `storage` and `focus`.

**Other window events:**
- `uv-close-lead`: closes the lead modal.
- `uv-hide-sticky-ctas` and `uv-show-sticky-ctas`.
- `uv-lead-unlocked`.
- `uv-shortlist-changed`.

---

## 5. Security headers, CSP and font loading

**Caddy** (`/Users/arjunh/Documents/crm/crm/deploy/vps/caddy/Caddyfile`, `{$UNNATIVIDYA_DOMAIN}` block) sets this CSP on every response:
```
default-src 'self';
script-src 'self' 'unsafe-inline' https://www.googletagmanager.com;
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
font-src 'self' data:;
connect-src 'self' https://api.zeptomail.in https://www.googletagmanager.com https://www.google-analytics.com https://*.google-analytics.com https://analytics.google.com https://*.analytics.google.com https://stats.g.doubleclick.net;
base-uri 'self'; form-action 'self'; object-src 'none'; frame-ancestors 'none'
```
The same block also sets HSTS (1y, includeSubDomains), `nosniff`, `strict-origin-when-cross-origin`, a Permissions-Policy (camera, mic, geo, payment, usb, interest-cohort all denied), and `X-Robots-Tag: noindex` for `/admin*`, `/api*` and `/lead`. `www.` gets a 301 to the apex.

**`next.config.ts`** sets no CSP. It does set:
- `nosniff`, Referrer-Policy and Permissions-Policy on all paths.
- noindex for `/admin` and `/api`.
- `Cache-Control: public, max-age=31536000, immutable` for `/brand/:path*`.
- **`Cache-Control: no-store` for `/universities/:path*` and `/courses/:path*`.** These patterns also match the static files under `public/universities/`, so logos, campus photos and partner logos are served `no-store`. This was confirmed on the local server: `amity-online-campus.webp` (2.6 MB) is served with `Cache-Control: no-store`. `next/image` requests go through `/_next/image`, which is unaffected, but any raw `<img>` or CSS background from `/universities/` would be re-downloaded on every visit.
- `images.remotePatterns` allows `commons.wikimedia.org`, but nothing in `src` uses it.
- `src/proxy.ts` handles admin authentication only, with no headers.

**What this means for the target fonts**
- **The Google Fonts CDN is blocked.** A `<link href="https://fonts.googleapis.com/css2?...">` fails `style-src 'self' 'unsafe-inline'`, and font files from `fonts.gstatic.com` fail `font-src 'self' data:`. The handoff's `<link>` tags cannot be ported unless the CSP is changed. CONSTRAINTS #11 says to keep it.
- **`next/font/google` works for Plus Jakarta Sans.** It is present in Next 16.3.8's `font-data.json`: weights 200–800 plus `variable`, `wght` axis 200–800, subsets `latin`, `latin-ext`, `vietnamese`, `cyrillic-ext`. Next downloads the files **at build time** and serves them from `/_next/static/media/*` (same origin), which satisfies `font-src 'self'`. The injected `@font-face` CSS is same-origin or inline, which satisfies `style-src`.
- **Material Symbols Rounded is not in `next/font/google`.** It is absent from `node_modules/next/dist/compiled/@next/font/dist/google/font-data.json` (no `Material*` keys at all). Options:
  - (a) Self-host a **subset** woff2. Fetch it once at dev time from the css2 API with `&icon_names=…` (about 60 names in the handoff), commit it under `public/fonts/` or `src/fonts/`, and load it with `next/font/local` or a plain `@font-face`. CSP-safe and small, but the file must be regenerated when an icon is added. Ligature text such as "school" shows as plain text until the font loads, so use `font-display: block` and size-matched boxes, or an `aria-hidden` wrapper.
  - (b) The full variable font is multiple MB, which is not acceptable for page weight.
  - (c) An npm package (for example `material-symbols`) is a new dependency, which owner rule 11 says needs review.
  - (d) Map icons to **lucide-react**, which is already installed and tree-shaken as inline SVG. There is no font request and no CSP impact, but the icons differ visually from the handoff.
- **Docker and next/font/google at build time.** `apps/unnatividya/Dockerfile` runs `npm run unnatividya:build` (`next build --webpack`) in the `node:20-bookworm-slim` builder stage. `deploy/vps/docker-compose.yml` builds `unnatividya-web` with `context: ../..` and no `network:` override, so Docker's default build network gives the build outbound internet. CI (`.github/workflows/ci.yml`, step "Production build") runs on GitHub-hosted runners, which also have internet. So `next/font/google` **should work** in both. The risk is that the build fails whenever `fonts.googleapis.com` is unreachable from the VPS or CI builder. For a deterministic and offline-safe build, prefer **`next/font/local`** with committed woff2 files for Plus Jakarta Sans (variable `wght` file, latin subset) and the Material Symbols subset. That approach needs no network at build time and no CSP change.
- `img-src 'self' data: https:` means absolute `https://unnatividya.com/...` image URLs in the handoff would load. Use relative paths anyway.
- `connect-src` allows only self, ZeptoMail and GA, so a redesign must not add client fetches to other origins.

---

## 6. Assets

`public/` is 8.9 MB.
- `public/approvals/`: `aicte.svg`, `aiu.svg`, `naac.svg`, `ugc.svg`, `wes.svg` (4–8 KB each).
- `public/blog/`: 26 `.webp` covers (81–152 KB each). There is also a stray `.DS_Store`.
- `public/brand/`:
  - `android-chrome-192x192.png`, `android-chrome-512x512.png`, `apple-touch-icon.png`, `favicon-32x32.png`, `favicon.ico`
  - `og-default.jpg` (84 KB), `site.webmanifest`
  - `unnatividya-logo-gradient.svg` (12.6 KB), `unnatividya-logo-violet.svg`, `unnatividya-logo-white.svg`
- `public/certificates/`: 33 `*-certificate-sample.webp` (21–64 KB).
- `public/hero/`: `student-online-degree.webp` (1600×1200, 77 KB), `recommender-preview.webp` (105 KB).
- `public/states/`: `application-enquiry-received.webp`, `no-course-matches.webp`, `shortlist-empty.webp`.
- `public/streams/`: `arts-humanities.webp`, `commerce-finance.webp`, `it-computer-applications.webp`, `management.webp` (1200×800, 106–114 KB).
- `public/universities/`, for each of `manipal-university-jaipur`, `sikkim-manipal-university` and `amity-online`: `-logo.svg`, `-campus.webp`, `-moment-{1,2,3}.webp`, `-partner-logo-{1..6}.svg`.
  - **`amity-online-campus.webp` is 2.6 MB (1642×958)**, against 102 KB for MUJ and 147 KB for SMU. It should be recompressed.
- `public/.DS_Store` and `public/blog/.DS_Store` should be removed.

**Design asset paths: all 25 exist.**
- `/brand/unnatividya-logo-gradient.svg` ✓
- `/brand/unnatividya-logo-white.svg` ✓
- `/hero/student-online-degree.webp` ✓
- `/universities/{manipal-university-jaipur|sikkim-manipal-university|amity-online}-logo.svg` ✓ ✓ ✓
- `/universities/{manipal-university-jaipur|sikkim-manipal-university|amity-online}-campus.webp` ✓ ✓ ✓
- `/universities/manipal-university-jaipur-partner-logo-{1..6}.svg` ✓ ×6
- `/approvals/{ugc,naac,aicte,wes,aiu}.svg` ✓ ×5
- `/streams/{management,it-computer-applications,commerce-finance,arts-humanities}.webp` ✓ ×4
- `/certificates/mba-muj-certificate-sample.webp` ✓

**`src/data/media.ts` mapping**
- `universityMedia[muj|smu|amity]` = `{src: campus webp, alt, logo: -logo.svg, moments: 3× -moment-N.webp, partnerLogos: 6× -partner-logo-N.svg}`. The Amity campus alt text is "Amity University Noida campus".
- `certificateImagePath(courseId)` → `/certificates/${courseId}-certificate-sample.webp`.
- `learningMedia` → `/hero/student-online-degree.webp` (alt "Online learning").
- `recommenderPreviewMedia` → `/hero/recommender-preview.webp`.
- Stream images are mapped separately in `src/app/page.tsx:30` (`streamIllustrations`): Management → management, "IT & Computers" → it-computer-applications, Commerce → commerce-finance, "Arts & Humanities" → arts-humanities.
- Catalog stream values are `Management` (6), `IT & Computers` (7), `Commerce` (7), `Arts & Humanities` (10), 30 courses in total.
- 13 files import `next/image`, and there are no raw `<img>` tags. Only two images use `priority`: the university hero (`universities/[slug]/page.tsx:140`) and the article cover. **The home hero image (`page.tsx:173`, `fill`) is not `priority`, even though it is the likely LCP element.**

---

## 7. Tests coupled to markup, CSS and copy

There are 67 smoke files in `scripts/`. CI (`.github/workflows/ci.yml`, job step "Website smoke suites") runs **every `scripts/*-smoke.cjs` and `*-smoke.js`** with Playwright 1.62.1 against the standalone production build. Any failure fails the job. The `.mts`/`.ts` suites (recommender, total-cost, eligibility-rules, category-fee-batch, catalog-snapshot) are logic-only and unaffected by a redesign.

### 7.1 Public UI suites that a visual redesign will break or need updating (about 25)

| Suite | Coupling (examples) | Risk |
|---|---|---|
| `homepage-discovery-smoke.cjs` | `.uv-home-hero-grid`, `.uv-home-visual-fact` count **2**, `.uv-home-image` height **=190px** at ≤900, `.uv-mobile-action-bar` with exact links "Apply now" and "Browse courses"; `role=search` named "Find a course" with label "Search courses" and button "Search"; hero link "Online MBA" → `/courses?q=MBA`; `.uv-course-list-card`; no horizontal scroll at 320/390/768/1280/1440. | **High.** The design's hero (two selects plus "Show programs →", chips to `?degree=`) contradicts it. |
| `public-navigation-smoke.cjs` | `nav[aria-label="Main navigation"]`; buttons "Resources" and "Tools" with `aria-expanded`; links "Degree guides", "Articles", "EMI calculator", "Find my course"; "Open menu" toggle; `nav "Mobile navigation"`; Escape and focus return; H1 text "Online learning articles"; responsive at 320/390/768/**1100**. | **High.** The design nav is "Explore Degrees …" plus a flat list, with a 1080px breakpoint. |
| `mobile-smoke.js` (static) | Reads `globals.css` text and asserts that it contains `@media (max-width: 900px)`, `.grid.three` plus `grid-template-columns: 1fr`, `.search-panel` plus `flex-direction: column`, `.article-layout`, `.admin-grid`, `.sticky-ctas` with `right: 12px`/`bottom: 12px`/`left: auto`, `.callback-pill` `width: 58px`, no vw/vh font-size outside `clamp()`. | **High.** It breaks on any CSS restructure. |
| `mobile-actions-smoke.cjs` | `.uv-sticky-ctas` hidden at 1280 and visible at 900, `.uv-header-cta`, `.footer-apply`, `.uv-mobile-action-bar`. | High |
| `course-discovery-smoke.cjs` | `.uv-course-list-card`, 18 exact role names, e.g. "Quick comparisons", link "MBA: MUJ vs Amity"; URL params `university`, `level`, `sort=feeDesc`, `maxFee`. | Medium-high |
| `course-detail-ui-smoke.cjs` | `.pill-nav`, `#sec-fees`/`#sec-eligibility` focus and offset below `.pill-nav`, `.decision-guide-card` `transitionDuration` `'0s'` (reduced motion), `.course-payment-plan`, `.curriculum-item`, `.university-outcome-facts`, `option` counts 7 and 6. | High |
| `course-sidebar-smoke.cjs` | `.course-reading-rail`, `.course-rail-action` height ≥44 and no overflow, `#sec-certificate img`. | Medium |
| `comparison-ui-smoke.cjs` | `.comparison-slot` counts 2/3, `.comparison-results li`, `#comparison-picker`, `.comparison-remove`, `.comparison-data-region`, `.comparison-mobile-label`, focus on `#comparison-selection-title`; 14 count assertions. | High |
| `editorial-comparison-smoke.cjs` | `.comparison-data-region`, `.comparison-mobile-label`, `.editorial-program-actions`, `.comparison-slot`; counts 12/3/2. | Medium-high |
| `shortlist-ui-smoke.cjs` | `.shortlist-card` counts 4/3/1, `.shortlist-card .btn` height ≥44, `#shortlist-summary` focus, `.comparison-slot` count 2. | Medium-high |
| `illustrations-dialog-smoke.cjs` | `.stream-card` count **4** with `img`, `.state-illustration`, `.uv-course-list-card [data-open-lead]`, `main.inert` true/false, `.lead-modal-body`. | Medium-high |
| `application-accessibility-smoke.cjs` | `#main-content` focus, `.uv-sticky-ctas` count 0 on `/lead`, `.application-form-panel` above `.application-explanation`, `meta robots` noindex. | Medium |
| `university-discovery-smoke.cjs`, `university-cards-smoke.cjs` | `.university-discovery-card`, `.university-discovery-actions`, `.university-details-link`, `.university-program-card`, `.university-scholarship-cards`, `.guide-fee-card`, `.uv-filter-chips`; exact "Find my course", "Apply now". | Medium |
| `guide-discovery-smoke.cjs`, `guide-reading-smoke.cjs` | `.guide-card`, `.guide-topic-group`, `.guide-fee-card`, `.guide-compare-link`; counts 9/3/1; exact "Fees by university". | Medium |
| `article-discovery-smoke.cjs`, `article-reading-smoke.cjs` | `.article-discovery-card`, `.article-card-byline`, `.article-card-meta`, `.author-row`, `.course-meta`, `.article-contents`, `.article-cover`; exact "Fees & EMI", "Admissions", "All topics". | Medium |
| `specialization-ui-smoke.cjs`, `specialization-detail-smoke.cjs` | `.specialization-card`, `.specialization-group`, `.guide-fee-card`, `.comparison-slot`. | Medium |
| `policy-reading-smoke.cjs` | `.policy-reading-layout`, `.policy-contents`, `.policy-updated`, `.uv-rail`. | Medium |
| `emi-ui-smoke.cjs` | `.emi-result`; exact "No loan needed for these inputs." | Low-medium |
| `course-matcher-smoke.cjs` | `.matcher-course`, `.matcher-source`; 7 exact names. | Medium |
| `page-recovery-smoke.cjs` | `.page-recovery`, `.page-recovery-actions`. | Low |
| `program-details-smoke.cjs`, `catalog-public-smoke.cjs`, `marketing-consent-smoke.cjs` | HTML copy: "Possible charges beyond tuition", "When you choose a specialization", "Official source", fee strings "4,32,123", `#emi-course option`, "Confirm subscription". | Low-medium (copy) |
| `route-smoke.js` | File existence of route files; `robots.ts` contains `disallow: ["/admin", "/api", "/lead"]`. | Low (keep routes) |

### 7.2 Admin suites affected by shared CSS
`lead-inbox-ui-smoke.cjs`, `source-import-list-smoke.cjs` and `admin-shell-smoke.cjs` assert `.btn`, `.text-link`, `.container`, `.cms-toolbar` and similar. `crm-mapping-ui-smoke.cjs` asserts `.form-grid`. Renaming or restyling the shared `.btn`, `.container`, `.form-grid` or `.text-link` classes risks breaking admin tests and layout. **Recommendation:** scope new public styles under a new prefix, or keep the shared class names.

### 7.3 Estimate
About 25 public suites assert class names, exact copy, element counts or pixel sizes. Expect to touch most of them. The highest-churn suites are `homepage-discovery`, `public-navigation`, `mobile-smoke.js`, `mobile-actions`, `comparison-ui`, `course-detail-ui` and `shortlist-ui`. Role- and label-based assertions survive if the accessible names stay the same. Class-based assertions survive only if class names are kept as hooks.

---

## 8. Performance baseline

- **Client components:** 25 public client components in `src/components` (plus `error.tsx`, `global-error.tsx` and the `use-shortlist` hook). `SiteHeader`, `StickyCtas`, `Analytics`, `HideOnAdmin` and, through the boundary, `CatalogProvider` and `LeadWizardModal` load on every page. Only `LeadForm` is code-split (`next/dynamic`).
- **The full catalog is serialized to the client on every public page.** `PublishedCatalogBoundary` passes `loaded.snapshot` (`CatalogSnapshot`) as a prop to the client `CatalogProvider` (`src/components/published-catalog-boundary.tsx:10`). The snapshot holds all universities, all 30 courses, `courseEnrichmentById` (overview, highlights, fee plans, curriculum, FAQs, category fees, eligibility rules, recognition, intakes, program details) and `universityEnrichmentById`. Measured RSC flight payload inlined in the HTML:
  - `/privacy`: 136 KB, almost entirely snapshot (HTML 157 KB, 20.7 KB gzip).
  - `/`: 189 KB (HTML 263 KB, 32 KB gzip).
  - `/courses`: 189 KB (HTML 332 KB, 28 KB gzip).
  - `/courses/mba-muj`: 173 KB.
  - `/compare`: 182 KB.
  - `/universities/manipal-university-jaipur`: 169 KB.
  - The string `courseEnrichmentById` appears in every one of them.
- `/courses`, `/compare`, `/recommender` and `/shortlist` **also** pass course arrays as props to their client explorers, so the catalog data is sent twice.
- The snapshot is needed client-side only by `lead-form` (course options), `lead-wizard-modal` (labels), the tools and `shortlist-view`. A slimmer client projection would cut about 100 KB+ of uncompressed HTML per page. This is optional and outside visual scope, but it is the biggest weight item.
- **JS** (home, modern browsers): about 147 KB gzip across 11 of 14 chunks matched in the local build. Polyfills (39.5 KB gzip) are `noModule`. Framework chunks are about 190 KB raw, and the largest shared chunk is 241 KB raw.
- **CSS:** one 114 KB raw / 20 KB gzip file with about 25% admin rules, render-blocking on all pages.
- **Images:** all go through `next/image` (AVIF/WebP). The home hero is not `priority`. Amity campus is 2.6 MB at source, and `/universities/*` static files are served `no-store` (§5).
- **Fonts:** none are loaded today. Adding Plus Jakarta Sans (about 4 weights, or one variable file) and an icon font adds new bytes. Preload only the latin variable file and subset the icons.
- All public pages are dynamic (DB-backed). Only `/_not-found`, `robots.txt`, `sitemap-index.xml` and three guide sitemaps are prerendered.

---

## 9. Things the redesign must preserve

- **Metadata helpers** (`src/lib/page-metadata.ts`):
  - `withSocial(metadata)` derives OG `url`, `title` and `description` from each page's own `alternates.canonical`. The layout deliberately sets no canonical. It is used in 26 `src/app` files.
  - `fitTitle(...candidates)` enforces 60 characters including the " | Unnati Vidya" suffix. It is used in 3 files.
  - `lakh()` and `listNames()` are also exported.
  - The layout sets the title template `%s | Unnati Vidya`, icons from `/brand/*` and the OG default `/brand/og-default.jpg`.
- **JSON-LD** (`JsonLd` component, `<` escaped):
  - Layout: Organization (email admin@unnatividya.com, Noida address, no phone) and WebSite with SearchAction → `/courses?q=`.
  - Pages: BreadcrumbList (14), FAQPage (14), Course (3), CollegeOrUniversity (3), ItemList (3), Article, OfferCatalog/Offer, ImageObject.
  - There is no AggregateRating (owner rule 5). It must not be added.
- **Analytics:**
  - `trackEvent()` events: `compare_course_added`, `compare_selection_change`, `compare_view`, `course_filter_applied`, `course_search`, `emi_calculation`, `emi_calculator_used`, `lead_contact_saved`, `lead_cta_click`, `lead_preferences_saved`, `newsletter_signup_requested`, `otp_sent`, `otp_verified`, `recommender_completed`, `recommender_step_answered`, `wizard_open`, `shortlist_add`, `shortlist_remove`.
  - Declarative `data-track-event` / `data-track-params` attributes: `course_card_click` and `university_card_click` (home), `course_search` (home search), `compare_course_added` (explorer), `source_link_click` (guides), `whatsapp_click` (disabled).
  - New cards must carry the same attributes.
- **`data-open-lead` hook:**
  - 26 occurrences across 25 files. Any `a[data-open-lead]` with `href="/lead?course=&university=&intent=&goal=&category=row-N"` is intercepted in the capture phase by `LeadWizardModal`. The intent label map lives in `lead-wizard-modal.tsx`.
  - Every "Apply now" must stay a real `<a href="/lead?...">` with `rel="nofollow"` and `data-open-lead`, so it works without JS and outside the boundary.
  - Generic label is exactly "Apply now" (CONSTRAINTS #1).
- **Skip link and main landmark:** `<a href="#main-content" className="skip-content-link">` and `<main id="main-content" tabIndex={-1}>` (`layout.tsx`). Tests check focus on `#main-content`.
- **ARIA and keyboard patterns** (role usage: status 38, alert 13, search 10, region 2, dialog 1, log 1, group 1; aria-label 105, aria-labelledby 46, aria-current 10, aria-expanded 5, aria-pressed 4, aria-busy 13, aria-live 7):
  - Header: disclosure buttons with `aria-expanded`/`aria-controls`, Escape closes and returns focus, outside-pointer closes, `aria-current="page"`, mobile menu "Open menu"/"Close menu" toggle, reset on route change (`key={pathname}`).
  - Lead dialog: `role="dialog" aria-modal`, siblings `inert`, Tab trap, Escape, focus return to the opener, body scroll lock.
  - Compare and shortlist: `role="status"` live counts, focus moved to headings after add or remove, Escape closes the picker, undo removal.
  - Save button: `aria-pressed`, label "Save to shortlist"/"Remove from shortlist".
  - Comparison table: `<caption>`, `scope` headers, scrollable `role="region" tabIndex=0`, `aria-hidden` mobile labels, `data-same` rows.
  - Search forms: `role="search" aria-label="Find a course"`, GET to `/courses?q=`, which works without JS.
  - Native `<details>`/`<summary>` FAQs, native radio fee selector, `:focus-visible` outlines (3px primary), 44px minimum targets in many components (but `SaveButton` defaults to 36px).
- **URL contracts:**
  - `/courses` params are `q`, `level`, `stream` (full stream name), `university` (id or shortName), `maxFee` and `sort`. **The handoff's `?lvl=`, `?stream=<slug>` and `?degree=` do not exist.** Map the design's hero and chips onto the current params.
  - `/compare?add=a,b,c`.
  - Listing filters on `/blog` (`category`, `q`, `sort`), `/online-degree-guides` (`topic`, `degree`, `q`) and `/specializations` (`stream`, `degree`, `q`).
  - SEO paths must not change (CONSTRAINTS #10).
- **Section ids** on course and university pages (§1.1) are used by `SectionPillNav`, deep links (e.g. `/courses/mba-muj#sec-fees` in `wave2-publishing-smoke`) and tests.
- **Print CSS** for `/tools/total-cost` (`globals.css:4658`).
- **Robots and SEO:** `/lead` noindex, `robots.ts` disallow list, and the sitemaps are unaffected by styling.

### 9.1 Handoff vs. constraints and current behaviour (spotted while inventorying)
- The handoff's mobile menu has a "Call 1800-120-4050" link, which is **forbidden** (CONSTRAINTS #2).
- The handoff home floats a "Lowest MBA in our catalog" card and an "Average package ₹7.2 LPA / MUJ online learners" card. These conflict with rules 4 and 8: placement and package figures are university-wide and unverified and must be labelled as such.
- The handoff `UVCard` shows "UGC-entitled" and a "★ rating" on each card. Ratings may stay but must not drive sorting (rule 5).
- The handoff header label "Shortlist (n)" differs from the current "Saved courses (n)", which tests depend on.
- The handoff footer links point to `Legal?tab=…`. The current site uses separate `/privacy`, `/terms` and `/refund-policy` routes, which must stay.
- The handoff requires the Google Fonts CDN (blocked by CSP; see §5).
