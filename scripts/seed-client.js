/* eslint-disable no-console */
const { Client } = require("pg");

function loadEnv() {
  require("dotenv").config({ path: ".env.local" });
  require("dotenv").config({ path: ".env" });
  require("dotenv").config({ path: "../.env" });
}

function normalizePgValue(value, columnType = null) {
  if (value === undefined) return null;
  if ((columnType === "json" || columnType === "jsonb") && value !== null && typeof value === "object") {
    return JSON.stringify(value);
  }
  return value;
}

function quoteIdentifier(identifier) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return `"${identifier.replace(/"/g, '""')}"`;
}

function parseColumns(select) {
  if (!select || select === "*") return "*";
  return select
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((column) => quoteIdentifier(column))
    .join(", ");
}

function pgError(error) {
  return {
    message: error.message,
    code: error.code,
    details: error.detail || null,
    hint: error.hint || null,
  };
}

class PgQueryBuilder {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.action = "select";
    this.selectColumns = "*";
    this.filters = [];
    this.orders = [];
    this.limitValue = null;
    this.insertRows = null;
    this.updatePatch = null;
    this.upsertOptions = {};
    this.countMode = null;
    this.head = false;
    this.singleMode = false;
  }

  async columnTypes() {
    const cacheKey = this.table;
    if (!this.client.__columnTypeCache) this.client.__columnTypeCache = new Map();
    if (this.client.__columnTypeCache.has(cacheKey)) return this.client.__columnTypeCache.get(cacheKey);

    const result = await this.client.query(
      `
        select column_name, data_type
        from information_schema.columns
        where table_schema = 'public' and table_name = $1
      `,
      [this.table],
    );
    const types = new Map(result.rows.map((row) => [row.column_name, row.data_type]));
    this.client.__columnTypeCache.set(cacheKey, types);
    return types;
  }

  select(columns = "*", options = {}) {
    this.action = "select";
    this.selectColumns = columns;
    this.countMode = options.count || null;
    this.head = !!options.head;
    return this;
  }

  insert(rows) {
    this.action = "insert";
    this.insertRows = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  upsert(rows, options = {}) {
    this.action = "upsert";
    this.insertRows = Array.isArray(rows) ? rows : [rows];
    this.upsertOptions = options;
    return this;
  }

  update(patch) {
    this.action = "update";
    this.updatePatch = patch;
    return this;
  }

  delete() {
    this.action = "delete";
    return this;
  }

  eq(column, value) {
    this.filters.push({ column, operator: "=", value });
    return this;
  }

  in(column, values) {
    this.filters.push({ column, operator: "in", value: values });
    return this;
  }

  is(column, value) {
    this.filters.push({ column, operator: value === null ? "is null" : "is", value });
    return this;
  }

  ilike(column, value) {
    this.filters.push({ column, operator: "ilike", value });
    return this;
  }

  order(column, options = {}) {
    this.orders.push({ column, ascending: options.ascending !== false });
    return this;
  }

  limit(value) {
    this.limitValue = value;
    return this;
  }

  maybeSingle() {
    this.singleMode = true;
    return this.execute();
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }

  catch(reject) {
    return this.execute().catch(reject);
  }

  async execute() {
    try {
      if (this.action === "select") return await this.executeSelect();
      if (this.action === "insert") return await this.executeInsert(false);
      if (this.action === "upsert") return await this.executeInsert(true);
      if (this.action === "update") return await this.executeUpdate();
      if (this.action === "delete") return await this.executeDelete();
      throw new Error(`Unsupported action: ${this.action}`);
    } catch (error) {
      return { data: null, count: null, error: pgError(error) };
    }
  }

  buildWhere(startIndex = 1) {
    const clauses = [];
    const values = [];
    let index = startIndex;

    for (const filter of this.filters) {
      const column = quoteIdentifier(filter.column);
      if (filter.operator === "is null") {
        clauses.push(`${column} is null`);
      } else if (filter.operator === "in") {
        const items = filter.value || [];
        if (!items.length) {
          clauses.push("false");
        } else {
          const placeholders = items.map((item) => {
            values.push(normalizePgValue(item));
            return `$${index++}`;
          });
          clauses.push(`${column} in (${placeholders.join(", ")})`);
        }
      } else {
        values.push(normalizePgValue(filter.value));
        clauses.push(`${column} ${filter.operator} $${index++}`);
      }
    }

    return {
      sql: clauses.length ? ` where ${clauses.join(" and ")}` : "",
      values,
      nextIndex: index,
    };
  }

  async executeSelect() {
    const where = this.buildWhere();
    const table = quoteIdentifier(this.table);

    if (this.countMode === "exact" && this.head) {
      const result = await this.client.query(`select count(*)::int as count from ${table}${where.sql}`, where.values);
      return { data: null, count: result.rows[0]?.count || 0, error: null };
    }

    let sql = `select ${parseColumns(this.selectColumns)} from ${table}${where.sql}`;
    if (this.orders.length) {
      sql += ` order by ${this.orders
        .map((item) => `${quoteIdentifier(item.column)} ${item.ascending ? "asc" : "desc"}`)
        .join(", ")}`;
    }
    if (this.limitValue !== null) {
      where.values.push(this.limitValue);
      sql += ` limit $${where.values.length}`;
    }

    const result = await this.client.query(sql, where.values);
    const data = this.singleMode ? result.rows[0] || null : result.rows;
    return { data, count: result.rowCount, error: null };
  }

  async executeInsert(isUpsert) {
    const rows = this.insertRows || [];
    if (!rows.length) return { data: [], count: 0, error: null };

    const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
    const columnTypes = await this.columnTypes();
    const values = [];
    const tuples = rows.map((row) => {
      const placeholders = columns.map((column) => {
        values.push(normalizePgValue(row[column], columnTypes.get(column)));
        return `$${values.length}`;
      });
      return `(${placeholders.join(", ")})`;
    });

    let sql = `insert into ${quoteIdentifier(this.table)} (${columns.map(quoteIdentifier).join(", ")}) values ${tuples.join(", ")}`;
    if (isUpsert) {
      const conflictColumns = String(this.upsertOptions.onConflict || "id")
        .split(",")
        .map((column) => column.trim())
        .filter(Boolean);
      sql += ` on conflict (${conflictColumns.map(quoteIdentifier).join(", ")})`;
      if (this.upsertOptions.ignoreDuplicates) {
        sql += " do nothing";
      } else {
        const updateColumns = columns.filter((column) => !conflictColumns.includes(column));
        sql += updateColumns.length
          ? ` do update set ${updateColumns.map((column) => `${quoteIdentifier(column)} = excluded.${quoteIdentifier(column)}`).join(", ")}`
          : " do nothing";
      }
    }
    sql += " returning *";

    const result = await this.client.query(sql, values);
    return { data: result.rows, count: result.rowCount, error: null };
  }

  async executeUpdate() {
    const patch = this.updatePatch || {};
    const columns = Object.keys(patch);
    if (!columns.length) return { data: [], count: 0, error: null };

    const columnTypes = await this.columnTypes();
    const values = [];
    const assignments = columns.map((column) => {
      values.push(normalizePgValue(patch[column], columnTypes.get(column)));
      return `${quoteIdentifier(column)} = $${values.length}`;
    });
    const where = this.buildWhere(values.length + 1);
    const result = await this.client.query(
      `update ${quoteIdentifier(this.table)} set ${assignments.join(", ")}${where.sql} returning *`,
      values.concat(where.values),
    );
    return { data: result.rows, count: result.rowCount, error: null };
  }

  async executeDelete() {
    const where = this.buildWhere();
    const result = await this.client.query(`delete from ${quoteIdentifier(this.table)}${where.sql} returning *`, where.values);
    return { data: result.rows, count: result.rowCount, error: null };
  }
}

function createPgSeedClient(connectionString) {
  const client = new Client({ connectionString });
  let connected = false;

  return {
    async connect() {
      if (!connected) {
        await client.connect();
        connected = true;
      }
    },
    async close() {
      if (connected) {
        await client.end();
        connected = false;
      }
    },
    from(table) {
      return new PgQueryBuilder(client, table);
    },
  };
}

function createSeedClient() {
  loadEnv();
  const connectionString = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Missing DIRECT_DATABASE_URL or DATABASE_URL for direct Postgres seed mode");
  return {
    mode: "postgres",
    client: createPgSeedClient(connectionString),
  };
}

module.exports = {
  createSeedClient,
  createPgSeedClient,
  PgQueryBuilder,
  quoteIdentifier,
};
