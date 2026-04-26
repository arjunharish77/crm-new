# LeadSquared-Level CRM Gap Checklist

This is the working implementation checklist. Mark items complete only when the feature is implemented, wired to real data/runtime behavior, and verified.

## Forms and CRM Placement

- [x] Enhance existing CRM placement into process-style placement rules without creating a separate Process Designer module.
- [x] Add per-placement display order and launch label.
- [x] Add per-placement record-field conditions.
- [x] Add per-placement visibility overrides for users, teams, and sales groups.
- [x] Move CRM Placement into a dedicated Forms tab.
- [x] Add role-based CRM placement visibility.
- [x] Add user custom-field/skills based CRM placement conditions.
- [x] Add form draft save/resume.
- [ ] Add section/tab-level conditional rules.
- [ ] Add Task fields to forms after Tasks module exists.

## Tasks

- [ ] Add Task object/table/API.
- [ ] Add task list, calendar, detail, reminders, and completion workflow.
- [ ] Add tasks on leads, opportunities, and activities.
- [ ] Add task triggers to automation runtime.
- [ ] Add task actions to automation runtime.

## Automations

- [ ] Add automation-level exit conditions.
- [ ] Add loop protection and per-record execution caps.
- [ ] Add bulk enrollment and bulk update execution tracking.
- [ ] Add sub-automation action.
- [ ] Enhance split test with percentage allocation and performance analytics.
- [ ] Enhance wait nodes with exact date/time, timezone, day/time windows, timeout continue/exit, and max wait limits.
- [ ] Add explicit Triggered Activity vs Lead Activity condition source.
- [ ] Add opportunity share/stop-share actions after sharing model exists.
- [ ] Add real messaging actions when email/SMS/WhatsApp integrations are in scope.

## Distribution

- [ ] Add assignment quotas for leads and opportunities.
- [ ] Add user availability/check-in and working-hours support.
- [ ] Add distribution rule simulator/tester.
- [ ] Add drag/drop rule ordering and default-rule enforcement UI.
- [ ] Add user-property based distribution matching.
- [ ] Add distribution fairness reports.

## CRM Objects

- [x] Add core/system activities.
- [x] Add website tracking script and web activity ingestion.
- [x] Add static lists and smart lists.
- [x] Add list automation triggers and add/remove list actions.

## Imports and Integrations

- [x] Add full lead import with mapping and validation report.
- [x] Add opportunity import.
- [x] Add activity import.
- [x] Add duplicate-handling configuration for imports.
- [x] Add trigger automation on import.
- [x] Add real webhook management APIs.
- [x] Add telephony/agent-popup integration.

## Reporting and Admin

- [x] Add field-level audit trail for leads, opportunities, and activities.
- [x] Show activity modification history with changed values in activity timeline.
- [x] Add tenant-wide audit log endpoint for all modules.
- [ ] Add custom report builder with joins.
- [ ] Add scheduled report subscriptions.
- [ ] Add automation performance reports.
- [ ] Add form drop-off analytics by step/tab/field.
- [ ] Add activity SLA reports.
- [x] Add field-level permissions.
- [ ] Add record sharing and opportunity sharing.
