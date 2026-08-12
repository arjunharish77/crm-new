# UnnatiVidya — Design Handoff for Claude Code

**Source repo:** `arjunharish77/crm-new`, branch `main`, app at `apps/unnatividya`
**Design package:** `designs/` (18 clickable HTML screens) + this document set
**Design intent:** Visual refresh of the existing Next.js app. Same design tokens, same routes, same data. New section layouts, richer use of real photography and logos, better density and rhythm, plus several missing pages and features.

Read this file first, then `GAP_ANALYSIS.md` (what is missing from the current app), then `PAGE_SPECS.md` (screen-by-screen build instructions).

---

## 1. How to use the design files

`designs/*.dc.html` are self-contained HTML files. Open any of them directly in a browser — they are fully interactive (filters, quiz, compare picker, lead wizard, accordions all work). `designs/Index.dc.html` links to all 18 screens.

Each file has three parts:
1. `<helmet>` — fonts, body resets, and (in `SiteHeader.dc.html`) the responsive media queries.
2. The markup between `<x-dc>` and `</x-dc>` — **all styling is inline**. Treat every inline value (hex, px, radius, weight) as the spec.
3. A `<script data-dc-script>` class at the bottom — the page logic. `renderVals()` returns everything the markup binds to. Read it to understand filtering, scoring, gating and state.

`{{ name }}` are template holes; `<sc-for list="{{ x }}" as="item">` is a loop. Translate these to React `.map()` and JSX expressions.

**Do not port these files as-is.** Rebuild each screen as a React/Next component in the existing app, reusing the app's own components where they already exist (`site-header.tsx`, `course-card.tsx`, `lead-form.tsx`, etc.) and updating them to the new layout.

### File → route map

| Design file | Existing route | Existing source | Status |
|---|---|---|---|
| `Home.dc.html` | `/` | `src/app/page.tsx` | Redesign |
| `Courses.dc.html` | `/courses` | `src/app/courses/page.tsx`, `components/course-explorer.tsx` | Redesign |
| `Course.dc.html` | `/courses/[slug]` | `src/app/courses/[slug]/page.tsx` | Redesign |
| `Universities.dc.html` | `/universities` | `src/app/universities/page.tsx` | Redesign |
| `University.dc.html` | `/universities/[slug]` | `src/app/universities/[slug]/page.tsx` | Redesign |
| `Compare.dc.html` | `/compare`, `/compare/[course]` | `src/app/compare/page.tsx`, `components/compare-gate.tsx` | Redesign + **new selector UX** |
| `Recommender.dc.html` | `/recommender` | `components/recommender-quiz.tsx` | Redesign |
| `Lead.dc.html` | `/lead` | `src/app/lead/page.tsx`, `components/lead-form.tsx` | Redesign |
| `EmiCalculator.dc.html` | `/tools/emi-calculator` | `components/emi-calculator.tsx` | **Route missing — see gap #1** |
| `Shortlist.dc.html` | `/shortlist` | `src/app/shortlist/page.tsx`, `components/shortlist-view.tsx` | Redesign |
| `Specializations.dc.html` | `/specializations` | `src/app/specializations/page.tsx` | Redesign |
| `Blog.dc.html` | `/blog` | `src/app/blog/page.tsx`, `components/blog-explorer.tsx` | Redesign |
| `Article.dc.html` | `/blog/[slug]` | `src/app/blog/[slug]/page.tsx` | Redesign |
| `Guides.dc.html` | `/online-degree-guides` | `src/app/online-degree-guides/page.tsx` | Redesign |
| `HowWeVerify.dc.html` | `/how-we-verify` | `src/app/how-we-verify/page.tsx` | Redesign |
| `Legal.dc.html` | `/about`, `/privacy`, `/terms`, `/refund-policy` | four separate route files | Redesign — see note below |
| `Admin.dc.html` | `/admin` | `src/app/admin/page.tsx` | Redesign |
| `Mobile.dc.html` | — | — | Responsive spec, 8 screens at 390px |
| `SiteHeader.dc.html` / `SiteFooter.dc.html` / `LeadWizard.dc.html` | shared chrome | `components/site-header.tsx`, `site-footer.tsx`, `lead-wizard-modal.tsx` | Redesign |

**Legal note:** the design shows one tabbed page for readability. Keep the four separate routes for SEO (`/about`, `/privacy`, `/terms`, `/refund-policy`); apply the design's typography and sidebar to each, and render the tab strip as links between them rather than client-side tabs.

---

## 2. Design tokens

These match `src/styles/globals.css` — do not introduce new values.

| Token | Value | Use |
|---|---|---|
| `--uv-primary` | `#544CC8` | CTAs, active nav, links, accents |
| `--uv-primary-hover` | `#453DB8` | Button/link hover |
| `--uv-primary-soft` | `#F4F3FC` | Tinted bands, highlighted table rows, logo chips |
| `--uv-gradient` | `linear-gradient(135deg,#4F46E5 0%,#7C3AED 100%)` | AI features only (recommender CTA, best-match badge, AI dot) |
| `--uv-ink` | `#363634` | Headings |
| `--uv-body` | `#555555` | Body text |
| `--uv-muted` | `#707070` | Secondary text |
| `--uv-faint` | `#AAAAAA` | Meta, timestamps, disabled |
| `--uv-border` | `#CFDAE6` | Card borders |
| `--uv-hairline` | `#EAEAEA` | Row dividers, section rules |
| `--uv-chip` | `#D8D7D6` | Chip outlines |
| `--uv-page` | `#F7F8F9` | Listing page background |
| `--uv-dark` | `#263238` | Hero bands, footer, announcement bar |
| `--uv-dark-text` | `#B8C4CA` | Text on dark |
| `--uv-success` | `#2E7D32` | Verified badges, best-value cells (bg `rgba(46,125,50,0.10)`) |
| `--uv-rating` | `#FDB515` | Stars, announcement link, badges on dark |
| `--uv-whatsapp` | `#25D366` | WhatsApp FAB |
| Level UG | `#4FA8FF` on `rgba(79,168,255,0.12)` | UG badge |
| Level PG | `#4D00FF` on `rgba(77,0,255,0.10)` | PG badge |
| Radius | card `8px`, control `4px`, pill `999px`, hero image `12px` | |
| Shadow | card `0 1px 3px rgba(0,0,0,0.06)`, hover `0 4px 8px rgba(36,36,36,0.12)`, modal `0 8px 24px rgba(0,0,0,0.16)`, header `0 3px 6px rgba(194,194,194,0.16)` | |
| Max width | `1200px`, page padding `24px` | |

**Typography — DM Sans** (400/500/600/700), already loaded.

| Role | Size / weight | Extra |
|---|---|---|
| Hero H1 | 46px / 700 | `line-height:1.08`, `letter-spacing:-0.5px`, `text-wrap:pretty` |
| Page H1 | 32px / 700 | `letter-spacing:-0.4px` |
| Detail hero H1 | 36px / 700 | on dark |
| Section H2 | 28px / 700 (marketing), 24px / 700 (detail sections) | `letter-spacing:-0.3px` |
| Card title | 17–19px / 700 | |
| Body | 15px / 400, `line-height:1.6–1.7` | |
| Meta | 13px / 400 | |
| Micro / label | 11–12px / 700, `letter-spacing:0.4–0.8px`, uppercase | |
| Stat number | 25–27px / 700, `letter-spacing:-0.5px` | |

**Buttons** — primary: `#544CC8` fill, white 700, radius 4, height 42–48. Secondary: white fill, `1.5px solid #555`, `#555` text, hovers to `#544CC8`. Ghost link: 13px/700 `#544CC8`.

---

## 3. Shared chrome

### Header (`SiteHeader.dc.html`)
- Sticky, white, 68px min-height, header shadow. Max-width 1200, padding 0 24.
- Gradient logo (`/brand/unnatividya-logo-gradient.svg`) at 24px height.
- Nav: Courses, Universities, Compare, **AI Recommender** (gold `#FDB515` 7px dot prefix), Blog, **Guides**. Active item: `#544CC8` + 2px bottom border.
  - **Change vs current app:** "Guides" (`/online-degree-guides`) is added to primary nav.
- Shortlist: outlined pill with count, not the current heart icon.
- Primary CTA "Talk to an expert" → opens the lead wizard.
- **Responsive:** below **1100px** (raise from the app's current 900px — the nav is now 6 items) hide nav + CTA + shortlist pill with `display:none !important`, show the hamburger, and render the slide-down `.uv-header-mobile-panel`. The `!important` matters: inline display styles otherwise win.
- Announcement bar below header: dark `#263238`, 12px, centred, gold link.

### Footer (`SiteFooter.dc.html`)
- Dark `#263238`, 4-column grid `1.5fr 1fr 1fr 1fr`, collapses to 2 columns ≤1100px and 1 column ≤640px.
- Column 1: white logo, one-line positioning statement, **three real approval badges on white chips** (UGC, NAAC, AICTE).
- Explore / Top courses / Company columns as in the design (Company now includes "My shortlist").
- Legal bar: copyright + Privacy · Terms · Refund policy.

### Sticky CTAs
Fixed bottom-right, `z-index:150`: "Request a callback" outlined pill (opens wizard) above a 52px WhatsApp circle. Present on every public page.

### Lead wizard (`LeadWizard.dc.html`, and `Lead.dc.html` for the full-page version)
Four steps, progress dots:
1. Interest picker — 6 course chips, one preselected.
2. Name / email / city. Continue disabled (grey `#D8D7D6`) until name **and** email are filled.
3. Phone `+91` prefix + 10-digit input (strip non-digits, cap at 10) → "Send OTP" → 4-digit OTP field appears with a green confirmation strip → "Verify & submit". Consent line beneath.
4. Success: green tick, "You're all set, {firstName}", note that compare is unlocked, plus links onward.

On success set the unlock flag and POST the lead. Every "Enquire" / "Talk to an expert" / "Request a callback" opens this same wizard **with page context passed in** (course name + university, or university name, or page topic) — the context string is shown in the wizard title and must be recorded on the lead.

---

## 4. Data

`designs/uv-data.js` mirrors `src/data/catalog.ts` exactly as of this handoff: 3 universities, 30 courses, `roleSalary` bands, `curriculumByStream`, `approvalIcon()`, `fmtFee()`, and a 6-post `blogPosts` sample. **Use the app's real `catalog.ts` / `blog.ts` / `guide-content.ts` as the source of truth** — `uv-data.js` exists only so the design files run standalone. Slugs and ids in the designs match the repo (`mba-muj`, `online-mba-manipal-university-jaipur`, `muj` / `smu` / `amity`).

---

## 5. Assets

All imagery in `designs/assets/` came from `apps/unnatividya/public/`. Mapping back:

| Design asset | Repo path |
|---|---|
| `logo-gradient.svg`, `logo-white.svg`, `logo-violet.svg` | `public/brand/unnatividya-logo-*.svg` |
| `ap-ugc/naac/aicte/wes/aiu.svg` | `public/approvals/*.svg` |
| `muj-logo.svg`, `smu-logo.svg`, `amity-logo.svg` | `public/universities/*-logo.svg` |
| `muj-campus.webp`, `smu-campus.webp`, `amity-campus.webp` | `public/universities/*-campus.webp` (amity uses `amity-online-moment-1.webp`) |
| `moment-1/2/3.webp` | `public/universities/manipal-university-jaipur-moment-*.webp` |
| `hero-student.webp`, `hero-recommender.webp` | `public/hero/*.webp` |
| `certificate-mba-muj.webp` | `public/certificates/mba-muj-certificate-sample.webp` |
| `blog-*.webp` | `public/blog/*.webp` |
| `partner-1..6.svg` | `public/universities/manipal-university-jaipur-partner-logo-*.svg` |

**Important asset bug — fix in the repo (see gap #2):** every logo SVG in `public/approvals/` and `public/universities/` is a square/oversized canvas with the artwork letterboxed inside it. Sized by height, a wordmark renders at ~20% of its box and looks broken. The design assets are already fixed — each `viewBox` was cropped to the inner `<image>` bounds, keeping the same base64 payload. Apply the identical crop to the repo copies:

| File | Current viewBox | Corrected viewBox |
|---|---|---|
| `approvals/ugc.svg` | `0 0 48 48` | `4 19.62 40 8.75` |
| `approvals/aicte.svg` | `0 0 48 48` | `4 20.04 40 7.92` |
| `approvals/naac.svg` | `0 0 48 48` | `4 7.80 40 32.41` |
| `approvals/wes.svg` | `0 0 80 48` | `10.47 4 59.07 40` |
| `approvals/aiu.svg` | `0 0 80 48` | `19.79 4 40.42 40` |
| `universities/manipal-university-jaipur-logo.svg` | `0 0 64 64` | `4 24.07 56 15.87` |
| `universities/sikkim-manipal-university-logo.svg` | `0 0 64 64` | `4 25.62 56 12.76` |
| `universities/amity-online-logo.svg` | `0 0 64 64` | `8.58 4 46.84 56` |
| all 18 `*-partner-logo-*.svg` | varies | crop to the inner `<image>` x/y/width/height |

Rule of thumb: read the inner `<image>`'s `x y width height` and use exactly those four numbers as the `viewBox`. Then `height:NNpx; width:auto` renders correctly everywhere.

---

## 6. Global interaction rules

- **Card hover:** `box-shadow:0 4px 8px rgba(36,36,36,0.12)`; interactive cards also shift border to `#544CC8`.
- **Accordions** (curriculum, FAQ): single-open per group, `+` / `−` marker, open header background `#F5F5F5`.
- **Section pill nav** (course + university detail): sticky under the header at `top:68px`, horizontally scrollable, active pill filled `#544CC8` with white text, others white with `#CFDAE6` border. Every target section needs `scroll-margin-top:140px`.
- **Compare gate:** table renders blurred (`filter:blur(5px); pointer-events:none`) under a centred unlock card until the lead is verified; then it unblurs and a green "access unlocked" note appears. Persist per user session server-side (the prototype uses `localStorage['uv_lead_unlocked']`).
- **Filters** are instant and client-side. Keep them URL-syncable (`?level=PG&stream=...&q=...`) so results are shareable and indexable.
- **Empty states** are designed, not blank: every filtered list has a bordered-dashed panel with a heading, a suggestion, and a "Clear all filters" button.
- **Touch targets** ≥44px on mobile; every interactive element needs a visible focus ring.

---

## 7. Build order

1. Tokens + `SiteHeader` (with the 1100px collapse) + `SiteFooter` + sticky CTAs.
2. `LeadWizard` as one shared modal, wired to the real OTP + CRM endpoints, with context passing.
3. Home → Courses → Course detail.
4. Universities → University detail.
5. Compare (new slot-based selector + gate) → Recommender.
6. Blog → Article → Guides → Specializations.
7. Shortlist → **EMI calculator route (new)** → How we verify → Legal pages.
8. Admin console.
9. Responsive pass against `Mobile.dc.html`.
10. Work through `GAP_ANALYSIS.md`.

## 8. Definition of done

- All 18 screens match the designs at 1280px and at 390px.
- No horizontal overflow at 360, 390, 768, 924, 1100, 1280, 1440.
- Header collapses to the hamburger below 1100px; the panel opens and closes.
- Filters, sort, accordions, pill navs, compare gate, compare picker, quiz and wizard all work.
- Every logo renders at its true aspect ratio (no letterboxed squares).
- Lead submissions reach the CRM with full page context; OTP verification unlocks compare for the session.
- Lighthouse ≥90 SEO and ≥90 accessibility on all content pages.
