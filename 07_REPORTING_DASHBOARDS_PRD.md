# PRD: Advanced Reporting & Dashboard Builder

Extends the existing `dashboard-manager` / `widget-library` components and the
`reports` API — this is not a rebuild. Read `SCHEMA.md` before starting so new
rollup tables fit the existing tenant/permission model.

## 1. Data freshness architecture

- **Light widgets** (simple counts/filters on current data — "my leads today,"
  "tasks due") — computed on request, no caching needed.
- **Heavy aggregates** (funnel conversion, cohort analysis, leaderboards,
  source ROI, reassignment-impact) — precomputed into rollup tables, refreshed
  on a schedule (start with every 15 min, make configurable).
- Every dashboard shows a "last updated" timestamp on aggregate widgets, plus
  a manual "Refresh now" button that recomputes on demand (rate-limited so
  it can't be spammed).
- Rollup tables are tenant-scoped and rebuilt incrementally where possible
  (not full recompute every cycle) — flag if incremental isn't feasible for a
  given report and full recompute is used instead.

## 2. Default dashboards by persona

Dashboards are assigned by **permission scope**, not literal role name, since
roles are tenant-custom. Each persona below maps to an existing permission
level already in the app.

### Admin/Ops Leader (org-wide visibility)
- Org-wide funnel: lead → qualified → opportunity → won, by stage
- Source-wise lead volume & conversion rate
- SLA/response-time breach count (leads not contacted within X — configurable)
- Rep leaderboard summary (top 5, links to full leaderboard)
- Data quality flags: duplicate leads, leads with no activity in 14+ days
- Reassignment-impact widget (leads reassigned vs. their conversion rate —
  automates the funnel finding from your own past manual analysis)

### Sales Manager/Team Lead (team-scoped visibility)
- Team pipeline by stage (kanban-style counts)
- Team leaderboard (pulls from Phase 1 gamification data)
- Rep-wise comparison: conversion rate, response time, activity volume
- Reassignment/churn tracking within their team
- Follow-ups overdue across the team

### Sales Rep/Counselor (own-data visibility)
- My leads today / this week
- My conversion rate (with trend vs. last period)
- My follow-ups due (works with current activity data now; upgrades
  automatically once the Tasks phase ships)
- My leaderboard rank + points (Phase 1 data)

### Partner (external, own-data visibility — Phase 1 role)
- My referred leads and their current status
- My commission ledger running total (Phase 1 data)
- My payout history (Draft/Approved/Invoiced/Paid)
- My leaderboard rank, if gamification is enabled for partners

Each dashboard ships as a **default preset** users can customize using the
existing widget-library/dashboard-manager — not a locked template. Users can
add/remove/rearrange widgets from their default starting point.

## 3. Advanced Report Builder

Current state: single-object filtered reports (leads/opportunities/activities),
no joins, no scheduling. Target state:

- **Cross-object joins** — e.g. opportunities joined to their originating lead
  and to activities, so a report can show "leads from source X, their assigned
  rep, and days-to-first-contact" in one view.
- **Saved & shared reports** — save a report definition, share with specific
  roles/users, or keep private.
- **Scheduling** — email a report on a recurring schedule (daily/weekly/
  monthly) to specified recipients, as an export (CSV/PDF) or a link.
- **Drill-down** — clicking an aggregate number (e.g. "42 leads") opens the
  underlying record list filtered to match.
- **Comparison periods** — this period vs. last period, shown inline on
  report and dashboard widgets alike.
- **Chart types**: bar, line, funnel, pie/donut, table with conditional
  formatting. Reuse whatever charting library is already available in the
  app if one exists; otherwise pick one lightweight option and use it
  consistently everywhere (no library sprawl).
- **Report → dashboard widget promotion** — any saved report can be pinned to
  a dashboard as a widget without rebuilding it as a separate widget type.

## 4. Inbuilt report library (ship these as pre-built, not just examples)

1. Funnel/conversion by stage
2. Funnel/conversion by source and by campaign
3. Rep performance (calls, response time, conversion rate)
4. SLA/response-time breach report
5. Lead source ROI (volume in vs. conversions out)
6. Reassignment impact report
7. Activity/call volume trends over time
8. Commission/payout summary (Phase 1 data)
9. Cohort report (leads grouped by entry week/month, tracked through funnel
   stages over time)
10. Data quality report (duplicates, stale leads, missing required fields)

## 5. Permissions

Reports and dashboards respect the same field-level and record-level
permissions already enforced elsewhere in the app (a Rep's report never
surfaces another rep's records just because they built the report query
themselves) — extend the existing permission-templates system, don't build a
parallel one.
