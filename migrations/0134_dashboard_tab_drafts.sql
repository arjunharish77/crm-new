-- Builder save model for dashboard edit mode (decision 29, extended 2026-10-03): while
-- customizing, moving, resizing and removing widgets go to the tab's draft; the widgets (which
-- teammates may see, when shared) only change on Publish, which also records a tab version.
-- Draft shape: { "layouts": { "<widgetId>": { "x", "y", "w", "h" } }, "removed": ["<widgetId>", ...] }.
alter table "DashboardTab"
  add column if not exists draft jsonb,
  add column if not exists "draftUpdatedAt" timestamptz;
