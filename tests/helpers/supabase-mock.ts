export type Row = Record<string, any>;
export type FixtureDb = Record<string, Row[]>;

// Module-level mutable store so a single (hoisted) vi.mock factory can pick up
// whatever fixture each test's beforeEach installs.
let activeDb: FixtureDb = {};
export function setFixtureDb(db: FixtureDb) {
  activeDb = db;
}
export function getActiveDb(): FixtureDb {
  return activeDb;
}

type FilterOp =
  | { type: "eq" | "neq" | "gt" | "lt" | "gte" | "lte"; col: string; val: unknown }
  | { type: "is"; col: string; val: null }
  | { type: "in"; col: string; val: unknown[] }
  | { type: "ilike"; col: string; val: string };

function applyFilters(rows: Row[], filters: FilterOp[]): Row[] {
  return rows.filter((row) =>
    filters.every((f) => {
      switch (f.type) {
        case "eq":
          return row[f.col] === f.val;
        case "neq":
          return row[f.col] !== f.val;
        case "is":
          return row[f.col] === null || row[f.col] === undefined;
        case "in":
          return (f.val as unknown[]).includes(row[f.col]);
        case "gt":
          return row[f.col] > (f.val as any);
        case "lt":
          return row[f.col] < (f.val as any);
        case "gte":
          return row[f.col] >= (f.val as any);
        case "lte":
          return row[f.col] <= (f.val as any);
        case "ilike": {
          const needle = String(f.val).replace(/%/g, "").toLowerCase();
          return String(row[f.col] ?? "").toLowerCase().includes(needle);
        }
      }
    })
  );
}

type QueryResult = { data: any; error: any; count?: number | null };

class FakeQueryBuilder implements PromiseLike<QueryResult> {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private filters: FilterOp[] = [];
  private insertRows?: Row[];
  private updatePatch?: Row;
  private wantSingle = false;
  private wantMaybeSingle = false;
  private wantHead = false;
  private limitN?: number;
  private rangeFrom?: number;
  private rangeTo?: number;
  private orderBy: Array<{ col: string; ascending: boolean }> = [];

  constructor(private db: FixtureDb, private table: string) {}

  // select() declares result/RETURNING columns; it must never change `op`, since real
  // code chains it after .insert()/.update() too (e.g. .insert(payload).select("id").single()).
  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (opts?.head) this.wantHead = true;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = "insert";
    this.insertRows = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.updatePatch = patch;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }

  eq(col: string, val: unknown) {
    this.filters.push({ type: "eq", col, val });
    return this;
  }
  neq(col: string, val: unknown) {
    this.filters.push({ type: "neq", col, val });
    return this;
  }
  is(col: string, val: null) {
    this.filters.push({ type: "is", col, val });
    return this;
  }
  in(col: string, val: unknown[]) {
    this.filters.push({ type: "in", col, val });
    return this;
  }
  ilike(col: string, val: string) {
    this.filters.push({ type: "ilike", col, val });
    return this;
  }
  gt(col: string, val: unknown) {
    this.filters.push({ type: "gt", col, val });
    return this;
  }
  lt(col: string, val: unknown) {
    this.filters.push({ type: "lt", col, val });
    return this;
  }
  gte(col: string, val: unknown) {
    this.filters.push({ type: "gte", col, val });
    return this;
  }
  lte(col: string, val: unknown) {
    this.filters.push({ type: "lte", col, val });
    return this;
  }

  // Supabase's real query builder supports chaining multiple .order() calls to
  // produce a compound sort (primary key, then tie-break key, ...) — mirror that
  // here rather than only keeping the last call, since resolution logic that
  // tie-breaks priority with createdAt depends on it.
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy.push({ col, ascending: opts?.ascending ?? true });
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  range(from: number, to: number) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }
  single() {
    this.wantSingle = true;
    return this;
  }
  maybeSingle() {
    this.wantMaybeSingle = true;
    return this;
  }

  private execute(): QueryResult {
    this.db[this.table] = this.db[this.table] ?? [];
    const table = this.db[this.table];

    if (this.op === "insert") {
      const inserted = this.insertRows!.map((r) => ({ ...r }));
      table.push(...inserted);
      if (this.wantSingle) {
        return { data: inserted[0] ?? null, error: inserted[0] ? null : { message: "insert returned no row" } };
      }
      return { data: inserted, error: null };
    }
    if (this.op === "update") {
      const matched = applyFilters(table, this.filters);
      matched.forEach((row) => Object.assign(row, this.updatePatch));
      if (this.wantSingle) {
        return { data: matched[0] ?? null, error: matched[0] ? null : { message: "update matched no row" } };
      }
      if (this.wantMaybeSingle) return { data: matched[0] ?? null, error: null };
      return { data: matched, error: null };
    }
    if (this.op === "delete") {
      const matched = applyFilters(table, this.filters);
      const matchedSet = new Set(matched);
      this.db[this.table] = table.filter((row) => !matchedSet.has(row));
      return { data: matched, error: null };
    }

    // select
    let rows = applyFilters(table, this.filters);
    const count = rows.length; // filtered total, before range/limit slicing
    if (this.orderBy.length > 0) {
      const orderBy = this.orderBy;
      rows = [...rows].sort((a, b) => {
        for (const { col, ascending } of orderBy) {
          const diff = a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0;
          if (diff !== 0) return diff * (ascending ? 1 : -1);
        }
        return 0;
      });
    }
    if (this.rangeFrom !== undefined && this.rangeTo !== undefined) {
      rows = rows.slice(this.rangeFrom, this.rangeTo + 1);
    } else if (this.limitN !== undefined) {
      rows = rows.slice(0, this.limitN);
    }

    if (this.wantHead) return { data: null, error: null, count };
    if (this.wantSingle) return { data: rows[0] ?? null, error: rows[0] ? null : { message: "no rows" }, count };
    if (this.wantMaybeSingle) return { data: rows[0] ?? null, error: null, count };
    return { data: rows.map((r) => ({ ...r })), error: null, count };
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    let result: QueryResult;
    try {
      result = this.execute();
    } catch (e) {
      return Promise.reject(e).then(onfulfilled as any, onrejected);
    }
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

export function createFakeSupabaseClient(db: FixtureDb) {
  return { from: (table: string) => new FakeQueryBuilder(db, table) };
}
