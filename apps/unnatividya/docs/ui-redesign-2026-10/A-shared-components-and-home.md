# A. Shared components + Home: design spec, current state, changes and conflicts

Scope: `UVHeader.dc.html`, `UVFooter.dc.html`, `UVCard.dc.html`, `UVFaq.dc.html`, `Home.dc.html`, `uv-data.js` (design handoff, `apps/unnatividya/design_handoff_unnati_vidya/`) against the current code in `apps/unnatividya/src/`. Checked against `0-constraints-checklist.md`, `docs/DESIGN_AND_CONTENT_STANDARD.md`, `docs/NEXT_PHASE_PLAN_2026-10.md` §11 and `docs/CLAIMS_REGISTER.md`.

Line numbers are approximate (`Home.dc.html:NN` = line in that file).

---

## 0. Cross-cutting facts that every section depends on

### 0.1 Design tokens vs current tokens

| Role | Design (README) | Current (`globals.css` `:root`, inline styles) |
|---|---|---|
| Primary | `#5B4CF0`, hover `#4A3BDB` | `--uv-primary #544cc8`, hover `#453db8` |
| Primary tints | `#F4F2FF` (50), `#F1EEFF` (100), `#ECE9FE` (150), `#D6D0FA` (200), `#CFC9FA` (250) | `--uv-primary-soft #f4f3fc`, `rgba(84,76,200,0.08/0.10)` |
| Text | navy `#16133F` (body text), ink-2 `#2B2950`, ink-3 `#4A4867`, ink-4 `#6F6D8C`, ink-5 `#8E8CA8` | `--uv-ink #363634`, `--uv-body #555`, `--uv-muted #707070` |
| Borders | `#E8E6F3` card, `#E4E1F3` input, `#F0EEF8`/`#F3F2F9` dividers | `--uv-border #cfdae6`, `--uv-hairline #eaeaea` |
| Dark | navy `#16133F`, footer `#1A1646` | `--uv-dark #263238` (footer, compare teaser) |
| Rating | `#F0A30A` (README) / `#F2A60C` (Home testimonials) / navy text (card) | `--uv-rating #fdb515` |
| Success | `#12925A`, text `#12784B`/`#14774A`, bg `#E7F6EE`/`#E8F6EE` | `--uv-success #2e7d32` |
| Font | Plus Jakarta Sans 400–800 (Google Fonts CDN) | `"DM Sans", Inter, system-ui…` in `body` (`globals.css:574`); **no font is actually loaded** (no `next/font`, no `@font-face`), so users see Inter/system |
| Icons | Material Symbols Rounded (Google Fonts CDN, ligature text) | `lucide-react` |
| Container | `max-width 1240px; padding-inline clamp(16px,3vw,32px)` | `max-width 1200px; padding 0 24px` (`--uv-max`) |
| Radii | 6 tags · 8–10 small buttons · 10–12 buttons/inputs · 14 tiles · 16 cards · 18 large cards · 20–24 panels · 99 pills | 8px cards, 4px controls |
| Body size | Paragraph sizes vary 13–16px; no global body size declared in prototype | `body { font-size: 15px }` |

### 0.2 Asset check (`public/`)
Every asset the five files reference exists locally. The design loads them from `https://unnatividya.com/...`; production must use root-relative paths (`/brand/...`) through `next/image`.

| Design path | In `public/`? |
|---|---|
| `/brand/unnatividya-logo-gradient.svg` | yes |
| `/brand/unnatividya-logo-white.svg` | yes |
| `/hero/student-online-degree.webp` | yes (already `learningMedia.src`) |
| `/approvals/{ugc,naac,aicte,wes,aiu}.svg` | yes, all 5 |
| `/streams/{management,it-computer-applications,commerce-finance,arts-humanities}.webp` | yes, all 4 |
| `/universities/{manipal-university-jaipur,sikkim-manipal-university,amity-online}-logo.svg` | yes |
| `/universities/...-campus.webp` | yes |
| `/universities/manipal-university-jaipur-partner-logo-{1..6}.svg` (README) | yes (SMU and Amity sets also exist) |
| `/certificates/mba-muj-certificate-sample.webp` (README) | yes (30 certificate files exist) |
| `/hero/recommender-preview.webp` | exists, used today; **the design drops it** |

### 0.3 Course id mapping (design `uv-data.js:13-42` → repo `src/data/catalog.ts`)
Ids that differ: `mscds-amity` → `msc-data-science-amity`; `mscmath-muj` → `msc-mathematics-muj`; `maeco-muj` → `ma-economics-muj`; `maeng-smu` → `ma-english-smu`; `mapol-smu` → `ma-political-science-smu`; `masoc-smu` → `ma-sociology-smu`; `mapp-amity` → `ma-public-policy-governance-amity`; `bcomh-amity` → `bcom-honours-amity`. The other 22 match. The repo has 30 courses, which matches "30 programs".

URL shapes are different too. The design uses `Course.dc.html?id=` and `University.dc.html?id=`, `Legal?tab=`, `/compare?ids=`, and `/courses?lvl=&degree=&uni=`. The repo uses `/courses/[slug]`, `/universities/[slug]`, `/privacy`, `/terms`, `/refund-policy`, `/compare?add=a,b,c`, and `/courses?level=&stream=&university=&maxFee=&q=&sort=`. Constraint 10 says SEO URLs must not become query-param URLs.

### 0.4 Data drift (design catalogue vs repo seed)
The design hard-codes values that differ from the repo. Production must read the published catalogue (`getPublishedCatalog()`), never `uv-data.js`.
- Specialisation counts: `mba-smu` 4 in the design vs 6 in the repo; `mba-amity` 4 vs 14; `bba-muj` 4 vs 7; `bca-amity` 4 vs 6; `bcom-muj` 4 vs 8; `ba-amity` 4 vs 9; `bcomh-amity` 4 vs 8; `mca-muj` 4 vs 5.
- Review counts: SMU `'2,180'` vs 2110; Amity `'5,960'` vs 4870. University learners: SMU/Amity `'—'` vs `38,000+`/`85,000+`. SMU/Amity `high` and `partners` are `'—'` vs `₹15 LPA`/210 and `₹21 LPA`/400.
- `about` copy for each university differs from the repo copy.
- `reviews` on courses is a raw number (`1420`); the card prints `(1420)` unformatted. Current code uses `toLocaleString("en-IN")`.
- The repo `duration` is a string (`"24 months"`) while the design uses `months` (number) + `" mo"`. The repo `emi` is already a string with `/mo` (`"₹7,500/mo"`).

### 0.5 Fonts and icons under the CSP
The Caddy CSP is `font-src 'self' data:; style-src 'self' 'unsafe-inline'` (`deploy/vps/caddy/Caddyfile:30,50`). The design's two `<link href="https://fonts.googleapis.com/...">` tags (`Home.dc.html:12-13`) would be blocked.
- **Plus Jakarta Sans:** use `next/font/google` (self-hosted at build time; the Docker build needs network access to fetch it) or `next/font/local` with committed woff2 files.
- **Material Symbols Rounded:** do not port it. The variable icon font is large and its ligature text (`"search"`, `"bookmark"`, `"help"`, `"add"`) is read aloud by screen readers unless `aria-hidden`. Map each icon to `lucide-react`, which is already a dependency and needs no new dependency (constraint 11).

| Material Symbol (where) | lucide-react equivalent |
|---|---|
| `search` (header) | `Search` |
| `bookmark` / `bookmark_added` (header, card) | `Bookmark` / `BookmarkCheck` |
| `menu` / `close` (header) | `Menu` / `X` (already used) |
| `school` (nav Explore Degrees) | `GraduationCap` |
| `account_balance` (nav Universities; Commerce stream icon) | `Landmark` |
| `compare_arrows` (nav Compare) | `ArrowLeftRight` |
| `category` (nav Specializations) | `Shapes` or `LayoutGrid` |
| `menu_book` (nav Guides) | `BookOpen` |
| `calculate` (nav Tools) | `Calculator` |
| `auto_awesome` (mobile "Find my fit") | `Sparkles` |
| `business_center` (Management) | `BriefcaseBusiness` |
| `computer` (IT & Computers) | `Monitor` / `Laptop` |
| `auto_stories` (Arts & Humanities) | `BookOpenText` |
| `help` / `add` / `remove` (FAQ) | `CircleHelp` / `Plus` / `Minus` |
| `arrow_forward` ("View all FAQs") | `ArrowRight` |

### 0.6 Scroll-reveal script (`uv-data.js:88-101`, README "Interactions")
**Spec:** after a 250ms delay, every `main section` and `main > div > div[style*="border-radius"]` whose top is at or below 90% of the viewport is set to `opacity:0; transform:translateY(24px)` with transition `opacity .6s cubic-bezier(.2,.7,.2,1), transform .6s cubic-bezier(.2,.7,.2,1)`. An IntersectionObserver (`rootMargin 0 0 -8% 0`, `threshold 0.06`) reveals each element once. A MutationObserver rescans 80ms after DOM changes. The script is skipped under `prefers-reduced-motion: reduce`, inside header/footer, and for sections nested in another `main section`.

**Conflict:** constraint 11 says "content visible without JS (no scroll-reveal that hides content)". The standard (§10) also forbids hiding content before animation and moving anchored headings. The script hides content with JS after load. Hidden sections can stay invisible for find-in-page jumps, anchor jumps, print, and screenshots taken before scrolling. The 250ms delay can also hide content after first paint (a flash). **Recommendation:** do not port it. If the owner wants entrance motion, make it CSS-only and progressive: `@supports (animation-timeline: view())` with `animation-range` keyframes from `opacity: .001` and a 4–8px move (the standard's limit, not the design's 24px), and nothing hidden when the feature is unsupported or under reduced motion.

### 0.7 Shared store (`uv-data.js:51-57`)
- `store.get(k)` returns `JSON.parse(localStorage['uv_'+k])` inside try/catch. `store.set` writes and then dispatches `window` event `uv-store`.
- `saved()` reads `uv_saved` or `[]`. `toggleSaved(id)` adds or removes.
- `compare()` reads `uv_compare` or the **default `['mba-muj','mba-smu','mba-amity']`**. `toggleCompare(id)` removes the id if present. Otherwise it appends, and if 3 are already held it drops the oldest (`[...c.slice(1), id]`).
- The README asks for a global store (Zustand/Context) synced to localStorage.

**Current:** `src/lib/use-shortlist.ts` uses key `uv_shortlist` and event `uv-shortlist-changed`, listens to `storage` for cross-tab sync, de-duplicates and validates the array, and fires analytics `shortlist_add`/`shortlist_remove`. It exposes `{ids, ready, count, isSaved, toggle, setSaved}`. There is **no compare store**. Compare selection lives only in the URL (`/compare?add=`, `compare-picker.tsx`), and the compare result is gated by OTP (`compare-gate.tsx`, cookie `uv_compare_access`).

**Changes:**
- Keep `useShortlist` and the `uv_shortlist` key. Renaming the key to `uv_saved` would silently wipe every existing visitor's shortlist; if the owner wants the rename, migrate the old key.
- Add a separate `useCompareList` hook with the same pattern (key e.g. `uv_compare`, its own event, `storage` sync, max 3).
- Do **not** pre-seed MBA defaults (see the card conflicts).
- Zustand is not needed (constraint 11: no new big dependencies).

---

## 1. Header (`UVHeader.dc.html`)

### 1.1 Design spec

**Container** (`UVHeader:11-12`):
- `<header>`: background `rgba(255,255,255,0.96)`, `backdrop-filter: blur(12px)`, `border-bottom: 1px solid #ECEAF6`, font Plus Jakarta Sans.
- Sticky positioning comes from the page wrapper (`Home.dc.html:18`): `position: sticky; top: 0; z-index: 40; display: block`.
- Inner row: `max-width 1240px; margin 0 auto; padding 0 clamp(16px,3vw,32px); height 68px; display flex; align-items center; gap 24px`.

**Logo** (`:13`): `<a href="Home">` (flex, `flex:none`) wrapping `<img src=/brand/unnatividya-logo-gradient.svg alt="Unnati Vidya">` at `height 32px; display block`.

**Breakpoint:** JS `window.innerWidth >= 1080` → desktop, otherwise mobile (`:57`). The render is width-driven, which causes an SSR/hydration flash. Implement it with CSS media queries.

**Desktop nav** (`:15-19`):
- `<nav>`: `display flex; gap 2px; flex 1; min-width 0`. No `aria-label`.
- Links, in order (label → target, key, icon, `:56`):
  1. "Explore Degrees" → Courses (`courses`, `school`)
  2. "Universities" → Universities (`unis`, `account_balance`)
  3. "Compare" → Compare (`compare`, `compare_arrows`)
  4. "Specializations" → Specializations (`specs`, `category`)
  5. "Guides" → Guides (`guides`, `menu_book`)
  6. "Tools" → **EMICalculator** (`tools`, `calculate`)
- Link style: `white-space nowrap; padding 8px 12px; border-radius 8px; 14px/600; no underline`. Default colour `#2B2950` on a transparent background. Active (prop `active === key`) and hover: background `#F4F2FF`, colour `#5B4CF0`.
- Computed height is about 36px (padding 16 + line box about 20).

**Desktop right cluster** (`:20-24`), `display flex; align-items center; gap 8px; flex none`:
1. Search: `<a href=Courses title="Search">`, 40×40, radius 10, flex-centred, colour `#16133F`, icon `search` 22px. Hover background `#F4F2FF`. No `aria-label`. The ligature text "search" is its only content.
2. Shortlist: `<a href=Shortlist>`, `display flex; align-items center; gap 6px; padding 9px 12px; radius 10; 14px/600; #16133F; nowrap`. Hover background `#F4F2FF`. Icon `bookmark` 20px, then text **"Shortlist ({{saved}})"**. It always shows the count, including "(0)".
3. CTA: `<a href=Apply>` **"Apply now"**, `padding 10px 18px; radius 10; background #5B4CF0; white; 14px/700; nowrap`. Hover `#4A3BDB`.

**Mobile bar (<1080)** (`:26-30`):
- A `flex:1` spacer.
- Shortlist icon link: 44×44, relative, `#16133F`, icon `bookmark` 24px. Badge: `position absolute; top 6px; right 4px; min-width 17px; height 17px; radius 9px; background #5B4CF0; white; 10px/800 Plus Jakarta`, showing `{{saved}}` (also shows "0").
- Menu toggle: a **`<div onClick>`** (not a button), 44×44, radius 12, `border 1px #E8E6F3`, flex-centred, icon `menu` or `close` 24px. No `aria-expanded`, `aria-controls` or label.

**Mobile panel** (`:32-41`), rendered only when open:
- Container: `border-top 1px #ECEAF6; padding 12px 16px 20px; flex column; gap 2px; background #fff; max-height calc(100vh - 68px); overflow auto`.
- The 6 nav links as rows: `flex; align-items center; gap 14px; padding 14px 12px; radius 12px; 16px/700; #16133F`. Background `#F4F2FF` when active. Leading icon 22px `#5B4CF0`.
- "Find my fit" row (icon `auto_awesome`) → Recommender.
- **"Apply now"** button: `margin-top 12px; centred; padding 15px; radius 12px; background #5B4CF0; white; 700`.
- `<a href="tel:18001204050">` **"Call 1800-120-4050"** (centred, padding 12, 700, `#5B4CF0`).

**State/data:** saved count from `UV.store.saved().length`, updated live on `uv-store` (re-read after 300ms). `open` toggles the menu. There is no Escape key, outside-click or route-change close, no focus management, no `aria-current`, and no skip link.

### 1.2 Current (`src/components/site-header.tsx`, `globals.css:75-123, 3355-3372, 3622-3641`)
- Returns `null` under `/admin`. Re-keyed by pathname so menus reset on navigation.
- Sticky header, `z-index 100`, white background with `--uv-header-shadow`. Inner `max-width 1200; min-height 68; gap 24; padding 0 24`.
- Logo is `next/image` at **24px** tall, `priority`, link `aria-label="Unnati Vidya home"`.
- Desktop nav (`aria-label="Main navigation"`):
  - Flat links Courses, Universities, Compare, colour `#555`, gap 22, min-height 44.
  - Two disclosure groups (`button aria-expanded aria-controls`, `ChevronDown`):
    - **Resources:** Degree guides `/online-degree-guides`, Articles `/blog`, How we verify `/how-we-verify`.
    - **Tools:** Find my course `/recommender`, EMI calculator `/tools/emi-calculator`, Total cost planner `/tools/total-cost`, Eligibility checker `/tools/eligibility-checker`.
  - Each child link shows a one-line description in a 290px dropdown.
  - Active state is `aria-current="page"` plus purple underline.
- Saved pill: link to `/shortlist` with a `Heart` icon (filled when count > 0) and text "Saved courses (n)". It has an `aria-label` with the count. Pill style: border `#cfdae6`, radius 999.
- CTA: `<Link href="/lead?intent=enquire" rel="nofollow" data-open-lead>` **"Apply now"**, 42px tall, radius 4. It opens the lead modal (`lead-wizard-modal.tsx` listens for `[data-open-lead]`).
- Mobile (≤1100px via CSS): a real `<button>` toggle with `aria-label` "Open menu"/"Close menu", `aria-expanded` and `aria-controls`.
  - Panel `<nav aria-label="Mobile navigation">` containing the same links and groups, then "Saved courses (n)" and "Apply now" (`data-open-lead`).
  - Escape closes the menu (and a group first) and returns focus. Outside pointerdown closes. Crossing the media breakpoint closes.
- No search entry point in the header.

### 1.3 Changes required
1. Restyle the container: background `rgba(255,255,255,.96)` with `backdrop-filter: blur(12px)` and border-bottom `1px #ECEAF6` instead of the shadow. Height 68, max-width 1240, gutter `clamp(16px,3vw,32px)`. Logo height 32px (the Image `width` must keep the aspect: 174×32 already).
2. Nav links: 14px/600, `#2B2950`, padding 8×12, radius 8, gap 2. Hover and active use background `#F4F2FF` and colour `#5B4CF0`. Keep `aria-current="page"` (pathname-derived, not a prop). Drop the underline only if the background change is accepted as the visible current-location cue, which the standard §3 requires to be visible and semantic. Raise the hit area to ≥44px (`min-height:44px` with the same padding) per the standard.
3. Decide the IA (see conflicts). If it is adopted, the six flat links are Courses, Universities, Compare, Specializations, Guides, Tools. Keep the Resources and Tools grouping, or at minimum keep access to `/blog`, `/how-we-verify`, `/tools/total-cost`, `/tools/eligibility-checker` and `/recommender`.
4. Add the search icon button (`Search`, 40→44px, `aria-label="Search courses"`) linking to `/courses`. Ideally focus the search field there, e.g. `/courses#course-search` or a `?focus=search` that the page handles. Without that, the design gives no search behaviour beyond navigation.
5. Restyle the saved pill: `Bookmark` icon 20px, 14px/600 `#16133F`, padding 9×12, radius 10, no border, hover background `#F4F2FF`. Label per the decision ("Shortlist (n)" in the design vs "Saved courses" in the standard §3). Keep the `aria-label` with the count.
6. CTA: keep `href="/lead?intent=enquire" rel="nofollow" data-open-lead` and the label "Apply now". Restyle to padding 10×18, radius 10, `#5B4CF0`, hover `#4A3BDB`, 14px/700, min-height 44.
7. Mobile (<1080; currently 1100):
   - Add the bookmark icon link (44×44) with a count badge. The badge must sit inside the link's accessible name (`aria-label="Saved courses, n saved"`) and be `aria-hidden`. Hide the badge at 0, or keep "0" by decision.
   - Restyle the toggle (keep `<button>`, `aria-*`, Escape handling and focus return) to 44×44, radius 12, border `#E8E6F3`.
8. Mobile panel restyle:
   - Rows 16px/700 `#16133F`, padding 14×12, radius 12, gap 14, leading lucide icon 22px `#5B4CF0` (`aria-hidden`), active row background `#F4F2FF`.
   - Add a "Find my fit" (or "Find my course") row with `Sparkles` → `/recommender`.
   - Full-width Apply now: padding 15, radius 12, with `data-open-lead`.
   - **Omit the Call link.**
   - Use `max-height: calc(100dvh - 68px)` (current uses `100dvh - 84px`; the `dvh` unit is better than the design's `vh`).
9. Keep: the admin hide, route-keyed reset, Escape/outside-click close, `aria-label`s on both navs, and the skip link in `layout.tsx`.
10. Document the z-index: the design uses 40, current is 100, sticky CTAs use 150. Keep one stacking scale (standard §3).

### 1.4 Conflicts / questions
- **Phone number** (`UVHeader:39`, `tel:18001204050`, "Call 1800-120-4050"): violates constraint 2. Remove it. If a contact line is wanted, use `admin@unnatividya.com`.
- **IA vs standard §3 and constraint 10:**
  - The standard says "Primary navigation: Courses, Universities, Compare, Resources, Tools. Saved courses and Apply now are utilities." The design's flat six links drop the Resources and Tools groups.
  - On desktop there is no link to `/blog` (Articles), `/how-we-verify`, `/tools/total-cost`, `/tools/eligibility-checker` or `/recommender`. "Tools" points only at the EMI calculator (`UVHeader:56`).
  - The total cost planner, eligibility checker, recommender and CMS blog are must-keep features (constraint 10). They need a nav route.
  - Recommended options: (a) keep the "Tools" and "Resources" disclosures with the design's visual style, or (b) make "Tools" a disclosure containing all four tools and "Guides" a disclosure with Degree guides, Articles and How we verify.
  - **Owner question:** flat (design) vs grouped (standard)?
- **Label/target mismatch:** "Explore Degrees" (`:56`) links to the Courses listing. Every other place says "Courses" (footer "All courses", breadcrumbs). Question: keep "Explore Degrees" or "Courses"?
- **"Find my fit" vs "Find my course":** the design header uses "Find my fit" (`:37`) while the design footer uses "Find my course" (`UVFooter:23`). The current site uses "Find my course" and the recommender heading "Find a course that fits your preferences". The design is inconsistent with itself. Choose one name.
- **"Shortlist (n)" vs "Saved courses":** the current label and the standard §3 say "Saved courses". The design also always shows "(0)". Choose the label and the zero behaviour.
- **Icon change:** the save icon changes from heart to bookmark. If adopted, this is a site-wide change (header, `SaveButton`, `/shortlist` copy "Use the heart on a course to save it" in `shortlist-view.tsx:37`).
- **Target sizes:** nav links about 36px, search 40×40, shortlist about 38px and Apply about 38–40px are all below the standard's ≥44px aim (constraint 11). Use min-height 44.
- **Accessibility gaps in the design:**
  - The menu toggle is a `div` with no role, keyboard support or `aria-expanded`.
  - The search link has only ligature text.
  - No `aria-current`, no nav labels, no Escape handling, no focus management.
  - Keep all current a11y behaviour.
- **JS width detection** (`state.w`, `:46-57`) renders desktop-first on SSR (`w:1280`), so mobile users get a flash. Use CSS.
- **Breakpoint** 1080 vs current 1100. The `StickyCtas` floating Apply button is tied to `min-width:1101px` (`globals.css:4268`). Changing to 1080 needs both updated together.
- **Primary colour** `#5B4CF0` vs "Preserve existing purple/ink/background tokens" (standard §2). Treat it as an owner-approved rebrand or keep `#544CC8`. Applies site-wide.

---

## 2. Footer (`UVFooter.dc.html`)

### 2.1 Design spec
**Container** (`UVFooter:10`): `<footer>` background `#1A1646`, colour `#C3C0E6`, Plus Jakarta, `margin-top: 80px`.

**Top grid** (`:11`): `max-width 1240; margin 0 auto; padding 56px clamp(16px,3vw,32px) 32px; display grid; grid-template-columns repeat(auto-fit, minmax(160px,1fr)); gap 36px`. No explicit breakpoints.

**Brand block** (`:12-20`), `grid-column: 1/-1; max-width 380px`:
- `<img src=/brand/unnatividya-logo-white.svg alt="Unnati Vidya">` at height 32px.
- `<p>` (margin 14px 0 0, 14px, line-height 1.65): **"India's unbiased marketplace for UGC-entitled online degrees. Compare, get counselled, enrol — all free."**
- Badge row (flex, gap 14, margin-top 16, align center): three `<img>` UGC, NAAC, AICTE (`alt="UGC"`, `"NAAC"`, `"AICTE"`), each `height 26px; background #fff; border-radius 6px; padding 3px`.

**Four link columns** (`:21-36`), each `flex column; gap 10px; 14px`. The heading is a **`<div>`** (`#fff; 700; margin-bottom 4px`), not a heading element. Links are `#C3C0E6` (inherits the global link hover rule: `#4A3BDB` plus underline, which would be dark purple on navy).
1. **Explore:** "All courses" → Courses; "Universities"; "Compare programs" → Compare; "Find my course" → Recommender; "Specializations".
2. **Popular degrees:** "Online MBA" → `Course?id=mba-muj`; "Online BCA" → `bca-muj`; "Online MCA" → `mca-muj`; "Online B.Com" → `bcom-muj`; "Online MSc Data Science" → `mscds-amity`.
3. **Resources:** "Degree guides" → Guides; "Articles" → **Guides** (same target as Degree guides); "EMI calculator"; "My shortlist" → Shortlist.
4. **Company:** "About us"; "How we verify our data" → HowWeVerify; "Apply now" → Apply (plain link style); `<a href="tel:18001204050" style="color:#fff;font-weight:700">` **"1800-120-4050"**.

**Bottom bar** (`:38-41`): `max-width 1240; padding 20px clamp(16px,3vw,32px) 28px; border-top 1px rgba(255,255,255,0.1); flex wrap; justify space-between; gap 12; 13px`.
- Left: **"© 2026 Unnati Vidya. All rights reserved."**
- Right: flex gap 20 wrap, "Privacy" → `Legal?tab=privacy`, "Terms" → `?tab=terms`, "Refund policy" → `?tab=refund`.

No newsletter, no email, no `nav` landmarks or `aria-label`s, no focus styles.

### 2.2 Current (`src/components/site-footer.tsx`, `globals.css:3374-3415, 4028-4039, 4521-4536`)
- Background `#263238`, text `#B8C4CA`, `marginTop:auto`. Grid `1.4fr 1fr 1fr 1fr`, max 1200, padding `48px 24px 32px`, gap 32. Below 1100px it becomes 2 columns, below 640px 1 column with top-border separators on each nav.
- Brand: white logo 24px, the same intro sentence (13px, max-width 280), and UGC/NAAC/AICTE badges on white tiles (56×30, radius 4, `next/image fill`).
- `<nav aria-label="Explore the website">` with `<h2>Explore</h2>`: All courses, Universities, Compare programs, Find my course, Degree guides, Specializations, EMI calculator, **Total cost planner**, **Eligibility checker**.
- `<nav aria-label="Featured courses">` with `<h2>Courses</h2>`: Online MBA/BCA/MCA/B.Com (MUJ slugs) and Online MSc Data Science (`/courses/online-msc-data-science-amity-online`).
- `<nav aria-label="About and support">` with `<h2>Company</h2>`:
  - Articles (`/blog`), About us, How we verify our data, My shortlist.
  - **Apply now** button (`btn primary footer-apply`, `data-open-lead`, `rel=nofollow`, `/lead?intent=footer`).
  - `mailto:admin@unnatividya.com`.
- **`<NewsletterSignup />`** (double opt-in, honeypot, status/error live regions, "How we use your email" link) in its own row.
- Bottom bar: "© 2026 Unnati Vidya" and `<nav aria-label="Legal policies">` with `/privacy`, `/terms`, `/refund-policy`.
- CSS: links min-height 44px; focus outline `3px #ffc857`; hover underline.

### 2.3 Changes required
1. Background `#1A1646`, text `#C3C0E6`, `margin-top: 80px` (or keep `auto` plus a top margin; the layout is not a flex column today, so `margin-top:auto` has no effect).
2. Grid becomes `repeat(auto-fit,minmax(160px,1fr))`, gap 36, padding `56px clamp(16px,3vw,32px) 32px`, max 1240. The brand block spans the full row (`grid-column:1/-1`, max 380). Remove the `1100px`/`640px` `!important` grid overrides, or keep the mobile separators as an enhancement.
3. Brand: logo 32px. Intro 14px/1.65. Badges 26px tall on white, radius 6, padding 3, gap 14.
4. Column headings: white/700, margin-bottom 4. Keep them as `<h2>` (or `<h3>`) inside `<nav aria-label>`. Link gap 10px visually, but keep the 44px min-height hit areas (the design's 10px gap with 14px text gives about 20px targets).
5. Reorganise into the four design columns with repo URLs:
   - **Explore:** `/courses`, `/universities`, `/compare`, `/recommender`, `/specializations`.
   - **Popular degrees:** the five existing `/courses/<slug>` links, unchanged. Heading "Popular degrees" replaces "Courses".
   - **Resources:** "Degree guides" `/online-degree-guides`, "Articles" **`/blog`** (not Guides), "EMI calculator" `/tools/emi-calculator`, **plus "Total cost planner" `/tools/total-cost` and "Eligibility checker" `/tools/eligibility-checker`** (must-keep features omitted by the design), "My shortlist" `/shortlist`.
   - **Company:** "About us" `/about`, "How we verify our data" `/how-we-verify`, "Apply now" (keep `data-open-lead rel=nofollow`; the design shows it as a plain link, the current shows a button, so decide), and **`admin@unnatividya.com`** in place of the phone (same visual treatment: `#fff` 700).
6. **Keep `<NewsletterSignup />`.** The design has no slot for it, so place it as a full-width row above the bottom bar or inside the brand column. Restyle its border and input to the new tokens (input border `#E4E1F3`, radius 10–12, button primary radius 10).
7. Bottom bar: padding `20px … 28px`, 13px, border `rgba(255,255,255,.1)`. Text "© 2026 Unnati Vidya. All rights reserved." (decide). Links `/privacy`, `/terms`, `/refund-policy` with gap 20.
8. Override the global link hover inside the footer: keep the light colour plus underline. The design's global `a:hover{color:#4A3BDB}` would make hovered footer links unreadable on navy (about 1.9:1). Keep the `#ffc857` focus ring or define a new on-navy focus ring.

### 2.4 Conflicts / questions
- **Phone** (`UVFooter:35`, "1800-120-4050" `tel:`): violates constraint 2. Replace with `admin@unnatividya.com` (the current behaviour; claims register "Removed (parked)").
- **Newsletter omitted:** constraint 1 and 10 require footer newsletter sign-up. It must stay.
- **Tools omitted:** the total cost planner and eligibility checker are absent from the design footer and header (constraint 10).
- **"Articles" → Guides** (`:31`): the design duplicates the target. Articles are the CMS blog at `/blog`, a separate feature (constraint 10).
- **Legal URLs:** `Legal?tab=` must map to `/privacy`, `/terms`, `/refund-policy` (constraint 10). The README also says Legal copy is placeholder; it does not apply here because the repo pages exist.
- **Badges** (UGC, NAAC and AICTE logos next to "India's unbiased marketplace…"): constraint 8 says "institution badges must not imply program approval". Regulator logos in a marketplace footer imply that the site or all programs are approved. The current footer has the same badges, so this is an existing risk. **Question:** keep, remove, or add an explanatory label/link to `/how-we-verify`? AICTE in particular is not a recognition body for every listed program.
- **"UGC-entitled online degrees"** in the intro: a blanket claim, also in the current footer. 2026-27 recognition is per program: 25 direct matches and 5 Amity programs attributed to Amity UP by owner statement (claims register "Recognition"). **Question:** reword to e.g. "online degrees from UGC-entitled universities", or keep as owner-stated.
- **"all free"** / "get counselled": the claims register lists free counselling as owner-stated, so OK.
- **Popular degrees ids:** `mscds-amity` must become slug `online-msc-data-science-amity-online`. The current footer already has it.
- **Heading semantics:** design `<div>` headings vs current `<h2>` in labelled navs. Keep the semantic version.
- **"Apply now" as a plain link** in a link list vs the current primary button. Ambiguous whether the design intends it as a CTA.

---

## 3. Program card (`UVCard.dc.html`)

### 3.1 Design spec
Prop `courseId`. Data comes from `UV.card(UV.byId(id))` (`uv-data.js:86`): `{...course, uniName, uniShort, logo, campus, feeF: inr(fee), emiF: inr(emi)+'/mo', lvlLong, specCount, href, applyHref}`. Saved and compare states come from `UV.store`. It re-renders on `uv-store`.

**Loading skeleton** (`UVCard:11-18`), shown while data is missing:
- Root `<div aria-busy="true">`: `height 100%; min-height 290px; background #fff; border 1px #EEECF6; radius 16; padding 20; flex column; gap 14`.
- Row A: 46×46 radius-12 shimmer block plus a column (gap 8) with a 14px-high 60%-wide bar and a 10px 40% bar (radius 6).
- Row B: two static blocks, 20×40 and 20×90, radius 6, `#F3F1F9`.
- Row C: 64px-high radius-12 shimmer block, `margin-top:auto`.
- Row D: two flex-1 42px radius-10 blocks, `#ECE9FE` and `#F3F1F9`.
- Shimmer: `linear-gradient(90deg,#F1EFF8 25%,#F8F7FC 50%,#F1EFF8 75%)`, `background-size 200% 100%`, `@keyframes uvShimmer {0%{background-position:100% 0}100%{background-position:-100% 0}}`, `1.4s linear infinite`. No reduced-motion handling.

**Ready card** (`:19-46`). The root is a `<div>` (not `article`): `height 100%; background #fff; border 1px #E8E6F3; radius 16; padding 20; flex column; gap 14; transition box-shadow .2s, border-color .2s`. Hover: border `#CFC9FA`, shadow `0 18px 40px -24px rgba(60,45,170,0.4)`. No focus-within style.

1. **Row 1** (`flex; gap 12; align-items flex-start`):
   - Icon tile `<span>` 46×46, radius 12, background `#F1EEFF`, colour `#5B4CF0`, icon 24px, `flex:none`. Icon per stream (`uv-data.js:44`): Management `business_center`, IT & Computers `computer`, Commerce `account_balance`, Arts & Humanities `auto_stories`.
   - Middle (`flex 1; min-width 0`):
     - Title `<a href=c.href>` **"Online MBA"** (`c.title` = "Online " + short): 17px/800, `#16133F`, letter-spacing −0.01em, no underline. Not a heading element.
     - Below it: `flex; align center; gap 6; margin-top 4; 13px; #6F6D8C`, with the university logo `<img alt="">` 16×16 `object-fit contain` and then the full university name `c.uniName`.
   - Save toggle: **`<div onClick title="Shortlist">`**, 36×36, radius 10, flex-centred, icon 22px `#5B4CF0`, `flex:none`. Icon `bookmark` with background `#F8F7FD` when unsaved; `bookmark_added` with background `#ECE9FE` when saved.
2. **Row 2** (`flex wrap; gap 6; align center`):
   - Level badge `c.lvl` ("PG"/"UG"): 11px/800, padding 3×8, radius 6, background `#ECE9FE`, colour `#5B4CF0`.
   - **"UGC-entitled"** pill: 12px/600, padding 3×8, radius 6, background `#E7F6EE`, colour `#12784B`. Static on every card.
   - Rating `"★ {rating}"` 12px/700 `#16133F` (the star is navy, not `#F0A30A`), then `"({reviews})"` 12px `#8E8CA8`.
3. **Row 3** stat block: `grid 3 × minmax(0,1fr); gap 8; padding 12; radius 12; background #F8F7FD; margin-top auto` (pins to the bottom). Each cell is a label (11px/600 `#6F6D8C`) over a value (14px/800 `#16133F`, margin-top 2):
   - "Duration" → `"{months} mo"` (e.g. "24 mo")
   - "Total fee" → `feeF` (e.g. "₹1,80,000")
   - "EMI from" → `emiF` (e.g. "₹7,500/mo")
4. **Row 4** (`flex; space-between; align center; 13px`): `<a href="Specializations.dc.html">` `specCount` at 700. The text is "N specialisations", or **"1 specialisation"** when `specs[0]==='General'`. It links to the **generic** Specializations index.
5. **Row 5** (`flex; gap 8`):
   - **"View details"** `<a href=c.href>`: `flex 1; centred; padding 11; radius 10; background #5B4CF0; white; 700; 14px`, hover `#4A3BDB`.
   - Compare toggle **`<div onClick>`**: `flex 1; centred; padding 10; radius 10; border 1px #D6D0FA; 700; 14px; colour #5B4CF0`. Label **"+ Compare"** on background `#fff`, or **"✓ In compare"** on background `#ECE9FE`. It calls `toggleCompare` (max 3, drops the oldest).

There is no Apply now on the card (`applyHref` is computed in `uv-data.js:86` but unused by the card), no specialisation chips, and no analytics.

Grid usage: Home `auto-fill minmax(min(100%,340px),1fr)` gap 20. Courses, Course "similar", Shortlist, Specialization and Recommender use `minmax(min(100%,300px),1fr)` gap 14.

### 3.2 Current card implementations (there is no single shared card component)
- **Home "Popular online degrees"** (`src/app/page.tsx:243-277`):
  - `<article>` with border `#CFDAE6`, radius 8, padding 18, gap 10.
  - Top row: level pill (PG `#4D00FF` on `rgba(77,0,255,.1)`, UG `#0F5BB8`), "★ rating" (star `#FDB515`) and `SaveButton` (28px).
  - Title `course.name` 17/700 as a `div` (not a link), then the university name.
  - First 3 specialisation chips.
  - Facts row: duration, "**₹X** total", "EMI ₹…/mo".
  - Buttons: "View course" (primary 38px, radius 4, `data-track-event="course_card_click"`) and **"Apply now"** (`/lead?course=<id>&intent=enquire`, `data-open-lead`, rel nofollow).
  - No compare action.
- **Courses list** (`src/components/course-explorer.tsx:226-291`):
  - Horizontal list card: grid `56px 1fr auto`, with a logo tile.
  - Level and stream, `SaveButton` 28px.
  - Title link "{name} — {university}" 18/700.
  - Facts: "**₹fee** total", duration, "Financing: {emi}", and a quieter rating with the reviews count formatted en-IN.
  - Up to 4 specialisation chips.
  - Actions column: "View details", "Apply now" (lead) and "+ Add to compare" (`/compare?add=<id>`, tracked).
  - A note above the list: "Tuition shown. Check each program for current fees and eligibility."
- **Similar programs** (`app/courses/[slug]/page.tsx:489-498`): a compact link card "{name} — {short}" with "duration · fee · ★ rating".
- **University program cards** (`app/universities/[slug]/page.tsx:234-236`): `guide-fee-card university-program-card` with `SaveButton` size 44.
- **Shortlist cards** (`shortlist-view.tsx:53-60`):
  - `<article aria-labelledby>`, logo, Remove, h3 name, university.
  - `dl`: "Listed total tuition", Duration, "EMI from".
  - Ratings and placement are collapsed in a `<details>`.
  - "Select for comparison" checkbox (max 3), "View course" and "Apply now".
- **`SaveButton`** (`save-button.tsx`): a real `<button>` with `aria-pressed` and `aria-label` "Save to shortlist"/"Remove from shortlist". Circular, border `#CFDAE6`/`#544CC8`, heart icon. It calls `preventDefault` and `stopPropagation`. The home and explorer use **size 28** (below the 44px target); the course page uses 36 and the university page 44.

### 3.3 Changes required
1. Create one shared `CourseCard` server component (with small client islands for save and compare). Use it on Home, Courses (grid instead of list; see the Courses report), Shortlist, Specialization, similar programs and Recommender "more".
2. Markup: an `<article aria-labelledby>` root. Make the title an `<h3>` containing a `<Link href={`/courses/${slug}`}>`, with the design styles (17/800, `#16133F`, −0.01em). Optionally add a stretched-link pattern so the whole card is clickable, while keeping the inner buttons above it.
3. Icon tile: 46×46, radius 12, `#F1EEFF`/`#5B4CF0`, lucide icon by stream (`aria-hidden`).
4. University line: logo `next/image` 16×16 `alt=""` plus `university.name` (13px `#6F6D8C`).
5. Save toggle: reuse `useShortlist`. Restyle `SaveButton` (or add a `variant`) to radius 10, unsaved background `#F8F7FD` and saved `#ECE9FE`, icon `Bookmark`/`BookmarkCheck` 22px `#5B4CF0`. **Make the hit area 44×44** (a visual 36 inside a 44 hit area, or 44 outright). Keep `aria-pressed` and the descriptive `aria-label` including the course and university (e.g. "Save Online MBA, MUJ").
6. Row 2: the level badge (11px/800 per design; the standard says avoid 11px core facts, so consider 12px). **Replace the static "UGC-entitled" pill with the per-program recognition result** (`recognitionSummary(course)` in `lib/program-facts.ts:69`). Possible compact label: "UGC-DEB 2026-27: listed" (green) or "Recognition: being re-checked" / "confirm awarding university" (neutral or amber). Rating "★ 4.7 (1,420)" with reviews formatted en-IN. Fix the review-count contrast (see conflicts). Never use the rating for order or emphasis.
7. Stats block: background `#F8F7FD`, radius 12, padding 12, 3 columns, `margin-top:auto`.
   - "Duration": use `course.duration` ("24 months") or derive "24 mo".
   - "Total fee": formatted Indian-applicant tuition, labelled "Total tuition" or "Listed tuition" to match current wording and the standard.
   - "EMI from": `course.emi`, keeping the owner-stated no-cost EMI wording.
   - Labels ≥12px if following the standard (design 11px).
8. Row 4: specialisation count link. Point it to `/specializations?degree=<courseLabel>` (the explorer supports `degree`) or `/courses/<slug>#sec-specialisations`. Do not show "1 specialisation" for "General" (see conflicts).
9. Row 5 actions:
   - "View details" (primary, radius 10, min-height 44, keep `data-track-event="course_card_click"`).
   - Compare toggle as a real `<button aria-pressed>` with "+ Compare" / "✓ In compare" (the ✓ glyph `aria-hidden`; the accessible name stays "Add Online MBA, MUJ to compare"), backed by a new `useCompareList`. Keep the `compare_course_added` analytics.
   - **Decide on Apply now** (see conflicts). Current cards all carry "Apply now".
10. Hover: border `#CFC9FA` and shadow `0 18px 40px -24px rgba(60,45,170,.4)`, transition .2s. Add an equivalent `:focus-within` style. Under reduced motion, keep the transitions instant (no transform is used, which is good).
11. Skeleton: only where data loads client-side. Home and Courses are server-rendered (`force-dynamic`), so the skeleton is mostly unnecessary there. If used: `aria-busy="true"` on the grid container (not on each card) plus a visually hidden "Loading programs" status, and `@media (prefers-reduced-motion: reduce){animation:none}` on the shimmer (standard §10 names "loading shimmer" explicitly).

### 3.4 Conflicts / questions
- **"UGC-entitled" pill on every card** (`UVCard:31`): conflicts with constraint 8 (recognition is a per-program dated UGC-DEB 2026-27 result). The claims register removed "UGC-entitled" from course overviews ("2026-27 recognition is pending"; `program-facts.ts:57` strips it). Five Amity programs are listed only under Amity UP (owner attribution). The pill must be data-driven or removed.
- **No "Apply now" on the card:** the design drops the per-card lead entry that every current card has (home, explorer, shortlist, recommender). Constraint 1 ("Apply now" everywhere generic) does not require it on cards, but removing it is a conversion change. **Owner question:** keep a third action, swap Compare for Apply, or accept the design?
- **Compare toggle needs a persistent compare list:**
  - Today compare state is URL-only and results are OTP-gated (constraint 3). The new store must feed `/compare?add=…`, never bypass `CompareGate`, and the tray CTA must lead to the gated tool.
  - The design default `['mba-muj','mba-smu','mba-amity']` (`uv-data.js:54`) would make the MBA cards on Home show "✓ In compare" for a brand-new visitor, which is misleading. Start empty. (The current `/compare` defaults to `mba-muj, mba-amity` only when `add` is absent, which is a different thing.)
  - Silently dropping the oldest item when adding a 4th (`:56`) gives no feedback. Add a live-region message or block at 3 (the current picker blocks at 3).
- **Ratings:** visible per constraint 5, OK. The design colours the star navy (card) while the README says `#F0A30A`; the star colour is ambiguous. The review count `#8E8CA8` on white is **3.25:1**, failing 4.5:1 for 12px text (standard §2). Darken it to `#6F6D8C` (4.95:1).
- **"1 specialisation" for General** (`uv-data.js:86`): "General" is skipped as "not a real differentiator" in `lib/specializations.ts:23-25`. Showing "1 specialisation" for e.g. M.Com MUJ or MA English misleads. Hide the row, or show "No specialisation (general)".
- **Spec-count link to the generic index** (`UVCard:40`): it lands on the unfiltered `/specializations`. Ambiguous intent; filter by degree.
- **"Total fee" label vs category fees:** card fees are the Indian-applicant tuition. NRI/foreign fees differ (constraint 10, category selector on course pages). The current explorer says "Tuition shown…". **Question:** label "Tuition (Indian applicants)" or keep "Total fee"?
- **Duration format "24 mo"**: the repo has strings; deriving needs parsing. Ambiguous whether "mo" is the desired copy.
- **Target sizes:** the save toggle is 36×36 and the buttons about 40–42px tall (padding 11 + 14px text), below 44 (constraint 11).
- **Accessibility:** save and compare are `div`s with `onClick` (no keyboard, no role, no pressed state); the title is not a heading; the shimmer ignores reduced motion.
- **Font sizes:** 11px level badge and stat labels vs the standard's "avoid dense 11px core decision facts".

---

## 4. FAQ accordion (`UVFaq.dc.html`)

### 4.1 Design spec
Props: `items: [q, a][]`, `title` (default **"Frequently asked questions"**), `subtitle` (default **"Get quick answers to common questions about online degrees."**). Used on Compare, EMI, Guides, Course, Specialization, Recommender, Universities and University, but **not Home**.

- `<section>` (Plus Jakarta).
- **Header row** (`UVFaq:11-17`): `flex wrap; justify space-between; align-items end; gap 12; margin-bottom 20`.
  - Left: `<h2>` `margin 0; font-size clamp(24px,3vw,30px); letter-spacing -0.025em; 800; #16133F`, then `<p>` `margin 6px 0 0; #4A4867; 15px`.
  - Right: `<a href="Guides.dc.html">` **"View all FAQs"** plus `arrow_forward` 18px; 14px/700; flex gap 4.
- **Body** (`:18-33`): `flex wrap; gap 12`. Two columns, each `flex 1 1 380px; min-width 0; flex column; gap 10`. Items split by index: the first `ceil(n/2)` go left, the rest right.
- **Item:** `<div>` with `border 1px #E8E6F3` (open `#CFC9FA`), radius 12, background `#fff`.
  - Row `<div onClick>`: `cursor pointer; flex; align center; gap 12; padding 14px 16px; min-height 52px`.
  - `help` icon 20px `#5B4CF0`; question `flex 1; 15px/600; #16133F`; `add` (closed) or `remove` (open) icon 22px `#5B4CF0`.
- **Answer** (rendered only when open): `<p>` `margin 0; padding 0 16px 16px 48px; #4A4867; 14px; line-height 1.65`.
- **State:** a single `open` index (default −1, all closed). Clicking the open item closes it; opening another closes the previous one.

### 4.2 Current
- `.faq-item` native `<details name="…">` with `<summary>` (`globals.css:2450-2488`). This gives an exclusive accordion via the `name` attribute, works without JS, is keyboard accessible and keeps the answer in the DOM.
  - Style: border `#CFDAE6`, radius 8, summary 14px/600 padding 14×18 with a `+`/`−` after-glyph `#707070` 13px; answer 14px `#555`.
- Used on Home, the EMI calculator, total cost, universities/[slug], how-we-verify, guides/[slug], courses/[slug], specializations/[slug], recommender, compare pair pages and article-view.
- Each page also emits **FAQPage JSON-LD** from the same array (e.g. `page.tsx:111-115`, `courses/[slug]/page.tsx:120-130`).
- Single column; no "View all FAQs"; no section header component.

### 4.3 Changes required
1. Build a shared `<FaqAccordion items title subtitle viewAllHref? name>` server component that keeps **native `<details name>`/`<summary>`**. Restyle to the design:
   - Border `#E8E6F3`, radius 12, background white; `details[open]` border `#CFC9FA`.
   - Summary: flex, gap 12, padding 14×16, min-height 52, 15px/600 `#16133F`, leading `CircleHelp` 20px `#5B4CF0` (`aria-hidden`), trailing `Plus`/`Minus` 22px (CSS swap on `[open]`, `aria-hidden`). Hide the marker.
   - Answer: padding `0 16px 16px 48px`, 14px/1.65 `#4A4867` (or 15–16px per standard body).
2. Layout: two columns via `flex-wrap` with `flex: 1 1 380px`, gap 12 between columns and 10 between items. Same split rule (first half left). Consider CSS `columns` or a single DOM list so reading and tab order stay logical; the design's split is acceptable because column 1 is read fully first.
3. Header row: H2 `clamp(24px,3vw,30px)`/800, subtitle 15px `#4A4867`. The "View all FAQs →" link is only rendered when a real target exists (see conflicts).
4. Keep the FAQPage JSON-LD generation beside each usage.
5. Default: all items closed (design) vs current Home, which opens the first (`page.tsx:447 open={index===0}`). Decide.
6. Under reduced motion: no animation is specified, so make none.

### 4.4 Conflicts / questions
- **"View all FAQs" → Guides** (`UVFaq:16`): no FAQ hub exists in the repo, and Guides (`/online-degree-guides`) is not an FAQ page. Placeholder target. **Question:** drop the link, point to `/online-degree-guides`, or build an FAQ page?
- **Accessibility:** a `div onClick` header with no button semantics, no `aria-expanded`, and content removed from the DOM when closed. Answers hidden from the DOM also weaken the FAQPage structured-data match. Use `<details>`.
- **The phone number in the shared FAQ data** (`uv-data.js:72`, `FAQ_GENERAL[5]`: "How can I speak to an expert? — Call 1800-120-4050 or request a callback. A counsellor will call you, usually within one working day."): this feeds UVFaq on other pages. Violates constraint 2. "request a callback" also does not match the lead flow (constraint 1: contact-first form with OTP; no appointment booking). Rewrite it to point to "Apply now" / `admin@unnatividya.com`. Do not promise "within one working day" unless the owner confirms it.
- **"Can I pay via EMI? Every listed program offers no-cost EMI…"** (`uv-data.js:69`, `Home.dc.html:227`): owner-stated exception (claims register). Keep the exact existing wording; do not expand.
- **"Is counselling really free? Yes — universities compensate us equally… no commission bias"** (`uv-data.js:68`, `Home.dc.html:227`): this is the "every university pays us the same" type of claim. Decision §11 #3 replaced it with "No hidden charges", and §11 #14 says "'No hidden charges' stays the only statement". The sentence is also still in the current Home FAQ (`page.tsx:24`). **Flag for the owner:** the design re-propagates a claim the owner replaced.

---

## 5. Home (`Home.dc.html`)

### 5.0 Page shell and section order
- `<helmet>` (`:10-16`): Google Fonts links (blocked by CSP; see 0.5). Global CSS: `body{margin:0;font-family:Plus Jakarta;color:#16133F;-webkit-font-smoothing:antialiased}`, `*{box-sizing:border-box}`, `a{color:#5B4CF0;text-decoration:none} a:hover{color:#4A3BDB;text-decoration:underline}`, `select{font-family:inherit}`.
- Wrapper: `min-height 100vh; flex column; background #fff`. Then: sticky header (`active=""`) → **navy hero section** (outside `<main>`) → `<main style="flex:1;max-width:1240px;width:100%;margin:0 auto;padding:0 clamp(16px,3vw,32px)">` → footer.
- Order: **Hero (with approvals strip) → Popular online degrees → Browse by stream → Course matching → Universities we cover → Compare teaser → How UnnatiVidya works + perks → What learners say → FAQ (custom 2-col)**.
- Every main section is `padding-top: 72px`. There is no bottom padding; the footer's `margin-top: 80px` closes the page.
- **Current order** (`src/app/page.tsx`): light hero → approvals strip (separate band) → Course matching (light, with image) → Popular online degrees (grey band) → Browse by stream → Universities → How it works → 6-tile perks → **"Why learners trust UnnatiVidya"** band → Compare teaser (dark band) → What learners say → FAQ (800px column, `details`) → **`StickyMobileBar`** (Apply now + Browse courses, ≤640px). Plus the FAQPage JSON-LD. `PublishedCatalogBoundary` wraps everything and mounts the lead modal.

### 5.1 Hero (`Home.dc.html:20-69`)

**Section:**
- `position relative; overflow hidden; color #fff`.
- Background: `radial-gradient(640px 360px at 88% 8%, rgba(124,108,255,.45) 0%, rgba(124,108,255,0) 70%), radial-gradient(520px 320px at 0% 100%, rgba(91,76,240,.35) 0%, rgba(91,76,240,0) 70%), #16133F`.

**Grid:** `max-width 1240; margin auto; padding clamp(40px,6vw,72px) clamp(16px,3vw,32px) 48px; display grid; grid-template-columns repeat(auto-fit, minmax(min(100%,460px),1fr)); gap clamp(32px,5vw,56px); align-items center`. It collapses to one column below roughly 1050px of container width (2×460 + gap + gutters). There is no explicit breakpoint.

**Left column:**
1. **Eyebrow pill** (`:23`): `inline-flex; gap 8; padding 6px 12px; radius 99; background rgba(255,255,255,.08); border 1px rgba(255,255,255,.16); 12px/700; letter-spacing .06em; #CFC9FF; uppercase`. Text: **"UGC-entitled · 30 programs · 3 universities"** (hard-coded).
2. **H1** (`:24`): `margin 20px 0 0; font-size clamp(40px,5.2vw,64px); line-height 1.04; letter-spacing -0.035em; 800; text-wrap balance; #fff`. Text: **"Find an online degree that fits "** + `<span style="color:#A99EFF">you.</span>`.
3. **Paragraph** (`:25`): `margin 20px 0 0; font-size clamp(16px,1.6vw,18px); line-height 1.6; #CFCCEE; max-width 520px; text-wrap pretty`. Text: **"Explore Manipal University Jaipur, Sikkim Manipal University and Amity Online. Compare tuition, entry requirements and study options."** (identical to current).
4. **Search card** (`:26-36`): `margin-top 32px; background #fff; radius 16; box-shadow 0 24px 50px -20px rgba(0,0,0,.5); padding 8px; flex wrap; gap 4px; align-items stretch`.
   - `<label>` 1: `flex 1 1 150px; padding 8px 12px; radius 10; flex column; gap 2`.
     - Caption **"Degree level"**: 11px/700, letter-spacing .06em, uppercase, `#6F6D8C`.
     - `<select>`: `border 0; padding 0; 15px/600; #16133F; transparent; outline none`. Options **"Any level"** (`""`), **"Undergraduate"** (`UG`), **"Postgraduate"** (`PG`).
   - `<label>` 2: same, plus `border-left 1px #EFEEF8` (no radius). Caption **"Stream"**. Options **"Any stream"**, "Management", "IT & Computers", "Commerce", "Arts & Humanities" (value = text).
   - `<a href={searchHref}>` **"Show programs →"**: `flex 1 0 auto; padding 0 22px; min-height 52px; radius 10; background #5B4CF0; white; 700; 15px; flex-centred; gap 8`. Hover `#4A3BDB`.
   - `searchHref` = `Courses?` + only the non-empty `stream` and `lvl` (`:230`).
5. **Popular row** (`:37-40`): `margin-top 18; flex wrap; gap 8; align center; 13px; #A9A6D6`.
   - Label **"Popular:"**.
   - Chips **"Online MBA"**, **"Online BCA"**, **"Online MCA"**, **"Online B.Com"** → `Courses?degree=MBA|BCA|MCA|B.Com`. Chip style: `padding 6px 12px; radius 99; border 1px rgba(255,255,255,.2); background rgba(255,255,255,.06); #fff; 600`. Hover background `rgba(255,255,255,.14)`.

**Right column** (`:42-54`), wrapper `position relative; padding 20px 24px 32px 0`:
- `<img src=/hero/student-online-degree.webp alt="Online learner">`: `width 100%; aspect-ratio 5/4; object-fit cover; radius 24; display block; background #2A2660; box-shadow 0 40px 80px -40px rgba(0,0,0,.7)`.
- **Card A** (bottom-left): `position absolute; left -8px; bottom 4px; background #fff; colour #16133F; radius 16; padding 16px 18px; shadow 0 18px 40px -16px rgba(0,0,0,.5); min-width 200px`.
  - **"Lowest MBA in our catalog"** (12px/600 `#6F6D8C`)
  - **"₹1,20,000"** (26px/800, −0.02em, margin-top 2)
  - **"SMU · EMI ₹4,583/mo"** (12px `#4A4867`, margin-top 2). All hard-coded.
- **Card B** (top-right): `position absolute; right 0; top 0; background #5B4CF0; white; radius 16; padding 14px 18px; same shadow`.
  - **"Average package"** (12px `#DCD8FF` 600)
  - **"₹7.2 LPA"** (24px/800)
  - **"MUJ online learners"** (12px `#DCD8FF`). Hard-coded.

**Approvals strip** (`:56-68`), in a row `max-width 1240; padding 0 clamp(16px,3vw,32px) 40px`:
- Box: `flex wrap; align center; gap 20; padding 16px 20px; background rgba(255,255,255,.06); border 1px rgba(255,255,255,.12); radius 14`.
- **"APPROVALS THAT MATTER"**: 12px/700, .08em, `#A9A6D6` (a plain span, not a heading).
- Logos box (`flex wrap; gap 10; flex 1`): 5 white tiles (`radius 8; padding 5px 8px; flex`), each an `<img>` 24px tall: UGC, NAAC, AICTE, WES, AIU (alt equals the acronym).
- **"How we verify →"** → HowWeVerify, 14px/700 `#CFC9FF`.

**Current hero** (`page.tsx:120-203`):
- Light gradient `#F4F3FC→#fff`. Grid `1.05fr .95fr`, collapsing at 900px.
- Eyebrow **"Explore undergraduate and postgraduate degrees"** with a green dot.
- H1 43px/700 (no accent). The same paragraph.
- A text search **`<form role="search" action="/courses" method="get">`** with `<input name="q">` (placeholder "Search a course, e.g. Online MBA") and a **"Search"** button (tracked `course_search`). Works without JS.
- **"Browse:"** chips → `/courses?q=MBA|BCA|MCA|BCom`.
- **Catalog summary line:** "{n} programs · {n} universities · **10k+ learners guided**" (owner claim).
- Visual: image 360px tall, radius 8, `next/image priority`, alt "Online learning".
  - Fact card "Lowest MBA in our catalog" **computed** from the catalogue (cheapest MBA, with university short name and EMI).
  - "Average package" card **computed** by picking the university with the highest `avgPackage`, labelled "{short} online learners".
  - Under 900px the fact cards become static grid cells under a 190px image.
- Separate white approvals band (5 logos 44×24, "How we verify →" link).

**Changes required (hero):**
1. Swap to the navy section with both radial glows. Use the grid `auto-fit minmax(min(100%,460px),1fr)` with the gap and padding clamps above.
2. Eyebrow pill styled as specified. Content per decision (see conflicts). Counts must come from the catalogue (`courses.length`, `universities.length`), not literals.
3. H1 at the new size and weight with the `you.` accent span `#A99EFF`. Keep `text-wrap: balance`. Check the standard §2: "H1 approximately 30–36px mobile / 40–48px desktop". The design's `clamp(40px,5.2vw,64px)` reaches 64px at ≥1231px and is 40px on a 390px phone (above the 30–36 guidance). Consider `clamp(32px,5.2vw,56px)` or get owner sign-off. The current mobile override is `clamp(30px,7.5vw,38px)`.
4. Paragraph: `#CFCCEE`, `clamp(16px,1.6vw,18px)`, max 520.
5. **Search card:**
   - Implement as `<form action="/courses" method="get" role="search" aria-label="Find a course">` so it works without JS.
   - Selects named **`level`** (values `UG`/`PG`) and **`stream`**, which is what `course-explorer.tsx` reads. Empty values must be stripped: either `disabled` on empty options via a small client script, or have the explorer ignore empty params (it already does for `stream`/`level`, since `readList` filters to allowed values, so empty is harmless).
   - Submit button "Show programs →" (arrow `aria-hidden`), min-height 52, radius 10.
   - **Restore a visible focus indicator.** The design sets `outline:none` on the selects. Add `:focus-within` on each label or a ring on the card; current has `.uv-home-search:focus-within`.
   - Use select font-size ≥16px to avoid iOS zoom (design 15px).
   - Decide whether to keep a free-text `q` field (see conflicts).
6. Popular chips: label "Popular:" (design) vs "Browse:" (current). Targets must be supported:
   - `?degree=` does not exist in `CourseExplorer`. Add a degree filter (the Courses design has one), or keep `?q=`.
   - **Fix "B.Com":** the current `/courses?q=BCom` does not match "B.Com" in the explorer's haystack (`course-explorer.tsx:73`, plain substring). The "Online B.Com" chip today most likely returns 0 results. Use `q=B.Com` or the degree filter.
   - Chip min-height 44 (design about 30px).
7. Right column: `next/image` (priority, `sizes`) with aspect 5/4, radius 24, background `#2A2660`, and the shadow. Alt text decision ("Online learner" vs current "Online learning"; the image is decorative-ish).
8. Floating cards restyled (Card A white radius 16 with 26px value; Card B `#5B4CF0`). **Keep the values computed from the catalogue** (current behaviour), not the literals.
   - Mobile: the design positions them absolutely with `left:-8px`. At ≤460px wide, Card A (min-width 200) and Card B overlap the image and possibly each other. Keep the current ≤900px rule that turns them into static cells under the image, or verify at 320/360/390.
   - Card B secondary text `#DCD8FF` on `#5B4CF0` is **4.1:1** (fails 4.5 at 12px). Use `#fff` or `#EEEBFF`.
9. Approvals strip moves inside the hero:
   - Translucent box, label `#A9A6D6` (7.6:1 OK), 5 white-tile logos (`next/image`, height 24), "How we verify →" (`/how-we-verify`, `#CFC9FF`).
   - Ensure the logos' alt text is meaningful ("UGC", etc.) or group them with a visually hidden list label.
   - Make the label a `<p>`/`<h2 class="sr-only">` pattern if it should be a landmark heading.
10. Keep (relocate) the **"10k+ learners guided"** owner claim. The design has no slot. Options: a third segment of the eyebrow ("… · 10k+ learners guided"), or a small line under the Popular chips in `#A9A6D6`.

### 5.2 Popular online degrees (`Home.dc.html:71-79`)
- Header row: `flex wrap; space-between; align-items end; gap 16; margin-bottom 28`.
  - `<h2>` **"Popular online degrees"**: `clamp(26px,3.2vw,32px)`, −0.025em, 800.
  - `<p>` **"Compare listed tuition and duration, then open a course for its requirements and current fee details."** (margin-top 8, `#4A4867`, 16px). Same copy as current.
  - Right: link **"Browse all 30 →"** (15px/700, primary) → Courses.
- Grid: `repeat(auto-fill, minmax(min(100%,340px),1fr))`, gap 20. 6 × UVCard: `mba-muj, bca-muj, mca-muj, mba-smu, bcom-muj, mscds-amity` (`:232`).
- **Current:** `page.tsx:233-281`. Grey band `#F7F8F9`, fixed 3-column grid, 6 custom articles using `msc-data-science-amity`, "Browse all {courses.length} →" (dynamic).
- **Changes:**
  - Remove the grey band (white background, 72px top spacing).
  - Header as specified. Keep "Browse all {n} →" computed.
  - Use the shared `CourseCard` (§3) in the auto-fill grid.
  - Map `mscds-amity` to `msc-data-science-amity`. The filter-out-missing logic stays, so the grid survives unpublished courses.
- **Conflicts:** card conflicts as in §3.4. The "→" glyph in link text should be `aria-hidden`.

### 5.3 Browse by stream (`Home.dc.html:81-102`)
- Header: `<h2>` **"Browse by stream"** plus link **"All specializations →"** → Specializations. No subtitle.
- Grid: `auto-fill minmax(min(100%,260px),1fr)`, gap 20. 4 tiles from `:233`:
  - "Management" / "6 degrees · BBA, MBA" / "from ₹90,000" / img `management`
  - "IT & Computers" / "7 degrees · BCA, MCA, MSc Data Science" / "from ₹80,000" / `it-computer-applications`
  - "Commerce" / "7 degrees · B.Com, B.Com Honours, M.Com" / "from ₹75,000" / `commerce-finance`
  - "Arts & Humanities" / "10 degrees · BA, BA JMC, MA Economics" / "from ₹75,000" / `arts-humanities`
  - Each links to `Courses?stream=<encoded name>`.
- **Tile** `<a>`: `position relative; display block; radius 18; overflow hidden; aspect-ratio 4/5; background #2A2660; colour #fff`.
  - `<img alt="">` absolutely filling it (`object-fit cover`).
  - Overlay `linear-gradient(180deg, rgba(21,19,58,0) 35%, rgba(21,19,58,.92) 100%)`.
  - Bottom block (`left/right/bottom 20px`):
    - Name 22px/800 (−0.01em)
    - Meta 13px `#DCDAF7` (margin-top 6)
    - Divider row (`margin-top 14; padding-top 14; border-top 1px rgba(255,255,255,.2); flex space-between`): "from **₹X**" (13px `#DCDAF7`, value `<b>` white 15px) and a 32px white circle with "→" (navy, 800).
  - No hover transform (only `text-decoration:none`).
- **Current:** `page.tsx:283-302` plus `.stream-card` CSS. White bordered cards (radius 8, padding 20, hover lift −2px, reduced-motion safe) with a 3:2 illustration on top, then `<strong>` name, `<small>` "{count} degree(s) · {first 3 distinct short names}", and `<small>` "from ₹X". All computed from the catalogue. Links `/courses?stream=…`.
- **Changes:**
  - Restyle to full-bleed 4/5 image tiles with the overlay, the bottom block and the arrow circle (`aria-hidden`).
  - **Keep the computed count, examples and min fee** (the design literals happen to match the seed catalogue today but will drift).
  - Use `next/image fill` with `sizes`.
  - Add a focus-visible ring (white or `#A99EFF` outline offset 3).
  - Hover: no movement in the design. Optionally a slight overlay change; keep reduced-motion compliance.
- **Conflicts/ambiguity:**
  - "6 degrees" counts **programs** (e.g. MBA ×3 + BBA ×3), not distinct degrees. Existing wording, but misleading. Suggest "6 programs".
  - The design's example list shows 2–3 hand-picked names ("BA, BA JMC, MA Economics" skips MA JMC etc.). The current code takes the first 3 distinct names.
  - "from ₹X" is the Indian-applicant tuition minimum.
  - The design classes MSc Mathematics under IT & Computers (as does the repo).
  - Text over imagery: contrast is fine at the bottom (`#DCDAF7` on an overlay of about `#15133A` ≈ 13:1). Verify at 4/5 crop on narrow widths, where the text block can extend above the 35% transparent zone.

### 5.4 Course matching panel (`Home.dc.html:104-127`)
- Panel: `radius 24; background #16133F; colour #fff; padding clamp(24px,4vw,48px); grid auto-fit minmax(min(100%,380px),1fr); gap 48; align center`.
- **Left column:**
  - Eyebrow **"COURSE MATCHING"** (12px/700, .08em, `#A9A4FF`).
  - `<h2>` **"Start with your goals and budget."** (margin-top 12; `clamp(28px,3.4vw,36px)`, larger than the other H2s; −0.025em; 800; line-height 1.1).
  - `<p>` **"Explore an initial shortlist based on your preferences. Check the course’s entry requirements and confirm eligibility with the university before applying."** (margin-top 14; `#C9C6EC`; 16px/1.6; max 480). Same as current.
  - Buttons (flex wrap, gap 12, margin-top 28):
    - **"Get my shortlist →"** → Recommender: `padding 13px 22px; radius 10; background #fff; colour #16133F; 700; 15px`.
    - **"Compare manually"** → Courses: same padding, `border 1px rgba(255,255,255,.25)`, white text.
  - Note **"Takes about two minutes · no sign-up to see results"** (margin-top 16; 13px; `#9C98CC`).
- **Right column** (flex column, gap 10): 3 sample rows from `:243`: `[['mba-muj',92],['mba-smu',86],['mba-amity',78]]`, each linking to **Recommender**.
  - Row `<a>`: `flex; align center; gap 16; background rgba(255,255,255,.06); border 1px rgba(255,255,255,.1); radius 14; padding 14px 18px; white`. Hover background `rgba(255,255,255,.1)`.
  - Ring: 52px circle, background `conic-gradient(<col> <match×3.6>deg, rgba(255,255,255,.12) 0)` where col = `#12A35C` if ≥85 else `#8B7CFF`. Inner 42px circle `#1F1C4A` with "**{match}%**" (13px/800).
  - Text: title (15px/700, e.g. "Online MBA") and university (13px `#B9B6E8`).
  - Right: fee (800) and EMI (12px `#B9B6E8`).
  - Disclaimer below: **"Preference-based suggestions are a starting point, not an admission decision."** (12px `#9C98CC`, margin-top 4).
- **Current:** `page.tsx:205-231`. Light section: pill eyebrow "Course matching", h2 26px, the same paragraph, gradient button "Get my shortlist" plus outline "Compare manually", the same note. Right column: a card with `/hero/recommender-preview.webp` (160px) and the same disclaimer.
- **Changes:** restyle as a dark rounded panel inside `main`. Buttons min-height 44 (13px padding + 15px text ≈ 44). Arrow `aria-hidden`. Move it after "Browse by stream" (design order). Right-column content needs a decision (see conflicts).
- **Conflicts:**
  - **Invented sample match rows:** "92% / 86% / 78%" for MBA MUJ/SMU/Amity are fabricated. The real recommender (`recommender-quiz.tsx`) shows **no match percentages**: it filters on 5 questions, then Groq orders. The rows imply a ranking that puts MUJ first, with a green "strong match" colour, and they link to the recommender start rather than results. That conflicts with constraint 5 (ratings/unverified data must not drive recommendations; the design's own scoring in README §07–08 uses placement % and rating, which constraint 5 forbids). It also conflicts with constraint 7's spirit (no invented proof).
    - Options: (a) keep the current preview image; (b) show a static illustrative "how it works" list (the 5 question topics) with no scores; (c) show three real programs with **no** percentages, labelled "Example".
    - **Owner question.**
  - "Takes about two minutes · no sign-up to see results" is consistent with the current recommender ("Five quick questions. Free results, with no sign-up required."), so OK.
  - "Get my shortlist" naming collides with the Shortlist (saved courses) feature. Existing copy; flag only.
  - The ring colour carries meaning by colour alone.
  - Design inconsistency: the eyebrow colour `#A9A4FF` differs from the token `#A9A6D6` and the hero eyebrow `#CFC9FF`.

### 5.5 Universities we cover (`Home.dc.html:129-154`)
- Header: `<h2>` **"Universities we cover"**, `<p>` **"Three institutions, every program checked against the UGC-DEB entitlement list."**, link **"All universities →"**.
- Grid: `auto-fill minmax(min(100%,340px),1fr)`, gap 20. One card per university, the whole card an `<a href=University?id=>`.
  - Card: `background #fff; border 1px #E7E6F2; radius 18; overflow hidden; #16133F`. Hover: border `#C9C5F5`, shadow `0 16px 36px -20px rgba(43,35,140,.35)` (differs from the card-hover token).
  - Media: `position relative; aspect-ratio 16/8; background #ECEBFD`; campus `<img alt="">` cover.
  - Logo tile: `position absolute; left 20; bottom -24; 56×56; radius 14; background #fff; border 1px #EAE9F4; padding 8; shadow 0 6px 16px -8px rgba(0,0,0,.25)`, containing the logo `<img alt="">`.
  - Body padding `36px 20px 20px`:
    - Name 18px/800 (`u.name`)
    - "{loc} · est. {est}" (13px `#6F6D8C`, margin-top 4)
    - Approval pills (first 3 of `approvals`; flex wrap, gap 6, margin-top 14): **"✓ {approval}"**, 12px/600, padding 4×9, radius 6, background `#E8F6EE`, colour `#14774A`
    - Stat row (`grid 3 cols; margin-top 18; padding-top 16; border-top 1px #F0EFF6`): `{programs}` / "programs", `{placement}%` / "placement", `{avg}` / "avg package". Values 20px/800, labels 12px `#6F6D8C`.
- **Current:** `page.tsx:304-352`. Fixed 3-column grid; cards radius 8 with `uv-card` hover. 140px-high campus image with a logo chip inside at bottom-left. Name, "{city} · est. {established}", the first **4** approvals via `ApprovalBadge` (with icons, blue), and a flex row "N programs · 88% placement · ₹7.2 LPA avg". Links `/universities/{slug}`, tracked `university_card_click`. Campus alt from `universityMedia`.
- **Changes:**
  - Restyle as specified (aspect 16/8 media, overlapping 56px logo tile, 3-col stat row).
  - Link `/universities/{slug}` and keep the analytics attributes.
  - Make the name an `<h3>`.
  - Keep `next/image`.
  - Label the placement and package stats as university-wide (see conflicts).
- **Conflicts:**
  - **Placement % and avg package unlabelled:** constraint 4 says "Placement/package/partners are university-wide figures and must be labelled so" (deferred claims in the register). The design labels them just "placement" and "avg package", and so does the current home. The label needs e.g. "university-wide placement assistance" or a footnote. The 88/81/84% figures also read like a ranking when shown side by side.
  - **Approval pills "✓ UGC-entitled", "✓ NAAC A+", "✓ AICTE"** with green checks: constraint 8 says institution badges must not imply program approval; the claims register lists university approvals as "not yet sourced per badge". A green ✓ adds a "verified" connotation. **Question:** drop the ✓ and green, or keep the current neutral `ApprovalBadge`.
  - **"every program checked against the UGC-DEB entitlement list"**: NEXT_PHASE T5 flagged this phrase. Since the 2026-27 check covers all 30 (25 direct plus 5 owner-attributed), it is defensible only once the recognition proposals are applied and deployed (claims register: "Public sourcing requires deployment and application"). Confirm with the owner. The text is identical to current.
  - Design `about`/`learners` placeholders are not shown on this card, so not relevant here.

### 5.6 Compare teaser (`Home.dc.html:156-173`)
- Panel: `background #F4F3FE; radius 24; padding clamp(24px,4vw,48px); grid auto-fit minmax(min(100%,340px),1fr); gap 40; align center`.
- **Left:**
  - `<h2>` **"Stuck between two universities?"** (line-height 1.15).
  - `<p>` **"Put up to three programs side by side — total fee, EMI, approvals, placement rate, average package and specialisation depth, on one screen. The best value in each row is highlighted."** (margin-top 14, 16px/1.6, `#4A4867`).
  - Button **"Open compare →"** → Compare (margin-top 24, padding 13×22, radius 10, primary, hover `#4A3BDB`).
- **Right:** a static table-like grid inside `background #fff; radius 16; border 1px #E2E1EF; overflow-x auto; 14px`, with inner `min-width 420px`.
  - Header row (`grid 1.2fr 1fr 1fr 1fr; padding 14px 18px; background #FAFAFE; border-bottom 1px #EFEEF8; 700; 13px`): **"Online MBA"** (`#6F6D8C`) | MUJ | SMU | Amity.
  - Rows (padding 12×18, border-bottom `#F3F2F8`; label `#6F6D8C`):
    - "Total fee": ₹1,80,000 | **₹1,20,000** | ₹2,25,000
    - "EMI": ₹7,500 | **₹4,583** | ₹9,375
    - "Placement": **88%** | 81% | 84%
    - "Avg package": **₹7.2 LPA** | ₹5.1 LPA | ₹6.5 LPA
  - Bold cells are styled `color:#14774A; font-weight:700` to mark the "best".
  - It is not a `<table>` (CSS grid of spans), so there are no header associations.
- **Current:** `page.tsx:408-418`. Dark band `#263238` with the same heading, the **same paragraph including "The best value in each row is highlighted."**, and an "Open compare" button to `/compare`. No table.
- **Changes:**
  - Restyle as a light panel. If a mini table is kept, build it as a real `<table>` with `<caption class="sr-only">`, `<th scope>`, in a horizontally scrollable region (`tabindex=0`, `role="region"`, `aria-label`), with values **computed from the catalogue** (MBA fee and EMI per university).
  - Move it after Universities (design order).
  - Button min-height 44; arrow `aria-hidden`.
- **Conflicts:**
  - **"Best value" highlighting on Placement and Avg package** (`:168-169`) and the copy "The best value in each row is highlighted." (`:160`): violates constraint 4 (no "best"/"winner"/"Lowest" highlighting based on unverified data: rating, placement, avg package, specialisation count). The copy line exists today too (`page.tsx:413`), so the current site already conflicts. Remove the sentence and the placement/package highlights. Fee and EMI highlighting is only OK if fees are verified; even then, the compare tool itself shows no "best" tags under constraint 4. Recommend no green highlighting at all, or neutral "lower fee" text only for verified fee rows.
  - Placement and avg package must be labelled **university-wide** (constraint 4).
  - **Gated tool:** constraint 3 gates the interactive compare results behind form plus OTP. A home mini table that shows placement and package side by side partially bypasses the gate's purpose. The copy "on one screen" should not imply instant access. **Question:** mention "Verify your email to unlock the full comparison", or link the teaser to the public editorial page `/compare/mba/<pair>` instead.
  - **"specialisation depth"** in the copy: a specialisation-count comparison is on constraint 4's list of no-highlight items. Rewording is advisable.
  - Static literals: the values must come from data (they match the seed today).

### 5.7 How UnnatiVidya works + perks (`Home.dc.html:175-186`)
- `<h2>` **"How UnnatiVidya works"**.
- `<p>` **"Unbiased by design — universities pay us the same, so our advice follows your goals, not commissions."** (margin-top 8, `#4A4867`, 16px).
- **Steps grid:** `auto-fit minmax(min(100%,280px),1fr)`, gap 20, margin-top 28. Each step is `border-top 2px #5B4CF0; padding-top 20` with an eyebrow (12px/800, .08em, `#5B4CF0`), a title (20px/800, margin-top 10) and a paragraph (margin-top 8, `#4A4867`, line-height 1.6, inheriting the browser default 16px):
  1. **"01 · COMPARE"** / **"Compare side by side"** / **"Fees, EMIs, curriculum, approvals and placement records — in one honest table."**
  2. **"02 · COUNSEL"** / **"Talk to a real counsellor"** / **"A free 1-on-1 call to sanity-check your shortlist against your career plan."**
  3. **"03 · ENROL"** / **"Enrol with support"** / **"We handle documents, loans and admission follow-ups until your LMS login arrives."**
- **Perks grid** (`:183-185`): `auto-fit minmax(min(100%,180px),1fr); gap 1px; background #EAE9F4; border 1px #EAE9F4; radius 16; overflow hidden; margin-top 40` (hairline separators). Each cell has `background #fff; padding 20`, a key (20px/800) and a value (13px `#6F6D8C`, margin-top 4):
  - **"30+"** / "comparison factors"
  - **"Loans"** / "quick education loan facility"
  - **"Support"** / "post-admission, till graduation"
  - **"Jobs"** / "job + internship portal"
  - **"Community"** / "exclusive learner groups"
  - **"₹0 extra"** / "lowest-fee guarantee"
- **Current:** `page.tsx:354-406`. The same heading, subtitle and 3 steps (left border 3px instead of top border, 16px titles). The same 6 perks as separate bordered tiles (6 columns, 2 below 900px). **Plus a "Why learners trust UnnatiVidya" band** with **"No hidden charges"** ("Counselling is free for learners, and Unnati Vidya adds no charge on top of the university fee."), **"Approvals you can check"** ("We link each program to the official UGC-DEB list and show when we last checked it.") and **"Support till enrolment"** ("Documents, loans and follow-ups handled until your LMS login arrives.").
- **Changes:**
  - Restyle the steps (top border 2px, 20px/800 titles).
  - Restyle the perks into the hairline-joined grid.
  - **Re-home the three owner trust claims** (No hidden charges, Approvals you can check, Support till enrolment). They are owner-confirmed homepage claims (constraint 9), and the design drops the band entirely. Options: make them three of the six perk cells (replacing Jobs/Community, see below), or add a short trust row under the steps.
- **Conflicts:**
  - **"Jobs — job + internship portal"** and **"Community — exclusive learner groups"**: constraint 9 says "Do not add new service claims (e.g. jobs, community) without owner confirmation". They are on the current page, but they are **not** in the claims register's owner-stated list (only "₹0 extra · lowest-fee guarantee" is). The owner confirmed only documents, loans and follow-ups (§11 #13). **Owner question:** confirm or remove both.
  - **"Support — post-admission, till graduation"**: contradicts the owner-confirmed scope "Support till enrolment… until your LMS login arrives" (§11 #13; step 03 on the same page says "until your LMS login arrives"). Existing text, so the design keeps an internal contradiction. Reword to "till enrolment" or get owner confirmation.
  - **"30+ comparison factors"**: unsubstantiated count, not in the claims register. Check against the compare table's actual row count (the design Compare table has 12 rows).
  - **"Loans — quick education loan facility"**: "quick" and "facility" imply Unnati Vidya provides loans. The owner confirmed loan *help*. Suggest "education-loan help".
  - **"₹0 extra — lowest-fee guarantee"**: owner-stated, keep as is (constraint 9; claims register).
  - **"universities pay us the same, so our advice follows your goals, not commissions"**: §11 #3 replaced "Every university pays us the same" with "No hidden charges", and #14 says "No hidden charges stays the only statement". This subtitle (also current `page.tsx:357`) restates the removed claim. **Owner question/flag.**
  - **"in one honest table"** and **"placement records"** (step 01): placement figures are deferred and university-wide. Mild; existing.
  - **"Talk to a real counsellor — A free 1-on-1 call"**: fine with the contact-first flow (phone is collected). It must not imply booking (constraint 1: no appointment booking).
  - Hairline grid at narrow widths: `minmax(180px)` needs 361px for two columns. A 390px phone leaves about 358px after gutters, so the six cells stack in one column. Acceptable but long; consider `minmax(150px)` for two columns on phones (optional).

### 5.8 What learners say (`Home.dc.html:188-199`)
- `<h2>` **"What learners say"** (margin `0 0 28px`).
- Grid: `auto-fit minmax(min(100%,320px),1fr)`, gap 20.
- Card: `border 1px #E7E6F2; radius 18; padding 24; flex column; gap 18`.
  - Stars **"★★★★★"** in `#F2A60C`, letter-spacing 2px (no accessible text).
  - Quote `<p>` 16px/1.6 `#2A2850` `flex:1`, wrapped in curly quotes.
  - Person row (flex, gap 12): 40px initials avatar (`#ECEBFD` background, `#5B4CF0`, 800, 14px), name (700, 14px) and meta (13px `#6F6D8C`).
- Content (`:235-238`), identical to the current `page.tsx:423-427`:
  1. "I compared 4 MBA programs here before picking Manipal Jaipur. The counsellor actually talked me out of the costlier option." — **Priya Sharma**, "Online MBA · batch of 2025", PS
  2. "The EMI breakdown saved me. I knew exactly what I would pay per month before I even spoke to the university." — **Arjun Mehta**, "Online BCA · working at TCS", AM
  3. "AI recommender shortlisted 3 courses in two minutes. Enrolled in Amity MCA the same week." — **Farhan Khan**, "Online MCA · batch of 2026", FK
- **Current:** the same three, in `<article>` cards (radius 8, 14px quote, 36px avatar, star `#FDB515`).
- **Changes:**
  - Restyle only. Use `<figure>`/`<blockquote>`/`<figcaption>` or keep `<article>`.
  - Give the stars an accessible label ("Rated 5 out of 5") or `aria-hidden`. Star `#F2A60C` on white is 2.05:1; that is decorative, so `aria-hidden` is acceptable.
  - **No AggregateRating/Review markup** (constraint 5).
- **Conflicts:**
  - The README says "Testimonials are sample content" (README §Content Caveats). The repo treats these three as owner-retained existing content (constraint 7; claims register "Deferred"). Keep **exactly these three, unchanged**. Do not add more, do not copy them to other pages, do not edit names or meta.
  - "working at TCS" names an employer. Existing; flag only for the deferred verification.

### 5.9 FAQ, Home-specific layout (`Home.dc.html:201-215`)
- Section: `padding-top 72; grid auto-fit minmax(min(100%,340px),1fr); gap 40`.
- **Left:**
  - `<h2>` **"Questions we get every day"**.
  - `<p>` **"Still unsure? A counsellor can walk you through it — free."** (margin-top 12, `#4A4867`, line-height 1.6).
  - Buttons (flex wrap, gap 10, margin-top 20):
    - **"Apply now"** → Apply: padding 12×18, radius 10, primary, white, 700.
    - **"Call 1800-120-4050"** → `tel:18001204050`: same padding, border `1px #D6D0FA`, 700, primary text.
- **Right:** `border-top 1px #E7E6F2`. Per item: `border-bottom 1px #E7E6F2`.
  - Header `<div onClick>`: `flex; space-between; gap 16; padding 18px 0; 700; 16px`, with the question and a sign `+`/`–` (`#5B4CF0`, 20px, line-height 1).
  - Answer `<p>` (rendered when open): `margin 0 0 18px; #4A4867; line-height 1.65; max-width 640px`.
  - Single-open; all closed by default.
- **Items** (`:227`), the same 5 as the current `homeFaqs`:
  1. "Are online degrees valid for government jobs?" / "Yes. UGC-entitled online degrees are legally equivalent to on-campus degrees for government jobs, PSU recruitment and higher studies."
  2. "Is counselling really free?" / "Yes — universities compensate us equally, so counselling costs you nothing and our advice carries no commission bias."
  3. "Can I pay via EMI?" / "Every listed program offers no-cost EMI through education loan partners, plus semester-wise payment options."
  4. "How do you verify fees and approvals?" / "We check every fee, approval and admission date against the university's own published pages each admission cycle, and flag anything we can't independently confirm — see our full verification process." (The text says "see our full verification process" but contains no link.)
  5. "Will my certificate say \"online\"?" / "No. A UGC-entitled online degree carries the same certificate as the on-campus program — there is no \"online\" marking that affects how employers or government bodies treat it."
- **Current:** `page.tsx:443-453`. An 800px single column, h2 "Questions we get every day", `details.faq-item name="home-faq"` with the first item open. No left CTA column. FAQPage JSON-LD (`:111-115`) from the same array.
- **Changes:**
  - Two-column layout. Left: h2, the "Still unsure?" line and **Apply now** (`/lead?intent=enquire` or `intent=home-faq`, `data-open-lead`, `rel=nofollow`, min-height 44).
  - **Remove the Call button.** Replace it with nothing, or with a secondary link e.g. "Email admin@unnatividya.com" or "How we verify" (decision).
  - Right: a divider-list accordion using `<details name="home-faq">` with summary 16px/700 padding 18px 0, and the `+`/`–` sign `#5B4CF0` 20px via CSS (`aria-hidden`).
  - Keep the FAQPage JSON-LD.
  - Turn "see our full verification process" into a real link to `/how-we-verify` (answer copy can hold a link; the JSON-LD text stays plain).
  - Default open state: decide.
- **Conflicts:**
  - **Phone** (`:205`): constraint 2.
  - "A counsellor can walk you through it — free.": owner-stated free counselling, OK.
  - FAQ #2 equal-compensation claim (see §4.4 and §5.7).
  - FAQ #3 universal no-cost EMI is an owner exception; keep the exact wording.
  - FAQ #1 and #5 "UGC-entitled online degree" are general statements about entitled programs. OK, but they depend on per-program status.
  - FAQ #4 "each admission cycle": compare with the weekly source checks (`docs/WEEKLY_SOURCE_CHECKS_2026-10-09.md`). Existing; fine.
  - Accessibility: a `div onClick` accordion in the design; use `<details>`.

### 5.10 Page-level items the design omits or changes
- **`StickyMobileBar`** (Apply now + Browse courses, ≤640px; `page.tsx:454`) and the **`StickyCtas`** floating "Apply now" (641–1100px, `layout.tsx`): the design Home has neither (README mentions a sticky bottom bar only for Course). **Question:** keep the Home mobile bar? The standard §3 allows one contextual sticky region. If removed, Apply now is only in the header menu on phones.
- **FAQPage JSON-LD, Organization/WebSite JSON-LD** (with SearchAction to `/courses?q=`) and metadata: keep.
- **Text search:** the design removes the free-text hero search (`q`). The site's `WebSite` SearchAction still targets `/courses?q=`, and the courses page keeps a search box. The header search icon only navigates. **Question:** keep a `q` input in the hero search card (e.g. a third field) or accept level+stream only.
- **"10k+ learners guided"** (owner claim): no slot in the design (see §5.1 change 10).
- **"Why learners trust UnnatiVidya"** band: removed by the design (see §5.7).
- **Recommender preview image** `/hero/recommender-preview.webp`: dropped.
- **Analytics attributes** (`course_card_click`, `course_search`, `university_card_click`): the design has none; keep them.
- **Section rhythm:** the design uses white throughout with 72px top padding, no bands except the navy hero, the navy matching panel and the lavender compare panel. The current page alternates grey and lavender bands. Restyle.
- **Container:** 1240 with clamp gutters vs the standard's "Shared 1200px shell" and gutters 16/24/32. The design's gutters match the standard; the width does not. Decide site-wide.
- **Body font size:** the design's paragraphs are 16px, but card meta and labels are 11–13px. Body copy without an explicit size inherits the 16px browser default in the prototype; the current `body` is 15px. Constraint 11 says 16px body. Set `body{font-size:16px}`, which also affects the current 15px.

---

## 6. Accessibility audit summary (design as delivered)

| Item | Design | Required |
|---|---|---|
| Menu toggle | `div onClick`, no state | `<button aria-expanded aria-controls aria-label>` (current OK) |
| Card save and compare | `div onClick`, 36px | `<button aria-pressed aria-label>` ≥44px |
| FAQ (both) | `div onClick`, answer not in DOM | `<details name><summary>` (current OK) |
| Icon fonts | ligature text read aloud | lucide `aria-hidden`, labelled controls |
| Focus styles | none defined; selects `outline:none` | visible focus everywhere (current has rules) |
| Targets | nav about 36px, search 40, chips about 30, card buttons about 40 | ≥44px |
| Contrast fails | `#8E8CA8` on white 3.25:1 (review count); `#DCD8FF` on `#5B4CF0` 4.1:1 (hero card B, 12px); star `#F2A60C` 2.05:1 (decorative OK); global hover `#4A3BDB` on navy footer about 1.9:1 | ≥4.5:1 text |
| Contrast passes | navy-panel texts (`#CFC9FF` 11.2, `#CFCCEE` 11.3, `#A9A6D6` 7.6, `#9C98CC` 6.5, `#B9B6E8` about 7.8), white on `#5B4CF0` 5.62, `#5B4CF0` on `#ECE9FE` 4.72, `#12784B` on `#E7F6EE` 4.93, `#6F6D8C` on white 4.95 / on `#F8F7FD` 4.65 | — |
| Non-text | outline-button border `#D6D0FA` 1.47:1, card border `#E8E6F3` 1.23:1 | Buttons have text labels, so a 3:1 boundary is not strictly required; inputs/selects with `#E4E1F3` borders would fail 1.4.11 (Courses scope) |
| Motion | scroll reveal hides content; shimmer ignores reduced motion | no hidden content; reduced-motion off for all |
| Semantics | card title not a heading; footer headings are `div`s; table is a grid of spans; no `aria-current` | headings, `<table>`, `aria-current` |
| Skip link and landmarks | none in prototype | keep current skip link, `main#main-content`, labelled navs |

---

## 7. Ambiguities inside the design itself
1. "Explore Degrees" label vs Courses target; "Find my fit" (header) vs "Find my course" (footer).
2. The footer "Degree guides" and "Articles" both go to Guides.
3. The default compare list pre-selects three MBAs, so MBA cards show "✓ In compare" on first visit.
4. "1 specialisation" for programs whose only spec is "General".
5. Star colour: navy in the card, `#F2A60C` in testimonials, `#F0A30A` in the README.
6. Colour drift: success tints `#E7F6EE`/`#12784B` (card) vs `#E8F6EE`/`#14774A` (home uni pills, mini table). Borders `#E8E6F3` (token) vs `#E7E6F2`/`#E2E1EF`/`#EAE9F4` (home). Card hover shadow token vs the uni card's `0 16px 36px -20px rgba(43,35,140,.35)` and hover border `#C9C5F5` vs `#CFC9FA`. Eyebrows `#A9A4FF` vs `#A9A6D6` vs `#CFC9FF`. Avatar background `#ECEBFD` vs the token `#ECE9FE`. Quote text `#2A2850` vs the token `#2B2950`.
7. H2 sizes: sections `clamp(26px,3.2vw,32px)`, matching panel `clamp(28px,3.4vw,36px)`, UVFaq `clamp(24px,3vw,30px)`.
8. Hero floating cards on phones: absolute positions with no mobile rule, so likely overlap at ≤400px.
9. Badge "0" always shown on the mobile bookmark and in "Shortlist (0)".
10. Hero chips use `?degree=`, the search uses `?lvl=`, and the Courses page reads both. The repo uses `level`, and `degree` is unsupported.
11. FAQ #4 promises a link ("see our full verification process") that is not a link.
12. The Home FAQ uses `–` (en dash) as the open sign, while UVFaq uses the `remove` icon. Two different accordion styles on the same site.
13. The README says the Card shows "+ Compare" toggling to "✓ In compare". There is no feedback when the 4th item evicts the oldest.

---

## 8. Summary: top conflicts
1. **Phone number "1800-120-4050"** in the header mobile menu (`UVHeader:39`), the footer (`UVFooter:35`), the Home FAQ CTA (`Home:205`) and the shared FAQ data (`uv-data.js:72`). Must be removed (constraint 2). Use `admin@unnatividya.com`.
2. **Blanket "UGC-entitled"** on every card pill (`UVCard:31`), the hero eyebrow (`Home:23`) and the footer copy. Recognition must be the per-program dated 2026-27 result (constraint 8, `recognitionSummary`).
3. **"Best value" highlighting on placement and avg package** in the Compare teaser plus the copy "The best value in each row is highlighted." (`Home:160,166-169`, also on the current page). Unlabelled university-wide placement/package on the University cards and the hero "Average package … MUJ online learners" card (constraint 4).
4. **Invented content:** the sample match rows 92/86/78% (`Home:243`), which the real recommender never shows. The perks "Jobs – job + internship portal" and "Community – exclusive learner groups" (constraint 9). "Support – post-admission, till graduation" vs the owner-confirmed "till enrolment". The unsourced "30+ comparison factors". The README calls the testimonials "sample": keep only the three owner-retained ones, unchanged.
5. **Owner-confirmed claims dropped by the design:** "10k+ learners guided" and the "Why learners trust" band (No hidden charges, Approvals you can check, Support till enrolment) (constraint 9). The design instead re-propagates "universities pay us the same / compensate us equally", which §11 #3 and #14 replaced with "No hidden charges" (also still live in the current subtitle and FAQ).
6. **Must-keep features missing from nav/footer:** newsletter sign-up (footer), total cost planner, eligibility checker, blog/Articles (pointed at Guides), How we verify and the recommender (desktop nav) (constraint 10). The standard's grouped Resources/Tools nav is replaced by flat links.
7. **Compare model:** the card's compare toggle and persistent `uv_compare` store (default three MBAs, silently drops the oldest) are new. They must feed the OTP-gated `/compare?add=` (constraint 3) and not pre-select courses. The design also removes "Apply now" from cards.
8. **URL and id mismatches:** `?id=` pages, `Legal?tab=`, `?ids=`, `?lvl=`/`?degree=`/`?uni=` must map to the existing SEO slugs and params. `mscds-amity` and 7 other ids differ. The current "Online B.Com" chip (`?q=BCom`) is likely broken today.
9. **Platform constraints:** Google Fonts and Material Symbols CDN are blocked by the CSP (self-host Plus Jakarta via `next/font`; map icons to lucide). The scroll-reveal hides content (constraint 11). Many targets are under 44px and several controls are non-semantic `div`s. Two text contrast failures (`#8E8CA8` review counts, `#DCD8FF` on primary).
10. **Token and brand change:** primary `#544CC8` → `#5B4CF0`, radii 4/8 → 10/16, container 1200 → 1240, DM Sans (not actually loaded) → Plus Jakarta. The standard says "preserve existing tokens", so this needs explicit owner sign-off as a rebrand.
