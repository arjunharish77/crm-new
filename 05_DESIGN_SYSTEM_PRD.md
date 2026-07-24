# PRD: Design System Consolidation + Theme Selector

## 1. The core problem (fix this first)

The app currently runs two parallel UI systems:
- shadcn/ui + Tailwind (`src/components/ui/*`) — dominant, used in almost all app pages
- MUI with a hand-built Material 3 token system (`src/theme.ts`) — still directly
  imported in ~10 pages, and is the only place color tokens currently live

This causes inconsistent spacing, focus states, and button/input shapes across
the app, and blocks a clean theme-selector implementation since color logic is
split across two systems.

**Decision: consolidate on shadcn/Tailwind** (it's already the majority system).
Migrate the remaining MUI-only pages/components to shadcn equivalents. Do not
add any new MUI usage during this process.

## 2. Design tokens (single source of truth)

Port the existing Material 3 color roles from `theme.ts` (primary, secondary,
tertiary, surface variants, error, outline, etc. — light + dark) into Tailwind
CSS variables / `tailwind.config` theme extension, so there is exactly one
place color is defined. Preserve the existing color values initially — this
is a consolidation pass, not a rebrand — the theme selector (below) is what
introduces new palettes.

## 3. Theme Selector

- Theme registry: a set of named token sets (e.g. "Forest" = current green
  default, plus at least 2-3 new options) defined as Tailwind CSS variable
  sets, following the same M3 role structure already in use (primary,
  secondary, tertiary, surface, error, outline — light + dark for each theme).
- Persisted per user (and optionally per tenant as an admin-set default that
  users can override) — store in the same place other user preferences live.
- Applied via a root-level provider that sets CSS variables based on the
  selected theme, no page reload required.
- Live preview in the theme picker UI before committing.

## 4. Component audit scope

For each MUI-only page/component found, decide: migrate to existing shadcn
equivalent, or build new shadcn component if no equivalent exists yet. Track
this as a checklist (component name → status) so it can be worked through
incrementally rather than as one giant change.

## 5. Baseline UX patterns to establish during this pass

- Empty, loading, and error states designed for every list/table/panel
  component — not just happy-path.
- A compact/comfortable density toggle for data tables (leads, opportunities,
  activities lists).
- Consistent action vocabulary: a button's label must match the resulting
  toast/confirmation message (e.g. "Save" → "Saved", not "Updated").
- Visible keyboard focus states on all interactive elements (accessibility
  baseline, not optional).

## 6. Out of scope for this pass (later phases)
- Command palette (Cmd/Ctrl+K) — separate, self-contained feature, do after
  consolidation.
- Sales dashboard visual design — depends on gamification data (Phase 1) and
  should happen after tokens are unified.
- Mobile-specific responsive polish — do a full pass once this consolidation
  is stable, per the mobile-readiness phase in the roadmap.
