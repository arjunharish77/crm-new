import { randomUUID } from "crypto";
import { execute, query, type Queryable } from "@/lib/db/query";

// Custom field values (voice bot plan wave A). Custom fields could be defined for a record type,
// and the forms showed them, but no value was ever stored: every save dropped them. Values live
// in "CustomFieldValue", one row per record and field, typed by the field's type. Used for
// activities now; written so leads and opportunities can use the same functions.

export type CustomFieldObject = "ACTIVITY" | "LEAD" | "OPPORTUNITY";

const OBJECT_NAMES: Record<CustomFieldObject, string> = { ACTIVITY: "activity", LEAD: "lead", OPPORTUNITY: "opportunity" };

type FieldDefinitionRow = { id: string; key: string; label: string; type: string; options: unknown; entityTypeId: string | null; isRequired: boolean; order: number };

// The custom fields of a record type; with `entityTypeId` (an activity or opportunity type), the
// fields for every type plus that type's own ones.
export async function listCustomFieldDefinitions(tenantId: string, object: CustomFieldObject, entityTypeId?: string | null, client?: Queryable) {
  return query<FieldDefinitionRow>(
    `select fd.id, fd.key, fd.label, fd.type, fd.options, fd."entityTypeId", fd."isRequired", fd."order"
       from "FieldDefinition" fd
       join "ObjectDefinition" od on od.id = fd."objectId" and od."tenantId" = fd."tenantId"
      where fd."tenantId" = $1 and od.name = $2 and fd."isCustom" = true and fd."deletedAt" is null and fd."isActive" = true
        and (fd."entityTypeId" is null or fd."entityTypeId" = $3)
      order by fd."order" asc, fd."createdAt" asc`,
    [tenantId, OBJECT_NAMES[object], entityTypeId ?? null],
    client,
  );
}

type StoredValue = { valueString: string | null; valueNumber: number | null; valueBoolean: boolean | null; valueDate: string | null; valueJson: unknown };

const EMPTY: StoredValue = { valueString: null, valueNumber: null, valueBoolean: null, valueDate: null, valueJson: null };

// The column a value goes in, by field type. Returns null for an empty value (the row is removed).
export function toStoredValue(type: string, value: unknown): StoredValue | null {
  if (value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)) return null;
  switch (String(type).toUpperCase()) {
    case "NUMBER":
    case "CURRENCY":
    case "PERCENT":
    case "DECIMAL": {
      const number = Number(value);
      if (!Number.isFinite(number)) throw new Error("CUSTOM_FIELD_VALUE_INVALID");
      return { ...EMPTY, valueNumber: number };
    }
    case "BOOLEAN":
    case "CHECKBOX":
      return { ...EMPTY, valueBoolean: value === true || value === "true" || value === 1 || value === "1" };
    case "DATE":
    case "DATETIME": {
      const date = new Date(String(value));
      if (Number.isNaN(date.getTime())) throw new Error("CUSTOM_FIELD_VALUE_INVALID");
      return { ...EMPTY, valueDate: date.toISOString() };
    }
    case "MULTI_SELECT":
      return { ...EMPTY, valueJson: JSON.stringify(Array.isArray(value) ? value.map(String) : [String(value)]) };
    default:
      return { ...EMPTY, valueString: String(value).slice(0, 10000) };
  }
}

function fromStoredValue(row: StoredValue) {
  if (row.valueNumber !== null) return Number(row.valueNumber);
  if (row.valueBoolean !== null) return row.valueBoolean;
  if (row.valueDate !== null) return new Date(row.valueDate).toISOString();
  if (row.valueJson !== null) return row.valueJson;
  return row.valueString;
}

// Saves the values given (by field key) for one record. Keys that aren't a custom field of this
// record (and type) are ignored; an empty value removes the stored one. Returns the keys saved.
export async function saveCustomFieldValues(
  tenantId: string,
  object: CustomFieldObject,
  recordId: string,
  entityTypeId: string | null | undefined,
  values: Record<string, unknown> | null | undefined,
  client?: Queryable,
  // A public form skips a value of the wrong kind instead of refusing the whole submission.
  options: { skipInvalid?: boolean } = {},
) {
  if (!values || typeof values !== "object") return [];
  const definitions = await listCustomFieldDefinitions(tenantId, object, entityTypeId, client);
  const saved: string[] = [];
  for (const definition of definitions) {
    if (!(definition.key in values)) continue;
    let stored: StoredValue | null;
    try {
      stored = toStoredValue(definition.type, values[definition.key]);
    } catch (error) {
      if (options.skipInvalid) continue;
      throw error;
    }
    if (!stored) {
      await execute(`delete from "CustomFieldValue" where "tenantId" = $1 and "recordId" = $2 and "fieldDefinitionId" = $3`, [tenantId, recordId, definition.id], client);
    } else {
      await execute(
        `insert into "CustomFieldValue" (id, "tenantId", "objectType", "fieldDefinitionId", "recordId", "valueString", "valueNumber", "valueBoolean", "valueDate", "valueJson", "createdAt", "updatedAt")
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), now())
         on conflict ("tenantId", "recordId", "fieldDefinitionId") do update
           set "valueString" = excluded."valueString", "valueNumber" = excluded."valueNumber", "valueBoolean" = excluded."valueBoolean",
               "valueDate" = excluded."valueDate", "valueJson" = excluded."valueJson", "objectType" = excluded."objectType", "updatedAt" = now()`,
        [randomUUID(), tenantId, object, definition.id, recordId, stored.valueString, stored.valueNumber, stored.valueBoolean, stored.valueDate, stored.valueJson],
        client,
      );
    }
    saved.push(definition.key);
  }
  return saved;
}

// The stored values of several records, as { recordId: { fieldKey: value } }, and each field's
// label by key (for showing them).
export async function loadCustomFieldValues(tenantId: string, object: CustomFieldObject, recordIds: string[], client?: Queryable) {
  const result = new Map<string, Record<string, unknown>>();
  const labels: Record<string, string> = {};
  if (!recordIds.length) return Object.assign(result, { labels });
  const rows = await query<StoredValue & { recordId: string; key: string; label: string }>(
    `select v."recordId", fd.key, fd.label, v."valueString", v."valueNumber", v."valueBoolean", v."valueDate", v."valueJson"
       from "CustomFieldValue" v
       join "FieldDefinition" fd on fd.id = v."fieldDefinitionId" and fd."tenantId" = v."tenantId"
      where v."tenantId" = $1 and v."objectType" = $2 and v."recordId" = any($3::text[]) and fd."deletedAt" is null`,
    [tenantId, object, recordIds],
    client,
  );
  for (const row of rows) {
    const values = result.get(row.recordId) ?? {};
    values[row.key] = fromStoredValue(row);
    labels[row.key] = row.label;
    result.set(row.recordId, values);
  }
  return Object.assign(result, { labels });
}

// Custom field values sent with a record: `customFields` (API) or `data` (the record form), by key.
export function customFieldInputOf(payload: Record<string, unknown> | null | undefined) {
  const value = payload?.customFields ?? payload?.data;
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

// { recordId: { customFields, customFieldLabels } } for records about to be returned. Records
// without values get empty objects, so the shape is always the same.
export async function customFieldsByRecord(tenantId: string | null | undefined, object: CustomFieldObject, recordIds: string[], client?: Queryable) {
  const result = new Map<string, { customFields: Record<string, unknown>; customFieldLabels: Record<string, string> }>();
  if (!tenantId || !recordIds.length) return result;
  const values = await loadCustomFieldValues(tenantId, object, recordIds, client);
  for (const id of recordIds) {
    const customFields = values.get(id) ?? {};
    result.set(id, { customFields, customFieldLabels: Object.fromEntries(Object.keys(customFields).map((key) => [key, values.labels[key] ?? key])) });
  }
  return result;
}

// List filters on custom fields (`customFields.<key>`): each compiles to the record's stored
// value, looked up per row, so every operator works the same as on a built-in field ("is empty"
// matches records with no value). `table` is the unaliased table the list queries ("Lead",
// "Opportunity"). Only fields named in the filters are looked up; ids are the database's own.
export async function customFieldFilterColumns(
  tenantId: string | null | undefined,
  object: CustomFieldObject,
  table: '"Lead"' | '"Opportunity"',
  filters: unknown,
): Promise<Map<string, { column: string; kind: "text" | "number" | "date" | "select" | "boolean"; expression: string }>> {
  const columns = new Map<string, { column: string; kind: "text" | "number" | "date" | "select" | "boolean"; expression: string }>();
  const wanted = new Set<string>();
  const collect = (node: unknown) => {
    if (Array.isArray(node)) { node.forEach(collect); return; }
    if (!node || typeof node !== "object") return;
    const field = (node as any).field;
    if (typeof field === "string" && field.startsWith("customFields.")) wanted.add(field.slice("customFields.".length));
    if (Array.isArray((node as any).conditions)) (node as any).conditions.forEach(collect);
  };
  collect(filters);
  if (!tenantId || !wanted.size) return columns;
  const definitions = await query<{ id: string; key: string; type: string }>(
    `select fd.id, fd.key, fd.type from "FieldDefinition" fd join "ObjectDefinition" od on od.id = fd."objectId" and od."tenantId" = fd."tenantId"
      where fd."tenantId" = $1 and od.name = $2 and fd."isCustom" = true and fd."deletedAt" is null and fd.key = any($3::text[])`,
    [tenantId, OBJECT_NAMES[object], [...wanted]],
  );
  for (const definition of definitions) {
    if (!/^[A-Za-z0-9_-]+$/.test(definition.id)) continue;
    const type = String(definition.type).toUpperCase();
    const [valueColumn, kind]: [string, "text" | "number" | "date" | "select" | "boolean"] =
      ["NUMBER", "CURRENCY", "PERCENT", "DECIMAL"].includes(type) ? ['v."valueNumber"', "number"]
      : ["DATE", "DATETIME"].includes(type) ? ['v."valueDate"', "date"]
      : ["BOOLEAN", "CHECKBOX"].includes(type) ? ['v."valueBoolean"', "boolean"]
      : ["MULTI_SELECT", "MULTISELECT"].includes(type) ? ['v."valueJson"::text', "text"]
      : ["DROPDOWN", "SELECT"].includes(type) ? ['v."valueString"', "select"]
      : ['v."valueString"', "text"];
    columns.set(`customFields.${definition.key}`, {
      column: `customFields.${definition.key}`,
      kind,
      expression: `(select ${valueColumn} from "CustomFieldValue" v where v."tenantId" = ${table}."tenantId" and v."recordId" = ${table}.id and v."fieldDefinitionId" = '${definition.id}')`,
    });
  }
  return columns;
}
