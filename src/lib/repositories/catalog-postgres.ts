import { randomUUID } from "crypto";
import { execute, query, queryOne } from "@/lib/db/query";

type TenantUser = { id: string; tenantId: string | null };

// Priority Module 12's "product catalog" -- the first repository code written against the
// catalog schema (migrations 0100/0101), which until this module's own earlier items had zero
// repository/API/UI layer. `listProgramsForTenant` (item 3, linking an OpportunityType to a
// Program) is kept as its own small, typed function since it already has a real caller; the
// generic CRUD below is item 4's "admin catalog management UI" -- full create/edit/delete for
// every entity named in that item (universities, campuses, programs, courses, intakes, fees,
// scholarships, eligibility criteria, application stages, document checklists). Deliberately
// NOT covering `Specialization`/`ProductCatalog`/`CatalogVersion` -- none of those three are
// named in this item's own wording; `ProductCatalog` is auto-managed per tenant below instead
// of being a user-facing concept (see `getOrCreateDefaultCatalogId`).
export type CatalogProgram = {
  id: string;
  name: string;
  level: string;
  universityId: string;
  universityName: string;
};

export async function listProgramsForTenant(user: TenantUser): Promise<CatalogProgram[]> {
  if (!user.tenantId) return [];
  return query<CatalogProgram>(
    `select p.id, p.name, p.level, p."universityId", u.name as "universityName"
     from "Program" p
     join "University" u on u.id = p."universityId"
     where p."tenantId" = $1 and p."isActive" = true
     order by u.name asc, p."order" asc, p.name asc`,
    [user.tenantId],
  );
}

export type CatalogEntityKey =
  | "universities"
  | "campuses"
  | "programs"
  | "courses"
  | "intakes"
  | "fee-plans"
  | "scholarship-rules"
  | "eligibility-rules"
  | "application-stages"
  | "application-checklists";

type CatalogEntityConfig = {
  table: string;
  // The column on this table that references its parent -- null for University, whose "parent"
  // (ProductCatalog) is auto-managed, never supplied by the client.
  parentColumn: string | null;
  // Whitelisted column names the client may set -- NEVER interpolate a client-supplied key name
  // directly into SQL; only values for keys already in this list are used.
  fields: string[];
};

const CATALOG_ENTITY_CONFIGS: Record<CatalogEntityKey, CatalogEntityConfig> = {
  universities: {
    table: "University",
    parentColumn: null,
    fields: ["name", "code", "country", "city", "website", "logoUrl", "order", "isActive"],
  },
  campuses: {
    table: "Campus",
    parentColumn: "universityId",
    fields: ["name", "addressLine", "city", "state", "country", "isActive"],
  },
  programs: {
    table: "Program",
    parentColumn: "universityId",
    fields: ["name", "level", "durationMonths", "description", "order", "isActive"],
  },
  courses: {
    table: "Course",
    parentColumn: "programId",
    fields: ["name", "code", "description", "order", "isActive"],
  },
  intakes: {
    table: "Intake",
    parentColumn: "programId",
    fields: ["name", "campusId", "startDate", "endDate", "applicationDeadline", "capacity", "isActive"],
  },
  "fee-plans": {
    table: "FeePlan",
    parentColumn: "programId",
    fields: ["name", "intakeId", "currency", "applicationFee", "admissionFee", "tuitionFeeTotal", "isActive"],
  },
  "scholarship-rules": {
    table: "ScholarshipRule",
    parentColumn: "programId",
    fields: ["name", "description", "discountType", "discountValue", "isActive"],
  },
  "eligibility-rules": {
    table: "EligibilityRule",
    parentColumn: "programId",
    fields: ["name", "description", "minEducationLevel", "minPercentage", "requiredEntranceExam", "isActive"],
  },
  "application-stages": {
    table: "ApplicationStage",
    parentColumn: "programId",
    fields: ["name", "order", "slaDays", "isClosed", "isWon", "color"],
  },
  "application-checklists": {
    table: "ApplicationChecklist",
    parentColumn: "programId",
    fields: ["name", "description", "isRequired", "order", "isActive"],
  },
};

export function isCatalogEntityKey(value: string): value is CatalogEntityKey {
  return value in CATALOG_ENTITY_CONFIGS;
}

function requireTenantId(user: TenantUser) {
  if (!user.tenantId) throw new Error("TENANT_CONTEXT_REQUIRED");
  return user.tenantId;
}

// A tenant's own catalog is auto-created on first use rather than being a separate concept an
// admin manages directly -- `ProductCatalog`/`CatalogVersion` aren't named in this checklist
// item's own wording, so there's no UI for them; every University just belongs to "the tenant's
// one catalog" transparently.
async function getOrCreateDefaultCatalogId(tenantId: string): Promise<string> {
  const existing = await queryOne<{ id: string }>(
    'select id from "ProductCatalog" where "tenantId" = $1 order by "createdAt" asc limit 1',
    [tenantId],
  );
  if (existing) return existing.id;
  const now = new Date().toISOString();
  const created = await queryOne<{ id: string }>(
    'insert into "ProductCatalog" (id, "tenantId", name, "createdAt", "updatedAt") values ($1, $2, $3, $4, $4) returning id',
    [randomUUID(), tenantId, "Default Catalog", now],
  );
  if (!created) throw new Error("CATALOG_CREATE_FAILED");
  return created.id;
}

// Every non-University entity's parentId is client-supplied (which University/Program a new
// Campus/Course/etc belongs to) -- verified here rather than trusted from the FK alone, since
// none of these parent tables have a composite (tenantId, id) constraint at the DB level (a
// cross-tenant id would otherwise silently link fine).
async function assertParentBelongsToTenant(tenantId: string, parentTable: string, parentId: string) {
  const row = await queryOne<{ id: string }>(`select id from "${parentTable}" where id = $1 and "tenantId" = $2`, [parentId, tenantId]);
  if (!row) throw new Error("CATALOG_PARENT_NOT_FOUND");
}

const PARENT_TABLE_BY_COLUMN: Record<string, string> = {
  universityId: "University",
  programId: "Program",
};

function pickWhitelistedFields(config: CatalogEntityConfig, input: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of config.fields) {
    if (key in input) result[key] = input[key] === "" ? null : input[key];
  }
  return result;
}

export async function listCatalogEntitiesForTenant(user: TenantUser, entityKey: CatalogEntityKey, parentId?: string | null) {
  const tenantId = requireTenantId(user);
  const config = CATALOG_ENTITY_CONFIGS[entityKey];
  if (config.parentColumn && parentId) {
    return query<any>(
      `select * from "${config.table}" where "tenantId" = $1 and "${config.parentColumn}" = $2 order by "createdAt" asc`,
      [tenantId, parentId],
    );
  }
  return query<any>(`select * from "${config.table}" where "tenantId" = $1 order by "createdAt" asc`, [tenantId]);
}

export async function createCatalogEntityForTenant(
  user: TenantUser,
  entityKey: CatalogEntityKey,
  input: Record<string, unknown> & { parentId?: string },
) {
  const tenantId = requireTenantId(user);
  const config = CATALOG_ENTITY_CONFIGS[entityKey];
  const fields = pickWhitelistedFields(config, input);
  if (!fields.name || String(fields.name).trim() === "") throw new Error("NAME_REQUIRED");

  const row: Record<string, unknown> = { id: randomUUID(), tenantId, ...fields };

  if (config.parentColumn) {
    const parentId = input.parentId ? String(input.parentId) : "";
    if (!parentId) throw new Error("PARENT_ID_REQUIRED");
    const parentTable = PARENT_TABLE_BY_COLUMN[config.parentColumn];
    await assertParentBelongsToTenant(tenantId, parentTable, parentId);
    row[config.parentColumn] = parentId;
  } else {
    // University -- parent is the tenant's own auto-managed catalog, never client-supplied.
    row.catalogId = await getOrCreateDefaultCatalogId(tenantId);
  }

  const now = new Date().toISOString();
  row.createdAt = now;
  row.updatedAt = now;

  const columns = Object.keys(row);
  const result = await queryOne<any>(
    `insert into "${config.table}" (${columns.map((c) => `"${c}"`).join(", ")})
     values (${columns.map((_, i) => `$${i + 1}`).join(", ")})
     returning *`,
    columns.map((c) => row[c]),
  );
  if (!result) throw new Error(`${config.table.toUpperCase()}_INSERT_FAILED`);
  return result;
}

export async function updateCatalogEntityForTenant(
  user: TenantUser,
  entityKey: CatalogEntityKey,
  id: string,
  input: Record<string, unknown>,
) {
  const tenantId = requireTenantId(user);
  const config = CATALOG_ENTITY_CONFIGS[entityKey];
  const fields = pickWhitelistedFields(config, input);
  if ("name" in fields && String(fields.name ?? "").trim() === "") throw new Error("NAME_REQUIRED");
  fields.updatedAt = new Date().toISOString();

  const columns = Object.keys(fields);
  const assignments = columns.map((c, i) => `"${c}" = $${i + 1}`).join(", ");
  const result = await queryOne<any>(
    `update "${config.table}" set ${assignments} where "tenantId" = $${columns.length + 1} and id = $${columns.length + 2} returning *`,
    [...columns.map((c) => fields[c]), tenantId, id],
  );
  if (!result) throw new Error(`${config.table.toUpperCase()}_NOT_FOUND`);
  return result;
}

export async function deleteCatalogEntityForTenant(user: TenantUser, entityKey: CatalogEntityKey, id: string) {
  const tenantId = requireTenantId(user);
  const config = CATALOG_ENTITY_CONFIGS[entityKey];
  await execute(`delete from "${config.table}" where "tenantId" = $1 and id = $2`, [tenantId, id]);
}
