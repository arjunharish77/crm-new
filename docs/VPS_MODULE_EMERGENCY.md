# Modules on the VPS: enabling, new tenants, emergency suspension

Run every command from the repository root on the VPS (`/opt/unnatify-crm`). In the commands below, `$DC` stands for:

```bash
DC="docker compose -f deploy/vps/docker-compose.yml --env-file deploy/vps/.env"
```

## Module catalog

The catalog is created and updated by migrations; there is nothing to seed by hand. A module with no setting for a tenant counts as enabled. Core modules (Dashboard, Leads, Lists, Activities, Tasks, Views, Security & Admin) are always on.

## Enabling modules for a tenant

Use the platform admin UI: **Platform Admin → Tenants → (tenant) → Modules**.

- **Status:** pick Enabled, Trial (needs an end date), Suspended or Disabled. A change saves straight away and is written to the module audit log.
- **Impact preview:** disabling or suspending first lists what will stop. Live work (automations, scheduled campaigns and journeys, report schedules, assignment rules, forms, webhooks) is paused. It comes back when the module is enabled again. Data is never deleted.
- **Dependencies:** a change that would break a dependency is refused with an explanation. For example, Payouts needs Partners. Journey Orchestration needs Automations and Marketing.
- **Feature flags:** some modules also have an older flag in the Feature flags section. Both the flag and the module must be on.
- **Health:** module health is shown on the same card ("Recheck health"). **Platform Admin → Module Health** lists problems across all tenants.

Tenant admins see their modules on **Settings → Modules** and can request access. Requests appear on the tenant's Modules card.

## Creating a tenant

1. Go to **Platform Admin → Tenants → Create Tenant**.
2. Choose a bundle (Starter, Admissions or Full) or pick modules one by one. Dependency warnings show before you save.
3. Optionally set usage limits. Leaving them empty means unlimited.
4. Enter the first admin user.
5. After creating the tenant, open its page and check the modules, users and limits.
6. Optionally seed demo data from the tenant page.

If a module is under an emergency suspension (below), a new tenant does **not** inherit it. After creating tenants, run the `suspend` command again; it only adds tenants that are not yet covered.

## Emergency suspension

Use this when a module misbehaves for one or all tenants (for example a security problem, or runaway messages or webhooks) and you need it off now, even if the admin UI is unavailable. It does the same as setting the module to Suspended in the UI:

- **Access is refused:** users, API keys and app credentials can't use the module.
- **Work stops:** its live work is paused, and pending outbound webhooks are cancelled for Data Platform.
- **Data is kept** and the change is audited.

It also records each tenant's previous status, so lifting puts things back exactly as they were.

It runs in a one-off worker container:

```bash
EMERGENCY="$DC run --rm --no-deps worker npx tsx scripts/module-emergency.ts"
```

`--actor` must be the email of an active platform admin. Every change is recorded under that person.

### 1. See what would change (always first)

```bash
$EMERGENCY suspend --module MARKETPLACE --all-tenants \
  --actor ops@example.com --reason "Marketplace app webhooks leaking data, INC-142" --dry-run
```

It prints one line per tenant:

| Outcome | Meaning |
| --- | --- |
| `SUSPENDED` | Will be (or was) suspended. Also lists dependents and paused items. |
| `ALREADY_OFF` | The module is already off there; nothing to do. |
| `ALREADY_IN_EMERGENCY` | Already covered by this emergency. |
| `BLOCKED_BY_DEPENDENTS` | Another enabled module depends on it. Nothing changed for that tenant. |
| `FAILED` | An error for that tenant. The others are still processed. |

A dependent is never suspended without being asked for. To suspend dependents too, add `--include-dependents`. For example, suspending Automations also suspends Journey Orchestration. Dependents are recorded and lifted together with the module.

### 2. Suspend

For one or more tenants (tenant ids are in the tenant page URL; `--tenant` can be repeated):

```bash
$EMERGENCY suspend --module MARKETPLACE --tenant <tenant-id> \
  --actor ops@example.com --reason "INC-142"
```

For every tenant, you must type the module key again:

```bash
$EMERGENCY suspend --module MARKETPLACE --all-tenants --confirm MARKETPLACE \
  --actor ops@example.com --reason "Marketplace app webhooks leaking data, INC-142"
```

What people are told:

- **Tenant admins:** "<Module> has been temporarily suspended by your platform administrator. Your data is kept and scheduled work is paused…". The `--reason` stays internal. To send your own wording instead, add `--notice "..."`.
- **Platform admins:** one summary notice.

Exit code 0 means done. Exit code 2 means done, but some tenants were blocked or failed; read the lines marked `BLOCKED_BY_DEPENDENTS` or `FAILED`.

To find tenant ids without the UI:

```bash
$DC exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select id, name, status from \"Tenant\" order by name"'
```

### 3. Check

```bash
$EMERGENCY status          # open emergencies; --all includes lifted ones
```

In the UI, the tenant's Modules card shows Suspended. The health badge says "Temporarily suspended by the platform team".

### 4. Lift

Dry run first, then for real:

```bash
$EMERGENCY lift --module MARKETPLACE --actor ops@example.com --reason "Fixed in release 2026-10-02" --dry-run
$EMERGENCY lift --module MARKETPLACE --actor ops@example.com --reason "Fixed in release 2026-10-02"
```

Add `--tenant <id>` to lift for some tenants first. Lifting restores each tenant's previous status: Enabled, or Trial with its original end date. Requirements are restored before the modules that depend on them, and paused live work resumes. Each tenant module ends as one of:

| Outcome | Meaning |
| --- | --- |
| `RESTORED` | Back to its previous status. |
| `CHANGED_SINCE` | Someone changed the module during the emergency; their change is kept. |
| `TRIAL_ENDED` | Its trial ended during the emergency; it stays suspended. Enable it or start a new trial in the UI if needed. |
| `REQUIREMENT_OFF` | A module it needs is now off; it stays suspended. Fix the requirement, then enable it in the UI. |

When nothing is left suspended, the emergency closes and `status` no longer lists it. Tenant admins are told the module is available again.

### Notes

- Core modules cannot be suspended this way, or at all.
- To stop **everything** for one tenant, use **Suspend Tenant** on the tenant page instead.
- There is only one open emergency per module. Running `suspend` again adds tenants to it, keeping the first reason.
- Add `--json` to any command for machine-readable output.
