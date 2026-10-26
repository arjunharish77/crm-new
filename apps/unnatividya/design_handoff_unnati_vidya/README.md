# Handoff: Unnati Vidya — Website Redesign (Navy hero, no logo marquee)

## Overview
A full redesign of **unnatividya.com**, an unbiased marketplace for UGC-entitled online degrees from three universities: Manipal University Jaipur (MUJ), Sikkim Manipal University (SMU) and Amity University Online. Users browse 30 programs, compare up to three side by side, take a 4-step "Find my fit" quiz, estimate EMI, save a shortlist and submit an application enquiry.

This bundle covers **18 page types** plus 4 shared components. The Home page uses the approved **dark navy hero** and has **no logo marquee**.

## About the Design Files
The files here are **design references built in HTML**. They are prototypes that show the intended look and behaviour; they are not production code to ship. Your job is to **recreate them in the target codebase** (Next.js/React, Vue, etc.) using its own patterns, routing, component library and data layer. If no codebase exists yet, Next.js (App Router) + TypeScript + Tailwind or CSS Modules is a good fit: most pages are content-heavy and SEO-relevant, so use SSR/SSG for them.

Each `*.dc.html` file opens directly in a browser (it loads `support.js`, which is the prototype runtime — **ignore it, don't port it**). Every page has three parts:
- **Template markup**: HTML with inline styles and `{{ value }}` holes. `<sc-for list>` = loop, `<sc-if value>` = conditional, `<dc-import name="X">` = a shared component.
- **Logic class** (`class Component extends DCLogic`): `renderVals()` computes everything the template shows. It reads like a React class component.
- **Shared data**: `uv-data.js` exposes `window.UV`, which holds the catalog, helpers and a localStorage store.

Inline styles are a prototyping constraint. In production, move them into your styling system with the tokens below.

## Fidelity
**High-fidelity.** Colours, type, spacing, radii, shadows, copy and interactions are final. Recreate them pixel-accurately. Catalog numbers (fees, EMI, placement %) come from `uv-data.js` and should come from your CMS or API in production.

---

## Design Tokens

### Colour
| Token | Hex | Use |
|---|---|---|
| `primary` | `#5B4CF0` | Buttons, links, active states, icons, step numbers |
| `primary-hover` | `#4A3BDB` | Primary button and link hover |
| `primary-50` | `#F4F2FF` | Hover background on nav/links, CTA panels |
| `primary-100` | `#F1EEFF` | Icon tiles (round/square behind Material icons) |
| `primary-150` | `#ECE9FE` | Level badge bg (UG/PG), active chip bg, image placeholder bg |
| `primary-200` | `#D6D0FA` | Secondary (outline) button border, dashed empty-state border |
| `primary-250` | `#CFC9FA` | Card hover border |
| `primary-light` | `#A99EFF` | Accent word "you." in the navy hero |
| `lavender-text` | `#CFC9FF` | Eyebrow pill text and "How we verify" link on navy |
| `navy` | `#16133F` | Body text colour, **navy hero background**, dark CTA panels, comparison tray |
| `navy-footer` | `#1A1646` | Footer background |
| `ink-2` | `#2B2950` | Secondary strong text, nav link default |
| `ink-3` | `#4A4867` | Paragraph/body copy |
| `ink-4` | `#6F6D8C` | Meta text, labels, captions |
| `ink-5` | `#8E8CA8` | Tertiary (review counts, disclaimers) |
| `on-navy-1` | `#CFCCEE` | Hero paragraph on navy |
| `on-navy-2` | `#A9A6D6` | "Popular:" label and approvals label on navy |
| `on-navy-3` | `#C3C0E6` | Footer link colour |
| `on-navy-4` | `#B9B6E8` / `#9C98CC` | Secondary/tertiary text inside dark panels |
| `border` | `#E8E6F3` | Default card border |
| `border-strong` | `#E4E1F3` | Inputs, selects, search box |
| `border-soft` | `#F0EEF8` / `#F3F2F9` | Row dividers inside cards/tables |
| `surface-alt` | `#F8F7FD` | Stat strips inside cards, table header rows |
| `hero-bg` | `linear-gradient(180deg,#F7F5FF,#FBFAFF)` + radial `#E6E1FF` glow | Page heroes on inner pages |
| `success` | `#12925A` | Verified icons, "Save 2%" tag bg, "Lowest/Best" tag bg |
| `success-text` | `#12784B` | Best-value text, "UGC-entitled" pill text |
| `success-bg` | `#E7F6EE` / `#F3FBF6` | Success pills / best-value table cells |
| `warning-text` / `warning-bg` | `#A35A0B` / `#FFF4E5` | "CONFIRM WITH COUNSELLOR" label, over-budget pill |
| `star` | `#F0A30A` | Star ratings |
| `error` | `#B42318` | Form validation message |

### Typography
- **Family:** `Plus Jakarta Sans` (Google Fonts, weights 400/500/600/700/800), fallback `system-ui, sans-serif`. Use `-webkit-font-smoothing: antialiased`.
- **Icons:** `Material Symbols Rounded` (Google Fonts variable icon font). Icon names are listed inline in each file (e.g. `school`, `verified`, `compare_arrows`).

| Role | Size | Weight | Letter-spacing | Line-height |
|---|---|---|---|---|
| Home H1 | `clamp(40px, 5.2vw, 64px)` | 800 | -0.035em | 1.04 |
| Inner-page H1 | `clamp(30px, 4.2vw, 46px)` (detail pages up to 52px) | 800 | -0.035 to -0.04em | 1.04–1.1 |
| Section H2 | `clamp(26px, 3.2vw, 32px)` (inner pages `clamp(22px,3vw,28px)`) | 800 | -0.025em | 1.1–1.15 |
| Card H2 (in-card) | 20–22px | 800 | -0.02em | — |
| Card title | 17px | 800 | -0.01em | — |
| Body large | 16–18px | 400 | — | 1.6 |
| Body | 14–15px | 400–600 | — | 1.55–1.7 |
| Label / meta | 12–13px | 600–700 | — | — |
| Eyebrow | 12px, UPPERCASE | 700 | 0.06–0.08em | — |
| Stat number | 20–28px | 800 | -0.02em | — |

Use `text-wrap: balance` on H1s and `text-wrap: pretty` on hero paragraphs.

### Spacing
- Page container: `max-width: 1240px; margin: 0 auto; padding-inline: clamp(16px, 3vw, 32px)`. Text-first pages (Article, About, How we verify, Legal) use 880–980px.
- Gap between Home sections: `72px` (`padding-top`). Inner pages: 32–56px.
- Card padding: 20–24px. Inner tiles: 14–18px.
- Grid gaps: 12 / 14 / 16 / 20px.
- Common gaps: 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40, 48.

### Radius
`6px` tags/badges · `8–10px` small buttons, chips in cards · `10–12px` buttons, inputs · `14px` tiles, small cards · `16px` cards, search box · `18px` large cards · `20–24px` feature panels, hero image · `99px` pills · `50%` avatars and icon circles.

### Shadow
- Card hover: `0 18px 40px -24px rgba(60,45,170,0.4)`
- Search box (light bg): `0 12px 32px -12px rgba(43,35,140,0.18)`
- Search box (navy hero): `0 24px 50px -20px rgba(0,0,0,0.5)`
- Floating hero stat cards (navy): `0 18px 40px -16px rgba(0,0,0,0.5)`
- Hero image (navy): `0 40px 80px -40px rgba(0,0,0,0.7)`
- Sticky course sidebar: `0 20px 44px -28px rgba(60,45,170,0.45)`
- Compare tray: `0 24px 50px -18px rgba(22,19,63,0.7)`

### Breakpoints
Most layouts reflow without breakpoints, using `grid-template-columns: repeat(auto-fit|auto-fill, minmax(min(100%, Npx), 1fr))` and `flex-wrap`. Explicit JS breakpoints:
- **Header:** desktop nav at `≥1080px`, hamburger menu below.
- **Courses / Course / Compare / Recommender:** "mobile" layout below `860px`.

---

## Shared Components

### 1. Header (`UVHeader.dc.html`)
- Sticky (`position: sticky; top: 0; z-index: 40`), height **68px**, background `rgba(255,255,255,0.96)` with `backdrop-filter: blur(12px)`, bottom border `1px #ECEAF6`.
- **Left:** logo `https://unnatividya.com/brand/unnatividya-logo-gradient.svg`, 32px tall. Links to Home.
- **Desktop nav (≥1080px):** Explore Degrees → Courses, Universities, Compare, Specializations, Guides, Tools → EMI calculator. Links are 14px/600, padding 8×12, radius 8, `white-space: nowrap`. Default colour `#2B2950`. Active/hover: bg `#F4F2FF`, colour `#5B4CF0`. The page passes an `active` prop (`courses|unis|compare|specs|guides|tools`).
- **Right (desktop):** search icon button (40×40) → Courses; "Shortlist (n)" with bookmark icon → Shortlist (n = saved count from the store, live-updating); **primary "Apply now"** button (padding 10×18, radius 10, 14px/700) → Apply.
- **Mobile (<1080px):** bookmark icon with a count badge (17px circle, `#5B4CF0`) and a 44×44 menu button (`menu`/`close` icon). The open menu is a full-width panel: each nav item has an icon in `#5B4CF0` (16px/700, padding 14×12), plus "Find my fit", a full-width **Apply now** button and a "Call 1800-120-4050" link.

### 2. Footer (`UVFooter.dc.html`)
- Background `#1A1646`, text `#C3C0E6`, `margin-top: 80px`.
- First row: white logo (`/brand/unnatividya-logo-white.svg`, 32px), the line "India's unbiased marketplace for UGC-entitled online degrees. Compare, get counselled, enrol — all free.", and UGC/NAAC/AICTE badges on white 6px-radius tiles.
- 4 link columns (Explore, Popular degrees, Resources, Company) in an `auto-fit minmax(160px,1fr)` grid. Column headings are white/700.
- Bottom bar: © 2026 Unnati Vidya, plus Privacy / Terms / Refund policy links to `Legal?tab=…`.

### 3. Program card (`UVCard.dc.html`), prop `courseId`
- White, border `1px #E8E6F3`, radius 16, padding 20, column with gap 14, `height: 100%`. Hover: border `#CFC9FA` + card-hover shadow; transition `box-shadow .2s, border-color .2s`.
- **Row 1:** 46×46 icon tile (radius 12, `#F1EEFF`/`#5B4CF0`, stream icon). Title "Online MBA" (17px/800, links to Course) with the university logo (16px) + name (13px `#6F6D8C`) below. A 36×36 bookmark toggle on the right (`bookmark` / `bookmark_added`; saved state bg `#ECE9FE`).
- **Row 2:** level badge (UG/PG, 11px/800, bg `#ECE9FE`), "UGC-entitled" pill (bg `#E7F6EE`, text `#12784B`), ★ rating + (reviews).
- **Row 3:** 3-column stat block (bg `#F8F7FD`, radius 12, padding 12), pinned to the bottom with `margin-top: auto`. Columns: Duration "24 mo" · Total fee "₹1,80,000" · EMI from "₹7,500/mo".
- **Row 4:** "N specialisations" link.
- **Row 5:** two equal buttons: **View details** (primary) and **+ Compare** (outline). The second toggles to "✓ In compare" with bg `#ECE9FE`.
- **Loading skeleton:** while data is unavailable, show the same shape (min-height 290) with shimmer blocks. Shimmer = `linear-gradient(90deg,#F1EFF8 25%,#F8F7FC 50%,#F1EFF8 75%)`, `background-size: 200% 100%`, keyframe `background-position 100% → -100%` over 1.4s linear infinite. Set `aria-busy="true"`.

### 4. FAQ accordion (`UVFaq.dc.html`), props `items: [q, a][]`, `title`, `subtitle`
- Header row: H2 + subtitle on the left, "View all FAQs →" on the right.
- Items are split into **two columns** (`flex: 1 1 380px`). Each item is a card (border `#E8E6F3`, radius 12; open state border `#CFC9FA`) with a 52px-min row: `help` icon, question (15px/600), and `add`/`remove` icon. The answer is 14px `#4A4867`, padded `0 16px 16px 48px`. Only one item is open at a time.

---

## Screens

### 01 · Home (`Home.dc.html`): navy hero, no marquee
Section order: **Header → Navy hero (with approvals strip) → Popular online degrees → Browse by stream → Course matching (dark panel) → Universities we cover → Compare teaser → How UnnatiVidya works + perks grid → What learners say → FAQ (custom 2-col) → Footer.**

**Navy hero**
- Section background: `#16133F` with two radial glows: `radial-gradient(640px 360px at 88% 8%, rgba(124,108,255,0.45), transparent 70%)` and `radial-gradient(520px 320px at 0% 100%, rgba(91,76,240,0.35), transparent 70%)`. `overflow: hidden`, text white.
- Inner grid: `repeat(auto-fit, minmax(min(100%,460px),1fr))`, gap `clamp(32px,5vw,56px)`, padding `clamp(40px,6vw,72px)` top, 48px bottom, vertically centred.
- **Left column:**
  - Eyebrow pill: "UGC-entitled · 30 programs · 3 universities". 12px/700 uppercase, letter-spacing 0.06em, colour `#CFC9FF`, bg `rgba(255,255,255,0.08)`, border `1px rgba(255,255,255,0.16)`, radius 99, padding 6×12.
  - H1: "Find an online degree that fits **you.**" ("you." in `#A99EFF`). Margin-top 20.
  - Paragraph (`#CFCCEE`, max-width 520): "Explore Manipal University Jaipur, Sikkim Manipal University and Amity Online. Compare tuition, entry requirements and study options."
  - **Search card** (white, radius 16, padding 8, wraps). Two labelled selects (`flex: 1 1 150px`; label 11px/700 uppercase `#6F6D8C`; value 15px/600) separated by a `1px #EFEEF8` left border: **Degree level** (Any level / Undergraduate / Postgraduate) and **Stream** (Any stream / Management / IT & Computers / Commerce / Arts & Humanities). Then the primary button **"Show programs →"** (min-height 52, radius 10). It navigates to `/courses?lvl=&stream=` with only the filled params.
  - "Popular:" chips (Online MBA, BCA, MCA, B.Com) → `/courses?degree=X`. Chip: radius 99, padding 6×12, border `rgba(255,255,255,0.2)`, bg `rgba(255,255,255,0.06)`, white 600; hover bg `rgba(255,255,255,0.14)`.
- **Right column:** hero image `https://unnatividya.com/hero/student-online-degree.webp`, aspect 5/4, radius 24, cover, with the hero-image shadow. Wrapper padding `20px 24px 32px 0`. Two floating cards:
  - Bottom-left (`left: -8px; bottom: 4px`, white, radius 16, padding 16×18, min-width 200): "Lowest MBA in our catalog" / **₹1,20,000** (26px/800) / "SMU · EMI ₹4,583/mo".
  - Top-right (`right: 0; top: 0`, bg `#5B4CF0`, radius 16): "Average package" / **₹7.2 LPA** (24px/800) / "MUJ online learners". Secondary text `#DCD8FF`.
- **Approvals strip** (inside the hero, bottom padding 40): bg `rgba(255,255,255,0.06)`, border `rgba(255,255,255,0.12)`, radius 14, padding 16×20. Contents: label "APPROVALS THAT MATTER" (`#A9A6D6`, 12px/700, 0.08em), then 5 logos (UGC, NAAC, AICTE, WES, AIU; 24px tall, each on a white tile with radius 8 and padding 5×8), then "How we verify →" (`#CFC9FF`) on the right.

**Popular online degrees.** Heading + subtitle "Compare listed tuition and duration, then open a course for its requirements and current fee details." + "Browse all 30 →". Grid `auto-fill minmax(min(100%,340px),1fr)`, gap 20, showing 6 Program cards: `mba-muj, bca-muj, mca-muj, mba-smu, bcom-muj, mscds-amity`.

**Browse by stream.** 4 image tiles (`auto-fill minmax(260px)`, aspect 4/5, radius 18). Each has a full-bleed image `https://unnatividya.com/streams/{management|it-computer-applications|commerce-finance|arts-humanities}.webp` with an overlay `linear-gradient(180deg, rgba(21,19,58,0) 35%, rgba(21,19,58,0.92))`. Bottom block: name 22px/800, meta (e.g. "6 degrees · BBA, MBA") `#DCDAF7`, then a divider and "from ₹X" plus a 32px white circle arrow. Each tile links to `/courses?stream=`.

**Course matching panel.** `#16133F`, radius 24, 2 columns. Left: eyebrow "COURSE MATCHING" (`#A9A4FF`), H2 "Start with your goals and budget.", paragraph, buttons "Get my shortlist →" (white bg, navy text) and "Compare manually" (outline `rgba(255,255,255,0.25)`), note "Takes about two minutes · no sign-up to see results". Right: 3 sample result rows, each with a 52px conic-gradient match ring (`#12A35C` if ≥85, else `#8B7CFF`), title, university, fee and EMI. Row bg `rgba(255,255,255,0.06)`, border `rgba(255,255,255,0.1)`, radius 14. Disclaimer below.

**Universities we cover.** 3 cards. Campus image (aspect 16/8) with a 56×56 logo tile overlapping the bottom edge by 24px. Then name 18px/800, "Location · est. YYYY", green approval pills, and a 3-column stat row (programs / placement % / avg package). The whole card links to `/university?id=`.

**Compare teaser.** Panel bg `#F4F3FE`, radius 24. Left: "Stuck between two universities?" + copy + "Open compare →". Right: a static MBA mini-table (MUJ/SMU/Amity × Total fee, EMI, Placement, Avg package), with the best value in each row in `#14774A`/700.

**How UnnatiVidya works.** 3 steps (top border 2px `#5B4CF0`, eyebrow "01 · COMPARE" etc.), then a 6-cell perks grid separated by 1px `#EAE9F4` lines: "30+ comparison factors", "Loans", "Support", "Jobs", "Community", "₹0 extra lowest-fee guarantee".

**What learners say.** 3 testimonial cards: ★★★★★ in `#F2A60C`, quote 16px, 40px initials avatar.

**FAQ (Home-specific layout).** 2 columns. Left: H2 "Questions we get every day", "Still unsure? A counsellor can walk you through it — free.", buttons **Apply now** (primary) and "Call 1800-120-4050". Right: a simple divider-list accordion (18px row padding, 16px/700 question, `+`/`–` sign in `#5B4CF0`).

### 02 · Courses listing (`Courses.dc.html`), `/courses?lvl=&stream=&uni=&degree=&q=`
- Hero: breadcrumb, H1 "Online degree courses", subtitle, a 52px search input with a search icon, a "Not sure? Find my fit" outline button, and a "Quick compare" chip row (horizontal scroll).
- Body: filter sidebar (≤270px) + results.
  - **Filters:** checkbox groups for Degree level, Degree, Stream and University (each option shows a live count that takes the other active filters into account). Then a **Maximum total tuition** range slider (₹75,000–₹2,75,000, step 5,000, `accent-color #5B4CF0`) and a "Clear all" link.
  - **Results:** "N of 30 programs" + sort select (relevance / fee low→high / fee high→low / highest rated). Active-filter chips with × (bg `#ECE9FE`). Program cards in an `auto-fill minmax(300px)` grid.
  - **Empty state:** dashed `#D6D0FA` box with an illustration (two tilted cards + a 56px `#5B4CF0` icon circle + small orange and green dots), "No programs match these filters", the hint "Try raising the fee limit or removing a filter.", "Clear filters" (primary) and "Find my fit" (outline).
- **Compare tray:** a fixed bottom-centre bar, `width: min(720px, 100% - 24px)`, bg `#16133F`, radius 16. It holds removable chips for each compared program and a white "Compare N →" button. Shown when the compare list is not empty.
- **Mobile (<860px):** the sidebar is hidden behind a "Filters (n)" button with the sort select beside it. The panel expands inline and ends with "Show N results".

### 03 · Course detail (`Course.dc.html`), `/course?id=mba-muj`
- Hero: breadcrumb, then a 2-column layout. Left: logo tile + university link, H1 "Online MBA", rating/reviews/level/"100% online" row, about paragraph, and buttons **Apply now** (primary) / Compare / Shortlist toggle. Right: campus image (16/10, radius 22) with stacked white approval badges in the top-right corner. Below: a 5-cell stat strip (Duration, Total fee, No-cost EMI, Degree level, 100% online).
- **Sticky section tabs** at `top: 68px`: Overview, Eligibility, Admission, Specialisations, Fees & EMI, Careers, Reviews, FAQ. Clicking smooth-scrolls to the section with a −130px offset. The active tab is `#5B4CF0` with a 2px underline.
- Main column cards: About + Key highlights · Eligibility (tag **SOURCE VERIFIED** green for mba-muj, else **CONFIRM WITH COUNSELLOR** amber) · Admission process (4 steps) · Specialisations grid (links to the Specialization page) · Fees & EMI (3 plan tiles; "Full payment" with a green "Save 2%" tag) · Placements & careers · Sample certificate (mba-muj only) · Student reviews (mba-muj only).
- **Sticky sidebar** (`top: 132px`, ~300px): total fee 32px/800, a green "No-cost EMI from …" pill, **Start application enquiry** (primary), **Call 1800-120-4050** (outline), "Why learners pick X" checklist, disclaimer, and a "Not sure this is the one?" link to the Recommender.
- Below: Similar programs (3 cards) and the FAQ.
- **Mobile:** a sticky bottom bar with the fee + EMI and an **Apply now** button.

### 04 · Universities (`Universities.dc.html`)
Three wide cards (campus image left with a rating badge; details right: logo, name, location/est., about, approval pills, a 4-stat block, "View X programs" + "Browse all N courses"). Then "Universities at a glance", a comparison table with the best value per row highlighted, and the FAQ.

### 05 · University detail (`University.dc.html`), `/university?id=muj|smu|amity`
Hero like the Course page (logo, H1, tagline built from approvals, buttons "Compare X programs →" / **Apply now**, campus image with badges, 5-stat strip). Sticky tabs. About + Key highlights · Online programs list (row cards with icon, title, months · fee, specialisation count) · Approvals & recognition + Scholarships & fee benefits · Placements & career support (MUJ shows 6 hiring-partner logos) + Admission process (vertical steps) · FAQ · "Other universities to consider".

### 06 · Compare (`Compare.dc.html`), `/compare?ids=a,b,c` | `?add=id` | `?uni=id`
- Hero: H1 "Compare **Online MBA** Programs" (the degree name is in primary colour when all columns share a degree), Share (copies the URL; label changes to "Link copied") and Download PDF buttons, and Quick-start chips.
- 3 **slot cards**. Filled: campus thumbnail, university, program, View details, a "Change" control (invisible native select overlay), and ×. Empty: dashed "Add a program" picker.
- **Desktop table:** columns `200px repeat(3, 1fr)`. The sticky header row (`top: 68px`) has logo, name, "View program →" and Shortlist. Rows: Total program fee (min), EMI (min), Duration, UGC entitled, NAAC, Rating (max), Eligibility, Specializations (max), Learning mode, Placement assistance (max), Average package (max). The best cell gets bg `#F3FBF6`, text `#12784B`/800 and a green tag ("Lowest" or "Best"). No highlight when all values are equal. The final row is Key highlights bullets.
- **Mobile:** one card per feature, with a row per program (logo + "SMU · MBA" + value + tag).
- Also on the page: an email-report panel (input + "Send report →"; on success it becomes a green confirmation), "Explore more options" cards, a "Published comparison pages" link grid (18 pairs) and the FAQ.

### 07–08 · Find my fit (`Recommender.dc.html`); results at `?results=1`
- **Quiz (4 steps):** progress shown as 4 bars (6px, filled `#5B4CF0`, else `#E4E1F3`), eyebrow "FIND MY FIT · STEP N OF 4", H1 question, option cards (icon tile, label, sub-label, check icon; selected state = 1.5px `#5B4CF0` border). Choosing an option auto-advances. A Back link appears from step 2.
  1. Current education: 12th → UG, Graduation → PG.
  2. Study: Management / IT & Computers / Commerce / Arts & Humanities.
  3. Budget: ≤₹1L / ₹1–1.5L / ₹1.5–2L / >₹2L (values 100000 / 150000 / 200000 / 300000).
  4. Priority: placement / lowest fee / ratings.
- **Scoring** (per program at the chosen level): stream match +52 (else +8); budget fit +26 if within budget, otherwise `max(0, 26 − (fee − budget)/3000)`; priority factor ×20 (placement `(placement − 78)/10`, fee `1 − fee/275000`, rating `(rating − 4.1)/0.6`, each clamped 0–1). Capped at 97. Sort descending; show the top 3, with the next 3 under "Explore more programs".
- **Results:** hero with trust items. A "Your journey" sidebar (sticky on desktop) lists the 4 answers, each with Edit (jumps to that step), plus "Retake quiz". Result cards: 96px conic match ring (green ≥85, blue `#3B82F6` ≥70, else primary), reason pills (green or amber "₹X over budget"), fee/EMI, and View details / Shortlist / **Apply now**. Also a help CTA panel, more programs and the FAQ.

### 09 · Specializations (`Specializations.dc.html`)
Search input + degree filter pills. Groups per degree, each a grid of spec cards (name, arrow, university logos offering it, "from ₹X"). Empty state uses the illustration with a "Show all specializations" button. A navy CTA strip links to Find my fit.

### 10 · Specialization detail (`Specialization.dc.html`), `?key=mba-finance`
Hero (icon, level · stream, H1 "Online MBA in Finance", description, 4-stat strip). "Universities offering X" as Program cards, plus "Compare these programs →" when there are 2 or more. "Who it suits" checklist. "Other MBA specializations" chips. FAQ.

### 11 · Guides (`Guides.dc.html`)
Category pills (All / Fees / Eligibility / Careers / Approvals). Featured guide card (gradient panel `#5B4CF0 → #8B7CFF` with a large icon, plus text). Guide grid. Three tool shortcut tiles. FAQ.

### 12 · Article (`Article.dc.html`), `?slug=mba-fees`
880px column. Category tag, H1, deck, author/read time/updated line and a "Source-verified" link. "In this guide" TOC box (smooth-scroll). Sections with 16px/1.75 body and optional data tables (horizontal scroll on mobile). A CTA to compare the programs. Related guides list.

### 13 · EMI calculator (`EMICalculator.dc.html`), `?id=`
- Left card: program select, Down payment slider (0 to 50% of fee, step 5,000), tenure pills (6/12/18/24/36 m), interest slider (0–18%, step 0.5; 0 is labelled "No-cost").
- Right navy card: monthly EMI (`clamp(40px,6vw,56px)`/800), a stacked bar (down payment `#8B7CFF` / principal white / interest `#F0A30A`), a 4-figure breakdown, and "Check loan eligibility" / "View program" buttons.
- Formula: `P = fee − down`, `r = rate/1200`, `EMI = r ? P·r·(1+r)^n / ((1+r)^n − 1) : P/n`.
- Below: "Same plan, other universities" table (same degree) with "Use this →". FAQ.

### 14 · Shortlist (`Shortlist.dc.html`)
Saved program cards plus "Compare N" and "Clear all" in the hero, and a "Get a second opinion" CTA (**Apply now**). Empty state: illustration (bookmark icon), "Your shortlist is empty", hint text, "Browse programs" / "Find my fit", and three suggested cards.

### 15 · Apply now (`Apply.dc.html`), `?course=id` or `?uni=id` prefill
- Left: eyebrow "FREE COUNSELLING · NO OBLIGATION", H1 "Start your application enquiry", 4 perks, "Prefer to call? 1800-120-4050".
- Right card form: Full name; Mobile (+91 prefix, digits only, max 10); Email; Course select (all degrees); University (optional); consent checkbox (checked by default); **Apply now** submit.
- **Validation** (shown in `#B42318`, 13px/600): empty name → "Please enter your name."; phone ≠ 10 digits → "Please enter a valid 10-digit mobile number."; consent unchecked → "Please agree to be contacted."
- **Success:** green check, "Thanks, {first name}. We'll call you soon.", a summary sentence, 3 "What happens next" steps and follow-up links.

### 16–18 · About, How we verify, Legal
- **About:** large H1, 3 value cards, "How UnnatiVidya works" steps beside a 6-cell stat grid, navy "Talk to us" panel (Call + **Apply now**).
- **How we verify:** 4-step process tiles, a "What the labels mean" table (SOURCE VERIFIED / CONFIRM WITH COUNSELLOR / BEING RE-CHECKED, styled as described), source links, and a "Report an error" CTA.
- **Legal:** `?tab=privacy|terms|refund`, underline tabs, sticky section nav on the left, content sections. **The copy here is placeholder and needs legal review.**

### Mobile preview (`MobilePreview.dc.html`)
Reference board only: every page in a 390×844 phone frame. Not a production page.

---

## Interactions & Behaviour
- **Links:** default `#5B4CF0`, no underline; hover `#4A3BDB` + underline. Card-style links suppress the underline.
- **Buttons:** primary bg `#5B4CF0` → hover `#4A3BDB`. Outline style is 1px `#D6D0FA` border with primary text, hover bg `#F4F2FF`.
- **Cards:** hover border `#CFC9FA` + card-hover shadow, 0.2s.
- **Scroll entrance animation** (all pages, in `uv-data.js`): every `main section` that starts **below 90% of the viewport** at load begins at `opacity: 0; transform: translateY(24px)` and animates to `opacity: 1; transform: none` over **0.6s `cubic-bezier(.2,.7,.2,1)`** when it enters the viewport (IntersectionObserver, threshold 0.06, rootMargin bottom −8%). It fires once. **Disabled entirely under `prefers-reduced-motion: reduce`.** Above-the-fold content never animates. In React, use a small `useReveal` hook or Framer Motion `whileInView` with `once: true`.
- **Section tabs:** smooth `window.scrollTo` with a −130px offset (−90px on Article/Legal). Don't use `scrollIntoView`.
- **Accordions:** one open at a time; icon swaps `add`/`remove` (or `+`/`–`).
- **Shortlist & Compare** state persists across pages (see State). The Compare list holds max 3; adding a 4th drops the oldest.
- **Loading:** Program cards show the shimmer skeleton (above) until data arrives; the Courses grid renders 6 skeletons.

## State Management
- **Persisted (localStorage, prefix `uv_`):**
  - `uv_saved: string[]`: shortlisted course ids.
  - `uv_compare: string[]`: compare ids, max 3. Default `['mba-muj','mba-smu','mba-amity']`.
  - Every write dispatches a `uv-store` window event so the header count, cards and tray update live. In production, use a global store (Zustand/Context), sync it to localStorage, and later to the user account.
- **URL state:** Courses filters (`lvl, stream, uni, degree, q`), Course `id`, University `id`, Compare `ids|add|uni`, Specialization `key`, Article `slug`, EMI `id`, Apply `course|uni`, Legal `tab`, Recommender `results=1`. Keep these shareable.
- **Local UI state:** filters and sort, mobile filter panel open, quiz step and answers, accordion index, EMI inputs, form fields, error and success.
- **Data:** `uv-data.js` holds the catalog shape. Replace it with an API or CMS:
  - `University { id, name, short, slug, loc, est, rating, reviews, placement, avg, avgN, high, partners, feeFrom, approvals[], about, about2 }`
  - `Course { id, short, title, uni, lvl: 'UG'|'PG', stream, fee, months, emi, rating, reviews, icon, specs[] }`
  - `Specialization { key, name, degree, stream, lvl, courses[] }` (derived)
  - `Guide { slug, cat, title, read, desc, degree }`
- **Enquiry submission:** currently client-only. Wire it to the CRM/lead API, rate-limit it and add server-side validation.

## Assets
All are loaded from the live site `https://unnatividya.com`:
- `/brand/unnatividya-logo-gradient.svg`, `/brand/unnatividya-logo-white.svg`
- `/hero/student-online-degree.webp`
- `/universities/{manipal-university-jaipur|sikkim-manipal-university|amity-online}-logo.svg` and `-campus.webp`
- `/universities/manipal-university-jaipur-partner-logo-{1..6}.svg`
- `/approvals/{ugc|naac|aicte|wes|aiu}.svg`
- `/streams/{management|it-computer-applications|commerce-finance|arts-humanities}.webp`
- `/certificates/mba-muj-certificate-sample.webp`
- Fonts: Plus Jakarta Sans and Material Symbols Rounded (Google Fonts).

## Content Caveats
- Reviews, salary ranges and the sample certificate are only confirmed for **MUJ Online MBA**. Other programs hide those sections.
- SMU/Amity review counts and some university descriptions are placeholders. Replace them with verified data.
- Legal page copy is placeholder.
- Testimonials are sample content.

## Files
| File | What it is |
|---|---|
| `Home.dc.html` | Home: **navy hero, no marquee** (the approved version) |
| `Courses.dc.html` | Listing + filters + compare tray |
| `Course.dc.html` | Program detail |
| `Universities.dc.html` / `University.dc.html` | University list / detail |
| `Compare.dc.html` | Side-by-side compare |
| `Recommender.dc.html` | Find my fit quiz + results |
| `Specializations.dc.html` / `Specialization.dc.html` | Spec list / detail |
| `Guides.dc.html` / `Article.dc.html` | Guides hub / article |
| `EMICalculator.dc.html` | EMI tool |
| `Shortlist.dc.html` | Saved programs |
| `Apply.dc.html` | Apply now (enquiry form) |
| `About.dc.html`, `HowWeVerify.dc.html`, `Legal.dc.html` | Company pages |
| `UVHeader`, `UVFooter`, `UVCard`, `UVFaq` `.dc.html` | Shared components |
| `uv-data.js` | Catalog data, helpers, store, scroll-reveal script |
| `MobilePreview.dc.html` | All pages at 390px (reference only) |
| `support.js` | Prototype runtime. **Do not port.** |
