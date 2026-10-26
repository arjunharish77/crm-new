# B: Courses listing, Course detail and Compare (spec, current state, changes, conflicts)

Scope: `design_handoff_unnati_vidya/Courses.dc.html`, `Course.dc.html` and `Compare.dc.html`, plus `uv-data.js`, compared with the current code in `apps/unnatividya/src`. Line numbers are approximate (`file:line`). "Design" means the handoff. "Current" means the repo as it is today. Constraint numbers (C1–C12) refer to `0-constraints-checklist.md`.

---

## 0. Cross-cutting notes for all three pages

### 0.1 Global tokens these pages use
- Page wrapper: `min-height:100vh; display:flex; flex-direction:column; background:#fff`. Body text colour is `#16133F`. The font is Plus Jakarta Sans with `-webkit-font-smoothing:antialiased`.
- Links: `#5B4CF0` with no underline. On hover they turn `#4A3BDB` and underline. Card links suppress the underline (`style-hover="text-decoration:none"`).
- Container: `max-width:1240px; margin:0 auto; padding-inline:clamp(16px,3vw,32px)`. Current code uses `1200px` with 24px padding (`.uv-header-inner`, `shell` objects, `.container`).
- Inner-page hero background: `radial-gradient(<w> <h> at <x> 0%, #E6E1FF|#ECE8FF 0%, rgba(…,0) 70%), linear-gradient(180deg,#F7F5FF,#FBFAFF)`, with `border-bottom:1px solid #EEECF8` on Courses and Compare only.
- Breadcrumb: 13px, `#6F6D8C`, `display:flex; gap:6px; align-items:center`. The separator is the Material icon `chevron_right` at 16px. The last crumb is `#16133F`. Current breadcrumbs use the text separator `&gt;`.
- Header: sticky, 68px tall. Current `.uv-header-inner` has `min-height:68px` and `.pill-nav{top:68px}`, so the 68px offsets in the design match the current header.

### 0.2 Fonts and icons (C11, CSP)
- Every design file loads Google Fonts CSS (Plus Jakarta Sans and Material Symbols Rounded, lines 12–13 of each file). The live CSP (`deploy/vps/caddy/Caddyfile:30,50`) allows only `style-src 'self' 'unsafe-inline'; font-src 'self' data:`, so both fonts would be blocked.
  - Plus Jakarta Sans: use `next/font/google`, which self-hosts the font at build time.
  - Material Symbols: self-hosting the full variable icon font is a large asset (more than 1MB, needs review). Map each icon to `lucide-react`, which is already a dependency. Suggested map: `search`→Search, `chevron_right`→ChevronRight, `auto_awesome`→Sparkles, `tune`→SlidersHorizontal, `check`→Check, `close`→X, `search_off`→SearchX, `arrow_forward`→ArrowRight, `compare_arrows`→ArrowLeftRight, `bookmark`/`bookmark_added`→Bookmark/BookmarkCheck, `verified`→BadgeCheck, `schedule`→Clock, `payments`→Banknote, `credit_card`→CreditCard, `school`→GraduationCap, `laptop_mac`→Laptop, `workspace_premium`→Award, `edit_document`→FilePen, `upload_file`→FileUp, `check_circle`→CircleCheck, `share`→Share2, `download`→Download (or Printer), `sync`→RefreshCw, `add_circle`→CirclePlus, `person`→User, `category`→LayoutGrid, `work`→Briefcase, `forward_to_inbox`→MailPlus, `lock`→Lock, `add_chart`→ChartColumn, `explore`→Compass, `support_agent`→Headset, `call`→(not used, see C2).
- The current SaveButton uses a lucide `Heart` icon. The design uses `bookmark`/`bookmark_added` everywhere. UVCard/UVHeader are covered elsewhere, but the course hero and Compare header Shortlist controls depend on this choice.

### 0.3 Asset paths
The design loads every asset from the absolute URL `https://unnatividya.com/...` (`uv-data.js:2,83-84,86`; `Course.dc.html:103`). Use root-relative local paths through `next/image`, as `src/data/media.ts` already does. All assets these pages use exist in `public/`:

| Design path | In `public/` | Notes |
|---|---|---|
| `/universities/{manipal-university-jaipur,sikkim-manipal-university,amity-online}-logo.svg` | yes | `universityMedia[id].logo` |
| `/universities/{…}-campus.webp` | yes | `universityMedia[id].src` |
| `/certificates/mba-muj-certificate-sample.webp` | yes | Samples exist for **all 30** courses (`certificateImagePath(id)`). The design shows a certificate for `mba-muj` only. |
| `/states/no-course-matches.webp` | yes (current empty state) | The design replaces it with a CSS illustration. |
| `/brand/*`, `/approvals/*.svg` | yes | Used only by the header/footer on these pages |

### 0.4 Catalog IDs in `uv-data.js` versus the real catalog
22 of the 30 IDs match. These 8 do not, so any hard-coded preset, quick-compare chip or "published pair" list must use the real IDs:

| Design id (`uv-data.js`) | Real id (`src/data/catalog.ts`) |
|---|---|
| `bcomh-amity` | `bcom-honours-amity` |
| `maeco-muj` | `ma-economics-muj` |
| `maeng-smu` | `ma-english-smu` |
| `mapol-smu` | `ma-political-science-smu` |
| `mapp-amity` | `ma-public-policy-governance-amity` (shortName "MA Public Policy", not "MA Public Policy & Governance") |
| `masoc-smu` | `ma-sociology-smu` |
| `mscds-amity` | `msc-data-science-amity` |
| `mscmath-muj` | `msc-mathematics-muj` |

- Course pages are routed by **slug** (`/courses/online-mba-manipal-university-jaipur`), not by id (`/course?id=mba-muj`, `uv-data.js:86`).
- University pages are routed as `/universities/[slug]`, not `University.dc.html?id=`.
- The design's spec lists differ from the catalog. Examples: mba-smu has 4 in the design and 6 in the catalog, ba-amity has 4 and 9 (including medium-of-instruction rows), bca-amity has 4 and 6, and mca-muj and mca-amity have 4 and 5. Always render the catalog.
- University fixtures differ from `catalog.ts`. Reviews: SMU "2,180" vs 2110, Amity "5,960" vs 4870. SMU/Amity `learners`, `partners` and `high` are "—" in the design, but the catalog has 38,000+/85,000+, 210/400 and ₹15/₹21 LPA. The README itself says (line 282) "SMU/Amity review counts and some university descriptions are placeholders."

### 0.5 Breakpoints
- The design switches all three pages into "mobile" mode with JS `window.innerWidth < 860` (Courses:110, Course:168, Compare:144).
- The current code uses CSS breakpoints at 900px (filters and layouts), 640px (mobile action bar, section select, stacked comparison table) and 1100px (header).
- Recommendation: use a CSS media query at `max-width: 859px` instead of JS width state. This avoids a hydration flash, and the content works without JS (C11).

### 0.6 Scroll-reveal
`uv-data.js:89-101` hides every below-fold `main section` (opacity 0, translateY 24px) and reveals it with an IntersectionObserver. C11 says "no scroll-reveal that hides content". **Do not port it**, or at most use a CSS-only, reduced-motion-safe effect that never starts content at `opacity:0`.

### 0.7 Sticky and stacking scale
- Design z-indexes: header 40, course tabs 20, Compare sticky header row 5, mobile course bar 30, compare tray 50.
- Current z-indexes: `.uv-public-header` 100, `.pill-nav` 90, `.uv-mobile-action-bar` 150, floating `StickyCtas` "Apply now" 150 (desktop, fixed bottom-right, `src/components/sticky-ctas.tsx`).
- DESIGN_AND_CONTENT_STANDARD §35 requires "one contextual sticky action region at a time". The new compare tray (bottom-centre, fixed) needs a rule for coexisting with or suppressing `StickyCtas` (bottom-right) and the mobile bar.

---

## 1. Courses listing (`Courses.dc.html`) → `/courses`

### 1.1 Design spec

#### Route and URL state
- Design route: `/courses?lvl=&stream=&uni=&degree=&q=` (README:169).
- On mount it reads only **single** values: `lvl`, `stream`, `uni`, `degree` each become a one-item array, plus `q` (`Courses.dc.html:99-102`).
- **It never writes filter or sort state back to the URL.** Changes stay in component state, which contradicts README:260 "Keep these shareable".
- There is no sort or max-fee param.

#### Page structure, top to bottom

**1. Header**: `<UVHeader active="courses">`, sticky top 0, z 40 (line 18).

**2. Hero section** (lines 19–36)
- Background: `radial-gradient(500px 260px at 90% 0%,#E6E1FF 0%,rgba(230,225,255,0) 70%), linear-gradient(180deg,#F7F5FF,#FBFAFF)`; `border-bottom:1px solid #EEECF8`.
- Inner padding: `24px clamp(16px,3vw,32px) 28px`.
- Breadcrumb: "Home" (link) › "Explore degrees" (`#16133F`).
- H1: "Online degree courses". `margin:14px 0 0; font-size:clamp(30px,4.2vw,44px); letter-spacing:-0.035em; font-weight:800`. No explicit line-height. The README calls for `text-wrap:balance` on H1s.
- Subtitle `<p>`: "Every UGC-entitled program from MUJ, SMU and Amity, with listed tuition and EMI." `margin:8px 0 0; color:#4A4867; font-size:16px`.
- Search row: `display:flex; flex-wrap:wrap; gap:10px; margin-top:20px; align-items:center`.
  - Search box: `flex:1 1 320px; height:52px; padding:0 16px; gap:10px; background:#fff; border:1px solid #E4E1F3; border-radius:14px; box-shadow:0 10px 30px -22px rgba(60,45,170,0.4)`.
    - Icon `search` at 22px, `#6F6D8C`.
    - `<input>`: `flex:1; border:0; outline:none; font-size:15px; background:transparent; min-width:0`. Placeholder "Search MBA, Data Science, Finance…". Bound to `q` and filters live as you type. **No label and no `type="search"`.**
  - "Not sure? Find my fit" link → Recommender: `height:52px; padding:0 18px; border-radius:14px; background:#fff; border:1px solid #D6D0FA; font-weight:700; font-size:14px; gap:8px`, icon `auto_awesome` at 20px.
- "Quick compare" row: `display:flex; gap:8px; margin-top:16px; overflow-x:auto; padding-bottom:2px`.
  - Label "Quick compare": 13px/700, `#4A4867`, nowrap.
  - Chips (`<a>`): `white-space:nowrap; padding:7px 12px; border-radius:99px; background:#fff; border:1px solid #E4E1F3; font-size:13px; font-weight:600; color:#2B2950`. Hover: `border-color:#5B4CF0; color:#5B4CF0; no underline`.
  - Chips (line 114): "MBA: MUJ vs Amity" → `Compare?ids=mba-muj,mba-amity`; "MBA: SMU vs MUJ" → `mba-smu,mba-muj`; "BCA: MUJ vs Amity" → `bca-muj,bca-amity`; "MCA: MUJ vs SMU" → `mca-muj,mca-smu`.

**3. `<main>`** (line 37)
- `flex:1; max-width:1240px; padding:24px clamp(16px,3vw,32px) 120px; display:flex; flex-wrap:wrap; gap:28px; align-items:flex-start`.
- The 120px bottom padding clears the fixed compare tray.

**3a. Mobile only (<860): toolbar row** (lines 38–43). `flex:1 1 100%; display:flex; gap:8px; align-items:center`.
- "Filters" toggle (a `<div>`, not a button): `padding:11px 16px; border-radius:12px; border:1px solid #E4E1F3; font-weight:700; font-size:14px; gap:8px`. Icon `tune` at 20px. Label "Filters" + `activeCountLabel`, which is " (n)" where n = number of active chips including the max-fee chip.
- Sort `<select>`: `flex:1; padding:11px 12px; border-radius:12px; border:1px solid #E4E1F3; font-size:14px; font-weight:600; background:#fff`. Options: "Sort: relevance"(rel), "Fee: low to high"(low), "Fee: high to low"(high), "Highest rated"(rating). **No label.**

**3b. Filter sidebar `<aside>`** (lines 44–67)
- Desktop: always shown. Mobile: shown only when `open`.
- `flex:1 1 250px; max-width:270px` (100% on mobile); `display:flex; flex-direction:column; gap:22px; padding:20px; border:1px solid #E8E6F3; border-radius:16px; background:#fff`.
- **Not sticky.** The current sidebar is sticky at `top:88`.
- Header row: "Filters" (800, 16px) and "Clear all" (a span, 13px/700, `#5B4CF0`). Clear all resets q, max and every group. It does **not** reset sort.
- Four checkbox groups (line 123):
  1. "Degree level": Undergraduate (UG), Postgraduate (PG).
  2. "Degree": Online MBA, Online BBA, Online BCA, Online MCA, Online B.Com, Online M.Com, Online BA. This is a hard-coded list of 7. MA *, MSc *, BA JMC and B.Com Honours have no degree option.
  3. "Stream": Management, IT & Computers, Commerce, Arts & Humanities.
  4. "University": the full names Manipal University Jaipur, Sikkim Manipal University, Amity University Online.
- Group title: 12px/700, `letter-spacing:0.05em`, uppercase, `#6F6D8C`, `margin-bottom:8px`. The option list is a column with `gap:2px`.
- Option row (a `<div>` with onClick): `padding:8px; border-radius:9px; font-size:14px; font-weight:600; color:#2B2950; gap:10px`. Hover: `background:#F8F7FD`.
  - Fake checkbox: 20×20, `border-radius:6px; border:1.5px solid` `#5B4CF0` when on, `#CFCCE0` when off; background `#5B4CF0` when on, `#fff` when off. A white `check` glyph at 16px is always rendered, so it is invisible on white.
  - Label `flex:1`. Count: 12px, `#8E8CA8`.
- **Live count rule** (line 122): `count = catalog.filter(c => c[key] === value && matches all OTHER active filters (own group skipped), fee <= max and q)`. In words, the count is what you would get if this option were the only one chosen in its group.
- "Maximum total tuition" block, with the same group title style:
  - `<input type="range" min=75000 max=275000 step=5000>`: `width:100%; accent-color:#5B4CF0`. **No label association.**
  - Below it: `display:flex; justify-content:space-between; font-size:13px; color:#6F6D8C`. Left "₹75,000". Right `<b style="color:#16133F">` "Up to ₹2,75,000" (formatted INR).
- Mobile only, last in the panel: "Show N results" button (a div). `text-align:center; padding:14px; border-radius:12px; background:#5B4CF0; color:#fff; font-weight:700`. It closes the panel.

**3c. Results column** (lines 68–82): `flex:999 1 560px; min-width:0`.
- Desktop only, toolbar: `display:flex; flex-wrap:wrap; justify-content:space-between; gap:12px; margin-bottom:16px`.
  - Left: `<b>{count} of 30 programs</b>` followed by a span (13px, `#6F6D8C`): " · Tuition shown. Check each program for current fees and eligibility." **"30" is hard-coded.**
  - Right: sort select with `padding:9px 12px; border-radius:10px; border:1px solid #E4E1F3; font-size:14px; font-weight:600`. Same four options.
- Active chips (when any): `display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px`.
  - Chip (a span with onClick): `padding:6px 8px 6px 12px; border-radius:99px; background:#ECE9FE; color:#5B4CF0; font-size:13px; font-weight:700; gap:4px`, followed by a `close` icon at 16px.
  - Labels: uni → short name ("MUJ"); lvl → "Postgraduate"/"Undergraduate"; others → raw value ("MBA", "Commerce"); max < 275000 → "Up to ₹X".
  - **There is no chip for the search query q.**
- Grid: `display:grid; grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr)); gap:14px`. One `<UVCard course-id>` per result.
  - Skeletons: while `window.UV` is missing, `results` is six empty ids and UVCard renders its shimmer skeleton: `aria-busy="true"`, min-height 290, and the shimmer keyframe described in the README. The count shows "…".
- Empty state (`none`, line 81): see 1.1.1.

**4. Compare tray** (lines 84–91): shown when `UV.store.compare()` is non-empty.
- `position:fixed; left:50%; transform:translateX(-50%); bottom:16px; z-index:50; width:min(720px, calc(100% - 24px)); background:#16133F; color:#fff; border-radius:16px; padding:10px 10px 10px 16px; display:flex; align-items:center; gap:12px; box-shadow:0 24px 50px -18px rgba(22,19,63,0.7)`.
- Chip strip: `display:flex; gap:6px; flex:1; min-width:0; overflow-x:auto`.
  - Each chip: `padding:6px 8px; border-radius:9px; background:rgba(255,255,255,0.1); font-size:13px; white-space:nowrap; gap:6px`.
  - Content: university logo 18×18 (`object-fit:contain; background:#fff; border-radius:4px; padding:1px; alt=""`), label "{short} · {uniShort}" (e.g. "MBA · MUJ"), and a `close` icon (16px, `#B7B3E6`, a span with onClick) that removes the program from the store.
- CTA: `<a href="Compare.dc.html">` reading "Compare {n} →". `flex:none; padding:11px 16px; border-radius:11px; background:#fff; color:#16133F; font-weight:800; font-size:14px; nowrap`. **The ids are not in the href**; the tool relies on the localStorage store.
- **Default store value is `['mba-muj','mba-smu','mba-amity']` (`uv-data.js:54`), so on a first visit the tray is always visible with three MBAs.**

**5. Footer**: `<UVFooter>`.

#### 1.1.1 Empty state (line 81)
- Wrapper: `padding:40px 20px; text-align:center; border:1.5px dashed #D6D0FA; border-radius:20px; display:flex; flex-direction:column; align-items:center; gap:10px`.
- Illustration box: `position:relative; width:180px; height:130px; margin:0 auto`. Should be `aria-hidden`.
  - Back card: `left:18px; top:22px; 120×84; radius 16; #ECE9FE; rotate(-8deg)`.
  - Front card: `left:44px; top:14px; 120×84; radius 16; #fff; border 1px #E4E1F3; box-shadow 0 14px 30px -18px rgba(60,45,170,0.45); rotate(6deg); padding 14; column gap 8`. It holds three 8px bars (radius 4): 60% `#ECE9FE`, 85% `#F3F1F9`, 45% `#F3F1F9`.
  - Icon circle: `left:62px; top:64px; 56×56; 50%; #5B4CF0; white; search_off at 28px; box-shadow 0 10px 24px -8px rgba(91,76,240,0.6)`.
  - Orange dot: `right:4px; top:6px; 10×10; #F0A30A`. Green dot: `left:6px; bottom:10px; 8×8; #12A35C`.
- Title: "No programs match these filters" (20px/800, margin-top 6).
- Hint: "Try raising the fee limit or removing a filter." (14px, `#4A4867`, max-width 380).
- Buttons (`gap:8px`, wrap, centred, margin-top 6):
  - "Clear filters" (a div): `padding:11px 16px; radius 11; #5B4CF0; #fff; 700`.
  - "Find my fit" (`<a>` → Recommender): `padding:10px 16px; radius 11; border 1px #D6D0FA; 700`.

#### 1.1.2 Logic details (lines 116–135)
- Search matches `(title + ' ' + university full name + ' ' + specs.join(' ')).toLowerCase().includes(q)`. It does not include the stream or the uni short name.
- Fee rule: `c.fee <= max`.
- Sort:
  - `rel` keeps catalog order with no ranking.
  - `low` and `high` sort by fee.
  - **`rating` sorts by `b.rating - a.rating`**.
- Program card (shared UVCard, covered elsewhere): "View details" and "+ Compare" / "✓ In compare". It has **no "Apply now" button**. It shows the "UGC-entitled" pill and ★ rating (reviews).

#### 1.1.3 Accessibility in the design (missing almost everywhere)
- Filter options, chips, "Clear all", the mobile "Filters" toggle, "Show N results", "Clear filters" and tray remove icons are all `div`/`span` with onClick. They have no role, are not keyboard focusable, and have no `aria-pressed`, `aria-expanded` or `aria-controls`.
- Fake checkboxes have no `role="checkbox"` or `aria-checked`. There is no fieldset or legend per group.
- The search input and both sort selects are unlabelled. The range has no label or `aria-valuetext`.
- The result count is not a live region.
- Target sizes: option rows are about 36px, chips about 29px, tray close icons 16px. All are below the 44px minimum (C11).
- Present: decorative logos use `alt=""`, and skeletons use `aria-busy`.

### 1.2 Current implementation

#### `src/app/courses/page.tsx`
- Server component with `force-dynamic` and `getPublishedCatalog()`.
- JSON-LD `ItemList` of `Course` items (lines 27–41). Metadata: title "Online Degree Courses", canonical `/courses`.
- Hero: white, 28px, H1 "Online degree courses" (28px/700, `#363634`). Breadcrumb "Home > Courses". A "Not sure? Find my course" pill links to `/recommender`.
- A **collapsed `<details>` "Quick comparisons"** holds four links to `/compare?add=mba-muj,mba-amity` and similar (lines 65–81).
- Body renders `<CourseExplorer courses={items}/>`.

#### `src/components/course-explorer.tsx` (client)
- **URL state, written back to the URL:** `q`, `level` (repeatable or comma list), `stream`, `university` (accepts an id or a short name), `maxFee`, `sort` (`feeAsc`/`feeDesc`; relevance is the default). Updates use `history.pushState`; search and slider changes use `replaceState`.
- Old `?sort=popular` and `?sort=rating` fall back to relevance (comment at lines 15–17).
- Filters: Degree level ("Undergraduate (UG)" / "Postgraduate (PG)"), Stream (derived from data), University (short names).
  - Native checkboxes in `<label>` elements with live counts. `countMatches({group:[value]})` uses the same semantics as the design.
  - **There is no "Degree" group.**
- Fee range: `0…feeCeiling`, where the ceiling is derived from data and rounded up to ₹1,000. Step 1000. It has `<label htmlFor="course-max-fee">Maximum total tuition`, and "Up to ₹X" below.
- Search: a 40px input in the results toolbar with `aria-label="Search courses"`, `maxLength 200` and placeholder "Search courses, universities or streams…". It matches name, shortName, stream, uni name, uni shortName and specs.
- Sort: `<select aria-label="Sort courses">` with relevance, fee low→high and fee high→low. **"Highest rated" has been removed (C5).**
  - Relevance order: names that start with the query, then names that contain it, then by name, then by fee.
- Result count: `<p role="status" aria-live="polite">{n} of {total} programs</p>`. It uses the real total, not a hard-coded 30. The line "Tuition shown. Check each program for current fees and eligibility." follows.
- Chips: `.uv-filter-chips` buttons with `aria-label="Remove X filter"`, 44px min-height. They include a "Search: q" chip.
- Cards: **list rows**, not a grid (`.uv-course-list-card`, `56px 1fr auto`).
  - Content: logo, level pill, stream, SaveButton (heart), "{name} — {uni name}" link, fee/duration/"Financing: ₹…/mo", ★ rating (reviews) (quiet), up to 4 spec pills.
  - Actions: **View details**, **Apply now** (`/lead?course=…&intent=enquire`, `data-open-lead`), and the link "+ Add to compare" → `/compare?add={id}`, which navigates away.
- Empty state: `/states/no-course-matches.webp`, the text "No courses match this selection. Remove a filter above or start again." and the button "Reset search and filters".
- Mobile (≤900px CSS): a `.uv-filter-toggle` button with `aria-expanded`/`aria-controls`, "Filters (n)". The panel shows inline when open, Escape closes it and returns focus, and "Show N results" (`.uv-filter-apply`) closes it.
- Analytics: `course_filter_applied`, `course_search`, `course_card_click`, `compare_course_added`.
- **There is no compare tray and no client-side compare store.** Compare state lives only in the `/compare?add=` URL. A shortlist store exists (`use-shortlist.ts`, localStorage plus event).

#### Current features the design lacks
- Shareable URL state with back-button support.
- Real total count; aria-live count.
- Search chip.
- Data-derived fee range.
- Apply now per card.
- Analytics events.
- ItemList JSON-LD.
- Escape and focus management on the mobile panel.

### 1.3 Changes required (Courses)
1. **Hero (`courses/page.tsx`)**
   - Replace the white hero with the design gradient hero: breadcrumb with chevron icons, H1 at clamp(30px,4.2vw,44px)/800, and a subtitle. Use corrected copy (see 1.4).
   - Move search out of the results toolbar into the hero as the 52px box. Keep `aria-label` (or a visually hidden `<label>`), `type="search"`, `maxLength 200` and the URL `q` write. Wrap it in `role="search"`.
   - Restyle the recommender link as the 52px outline button. Label: "Not sure? Find my fit" vs the current "Find my course" (see 1.4 Q).
   - Replace the collapsed `<details>` with the always-visible horizontally scrollable "Quick compare" chip row (`overflow-x:auto`; make it keyboard scrollable or have the chips focusable). Keep it as `<a>` links. The target is a decision (1.4 Q4).
2. **Layout**
   - Change the `.uv-courses-layout` grid from 250px to `270px 1fr` with a 28px gap.
   - Use a 1240px container with clamp padding and 120px bottom padding only when the tray shows.
   - Use the CSS breakpoint at 859px instead of 900px. Avoid the design's flex-wrap: between about 860 and 890px it wraps the results below the sidebar.
3. **Filter sidebar (`course-explorer.tsx`)**
   - Restyle: radius 16, padding 20, 22px gap, uppercase 12px group titles, 14px/600 option rows, 9px radius with `#F8F7FD` hover, count in 12px `#8E8CA8`.
   - Keep **native checkboxes**. Visually style them as the 20×20/6px-radius box with `accent-color` or a custom pseudo-element. Each group becomes a `<fieldset><legend>`. Make each row's hit area at least 44px tall (design is about 36px).
   - Add a **"Degree" group**. Derive the options from the catalog (`courseKey(course.name)` or `shortName`) rather than the design's hard-coded 7, which drops MA/MSc/BA JMC/B.Com Honours. Add a URL param (e.g. `degree=mba`) with live counts.
   - University labels: the design uses full names, the current code short names. Full names are fine with `overflow-wrap`.
   - Range: keep the label. Add `aria-valuetext="Up to ₹X"`. Show the min/max line ("₹75,000" ··· "Up to ₹2,75,000") with the min **derived** from the catalog minimum, not hard-coded. Step 5000 instead of 1000 if desired; derive and round min and max to 5,000.
   - Decide whether the sidebar stays sticky. Current: sticky at `top:88`. Design: not sticky.
4. **Results toolbar**: "{n} of {total} programs" (bold), then " · Tuition shown. …" (13px `#6F6D8C`), with the sort select on the right (radius 10). Keep `role="status"`. Keep 3 sort options (no "Highest rated").
5. **Chips**: restyle to the `#ECE9FE` / `#5B4CF0` 13px/700 pill with an × icon. Keep `<button>`, `aria-label` and the 44px target (`min-height:44px`; can be visually smaller with padding). Keep the "Search:" chip.
6. **Cards**
   - Switch the list rows to the UVCard grid (`auto-fill minmax(min(100%,300px),1fr)`, gap 14), using the shared card component built from UVCard.
   - Decide whether the card keeps **Apply now** (see 1.4 Q5).
   - Keep server-rendered results with no skeletons on first paint. Use the UVCard skeleton (with `aria-busy`, reduced-motion shimmer off) only for a Suspense fallback or for client transitions if any.
7. **Empty state**: replace the webp with the CSS illustration (`aria-hidden="true"`) or keep the webp (1.4 Q6).
   - Title "No programs match these filters". Hint "Try raising the fee limit or removing a filter."
   - "Clear filters" as a `<button>` that clears URL params. "Find my fit" as a link to `/recommender`.
8. **Mobile (<860)**
   - Toolbar row with the "Filters (n)" button (keep `aria-expanded`/`aria-controls`) and the sort select beside it (labelled).
   - The panel expands inline. "Show N results" goes last, at 44px or more.
   - Keep the Escape handling and focus return.
9. **Compare tray (new)**
   - New client compare store, for example `src/lib/use-compare.ts` modelled on `use-shortlist.ts`: localStorage key, a window event, max 3, FIFO drop of the oldest. **Default empty.**
   - New `<CompareTray>`, rendered on `/courses` (and wherever cards render), styled exactly as in 1.1 item 4.
   - Chip remove = `<button aria-label="Remove {name} {uni} from comparison">` with a 44px hit area.
   - CTA `<Link href="/compare?add={ids}">`. Use the real ids in the URL so the selection is shareable and SSR-able.
   - When n = 1: disable the CTA or change its text to "Add one more to compare", because the gate needs 2 or more (`CompareGate`).
   - Hide or suppress `StickyCtas` while the tray shows, and on mobile make sure the tray does not overlap the safe area. Add `padding-bottom` to `main` only when the tray is visible.
   - Wire the card's "+ Compare" toggle to the store instead of navigating to `/compare?add=`. Keep the `compare_course_added` event.
10. **URL param aliases**: the design's Home links use `/courses?lvl=&stream=` and `?degree=`. Either accept `lvl`→`level` and `uni`→`university` as aliases in `readList`, or make Home emit the existing names. Keep `/courses` as the path.
11. **Icons** via lucide (0.2). **Fonts** via next/font.

### 1.4 Conflicts and questions (Courses)
1. **"Highest rated" sort** (`Courses.dc.html:41,72,121`): conflicts with C5. Remove it and keep relevance → fee. Note that the design's "relevance" is unsorted catalog order. Keep the current relevance ranking.
2. **Subtitle "Every UGC-entitled program from MUJ, SMU and Amity…"** (line 23): a blanket UGC-entitled claim. T2 removed blanket "UGC-entitled" wording, and recognition is per program and dated (C8). Suggest "Online degree programs from MUJ, SMU and Amity, with listed tuition and EMI."
   - The same issue applies to the UVCard "UGC-entitled" pill on every card. That belongs to the shared component; flag it to that owner. It should derive from `recognitionSummary(course)` (for example "UGC-DEB 2026-27: listed" only when the published result says so).
3. **Default compare list `['mba-muj','mba-smu','mba-amity']`** (`uv-data.js:54`): the tray would always show and would pre-select three MBAs. Default must be empty.
4. **Quick compare targets** (line 114): `Compare?ids=…` is the gated interactive tool (C3).
   - Option A: keep `/compare?add=…` (current behaviour; the user sees the unlock card).
   - Option B: link the **public editorial pages**, for example `/compare/mba/amity-online-vs-manipal-university-jaipur`. Pair slugs are sorted by university id (`comparisons.ts:33,41`), so "MUJ vs Amity" becomes `amity-online-vs-manipal-university-jaipur`, and "MCA: MUJ vs SMU" becomes `/compare/mca/manipal-university-jaipur-vs-sikkim-manipal-university`.
   - Owner decision needed. Option B gives users ungated, SEO-friendly content.
5. **Card actions**: the design card has View details and + Compare only. The current card also has **Apply now** (the generic CTA, C1). Should the redesigned card drop the per-card Apply now? The design omits it, which would reduce conversion entry points. Question for the owner.
6. **Empty-state illustration**: the design's CSS illustration replaces the existing `/states/no-course-matches.webp` asset. Either works. The CSS version needs `aria-hidden` and no motion.
7. **Hard-coded "of 30 programs"** (line 71) and the hard-coded fee range ₹75,000–₹2,75,000 (line 62): use catalog-derived values. CMS edits can change the totals; for example, the MAJMC Amity fee correction in plan U3 would change ranges.
8. **Filter state not in the URL** in the design: conflicts with the current shareable and back-navigable behaviour and with DESIGN_AND_CONTENT_STANDARD §45. Keep the current URL writing. The design's param names (`lvl`, `uni`, `degree`, single-valued) also differ from the current ones (`level`, `university`, multi-valued). Keep the current names and add aliases.
9. **"Find my fit" naming**: the site uses "Find my course" everywhere (header, footer, about, universities, course rail). The recommender has 5 questions, not 4 (C10). Rename site-wide, or keep "Find my course"? Owner or naming decision needed.
10. **Accessibility** (1.1.3): every interactive div or span must become a native control, and targets must be at least 44px. The design shows only the visuals.
11. **Not in the design but present today**: the search chip, ItemList JSON-LD, analytics, Escape and focus management on the mobile panel, and the aria-live count. Keep them all.
12. **Ambiguous**: the design's "Clear all" does not reset sort, while the current `clearFilters()` also clears `sort`. The design's mobile "Filters (n)" counts chips (including max fee but not q), while the current count includes q. Pick one.

---

## 2. Course detail (`Course.dc.html`) → `/courses/[slug]`

### 2.1 Design spec

#### Route
- Design route: `/course?id=mba-muj` (README:178). It falls back to `mba-muj` when the id is unknown (line 161).
- **Must stay `/courses/[slug]`** (C10), returning `notFound()` for an unknown slug, as today.

#### Data derived (lines 161–191)
- `key = c.id === 'mba-muj'` turns on the "verified" variants: the eligibility tag, credits, career salary tiles, certificate and reviews.
- `sems = months/6`.
- The `about` text is templated (line 166): "{title} from {uni name} is a {months} months, UGC-entitled online degree designed for {graduates and working professionals | school-leavers and early-career learners} who want flexible learning, online assessments, and career-focused support without relocating."

#### Structure, top to bottom

**1. Header**: UVHeader `active="courses"`.

**2. Hero section** (lines 19–45)
- Background: `radial-gradient(520px 280px at 0% 0%,#ECE8FF 0%,rgba(236,232,255,0) 70%), linear-gradient(180deg,#F7F5FF,#FBFAFF)`. **Light**; the current hero is dark (`.detail-hero{background:var(--uv-dark)}`).
- Inner padding: `22px clamp(16px,3vw,32px) 0`.
- Breadcrumb (wraps): Home › Courses › "{c.title}".
- Two-column grid: `repeat(auto-fit,minmax(min(100%,440px),1fr)); gap:clamp(24px,4vw,48px); align-items:center; margin-top:20px`.
- **Left column**
  - Row (gap 12): logo tile `56×56; border-radius:14px; background:#fff; border:1px solid #ECEAF6; padding:8px` (img `alt=""`). Beside it, the uni name link (15px/700 → university page) and location below it (13px `#6F6D8C`, for example "Jaipur, Rajasthan").
  - H1 "{c.title}" (for example "Online MBA"): `margin:18px 0 0; font-size:clamp(34px,4.6vw,52px); letter-spacing:-0.04em; font-weight:800; line-height:1.04`.
    - The H1 is "Online MBA" only. The university is not in the H1. The current H1 is also `{course.name}`, so this is the same.
  - Meta row (`flex-wrap; gap:8px; margin-top:14px; font-size:14px; color:#4A4867`): `<b style="color:#16133F">★ 4.7</b>` "(1,420 reviews)" · "Postgraduate degree" · "100% online".
  - About `<p>`: `margin:14px 0 0; color:#4A4867; font-size:16px; line-height:1.65; max-width:560px`.
  - Buttons (`flex-wrap; gap:10px; margin-top:22px`):
    - **Apply now** (`<a>` → Apply?course=id): `padding:13px 20px; border-radius:11px; background:#5B4CF0; color:#fff; font-weight:700; gap:6px`, then `arrow_forward` at 20px. Hover `#4A3BDB`.
    - **Compare** (`<a>` → `Compare?add=id`): `padding:12px 18px; border-radius:11px; border:1px solid #D6D0FA; background:#fff; font-weight:700; gap:6px`, with the icon `compare_arrows` at 20px before the text.
    - **Shortlist toggle** (a `<div>` with onClick): same style plus `color:#5B4CF0`. Icon `bookmark`/`bookmark_added`. Label "Shortlist"/"Shortlisted".
- **Right column**
  - Campus `<img alt="">`: `width:100%; aspect-ratio:16/10; object-fit:cover; border-radius:22px; background:#ECE9FE`.
  - **Approval badge stack** absolutely positioned at `right:12px; top:12px; flex-direction:column; gap:8px`. Each badge: `background:#fff; border-radius:12px; padding:9px 14px; font-size:13px; font-weight:700; box-shadow:0 10px 24px -12px rgba(0,0,0,0.3); gap:8px`, with `verified` (18px, `#12925A`) before the text. Values = `u.approvals.slice(0,3)`; for MUJ: "UGC-entitled", "NAAC A+", "AICTE".
- **Stat strip** (line 41): `display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr)); background:#fff; border:1px solid #E8E6F3; border-radius:16px; margin-top:32px`.
  - Each cell: `display:flex; gap:12px; align-items:center; padding:16px 18px; border-right:1px solid #F0EEF8`.
  - Icon tile `40×40; radius 10; #F1EEFF; #5B4CF0; 22px`. Value 17px/800. Label 12px `#6F6D8C`.
  - Cells (line 172): `schedule` "24 months"/"Duration"; `payments` "₹1,80,000"/"Total fee"; `credit_card` "₹7,500/mo"/"**No-cost EMI**"; `school` "PG degree"/"Postgraduate"; `laptop_mac` "100% online"/"**Proctored exams**".

**3. Sticky section tabs** (lines 46–50)
- `position:sticky; top:68px; z-index:20; background:rgba(255,255,255,0.97); border-bottom:1px solid #ECEAF6; margin-top:24px`.
- Inner: container with `display:flex; gap:26px; overflow-x:auto`.
- Tab (a `<div>` with onClick): `white-space:nowrap; padding:15px 0; font-size:14px; font-weight:700`. Colour is `#5B4CF0` when active, otherwise `#4A4867`. `border-bottom:2px solid` `#5B4CF0` when active, otherwise transparent. This is an underline style, not pills.
- Tabs (line 163): Overview, Eligibility, Admission, Specialisations, Fees & EMI, Careers, **Reviews** (points to `sec-careers` when the course is not mba-muj), FAQ.
- Click: sets the active state, then `window.scrollTo({top: el.top + scrollY - 130, behavior:'smooth'})`.
- **No scroll-spy.** The active tab changes only on click. There are no `<a href>` links, so it does not work without JS, and there is no `aria-current`.

**4. `<main>`** (line 51): `padding:32px clamp(16px,3vw,32px) 0; display:flex; flex-wrap:wrap; gap:32px; align-items:flex-start`.
- Main column: `flex:999 1 600px; min-width:0; display:flex; flex-direction:column; gap:20px`.
- Every section is a card: `border:1px solid #E8E6F3; border-radius:18px; padding:24px`. Card H2: `22px/800; letter-spacing:-0.02em`.
  1. **`#sec-overview`**: a grid of two cards (`auto-fit minmax(min(100%,300px),1fr)`, gap 20).
     - "About this program": the `about` paragraph (`margin-top:10px; 15px; line-height:1.7; #4A4867`), then an approvals row (`flex-wrap; gap:16px; margin-top:18px`). Each approval is a 38px circle (`#F1EEFF`, `workspace_premium` at 20px) with text at 14px/700.
     - "Key highlights" (h2 `margin-bottom:12px`): rows `display:flex; justify-content:space-between; gap:12px; padding:10px 0; border-bottom:1px solid #F3F2F9; font-size:14px`, key `#6F6D8C`, value bold and right-aligned. Rows (line 174):
       - Mode "100% online"
       - Semesters "4 semesters"
       - Credits "80-90 credits" (mba-muj) or "As per university"
       - Exams "Online proctored"
       - Application fee "₹500" (every course)
       - Batches "January & July"
  2. **`#sec-eligibility`**: H2 "Eligibility" plus a tag (`11px/800; letter-spacing:0.05em; padding:4px 8px; border-radius:6px`):
     - mba-muj: "SOURCE VERIFIED" (`#E7F6EE`/`#12784B`).
     - Otherwise: "CONFIRM WITH COUNSELLOR" (`#FFF4E5`/`#A35A0B`).
     - Body row (gap 14, margin-top 14): a 44×44 `school` tile (radius 12) and the text (15px, line-height 1.7, `#2B2950`).
     - Text is hard-coded (line 164). mba-muj: "Bachelor's degree (10+2+3) in any discipline with a minimum of 50% marks (45% for reserved categories). No work experience or entrance test required." PG fallback: "Bachelor's degree from a recognised university. Confirm the minimum percentage and any subject requirements for your case with a counsellor before applying." UG fallback: "10+2 from a recognised board. Confirm the minimum percentage …"
  3. **`#sec-admission`**: H2 "Admission process", then a grid (`auto-fit minmax(min(100%,170px),1fr)`, gap 14).
     - Step tile: `padding:16px; border-radius:14px; background:#F8F7FD`. A 28px number circle (`#5B4CF0`, 13px/800) and an icon at 22px. Title 800 (margin-top 12). Description 13px, line-height 1.55, `#4A4867`.
     - Steps from `UV.ADMISSION` (`uv-data.js:74-79`):
       1. `edit_document` "Application": "Fill basic, education, and work-experience details and pay the application fee."
       2. `payments` "Fee payment": "Pay first semester/year fee or full program fee through available payment/EMI options."
       3. `upload_file` "Document upload": "Upload academic documents, ID proof, and other requested records."
       4. `verified` "University approval": "The university evaluates documents and confirms admission."
  4. **`#sec-specs`**: H2 "{n} specialisations" (or "Specialisation" if General).
     - Subtitle "Confirm specialisation choices, timing and any fee differences for your admission session." (`margin:6px 0 16px; 14px; #6F6D8C`).
     - Grid `auto-fill minmax(min(100%,220px),1fr)`, gap 8. Each item is an `<a>` tile: `display:flex; justify-content:space-between; padding:12px 14px; border-radius:12px; border:1px solid #E8E6F3; 14px/700; #16133F`, ending with `arrow_forward` (18px, primary). Hover: border and text `#5B4CF0`.
     - href `Specialization?key={slugify(short-spec)}`. "General" is linked too.
  5. **`#sec-fees`**: header row with H2 "Fees & EMI options" and "Open EMI calculator →" (14px/700, → `EMICalculator?id={id}`).
     - Plan grid (`auto-fit minmax(min(100%,190px),1fr)`, gap 12, margin-top 16). Tile: `padding:18px; border-radius:14px; border:1.5px solid {bd}; background:{bg}`. Name 14px/700 `#4A4867`. Optional tag `11px/800; padding:3px 7px; radius 5; #12925A/#fff`. Big value 24px/800 (margin-top 10). Small line 13px `#6F6D8C`.
       1. "Full payment" + tag "**Save 2%**", big = fee × 0.98 (for example ₹1,76,400), small "one-time". Green border `#12925A`, background `#F3FBF6`.
       2. "Semester-wise", big "₹45,000 /sem", small "4 payments · ₹1,80,000 total".
       3. "No-cost EMI", big "₹7,500/mo", small "subject to lender approval".
     - Footnote (13px `#6F6D8C`): "Payment plans and scholarships depend on current university terms and eligibility. Confirm the total payable and financing charges before applying."
  6. **`#sec-careers`**: H2 "Placements & career outcomes".
     - Tile grid (`auto-fit minmax(min(100%,150px),1fr)`, gap 10). Tile `padding:16px; radius 14; #F8F7FD`, value 22px/800, label 13px `#6F6D8C`. Tiles: "88%" "placement assistance rate"; "₹7.2 LPA" "average package"; "320+" "hiring partners" (only when partners is not "—").
     - mba-muj only: role grid (`minmax(200px)`, gap 10, margin-top 12). Row `padding:14px 16px; border; radius 12`, role 14px/700 and pay 14px/800 `#12784B`: Business Manager ₹6-11 LPA, Marketing Manager ₹7-14 LPA, Finance Analyst ₹5-10 LPA, Operations Lead ₹8-15 LPA.
     - Footnote: "Placement assistance, not a guaranteed offer — as stated on the university's own pages."
  7. **Certificate** (mba-muj only; no id or tab): a 2-column grid (`minmax(260px)`, gap 20).
     - H2 "Sample degree certificate", text "Any sample shown is for reference. Confirm the current certificate wording and program recognition with the university." (14px, line-height 1.65).
     - img `alt="Sample certificate"`: `aspect-ratio:4/3; object-fit:contain; radius 12; border; #F8F7FD`.
  8. **`#sec-reviews`** (mba-muj only): H2 "Student reviews" with "★ 4.7 · 1,420 reviews" on the right.
     - Grid `minmax(260px)`, gap 12. Card `padding 18; radius 14; #F8F7FD`: 36px initials avatar (`#ECE9FE`/`#5B4CF0`), name bold, stars `#F0A30A`, text 14px.
     - **"Sneha Iyer ★★★★★ – Classes are genuinely live, not just recordings…"** and **"Rohit Verma ★★★★ – Good curriculum and the EMI made it affordable…"** (line 183).
- **Sidebar `<aside>`** (lines 115–131): `flex:1 1 300px; position:sticky; top:132px; display:flex; flex-direction:column; gap:14px`.
  - Card: `border:1px solid #E4E1F3; border-radius:18px; padding:22px; box-shadow:0 20px 44px -28px rgba(60,45,170,0.45); background:#fff`.
    - "Total program fee" (13px/600 `#6F6D8C`).
    - Fee "₹1,80,000" (32px/800, `letter-spacing:-0.03em`).
    - Pill "No-cost EMI from ₹7,500/mo" (`inline-flex; margin-top:6px; padding:5px 10px; radius 8; #E7F6EE; #12784B; 13px/700`).
    - Buttons (column, gap 8, margin-top 18):
      - **"Start application enquiry"** (primary, `padding:14px; radius 11`, centred).
      - **"Call 1800-120-4050"** (`tel:18001204050`, outline, `call` icon).
    - Divider (`margin-top:18px; padding-top:16px; border-top:1px solid #F0EEF8`).
    - "Why learners pick {uniShort}" (800). Three rows with `check_circle` (18px `#12925A`): "UGC-entitled, NAAC A+", "88% placement assistance rate", "Financing: ₹7,500/mo".
    - Note "Submitting an enquiry does not confirm university admission." (12px `#8E8CA8`).
  - Recommender card (`<a>` → Recommender): `border-radius:18px; padding:18px; background:#F4F2FF; gap:12px`. `auto_awesome` (28px primary), "Not sure this is the one?" (800), "Answer a few questions to explore matches." (13px `#4A4867`), `arrow_forward`.
  - Because of flex-wrap, the aside drops **below** all the main cards when the viewport is under about 960px. It stays sticky there, which has no visible effect.
- **Similar programs** (line 132): section `flex:1 1 100%; margin-top:28px`.
  - H2 "Similar programs to consider" (`clamp(22px,3vw,28px)`, -0.025em, 800, margin-bottom 18).
  - Grid of UVCards (`minmax(300px)`, gap 14), 3 items: same degree first, then the same stream and level.
- **FAQ** `#sec-faq` (`margin-top:40px`): UVFaq with title "Frequently asked questions" and subtitle "Quick answers about the {title} at {uniShort}." Items (lines 187–190):
  1. "Is the {title} from {uni} UGC-entitled?" → "Yes — this program is listed as a UGC-entitled online degree, legally equivalent… Always verify current-cycle entitlement before enrolling."
  2. "How much does the {title} cost, and can I pay in EMI?" → "…no-cost EMI available from {emi}, subject to lender approval."
  3. "What are the eligibility requirements?" → `elig`.
  4. "How long does it take to complete?" → "…with online-proctored exams…"
  5. "Are classes live or recorded?" → "Programs combine live sessions with recorded lectures…"
  6. "Can I speak to an expert?" → "Yes. **Call 1800-120-4050** or request a callback — counselling is free."

**5. Mobile (<860) bottom bar** (lines 140–145)
- `position:sticky; bottom:0; z-index:30; background:#fff; border-top:1px solid #E8E6F3; padding:10px 16px; display:flex; align-items:center; gap:12px; box-shadow:0 -10px 30px -20px rgba(22,19,63,0.4); margin-top:24px`.
- Left: fee (18px/800) and "EMI ₹7,500/mo" (12px/700 `#12784B`).
- Right: **Apply now** (`padding:13px 20px; radius 11; primary`).

**6. Footer.**

#### 2.1.1 Accessibility in the design
- Tabs are divs, not links. There is no `nav` landmark, `aria-current`, or keyboard support.
- The Shortlist toggle is a div with no `aria-pressed`.
- Campus and logo images use `alt=""` (acceptable as decorative).
- Smooth scrolling ignores reduced motion.
- No mobile alternative to the scrolling tab strip (the current code has a "Jump to section" select at ≤640px).

### 2.2 Current implementation (`src/app/courses/[slug]/page.tsx` and components)

#### Metadata and structured data
- `generateMetadata` uses `fitTitle` and `withSocial`, a canonical `/courses/{slug}`, and the OG image from the campus.
- JSON-LD: `Course` (an Offer pointing to the course page, **no AggregateRating**), `BreadcrumbList` and `FAQPage`.

#### Hero (dark `.detail-hero`)
- Breadcrumb.
- **Recognition chip** (`.uv-recognition-chip` → `#sec-recognition`, text from `recognitionSummary`, for example "UGC-DEB 2026-27: listed · checked 5 Oct 2026" or "program status being re-checked for 2026-27").
- Logo 60px, H1, uni link · city, SaveButton (heart).
- Meta: "★ 4.7 (1420 reviews) · 52,000+ learners across MUJ online programs".
- Then a white **4-stat band**: Duration, Total fee, **Financing**, Level.
- **No campus image and no approval badges in the hero** (UI fix 5: one program-level chip instead of 4 university badges).

#### `SectionPillNav` (`src/components/section-pill-nav.tsx`)
- Sticky (`top:68px`), `<nav aria-label="Course sections">` with `<a href="#…">` pills, `aria-current="location"`, and a scroll-spy.
- At ≤640px it is replaced by a labelled "Jump to section" `<select>`.
- 7 items (increment 77): Overview, Eligibility, Study, Fees & EMI, Recognition, Admission, Careers.
- `.detail-section{scroll-margin-top:130px}` (146px at ≤640).

#### Main stack (`.detail-layout.course-reading-layout`, sections without card borders)
1. `#sec-overview` "About this program": `programOverview(course)` (CMS text with "UGC-entitled" stripped), a learning image (`/hero/student-online-degree.webp`), and a fact grid:
   - Mode 100% online
   - Semesters
   - Credits `programCredits` ("Confirm with the university" unless program-specific)
   - Exams **"Confirm with the university"**
   - Application fee `programApplicationFee` ("₹500 non-refundable (Indian applicants)" for MUJ/SMU only)
   - Batches (enrichment or "January & July")
   - **Next intake** ("{label} · apply by {date}" or "Not yet announced")
2. **"Four checks before you apply"** decision guidance (increment 77): 4 numbered cards linking to `#sec-eligibility`, `#sec-fees`, `#sec-curriculum` and `#sec-recognition`, with copy that varies by verification state.
3. `#sec-eligibility`:
   - "SOURCE VERIFIED" badge only if `dataQuality.eligibility === "verified"`. Otherwise no badge.
   - `course.eligibility` text, then the source line "Source: {host} · checked {date}".
   - **"Check my academic profile"** → `/tools/eligibility-checker?course=…`, with a note about rule status.
4. `#sec-specialisations` (not in nav): "{n} specialisations", a sub-line, tiles "Confirm availability for your admission session", links to `/specializations/{key}-{spec}` ("General" is not linked), and the optional `programDetails.specialization` sourced card (increment 79).
5. `#sec-curriculum`: "Curriculum" or "Illustrative study areas" (`<details>` accordion, `name` grouped), with the source line when verified.
6. "Classes and assessments": optional sourced Learning format and Assessment cards (increment 79), plus "Questions to confirm".
7. `#sec-fees` "Fees & EMI options":
   - **`CategoryFeeSelector`** (native radios: Indian/NRI/Foreign or Indian/International, total and per-semester, notes, source and checked date, "Plan the total cost for this category →" link to `/tools/total-cost?course=&category=row-n`). Only when `categoryFees` is published, otherwise the fee source line.
   - Fee plan cards (`programFeePlans`, with the "Full payment (2% off)" template filtered out).
   - "Check the total payable" `<dl>` (tuition, application fee, other mandatory charges).
   - Optional sourced "Possible charges beyond tuition".
   - Footnote (same copy as the design).
   - Links: "Plan total cost for your fee category →" (when there are no category fees), "Open EMI calculator →" (`/tools/emi-calculator`, **no course param**; the calculator does not read one), and the fee guide and eligibility guide links.
8. `#sec-recognition` **Recognition**: the published UGC-DEB result (list name, listed under, programme as printed, official source and checked date, re-check caveat) or `RECOGNITION_STATUS_2026_27`, plus "{uni} university-level approvals →".
9. `#sec-admission`: 4 steps from `universityEnrichment.admissionSteps` (fallback: Apply online / Upload documents / Pay first semester / Start learning).
10. `#sec-careers` "Career outcomes":
    - "Salary bands are indicative industry ranges, not verified for this program or university."
    - `careerRoles` with `careerRoleSalary` (all courses).
    - "University-wide figures reported by {uni}, not specific to this program: 88% placement assistance rate · average package ₹7.2 LPA · 320+ hiring partners".
    - Career scope guide link.
11. `#sec-related-guides`: the UGC-approval guide and **editorial comparison pair links** (`/compare/{key}/{slug}`).
12. `#sec-certificate`: for **all courses**, with an image if it exists or a placeholder. Copy adds "Requirements for employment, further study and overseas evaluation depend on the receiving organisation."
13. The reviews section was **removed** (comment at lines 484–485).
14. Similar programs: same shortName only, as simple link cards ("{name} — {uni}", duration · fee · ★).
15. `#sec-faq`: `buildCourseFaqs` (6 Q&As: recognition answer from `recognitionSummary`, cost/EMI, specialisations, eligibility + "Confirm … with a counsellor", career roles, duration + "Confirm the exam format with the university"). Native `<details name>`. **No phone.**

#### Right rail (`.course-reading-rail`, `position:static`, not sticky)
- `CourseEnquiryCard`: "Start your application enquiry" h2, copy, **Apply now** (`data-open-lead`), "Our team will follow up. Submitting an enquiry does not confirm university admission."
- "Compare with similar programs" → `/compare?add={id}`.
- "Why learners pick {uni}" (approvals[0..1], placement %, "Confirm live-class schedules with the university", Financing). **Placement is not labelled university-wide here**, which is a current gap.
- Gradient "Not sure this is the one?" / "Answer three questions…" / "Find my course".

#### Mobile
`StickyMobileBar` (fixed, ≤640px): **Compare** (secondary) + **Apply now** (primary). No fee.

### 2.3 Changes required (Course detail)
1. **Hero**
   - Switch to the light gradient hero and two-column grid.
   - Logo tile 56/14 with border, uni link plus `city`, H1 at clamp(34px,4.6vw,52px)/800/-0.04em.
   - Meta row: ★ rating (reviews) · "{Postgraduate|Undergraduate} degree" · "100% online".
   - About paragraph: use `programOverview(course)`, not the design template.
   - Buttons: Apply now (`<Link href="/lead?course={id}&intent=apply_now" data-open-lead rel="nofollow">`), Compare (`/compare?add={id}`, or the new store toggle), and Shortlist (convert the `SaveButton` variant to a labelled outline button with `aria-pressed`, "Shortlist"/"Shortlisted").
   - **Keep the recognition chip** (C8). Place it in the meta row or above the H1, restyled for a light background. The current chip colours (`#fdd77a` text, gold border) are designed for the dark hero and need new light-theme colours with AA contrast.
   - Right column: the campus image via `next/image` (`universityMedia[id].src`, decorative `alt=""` or `universityMedia.alt`), aspect 16/10, radius 22. **Do not overlay institution approval badges** (see 2.4).
2. **Stat strip**: five cells with icon tiles. Labels: Duration; Total fee (consider "Listed tuition" when category fees exist); EMI (keep the current "Financing" label or the owner-approved "No-cost EMI" wording, see 2.4); Level; Mode "100% online", with a sub-label other than "Proctored exams" (for example "Online program" or the next-intake date).
3. **Section nav**
   - Restyle `SectionPillNav` as underline tabs: `gap:26px; padding:15px 0; 14px/700; #4A4867`, active `#5B4CF0` with a 2px underline, `background:rgba(255,255,255,.97)`, `border-bottom:1px solid #ECEAF6`.
   - Keep anchors, the scroll-spy, `aria-current`, the ≤640 select and `scroll-margin-top:130px`. Smooth scrolling only without reduced motion.
   - Item set: keep increment 77's seven (Overview, Eligibility, Study, Fees & EMI, Recognition, Admission, Careers). Optionally add "Specialisations" and "FAQ" from the design. **No "Reviews".** The `course-detail-ui-smoke.cjs` expectations will change.
4. **Main column cards**
   - Wrap each `.detail-section` in the 18px-radius bordered card with 24px padding and 20px gaps. H2 22px/800.
   - Overview: two-card grid. "About this program" plus approvals: replace the approval circles with the recognition result, or label them "University-level approvals". "Key highlights" rows (keyed list) keep the current values: Credits via `programCredits`, **Exams = "Confirm with the university"**, Application fee via `programApplicationFee`, Batches, **Next intake**. Optionally drop the learning image.
   - Keep the **"Four checks before you apply"** block, restyled as a card with the design tokens (number circle 28px `#5B4CF0` like the admission steps).
   - Eligibility: tag "SOURCE VERIFIED" only when `dataQuality.eligibility === "verified"`. The amber tag text should not say "counsellor" (see 2.4). The school icon tile plus `course.eligibility`. Keep the source line and the eligibility-checker button.
   - Admission: restyle as `#F8F7FD` tiles with a 28px number circle and icon, using `universityEnrichment.admissionSteps` data, not `UV.ADMISSION`.
   - Specialisations: link tiles with an arrow (`minmax(220px)`, radius 12). Keep `/specializations/{key}-{spec}`, the "General" non-link, and the `programDetails.specialization` card.
   - Keep Study/curriculum and Classes and assessments, restyled as cards (not in the design).
   - Fees & EMI: keep `CategoryFeeSelector`, restyled (radio pills on `#ECE9FE`, 44px). Restyle `programFeePlans` rows as the design's plan tiles (radius 14, 1.5px border, 24px/800 value) **without any Save 2% tile or computed plans**. Keep the "Check the total payable" box, the sourced charges card, the footnote and the planner, EMI and guide links. Header link "Open EMI calculator →" (optional new `?course=` support in `emi-calculator.tsx`, which currently starts with no selection).
   - Keep Recognition as its own card (not in the design).
   - Careers: three stat tiles **labelled "University-wide"** (for example a caption "University-wide figures reported by MUJ, not specific to this program"), plus role/pay tiles for all courses from `careerRoles`/`careerRoleSalary`, with the "indicative, not verified" caption. Footnote: "Placement assistance, not a guaranteed offer…" is fine to add.
   - Keep Related guides and comparison pair links, restyled as a card (not in the design).
   - Certificate: the design's two-column card. Show it for all courses where `publicAssetExists` (current behaviour). Use a better alt than "Sample certificate", for example "{course} sample degree certificate".
   - No Reviews section.
5. **Sidebar**
   - Make the rail sticky (`top:132px`) on desktop. `.course-reading-rail` is `position:static` today.
   - Card: "Total program fee" label, fee 32px/800, EMI pill, **one primary "Apply now"** (C1; replaces "Start application enquiry"). **No call button** (C2). Optionally a secondary "Compare with similar programs".
   - "Why learners pick {uni}" checklist with `check_circle`. Label the placement item "(university-wide)".
   - Note "Submitting an enquiry does not confirm university admission."
   - Recommender card: `#F4F2FF`, radius 18, `auto_awesome`, "Not sure this is the one?", "Answer a few questions to explore matches." → `/recommender`.
   - Below 860px, place the rail after the main column, non-sticky (current behaviour).
6. **Similar programs**: use the shared UVCard grid (3 cards) with the design's similarity rule (same degree, then the same stream and level). Never rank by rating. H2 at clamp(22px,3vw,28px).
7. **FAQ**: render the existing `buildCourseFaqs` through the shared UVFaq styling (two columns, one open at a time). Keep the FAQPage JSON-LD and the native `<details>` fallback. Subtitle "Quick answers about the {name} at {uni short}."
8. **Mobile bar**: extend `StickyMobileBar` (or add a variant) to show fee (18px/800) and EMI (12px/700 `#12784B`) on the left and **Apply now** on the right, at the design breakpoint (<860, currently ≤640). The current bar also has **Compare**; decide whether to keep it. Keep the fixed positioning, the safe-area padding and the body bottom padding.
9. Icons via lucide. No Google font links.

### 2.4 Conflicts and questions (Course detail)
1. **Phone CTA "Call 1800-120-4050"** (sidebar, `Course.dc.html:122`) and the FAQ answer "Call 1800-120-4050 or request a callback" (line 190): conflict with C2. Remove both. If a contact route is wanted, use admin@unnatividya.com.
2. **"Start application enquiry"** button label (line 121): conflicts with C1 (the generic CTA is exactly "Apply now"). The current card h2 "Start your application enquiry" is a heading, which is fine; the button must say "Apply now".
3. **"Full payment … Save 2%"** plan (line 179): conflicts with C6 (`programFeePlans` filters "Full payment (2% off)"). Remove it.
   - The **computed "Semester-wise ₹X /sem"** tile (fee ÷ semesters) and the **"No-cost EMI"** tile are derived values, not sourced plans. When category fees are published, the semester amount comes from `CategoryFeeSelector`. Show only `programFeePlans` (CMS) and category-fee data.
4. **Student reviews section and "Reviews" tab** (lines 106–113, 163, 183): conflict with C7. These are exactly the removed generic named reviews (Sneha Iyer, Rohit Verma). Remove the section and the tab.
5. **Approval badges overlaid on the campus image** (lines 36–38: "UGC-entitled", "NAAC A+", "AICTE" with a `verified` check). Also the approvals with `workspace_premium` in About (line 57) and "Why learners pick: UGC-entitled, NAAC A+" (line 184).
   - These conflict with C8 (institution badges must not imply program approval) and with UI fix 5 (one program-level recognition chip replaced the four badges).
   - "UGC-entitled" with a verified tick reads as a program claim. If university approvals are shown at all, label them "University-level approvals" and keep them away from the program hero, or show the program's dated UGC-DEB chip instead.
6. **About text "…a 24 months, UGC-entitled online degree … online assessments…"** (line 166): conflicts with T2 (no blanket "UGC-entitled" in the overview) and is a template. Use `programOverview(course)`.
7. **Key highlights template values** (line 174):
   - "Credits 80-90 credits" is in `TEMPLATE_CREDITS` and must show "Confirm with the university".
   - "Exams: Online proctored" and the stat "Proctored exams" (line 172), plus the FAQ "with online-proctored exams" (line 189), must show "Confirm with the university" (C6).
   - "Application fee ₹500" for every course: C6 allows ₹500 only for MUJ/SMU (Indian applicants). Amity shows "Confirm with the university".
   - "Batches January & July" is a hard-coded default (the current code falls back to the same). **Next intake** is missing (C10).
8. **Eligibility**: the hard-coded eligibility text (line 164) replaces the catalog's reviewed `course.eligibility`.
   - The "SOURCE VERIFIED" tag keyed to `mba-muj` ignores `dataQuality`.
   - The amber "CONFIRM WITH COUNSELLOR" label and the fallback copy "Confirm … with a counsellor" conflict with the site's "Confirm with the university" stance. The HowWeVerify design (another reviewer) defines "CONFIRM WITH COUNSELLOR" as a label, so this needs an owner decision. The current page shows no amber tag at all.
   - The design omits the source and checked-date line and the **eligibility checker** link (C10).
9. **Careers**
   - "88% placement assistance rate", "₹7.2 LPA average package" and "320+ hiring partners" appear without "university-wide" labelling (C4/C8).
   - Salary bands shown for mba-muj only (₹6-11 LPA and similar, line 181) lack the "indicative, not verified" label (C8) and differ from `careerRoleSalary`.
   - "Placement assistance, not a guaranteed offer — as stated on the university's own pages" is acceptable.
10. **FAQ answers**:
    - "Yes — this program is listed as a UGC-entitled online degree…" (line 187) conflicts with T3/C8. Use the `recognitionSummary(course).answer` dated status.
    - "Programs combine live sessions with recorded lectures" (line 190) is an unverified program-format claim, contrary to increment 79 (unanswered topics stay as questions).
11. **"No-cost EMI"** appears as a stat label (line 172), the sidebar pill "No-cost EMI from …" (line 119), the plan tile and the FAQ. C9 retains the existing no-cost EMI wording as an owner claim, but the standard (§81) says "Do not add new universal 'no-cost EMI' promises". The current page uses "Financing: ₹…/mo" in the stat band and rail and "no-cost EMI" only in the FAQ. **Owner question:** is the no-cost EMI label approved on every course page's stat strip, sidebar and mobile bar?
12. **Missing current features the design omits:**
    - Recognition section and hero chip (C8/C10).
    - `CategoryFeeSelector` (Indian/NRI/Foreign) (C10).
    - Source and checked-date lines (fees, eligibility, curriculum, sourced program-detail cards).
    - Next intake.
    - Eligibility checker link.
    - Total cost planner links.
    - "Four checks before you apply" decision guidance (increment 77).
    - Study/curriculum and "Classes and assessments" with "Questions to confirm" (increment 79 sourced cards).
    - "Check the total payable" box and "Possible charges beyond tuition".
    - Fee, eligibility, career-scope and UGC guide links.
    - Editorial comparison pair links.
    - Certificate for all 30 courses.
    - Learners line.
    - JSON-LD (Course, Breadcrumb, FAQPage).
    - The mobile "Jump to section" select.
    - Scroll-spy and `aria-current`.
    - All of these must be kept (C10). The design gives no visual treatment for them, so they need card styling derived from the design tokens.
13. **Sidebar fee vs category fees**: the 32px "Total program fee" shows the listed INR tuition. When a category other than Indian is selected in `CategoryFeeSelector`, the sidebar and mobile bar would disagree. Label it "Listed tuition (Indian applicants)", or show the selected category. Ambiguous; decide.
14. **Hero CTA trio vs rail**: the design has Apply now in the hero, the sidebar and the mobile bar (three places). The current page has the rail card, the mobile bar and the floating StickyCtas. Make sure the desktop floating "Apply now" (`sticky-ctas.tsx`) does not duplicate the sticky sidebar CTA ("one sticky action region at a time").
15. **Route**: the design's `/course?id=` and fallback-to-mba-muj must not be ported (C10). Keep `/courses/[slug]` with `notFound()`.
16. **Ambiguous**: the design sticky tabs show the "Reviews" tab even for non-MUJ courses (pointing to Careers), which looks like a prototype artefact. The tab bar is not hidden on mobile; the current page uses a select at ≤640px. Keep the select.

---

## 3. Compare (`Compare.dc.html`) → `/compare` (gated tool) and `/compare/[course]/[pair]` (editorial)

### 3.1 Design spec

#### Route and state
- Design route: `/compare?ids=a,b,c` | `?add=id` | `?uni=id` (README:192, logic lines 132–137).
  - `ids` gives a literal list.
  - `add=id` gives `[id, …every other course with the same short name]`, up to 3. In other words, it auto-fills same-degree siblings.
  - `uni=id` gives the first 3 **PG** programs of that university, which mixes degrees.
  - With no params it uses `UV.store.compare()`, which defaults to `['mba-muj','mba-smu','mba-amity']`.
- `setIds` writes to localStorage only. **The URL is not updated** when slots, quick-start chips or published pairs change, yet Share copies `location.href`.

#### Structure, top to bottom

**1. Header** `active="compare"`.

**2. Hero** (lines 19–31)
- Background: `radial-gradient(520px 280px at 90% 0%,#E6E1FF …)` plus the light linear gradient. `border-bottom:1px solid #EEECF8`. Padding `22px … 28px`.
- Breadcrumb: Home › Compare (link) › "{crumb}" ("Online MBA" when all columns share a degree, else "Programs").
- Row (`flex-wrap; justify-content:space-between; align-items:end; gap:16px; margin-top:12px`).
  - H1: "Compare **<span style=color:#5B4CF0>Online MBA</span>** Programs" (or "Online Degree"). `margin:0; clamp(28px,4vw,44px); -0.035em; 800; line-height:1.08`.
  - `<p>` "Compare fees, EMI, approvals, placements and more across top universities." (`margin-top:8px; #4A4867; 16px`).
  - Buttons (gap 8, divs): each `padding:10px 14px; radius 10; #fff; border 1px #E4E1F3; 14px/700; gap 6; icon 18px`.
    - `share` "Share comparison". It copies `location.href` with `navigator.clipboard` (errors swallowed) and changes the label to "Link copied" permanently.
    - `download` "Download PDF". **No handler.**
- "QUICK START" row (`margin-top:18px; overflow-x:auto`).
  - Label 12px/700, 0.05em, `#6F6D8C`.
  - Chips (divs, `padding:7px 12px; radius 99; #fff; border #E4E1F3; 13px/600`; hover border and colour `#5B4CF0`): "MBA: all three", "MCA: all three", "BBA: all three", "B.Com: all three", "BCA: MUJ vs Amity". Clicking replaces the selection in place.

**3. `<main>`** (`padding:24px clamp(16px,3vw,32px) 0`).

**3a. Slot cards** (lines 33–51): grid `auto-fit minmax(min(100%,300px),1fr)`, gap 12. Always 3 slots.
- Slot: `border:1px solid #E8E6F3; border-radius:16px; padding:12px; background:#fff; display:flex; gap:12px; align-items:center; min-height:104px`.
- **Filled:**
  - Campus thumbnail `88×78; object-fit:cover; radius 12; #ECE9FE; alt=""`.
  - University name (15px/800) and "Online MBA" (13px `#6F6D8C`).
  - Action row (gap 6, margin-top 8):
    - "View details →" (`<a>` to the course; `padding:6px 10px; radius 8; border #D6D0FA; 12px/700`).
    - "Change" control: a `<label>` with `sync` (15px) and the text "Change" (`padding:6px 10px; radius 8; border #E4E1F3; 12px/700; #4A4867`) wrapping an **invisible native `<select>`** (`position:absolute; inset:0; opacity:0`) listing all 30 programs as "Online MBA — MUJ".
    - `close` icon (20px `#8E8CA8`, a span, `margin-left:auto`) removes the program.
- **Empty:** a `<label>` (`flex:1; align-self:stretch; border:1.5px dashed #D6D0FA; radius 12; centred; gap 8; #5B4CF0; 700`) with `add_circle` (22px) and "Add a program", wrapping an invisible select whose first option is "Choose".
- Change logic: `a[i] = v`, then `new Set(a)` de-duplicates. Choosing a program already in another slot collapses the list.

**3b. Desktop table (≥860)** (lines 53–83)
- Container: `margin-top:20px; border:1px solid #E8E6F3; border-radius:18px; overflow:hidden; background:#fff`.
- Built from div grids, **not `<table>`**. Grid `200px repeat(3,minmax(0,1fr))`; always 3 value columns, even when only 2 programs are selected.
- **Sticky header row:** `position:sticky; top:68px; background:#fff; z-index:5; border-bottom:1px solid #E8E6F3`.
  - **Bug:** sticky cannot work, because the parent has `overflow:hidden`, which makes it the scroll container. Use `overflow:clip` or move the radius clipping.
  - First cell "Features" (800, `padding:18px 20px`).
  - Program cells (`padding:16px; border-left:1px solid #F0EEF8`):
    - Logo tile `44×44; radius 10; border 1px #ECEAF6; padding 5`.
    - Uni name 14px/800 and program title 12px `#6F6D8C`.
    - Buttons (margin-top 10, gap 6): "View program →" (`flex:1; padding:9px; radius 9; #5B4CF0; #fff; 13px/700`) and a Shortlist div (`padding:8px 10px; radius 9; border #D6D0FA; #5B4CF0; 13px/700`, icon `bookmark`/`bookmark_added` 17px, text "Shortlist").
- Data rows (`border-bottom:1px solid #F3F2F9`):
  - Label cell `padding:13px 20px; 14px/600; #4A4867`.
  - Value cell `padding:13px 16px; border-left:1px solid #F3F2F9; 15px; flex; gap 8; wrap`. Background, weight and colour come from the best rule. Optional icon 19px: `#12925A` for `check_circle`, else `#8E8CA8`.
  - Best tag: `11px/800; padding:3px 7px; radius 5; #12925A; #fff`.
- Rows (lines 158–166):

  | # | Label | Value | Icon | Highlight |
  |---|---|---|---|---|
  | 1 | Total program fee | `inr(fee)` | — | **min → "Lowest"** |
  | 2 | EMI (approx.) | "₹7,500/month" | — | **min → "Lowest"** |
  | 3 | Program duration | months/12 + " years" ("2 years") | schedule | — |
  | 4 | UGC entitled | **"Yes" (hard-coded)** | check_circle | — |
  | 5 | NAAC accreditation | **"A+" (hard-coded)** | check_circle | — |
  | 6 | Rating | "★ 4.7" | — | **max → "Best"** |
  | 7 | Eligibility | **"Graduation (any stream)" / "10+2 (any stream)"** (invented) | person | — |
  | 8 | Specializations | "General" or "N options" | category | **max → "Best"** |
  | 9 | Learning mode | "100% Online" | laptop_mac | — |
  | 10 | Placement assistance | uni placement "88%" | work | **max → "Best"** |
  | 11 | Average package | "₹7.2 LPA" | — | **max → "Best"** |

- **Best rule** (lines 152–156):
  - Only when the row has a mode and 2 or more columns are selected.
  - `b = min|max(vals)`. If every value equals `b`, there is no highlight.
  - Every cell equal to `b` is "best" (ties are all tagged).
  - A best cell gets `bg #F3FBF6`, weight 800, colour `#12784B`, and the tag "Lowest" (min) or "Best" (max).
  - Other cells: `#fff`, weight 500, `#16133F`.
- Final row "Key highlights" (`padding:16px 20px`, 800). Per column: bullets (6px `#5B4CF0` dots, 13px `#2B2950`), **hard-coded per university** (line 167):
  - MUJ: "Industry-aligned curriculum", "320+ hiring partners", "WES recognised", "Flexible learning for working professionals".
  - SMU: "Lowest listed fees", "Established 1995", "AIU member", "Dedicated student support".
  - Amity: "Widest range of programs", "QS ranked", "WES recognised", "Career guidance & placement assistance".

**3c. Mobile (<860)** (lines 85–99): one card per row (`border; radius 14; overflow hidden`, gap 10).
- Header strip `padding:10px 14px; #F8F7FD; 13px/800; #4A4867`.
- One line per program (`flex; space-between; padding:11px 14px; border-top:1px solid #F3F2F9; bg by best`):
  - Left: logo 20×20 and "SMU · MBA" (13px `#4A4867`).
  - Right: value 14px with the weight and colour from the best rule, plus the tag (10px/800, `padding:2px 6px`).
- On mobile there is no Key highlights row and no per-column View/Shortlist (only the slot cards).

**3d. Email-report panel** (lines 101–108)
- `margin-top:28px; border-radius:20px; background:linear-gradient(135deg,#F4F2FF,#EEEAFF); padding:clamp(20px,3vw,32px); flex-wrap; gap:20px`.
- 64px white circle with `forward_to_inbox` (32px primary).
- Title "Get the detailed comparison report via email" (20px/800). Text "We'll send a PDF comparison of these programs, including fees, approvals and placement data." (14px, line-height 1.55).
- Form: input with placeholder "Enter your email address" (**no label, no `type=email`, no validation**; `padding:13px 14px; radius 11; border #D6D0FA`) and "Send report →" (a div; `padding:13px 18px; radius 11; primary`).
- Footnote `lock` "We respect your privacy. No spam, ever." (12px `#6F6D8C`).
- After send: a green panel (`#E7F6EE`/`#12784B`, 700) with `check_circle` and "Report on its way — check your inbox." **Client-only; nothing is sent.**

**3e. "Explore more options"** (lines 110–116)
- H2 (`clamp(22px,3vw,28px)`) and `<p>` "Discover more programs or explore by specialization."
- Four link cards (`minmax(240px)`, gap 12; `padding:18px; border; radius 16; gap 14`; 46px icon tile radius 12; title 800; description 13px; CTA 13px/700 primary with " →"):
  - `school` "View all programs" / "Explore all 30 programs from top universities." / "View all programs" → Courses
  - `add_chart` "Compare more programs" / "Add up to three programs side by side." / "Start comparing" → Courses
  - `explore` "Explore specializations" / "Find the right specialization for your goals." / "View specializations" → Specializations
  - `support_agent` "Apply now" / "Get free guidance from our counselling team." / "Apply now" → Apply

**3f. "PUBLISHED COMPARISON PAGES"** (lines 117–120)
- Label 12px/700, 0.06em. Grid `minmax(220px)`, gap 8.
- Items are **divs with onClick** (`padding:11px 14px; border #EEECF6; radius 10; 14px/600`, `chevron_right`). They load the pair **into the interactive tool** and scroll to the top. They **do not link to `/compare/[course]/[pair]`**.
- 18 pairs as "Online MBA: MUJ vs Amity" and so on.

**3g. FAQ**: UVFaq with subtitle "Get quick answers to common questions about comparing programs." Six items (line 176):
1. "Are these online programs UGC entitled?" → "Yes. Every program we list is checked against the UGC-DEB entitlement list each admission cycle."
2. "How do I choose the right program?" → "Start with total fee and EMI, then check eligibility, specialisations and placement support. A counsellor can help you weigh them."
3. "What is the total fee structure for each program?" → "The table shows listed total tuition. Semester-wise and full-payment plans are on each program page."
4. "Do these programs have live classes?" → "Programs combine live sessions with recorded lectures. Confirm the schedule for your batch."
5. "Can I get an EMI option?" → "Yes — no-cost EMI is available through loan partners, subject to approval."
6. "Is there any difference in the degree value?" → "No. UGC-entitled online degrees are equivalent to on-campus degrees."

**4. Footer.**

#### 3.1.1 Accessibility in the design
- The table has no table semantics: no `<table>`, `<th scope>` or caption.
- "Best" is conveyed by colour plus a tag, which is acceptable.
- Share, Download, quick-start chips, the remove ×, the Shortlist toggle and the published pairs are divs or spans that are not focusable. Published pairs are not links, so they have no SEO value.
- The invisible select overlays have ambiguous accessible names ("Change", or "Add a program" plus every option text). They need `aria-label="Change program in slot 1 (Online MBA, MUJ)"` or similar.
- The "Link copied" state is not announced (no live region).
- The email input has no label.
- Targets: "View details" and "Change" are about 28px tall, × is 20px. Both are below 44px.
- Sticky header bug (3.1 item 3b).

### 3.2 Current implementation

#### `src/app/compare/page.tsx` (server, force-dynamic)
- Metadata title "Compare Online Degrees", canonical `/compare`.
- Hero: white, H1 "Compare programs side by side", sub "Choose up to three programs to compare fees, duration and course details. Email verification is required to view the interactive comparison."
- `?add=` (comma or repeated). When the param is **absent**, it defaults to `["mba-muj","mba-amity"]`. An explicitly empty `add=` stays empty.
- "QUICK START COMPARISONS" links: MBA all three, BCA MUJ vs Amity, MCA all three, B.Com all three → `/compare?add=…`.
- "PUBLISHED COMPARISON PAGES": **links** to `/compare/{key}/{slug}` from `allComparisonPairs(catalog)`, labelled "{label}: {left} vs {right}".

#### `src/components/compare-picker.tsx` (client)
- Section "Your comparison" (a focusable h2) and status "{n} of 3 programs selected. Choose at least two to compare."
- Slot `<article>`s: logo, name, uni, "fee · duration", and an × `<button aria-label="Remove {name} — {uni}">`.
- An "Add a program" button (`aria-expanded`) opens a picker panel: search, then Degree level, Stream and University selects, then a results list of Add buttons, "Reset filters" and "Close picker".
  - Focus management and Escape. It hides StickyCtas while open.
  - Selection updates the URL via `pushState(?add=)`.
- Analytics: `compare_view`, `compare_course_added`, `compare_selection_change`.
- Wrapped in `<CompareGate>` (`compare-gate.tsx`):
  - With fewer than 2 selected: "Select at least two programs above to start comparing."
  - Otherwise it calls `/api/compare-access`. When locked: the card "Unlock the full comparison" / "Submit your contact details and course preferences, then verify your email to unlock the comparison." / **Apply now** (`/lead?intent=compare-unlock`, `data-open-lead`) / "Email verification required. Your selection stays on this page."
  - Unlocked: the table plus "Comparison access unlocked." It re-checks on `uv-lead-unlocked`, storage and focus events.
- Table: `<label class="comparison-diff-toggle"><input type=checkbox> Show differences only</label>` (CSS `:has()` hides `tr[data-same]`). A `role="region"`, focusable, horizontally scrollable `<table class="comparison-data">` with a caption, `th scope="col"` (name and uni) and `th scope="row"`.
  - Rows from **`buildComparisonRows`** (`src/lib/comparisons.ts:62-82`):
    1. Total fee
    2. **Fee outside India** (published category fees in their own currency, or "Confirm with the university")
    3. EMI from
    4. Duration
    5. Level
    6. Rating ("4.7 ★ (1,420 reviews)")
    7. University approvals
    8. **Placement rate (university-wide)**
    9. **Average package (university-wide)**
    10. **Hiring partners (university-wide)**
    11. Specialisations ("N tracks")
    12. Eligibility (full catalog text)
    13. Plus a "Next steps" row with View course and **Apply now** per column.
  - **No best flags** (comment at lines 55–57).
  - Mobile ≤640px: thead visually hidden, rows stacked, `.comparison-mobile-label` per cell.

#### `src/app/compare/[course]/[pair]/page.tsx` (editorial, public, **not in the design at all**)
- Breadcrumb; H1 "{label}: {left} vs {right}"; byline "By Content Team, Unnati Vidya"; caveat line.
- In-page nav (Comparison / Program pages / Related guides / Questions).
- The same diff toggle and table (2 columns).
- Program-page buttons, fee and eligibility guide links, and `comparisonFaqs` (cheaper, placement (university-wide), recognition (dated), higher fee ≠ better, duration, specialisations).
- Right rail: "Still not sure which is right for you?" with **Apply now**, and "Add a 3rd program to compare" → `/compare?add=a,b`.
- JSON-LD Breadcrumb and FAQPage.

#### Current features the design lacks
- **The gate** (C3).
- Differences-only toggle.
- "Fee outside India" row.
- University-wide labels.
- Real eligibility text.
- University approvals row (as a whole list).
- Level row.
- "Next steps" Apply now.
- Searchable, filterable picker with focus management.
- URL-synced selection.
- Analytics.
- Links to the editorial pages.
- The editorial page template itself.
- Table semantics and caption.

### 3.3 Changes required (Compare)
1. **Hero (`compare/page.tsx`)**
   - Gradient hero. Breadcrumb Home › Compare › "{Online MBA | Programs}".
   - H1 "Compare **{Online MBA}** Programs", with the degree span in `#5B4CF0` when all selected share `courseKey`, otherwise "Online Degree". Compute it on the server from `?add=`.
   - Subtitle: **keep the email-verification notice** (C3), for example "Compare fees, duration, recognition and more for up to three programs. Email verification is required to view the full comparison."
   - **Share** button (a `<button>`): copy `${origin}/compare?add={ids}` (IDs only, per NEXT_PHASE_PLAN §5 "print/share with IDs only"). Fall back to `navigator.share` or a selectable text field when the clipboard is unavailable. Announce "Link copied" in an `aria-live="polite"` region.
   - Replace **Download PDF** with **"Print comparison"** (`window.print()` plus print CSS, as in `total-cost-planner.tsx`), shown only when unlocked. See 3.4.
   - Quick start: `<Link>` chips to `/compare?add=…` using real ids. Add "BBA: all three" (`bba-muj,bba-smu,bba-amity`; all three exist).
2. **Slot cards (`compare-picker.tsx`)**
   - Restyle `.comparison-slot` to the design: radius 16, padding 12, `min-height:104px`, 88×78 campus thumbnail (`next/image`, `alt=""`; hide on narrow widths if needed), uni name 15px/800, program 13px.
   - Actions:
     - "View details →" (`/courses/{slug}`).
     - **"Change"**: either the design's native select overlay with a proper `aria-label` ("Change {name}, {uni}") and 44px target, or reuse the existing picker panel scoped to that slot. Prefer the existing searchable picker for 30 options, or a visible native `<select>` (not opacity 0) for simplicity.
     - Remove `<button aria-label="Remove {name} — {uni}">` at 44px.
   - Always render 3 slots. Empty slots are a dashed "Add a program" button that opens the picker (keep the focus management).
   - Keep the URL (`?add=`) as the single source of truth. Also sync to the new compare store (1.3 item 9) if the tray is built.
3. **Gate**: keep `CompareGate` exactly (C3). Restyle the locked card to the design tokens (radius 18, `#F4F2FF` panel, primary **Apply now** button). The design has no locked state, so it needs a designed treatment.
   - Optional: render a blurred or skeleton preview of the table header (slot names only; never values) behind the lock card. No program values before unlock.
4. **Unlocked table, desktop ≥860**
   - Keep `<table>` semantics. Visually match the design grid: `table-layout:fixed`, first column 200px, radius 18 container using **`overflow:clip`** (not hidden) so the sticky `thead` works.
   - Sticky `<thead>` at `top:68px`, `z-index` above rows. Each column header: logo tile 44, uni name 14px/800, program 12px, "View program →" (primary) and the Shortlist toggle (`SaveButton` variant with `aria-pressed`).
   - Value cell typography 15px. Row label 14px/600 `#4A4867`. Separators `#F3F2F9`.
   - Use **`buildComparisonRows` unchanged** (so editorial and tool stay in sync, as the `comparisons.ts:60-61` comment says). Optionally add icons per row as in the design (schedule/person/category/laptop/work) where the rows match.
   - **No best/lowest cell highlighting** (C4). Keep the "Show differences only" toggle, styled as a design chip or switch at 44px.
   - Keep the "Next steps" row (View course + Apply now).
   - Optional: show "Learning mode: 100% online" as a row (catalog "Mode" is 100% online on the course page).
5. **Mobile <860**: either keep the current stacked table (≤640) or adopt the design's per-feature cards (header strip `#F8F7FD` plus a line per program with logo and "SMU · MBA" and value). Implement via CSS on the same `<table>` (`display:block` rows, with `th scope=row` as the strip). Keep `data-same` so the differences toggle still works. Add the logo to `.comparison-mobile-label`.
6. **Email report panel**: **do not build** unless a backend, consent and gate decision exist (3.4). If a placeholder is wanted, replace it with "Print comparison" and "Share link", or with the existing newsletter sign-up (a separate consent).
7. **"Explore more options"**: add the four link cards with real routes: `/courses`; `/courses` (or "Start comparing"); `/specializations`; and "Apply now" → `/lead?intent=compare` with `data-open-lead rel="nofollow"`. Copy: "Explore all {n} programs from three universities." (not "30" or "top universities", see 3.4). Consider a total-cost planner card, `/tools/total-cost?course=…`, since that tool compares up to three programs.
8. **Published comparison pages**: keep them as **`<Link>`s to `/compare/{key}/{slug}`** (generated by `allComparisonPairs`). Restyle as the design's 220px grid of bordered rows with `ChevronRight`. Label "Online MBA: MUJ vs Amity"; the current label already reads "{pair.label}: {left} vs {right}".
9. **FAQ**: optional on `/compare`. If added, use corrected answers (3.4) and the UVFaq styling. FAQPage JSON-LD is only appropriate if the text is visible without the gate (it is general, so fine).
10. **Editorial page `/compare/[course]/[pair]`**: not in the design. Restyle it with the same hero (gradient, breadcrumb, H1 "{Online MBA}: MUJ vs Amity"), the same table styling (2 columns, sticky header with logos, differences toggle) and the FAQ in UVFaq style. Keep the byline, in-page nav, guide links, right rail and JSON-LD. **It stays public and ungated** (C3).
11. **Course page "Compare" entry**: the design's `?add=id` auto-fills same-degree siblings. The current `?add=id` shows one course and then "Select at least two…". Owner or UX choice: the course page CTA can generate `/compare?add={id},{siblings}` (same `courseKey`) server-side, without changing the `?add=` semantics.
12. Drop the design's `?ids=` and `?uni=` params, or alias `ids`→`add`. `?uni=` mixes degrees (see 3.4).

### 3.4 Conflicts and questions (Compare)
1. **No OTP gate in the design**: the full table, including fees, is visible immediately (lines 53–99). This conflicts with C3. The `CompareGate` lock state must remain and needs a visual design.
2. **Best/Lowest highlighting** (lines 152–156, 159–165): "Lowest" on fee and EMI, "Best" on Rating, Specializations count, Placement assistance and Average package. This conflicts with C4 and C5 (ratings must not drive ranking), with T3 (best flags removed) and with standard §59 ("A cheapest price is not automatically best value"). Remove all of it.
   - **Question:** is a neutral fee-difference note (for example "₹60,000 less than X") acceptable for fees only? The safest reading of C4 is no highlighting at all.
3. **Placement and package rows unlabelled** ("Placement assistance", "Average package"): must read "(university-wide)" (C4). The design also lacks the "Hiring partners (university-wide)" row and the "University approvals" row. "NAAC accreditation: A+" is a hard-coded university-level fact presented as a program row.
4. **"UGC entitled: Yes"** (hard-coded, line 160): conflicts with C8. Program recognition is per program and dated. If a recognition row is wanted, use `recognitionSummary(course).chip` (for example "UGC-DEB 2026-27: listed · checked …" / "being re-checked"). This would be a new row in `buildComparisonRows`, shared with the editorial pages.
5. **Eligibility row with invented generic values** ("Graduation (any stream)", "10+2 (any stream)", line 162). This is wrong for MCA, BCA, M.Com and others; for example, MCA at Amity needs BCA, maths or CS (increment 74 T6 #7). Use `course.eligibility`.
6. **Missing rows the design omits:** "Fee outside India" (C10, wave 2), "Level", "University approvals", "Hiring partners (university-wide)", and the "Next steps" Apply now row.
7. **Differences-only toggle missing** from the design (C4/C10). Keep it.
8. **"Key highlights" per university** (line 167): hard-coded marketing claims.
   - "Industry-aligned curriculum", "Flexible learning for working professionals", "Dedicated student support" and "Career guidance & placement assistance" are unverified service claims.
   - "Lowest listed fees" (SMU) and "Widest range of programs" (Amity) are superlatives or winner claims. Amity does have 12 of 30 in the catalog, but it is still a superlative.
   - "320+ hiring partners" is a university-wide figure without a label.
   - "Established 1995", "AIU member", "QS ranked" and "WES recognised" are university facts that come from `approvals` and `established`.
   - Constraints: C7/C9 (never invent new claims) and C4. Recommend dropping the row, or replacing it with sourced program-detail cards (increment 79) where they exist.
9. **Email report "Get the detailed comparison report via email" / "We'll send a PDF comparison…" / "Send report →"** (lines 101–108):
   - No backend exists. There is no PDF generation and no email-report endpoint; `zeptomail.ts` is used for OTP and newsletter only.
   - It would collect an email outside the contact-first lead flow, with no consent text and no OTP (C1).
   - It bypasses the gate by emailing gated data.
   - "No spam, ever." is a new promise.
   - Remove it, or get an owner decision plus a backend spec (consent version, rate-limit, gate check, what data the PDF includes).
10. **"Download PDF"** (line 24): has no handler and no backend. NEXT_PHASE_PLAN §5 approves "print/share with IDs only". Replace it with "Print" (`window.print`) and print CSS, gated so it prints only unlocked content.
11. **Share copies `location.href`**, but the design never updates the URL (the selection lives in localStorage). Ensure the URL always holds `?add=` IDs only (no personal data, per standard §73).
12. **Default compare list** `['mba-muj','mba-smu','mba-amity']` from localStorage (`uv-data.js:54`): differs from the current server default `["mba-muj","mba-amity"]` when `add` is absent. **Question:** keep a default pair or triple, or show an empty selection with the quick-start chips? Whatever is chosen, it should not come from a pre-seeded localStorage store.
13. **Query-param URLs** `?ids=`, `?add=` (with sibling expansion) and `?uni=`: `/compare` is already a query-param tool, so `?add=` is fine.
    - `?uni=` builds a **mixed-degree** comparison (first 3 PG programs of one university). That contradicts standard §57 ("Compare like with like"). Drop it, or map it to `/universities/[slug]` program lists.
    - Changing `?add=` to auto-expand siblings would break existing links such as `/compare?add=mba-muj,mba-amity` from the editorial "Add a 3rd program" link and the course rail. Expand only on the course-page link, not inside the param semantics.
14. **Published comparison pages as in-tool loaders (div onClick)** instead of links to `/compare/[course]/[pair]`: conflicts with C3/C10 (editorial pages are public and SEO URLs). Keep the links.
15. **FAQ answers**:
    - "Yes. Every program we list is checked against the UGC-DEB entitlement list each admission cycle." and "No. UGC-entitled online degrees are equivalent…" conflict with T3 (dated 2026-27 status).
    - "Semester-wise and full-payment plans are on each program page." conflicts with C6 (no full-payment plan).
    - "Programs combine live sessions with recorded lectures." is unverified.
    - "Yes — no-cost EMI is available through loan partners" is a universal no-cost EMI promise (standard §81); owner question.
    - "A counsellor can help you weigh them." is acceptable.
16. **Hero copy**:
    - "Compare fees, EMI, approvals, placements and more across top universities": "top universities" is promotional, there are only three (C12), and it omits the gate notice.
    - "Explore all 30 programs from top universities." in Explore more: hard-coded "30".
17. **Rating row with ★ and "Best"**: ratings stay visible (C5) but must not be highlighted. The current "4.7 ★ (1,420 reviews)" row is fine.
18. **Accessibility**: the design's div grid table, unlabelled hidden selects, non-button controls and sub-44px targets. Keep the current `<table>`, caption, scoped headers, labelled remove buttons and focus management.
19. **Editorial page `/compare/[course]/[pair]` has no design**: a design or styling decision is needed (the proposal in 3.3 item 10 reuses the Compare tokens). Its FAQs (`comparisonFaqs`) include "Which is cheaper…" and "Which has better placement support… (university-wide)". The placement Q&A names a "higher placement rate" winner, so check it against C4 (it is labelled university-wide, so it is probably acceptable; confirm with the owner).
20. **Ambiguous**:
    - The sticky header row in the design cannot stick (the `overflow:hidden` bug). The intended behaviour is clearly "sticky under the 68px header", so implement it that way.
    - The design always shows 3 columns even with 2 programs (an empty third column). The current table shows only the selected columns. Pick one; showing only selected columns avoids an empty column.
    - The design's "Change" de-duplication collapses slots when a duplicate is picked. Prefer disabling already-selected programs in the picker, as the current picker does.

---

## 4. Test and spec impact (for the implementer)
- `scripts/course-detail-ui-smoke.cjs`: "Course sections" nav, "Jump to section" picker and section count.
- `scripts/course-discovery-smoke.cjs`: filters, sort options, chips, empty state.
- `scripts/course-sidebar-smoke.cjs`: rail content.
- `scripts/comparison-ui-smoke.cjs`: gate heading "Unlock the full comparison", table role, 13 rows.
- `scripts/editorial-comparison-smoke.cjs`: 12 rows.
- `scripts/mobile-actions-smoke.cjs`: the mobile bar.
- `scripts/wave2-publishing-smoke.cjs`: fee selector and recognition section.

All of these assert the current structure and copy and will need updating alongside the redesign.

---

## 5. Top conflicts (short summary)
1. **Compare without the OTP gate** (C3). The design shows the full table to everyone. `CompareGate` must stay and needs a designed locked state.
2. **Best/Lowest highlighting** on fee, EMI, rating, specialisation count, placement and package (C4/C5), plus **unlabelled university-wide placement and package figures** in Compare and Course Careers. Remove the highlighting and add "(university-wide)".
3. **"Highest rated" sort** on Courses (C5). Remove it.
4. **Phone CTA "Call 1800-120-4050"** in the course sidebar and FAQ (C2). Remove it. **"Start application enquiry"** must be "Apply now" (C1).
5. **Template and invented facts on the Course page** (C6/C7/C8):
   - "Save 2%" full-payment plan, computed semester plan.
   - "80-90 credits", "Online proctored" exams, ₹500 application fee for all, blanket "UGC-entitled" overview.
   - The two removed named reviews (Sneha Iyer, Rohit Verma).
   - Unlabelled salary bands.
   - Approval badges overlaid on the campus image, which imply program approval.
6. **Current features the design drops**, all of which must be kept (C10):
   - Category fee selector, Recognition section and chip, source and checked-date lines, Next intake.
   - Eligibility checker and total-cost planner links.
   - "Four checks" decision guidance, Study/assessment sections.
   - "Fee outside India" row, differences-only toggle, editorial comparison links and template.
   - JSON-LD, URL-synced filters.
7. **Features with no backend**: Compare "Download PDF" and the "email me the report" form (no endpoint, no consent, bypasses the gate). Replace them with print and share using IDs only (plan §5).
8. **Data and URL mismatches**:
   - Design ids differ for 8 courses (0.4) and use `/course?id=`, `/university?id=`, `?lvl=`/`?uni=`/`?degree=` and `Compare?ids=`. Keep `/courses/[slug]` and `/universities/[slug]`, and alias the params.
   - The default localStorage compare list (3 MBAs) would show the tray on every visit.
   - Hard-coded "30 programs" and the ₹75k–₹2.75L slider.
   - Placeholder university figures (reviews, partners, "—").
   - The hard-coded "Key highlights" marketing bullets.
9. **CSP and accessibility**: Google Fonts and Material Symbols are blocked by the CSP (use next/font and lucide). The scroll-reveal must not be ported. Almost every interactive control in the three designs is a non-focusable div or span with sub-44px targets, and the compare sticky header is broken by `overflow:hidden`.
