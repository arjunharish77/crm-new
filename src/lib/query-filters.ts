import { DEFAULT_SERVER_TIME_ZONE } from "@/lib/timezone";

// Gap checklist Module 10's "universal advanced filter drawer" -- a single, correct operator ->
// SQL mapping shared by every module's own filter-condition builder, replacing three near-
// identical, independently-duplicated (and identically incomplete) copies previously living in
// leads-postgres.ts/opportunities-postgres.ts/activities-postgres.ts. Real bug found and fixed
// while unifying them: none of the three actually implemented "before"/"after"/"between"/
// "is_empty"/"is_not_empty"/"starts_with"/"ends_with"/"includes"/"includes_all"/"includes_any" --
// every one of those operators is offered by the frontend's own OPERATORS_BY_TYPE (types/
// filters.ts) but silently produced NO SQL clause at all, meaning a user picking e.g. "Before" on
// a date field or "Is empty" on any field got an unfiltered result set with no error or
// indication anything was wrong.

export type FilterValueKind = "text" | "number" | "date" | "select" | "tags" | "boolean" | "user";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function zonedMidnightUTC(year: number, month1to12: number, day: number, timeZone: string): Date {
  const guess = new Date(Date.UTC(year, month1to12 - 1, day, 0, 0, 0));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(guess);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const wallAsUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const offsetMs = wallAsUTC - guess.getTime();
  // `guess` shifted back by the zone's own offset at this instant is the real UTC instant whose
  // wall-clock reading IN `timeZone` is exactly year-month1to12-day 00:00:00.
  return new Date(guess.getTime() - offsetMs);
}

function zonedYearMonthDay(reference: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(reference);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function zonedStartOfDay(reference: Date, timeZone: string): Date {
  const { year, month, day } = zonedYearMonthDay(reference, timeZone);
  return zonedMidnightUTC(year, month, day, timeZone);
}

const RELATIVE_DATE_LABELS: Record<string, string> = {
  "@today": "Today",
  "@yesterday": "Yesterday",
  "@tomorrow": "Tomorrow",
  "@this_week": "This week",
  "@next_7_days": "Next 7 days",
  "@last_7_days": "Last 7 days",
  "@last_30_days": "Last 30 days",
  "@this_month": "This month",
  "@last_month": "Last month",
  "@this_year": "This year",
};

export const RELATIVE_DATE_TOKENS = Object.keys(RELATIVE_DATE_LABELS).map((value) => ({ value, label: RELATIVE_DATE_LABELS[value] }));

// Resolves a relative-date token into a concrete [start, end) UTC ISO range, computed against
// `timeZone` (defaulting to this codebase's own established DEFAULT_SERVER_TIME_ZONE fallback --
// no per-tenant timezone is threaded through the filter-application call path today, so this
// reuses the same reference zone date-format.ts already falls back to, rather than inventing a
// second, narrower default). `now` is injectable for deterministic tests.
export function resolveRelativeDateRange(
  token: string,
  timeZone: string = DEFAULT_SERVER_TIME_ZONE,
  now: Date = new Date(),
): { start: string; end: string } | null {
  if (!(token in RELATIVE_DATE_LABELS)) return null;
  const todayStart = zonedStartOfDay(now, timeZone);
  const { year, month } = zonedYearMonthDay(now, timeZone);

  if (token === "@today") return { start: todayStart.toISOString(), end: new Date(todayStart.getTime() + MS_PER_DAY).toISOString() };
  if (token === "@yesterday") {
    const start = new Date(todayStart.getTime() - MS_PER_DAY);
    return { start: start.toISOString(), end: todayStart.toISOString() };
  }
  if (token === "@tomorrow") {
    const start = new Date(todayStart.getTime() + MS_PER_DAY);
    return { start: start.toISOString(), end: new Date(start.getTime() + MS_PER_DAY).toISOString() };
  }
  if (token === "@this_week") {
    // Monday to Sunday, in the workspace's time zone.
    const weekday = new Date(Date.UTC(year, month - 1, zonedYearMonthDay(now, timeZone).day)).getUTCDay();
    const start = new Date(todayStart.getTime() - ((weekday + 6) % 7) * MS_PER_DAY);
    return { start: start.toISOString(), end: new Date(start.getTime() + 7 * MS_PER_DAY).toISOString() };
  }
  if (token === "@next_7_days") {
    return { start: todayStart.toISOString(), end: new Date(todayStart.getTime() + 8 * MS_PER_DAY).toISOString() };
  }
  if (token === "@last_7_days") {
    const start = new Date(todayStart.getTime() - 7 * MS_PER_DAY);
    return { start: start.toISOString(), end: new Date(todayStart.getTime() + MS_PER_DAY).toISOString() };
  }
  if (token === "@last_30_days") {
    const start = new Date(todayStart.getTime() - 30 * MS_PER_DAY);
    return { start: start.toISOString(), end: new Date(todayStart.getTime() + MS_PER_DAY).toISOString() };
  }
  if (token === "@this_month") {
    const start = zonedMidnightUTC(year, month, 1, timeZone);
    const end = zonedMidnightUTC(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, 1, timeZone);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  if (token === "@last_month") {
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonth = month === 1 ? 12 : month - 1;
    const start = zonedMidnightUTC(prevYear, prevMonth, 1, timeZone);
    const end = zonedMidnightUTC(year, month, 1, timeZone);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  if (token === "@this_year") {
    const start = zonedMidnightUTC(year, 1, 1, timeZone);
    const end = zonedMidnightUTC(year + 1, 1, 1, timeZone);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  return null;
}

// A literal date/datetime value (from the plain `<input type="date">` fallback) resolves to
// "that whole calendar day" too -- the same real fix relative dates needed anyway, since an
// exact-instant equality check against a full timestamp column would otherwise almost never
// match what a user picking "On date" actually means.
function resolveDateRangeForValue(value: unknown, timeZone: string): { start: string; end: string } | null {
  if (typeof value !== "string" || !value) return null;
  const relative = resolveRelativeDateRange(value, timeZone);
  if (relative) return relative;
  const bareDate = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (bareDate) {
    const start = zonedMidnightUTC(Number(bareDate[1]), Number(bareDate[2]), Number(bareDate[3]), timeZone);
    return { start: start.toISOString(), end: new Date(start.getTime() + MS_PER_DAY).toISOString() };
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const start = zonedStartOfDay(parsed, timeZone);
  return { start: start.toISOString(), end: new Date(start.getTime() + MS_PER_DAY).toISOString() };
}

// "Contains 50%" or "starts with a_b" means those characters, not LIKE wildcards (backslash is
// Postgres's default LIKE escape).
export function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function pushClause(clauses: string[], values: unknown[], sql: string, ...args: unknown[]) {
  const placeholders = args.map((arg) => {
    values.push(arg);
    return `$${values.length}`;
  });
  clauses.push(sql.replace(/\?/g, () => placeholders.shift()!));
}

// The one shared operator -> SQL mapping every module's filter-condition builder should call
// (leads-postgres.ts, opportunities-postgres.ts, activities-postgres.ts all do). `column` must
// already be validated against that module's own allow-list of filterable columns -- this
// function only ever receives a column name the caller has already resolved, never a raw
// user-supplied field key, so there's no injection surface here.
export function applyFilterCondition(
  clauses: string[],
  values: unknown[],
  column: string,
  operator: string | undefined,
  rawValue: unknown,
  kind: FilterValueKind = "text",
  timeZone: string = DEFAULT_SERVER_TIME_ZONE,
  expression?: string,
) {
  const quoted = expression ?? `"${column}"`;
  const op = operator ?? "equals";

  if (op === "is_empty") {
    if (kind === "tags") clauses.push(`(${quoted} is null or array_length(${quoted}, 1) is null)`);
    else clauses.push(`(${quoted} is null or ${quoted}::text = '')`);
    return;
  }
  if (op === "is_not_empty") {
    if (kind === "tags") clauses.push(`(${quoted} is not null and array_length(${quoted}, 1) > 0)`);
    else clauses.push(`(${quoted} is not null and ${quoted}::text <> '')`);
    return;
  }

  if (kind === "date" && (op === "equals" || op === "before" || op === "after" || op === "between")) {
    if (op === "between" && Array.isArray(rawValue) && rawValue.length === 2) {
      const startRange = resolveDateRangeForValue(rawValue[0], timeZone);
      const endRange = resolveDateRangeForValue(rawValue[1], timeZone);
      if (!startRange || !endRange) return;
      pushClause(clauses, values, `${quoted} >= ? and ${quoted} < ?`, startRange.start, endRange.end);
      return;
    }
    const range = resolveDateRangeForValue(rawValue, timeZone);
    if (!range) return;
    if (op === "before") pushClause(clauses, values, `${quoted} < ?`, range.start);
    else if (op === "after") pushClause(clauses, values, `${quoted} >= ?`, range.end);
    else pushClause(clauses, values, `${quoted} >= ? and ${quoted} < ?`, range.start, range.end);
    return;
  }

  // A number field compared with something that isn't a number (an empty filter row, "abc")
  // adds no condition, the same as an unreadable date above. It used to reach the database as
  // `score = ''` and fail the whole list with "invalid input syntax for type integer".
  if (kind === "number" && !["in", "not_in"].includes(op)) {
    const toNumber = (value: unknown) => (typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN);
    if (Array.isArray(rawValue)) {
      const numbers = rawValue.map(toNumber);
      if (!numbers.length || numbers.some((value) => !Number.isFinite(value))) return;
      rawValue = numbers;
    } else {
      const number = toNumber(rawValue);
      if (!Number.isFinite(number)) return;
      rawValue = number;
    }
  }

  if (kind === "tags" && (op === "includes" || op === "includes_all" || op === "includes_any")) {
    const arr = (Array.isArray(rawValue) ? rawValue : [rawValue]).map(String);
    if (!arr.length) return;
    pushClause(clauses, values, op === "includes_all" ? `${quoted} @> ?::text[]` : `${quoted} && ?::text[]`, arr);
    return;
  }

  if (op === "equals") {
    if (Array.isArray(rawValue)) pushClause(clauses, values, `${quoted}::text = any(?::text[])`, rawValue.map(String));
    else pushClause(clauses, values, `${quoted} = ?`, rawValue);
  } else if (op === "not_equals") {
    if (Array.isArray(rawValue)) pushClause(clauses, values, `${quoted}::text <> all(?::text[])`, rawValue.map(String));
    else pushClause(clauses, values, `${quoted} <> ?`, rawValue);
  } else if (op === "not_equals_or_empty") {
    // "Isn't X" including records with no value -- e.g. a Smart View's "owner: someone else",
    // which must also list unowned records.
    if (Array.isArray(rawValue)) pushClause(clauses, values, `(${quoted} is null or ${quoted}::text <> all(?::text[]))`, rawValue.map(String));
    else pushClause(clauses, values, `(${quoted} is null or ${quoted}::text <> ?)`, String(rawValue ?? ""));
  } else if ((op === "in") && Array.isArray(rawValue)) {
    pushClause(clauses, values, `${quoted}::text = any(?::text[])`, rawValue.map(String));
  } else if ((op === "not_in") && Array.isArray(rawValue)) {
    pushClause(clauses, values, `${quoted}::text <> all(?::text[])`, rawValue.map(String));
  } else if (op === "contains" && typeof rawValue === "string") {
    pushClause(clauses, values, `${quoted} ilike ?`, `%${escapeLike(rawValue)}%`);
  } else if (op === "not_contains" && typeof rawValue === "string") {
    pushClause(clauses, values, `${quoted} not ilike ?`, `%${escapeLike(rawValue)}%`);
  } else if (op === "starts_with" && typeof rawValue === "string") {
    pushClause(clauses, values, `${quoted} ilike ?`, `${escapeLike(rawValue)}%`);
  } else if (op === "ends_with" && typeof rawValue === "string") {
    pushClause(clauses, values, `${quoted} ilike ?`, `%${escapeLike(rawValue)}`);
  } else if (op === "greater_than") {
    pushClause(clauses, values, `${quoted} > ?`, rawValue);
  } else if (op === "less_than") {
    pushClause(clauses, values, `${quoted} < ?`, rawValue);
  } else if (op === "greater_than_or_equal" || op === "gte") {
    pushClause(clauses, values, `${quoted} >= ?`, rawValue);
  } else if (op === "less_than_or_equal" || op === "lte") {
    pushClause(clauses, values, `${quoted} <= ?`, rawValue);
  }
}

type ConditionLike = { field?: string; operator?: string; value?: unknown };

// buildGroupedFilterClause skips a condition it can't apply (unknown field, operator or value),
// which widens the result. Callers that must not show a widened result as the answer (Smart
// Views) check first and get this error naming the condition instead.
export class UnsupportedFilterError extends Error {
  constructor(public field: string, public operator: string) {
    super("FILTER_UNSUPPORTED");
  }
}

export function assertFilterGroupsSupported(
  groups: unknown,
  columnMap: Map<string, FilterColumnEntry>,
  timeZone: string = DEFAULT_SERVER_TIME_ZONE,
) {
  for (const group of normalizeFilterGroups(groups)) {
    const conditions: ConditionLike[] =
      "conditions" in group && Array.isArray((group as any).conditions) ? (group as any).conditions : [group as ConditionLike];
    for (const condition of conditions) {
      if (!condition?.field) continue;
      const entry = columnMap.get(condition.field);
      const probe: string[] = [];
      if (entry) applyFilterCondition(probe, [], entry.column, condition.operator, condition.value, entry.kind, timeZone, entry.subquery ? undefined : entry.expression);
      if (!entry || probe.length === 0) throw new UnsupportedFilterError(condition.field, String(condition.operator ?? "equals"));
    }
  }
}
type GroupLike = ConditionLike | { logic?: "AND" | "OR"; conditions?: ConditionLike[] };

// WP09 (F12): a field whose real data doesn't live on the table being filtered (predictive
// scores live in "RecordScore", keyed by recordId/recordType, not on "Lead"/"Opportunity"
// directly). Previously leads-postgres.ts/opportunities-postgres.ts resolved these fields into a
// record-id list via a SEPARATE query, then ANDed that list onto the WHOLE where clause at the
// top level -- which silently turns a top-level OR group mixing a normal field and a score field
// into an intersection (the audit's own example: "source = web OR predictiveScoreBand = HOT"
// became "source = web AND id IN <score-matched ids>"). Registering the field here instead, with
// a `subquery` descriptor, lets it compile to an ordinary `id in (select ...)` boolean leaf
// condition at exactly the position it appears in the AND/OR tree -- so the SAME group-logic
// handling below (which already wraps a group's conditions in its own AND/OR and joins groups
// with AND) applies to it for free, with no separate resolve-then-intersect step.
export type FilterColumnEntry = {
  column: string;
  kind: FilterValueKind;
  // A fixed SQL expression from code (never user input) used instead of the quoted column,
  // e.g. the lead status category (UI/UX plan decision 6).
  expression?: string;
  subquery?: {
    table: string; // already-quoted, e.g. `"RecordScore"`
    matchColumn: string; // already-quoted, e.g. `"recordId"`
    recordType: string; // fixed literal for this columnMap (e.g. "LEAD"), not user input
  };
};

// A single `{ logic, conditions }` group (or a single bare condition) is one group, not "no
// filter". Callers that sent one object instead of an array -- e.g. the lead/opportunity
// timelines asking for `leadId equals X` -- used to have the filter silently dropped, which
// returned every activity in the tenant instead of the record's own (fail-open).
export function normalizeFilterGroups(groups: unknown): GroupLike[] {
  if (Array.isArray(groups)) return groups as GroupLike[];
  if (groups && typeof groups === "object") return [groups as GroupLike];
  return [];
}

// Real bug found and fixed while unifying the three modules' filter builders: every module's own
// buildWhere-style function flattened EVERY group's conditions and joined them ALL with a single
// hardcoded "and", completely ignoring each group's own `logic` field -- a user picking "Match
// ANY (OR)" for a group in the advanced filter drawer got that group's conditions silently
// ANDed together anyway, with no error or indication anything was wrong. This is the one place
// group logic is now actually honored: each group's own conditions are joined by ITS OWN logic
// and wrapped in parens, and the resulting per-group clauses are ANDed together (multiple groups
// are additional independent refinements, matching the drawer's own "Add Group" UI intent).
// `clauses`/`values` are mutated in place, the same convention applyFilterCondition already
// follows, so placeholder numbering stays consistent with whatever the caller already pushed
// (tenant scoping, ownership scoping, etc.) before calling this.
export function buildGroupedFilterClause(
  clauses: string[],
  values: unknown[],
  groups: GroupLike[] | null | undefined,
  columnMap: Map<string, FilterColumnEntry>,
  timeZone: string = DEFAULT_SERVER_TIME_ZONE,
  subqueryTenantId?: string | null,
) {
  for (const group of normalizeFilterGroups(groups)) {
    const conditions: ConditionLike[] =
      "conditions" in group && Array.isArray((group as any).conditions) ? (group as any).conditions : [group as ConditionLike];
    const logic = "logic" in group && (group as any).logic === "OR" ? "OR" : "AND";
    const groupClauses: string[] = [];
    for (const condition of conditions) {
      if (!condition?.field) continue;
      const entry = columnMap.get(condition.field);
      if (!entry) continue;
      if (entry.subquery) {
        const innerClauses: string[] = [];
        pushClause(innerClauses, values, `"recordType" = ?`, entry.subquery.recordType);
        if (subqueryTenantId) pushClause(innerClauses, values, `"tenantId" = ?`, subqueryTenantId);
        else innerClauses.push(`"tenantId" is null`);
        const before = innerClauses.length;
        applyFilterCondition(innerClauses, values, entry.column, condition.operator, condition.value, entry.kind, timeZone);
        // An operator/value combination applyFilterCondition doesn't recognize adds nothing --
        // without this guard the subquery would silently match every scored record (recordType +
        // tenantId alone) instead of contributing no real constraint, which is the exact kind of
        // "unsupported operator silently broadens the result" bug this same finding warns about.
        if (innerClauses.length === before) continue;
        groupClauses.push(`id in (select ${entry.subquery.matchColumn} from ${entry.subquery.table} where ${innerClauses.join(" and ")})`);
        continue;
      }
      applyFilterCondition(groupClauses, values, entry.column, condition.operator, condition.value, entry.kind, timeZone, entry.expression);
    }
    if (groupClauses.length === 0) continue;
    clauses.push(groupClauses.length === 1 ? groupClauses[0] : `(${groupClauses.join(` ${logic} `)})`);
  }
}
