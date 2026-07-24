/* eslint-disable no-console */
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { createSeedClient } = require("./seed-client");
require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });
require("dotenv").config({ path: "../.env" });

const TENANT = process.env.DEMO_TENANT_ID || "d3b6693a-7aa2-4b91-94cf-43ab37ffed90";
let ADMIN_USER_ID = process.env.DEMO_ADMIN_USER_ID || "82c64bde-47de-4d36-8045-45e8488a1a99";
const ADMIN_EMAIL_FALLBACK = process.env.DEMO_ADMIN_EMAIL || "admintest@test.com";
const BASE_DATE = new Date("2026-07-08T09:00:00.000Z");
const PASSWORD = "Demo@12345";
const LEAD_COUNT = Number(process.env.DEMO_LEAD_COUNT || 520);

const pick = (items, index) => items[index % items.length];
const slug = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const stableUuid = (value) => {
  const hex = crypto.createHash("sha256").update(`${TENANT}:${value}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${(8 + (parseInt(hex.slice(16, 17), 16) % 4)).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
const normalizeSeedIds = (value) => {
  if (typeof value === "string") return value.startsWith("demo-") ? stableUuid(value) : value;
  if (Array.isArray(value)) return value.map(normalizeSeedIds);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeSeedIds(item)]));
  }
  return value;
};
const iso = (daysOffset, hour = 9, minute = 0) => {
  const date = new Date(BASE_DATE);
  date.setUTCDate(date.getUTCDate() + daysOffset);
  date.setUTCHours(hour, minute, 0, 0);
  return date.toISOString();
};

const COURSES = [
  "B.Tech Computer Science",
  "B.Tech Artificial Intelligence",
  "BBA Digital Business",
  "MBA Marketing",
  "MBA Finance",
  "B.Com Professional",
  "BA Psychology",
  "B.Des UX Design",
  "MCA Cloud Computing",
  "M.Sc Data Science",
  "LLB Integrated",
  "B.Sc Nursing",
];
const SOURCES = ["Google Ads", "Meta Ads", "Website", "Education Fair", "Partner", "WhatsApp Campaign", "School Outreach", "Referral"];
const CAMPAIGNS = ["July Admissions 2026", "Scholarship Push", "South Zone Fair", "Engineering Intent", "MBA Weekend", "Retargeting Warm Leads"];
const MEDIUMS = ["cpc", "social", "organic", "partner", "whatsapp", "email", "event"];
const STATES = ["Karnataka", "Tamil Nadu", "Kerala", "Maharashtra", "Delhi", "Telangana", "West Bengal", "Gujarat"];
const CITIES = ["Bengaluru", "Chennai", "Kochi", "Mumbai", "Delhi", "Hyderabad", "Kolkata", "Ahmedabad"];
const STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST"];
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

const seedConnection = createSeedClient();
const supabase = seedConnection.client;

async function tableExists(table) {
  const { error } = await supabase.from(table).select("*").limit(1);
  if (!error) return true;
  if (/does not exist|schema cache|could not find/i.test(error.message || "")) return false;
  throw error;
}

async function safeUpsert(table, rows, options = {}) {
  if (!rows.length) return { table, count: 0 };
  if (!(await tableExists(table))) return { table, count: 0, skipped: "missing" };
  const normalizedRows = rows.map(normalizeSeedIds);
  const chunkSize = options.chunkSize || 500;
  for (let index = 0; index < normalizedRows.length; index += chunkSize) {
    const chunk = normalizedRows.slice(index, index + chunkSize);
    const { error } = await supabase.from(table).upsert(chunk, {
      onConflict: options.onConflict || "id",
      ignoreDuplicates: options.ignoreDuplicates || false,
    });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  return { table, count: rows.length };
}

async function upsertRecordScores(rows) {
  try {
    return await safeUpsert("RecordScore", rows);
  } catch (error) {
    if (!/RecordScore_source_check/i.test(error.message || "")) throw error;
    console.warn("RecordScore source constraint does not accept PREDICTIVE_SCORING yet; retrying demo scores as RULE_FALLBACK.");
    return safeUpsert("RecordScore", rows.map((row) => ({ ...row, source: "RULE_FALLBACK" })));
  }
}

async function safeUpdate(table, id, patch) {
  if (!(await tableExists(table))) return;
  const { error } = await supabase.from(table).update(normalizeSeedIds(patch)).eq("id", normalizeSeedIds(id));
  if (error) throw new Error(`${table} update ${id}: ${error.message}`);
}

async function getOne(table, select, queryFn) {
  const { data, error } = await queryFn(supabase.from(table).select(select)).maybeSingle();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data;
}

async function getMany(table, select, queryFn) {
  const { data, error } = await queryFn(supabase.from(table).select(select));
  if (error) throw new Error(`${table}: ${error.message}`);
  return data || [];
}

async function ensureObject(name, label) {
  const existing = await getOne("ObjectDefinition", "id", (q) => q.eq("tenantId", TENANT).ilike("name", name).limit(1));
  if (existing?.id) return existing.id;
  const row = {
    id: `demo-object-${slug(name)}`,
    tenantId: TENANT,
    name,
    label,
    isCustom: false,
    createdAt: iso(-90),
    updatedAt: iso(0),
  };
  await safeUpsert("ObjectDefinition", [row]);
  return row.id;
}

async function ensureCustomField(objectId, key, label, type, options = null, order = 0, extra = {}) {
  const existing = await getOne("FieldDefinition", "id", (q) =>
    q.eq("tenantId", TENANT).eq("objectId", objectId).eq("key", key).is("deletedAt", null).limit(1)
  );
  const row = {
    id: existing?.id || `demo-field-${objectId}-${key}`.slice(0, 120),
    tenantId: TENANT,
    objectId,
    key,
    label,
    type,
    storageStrategy: "HYBRID",
    isCustom: true,
    isRequired: false,
    isUnique: false,
    isImmutable: false,
    defaultValue: null,
    options,
    order,
    isActive: true,
    createdAt: iso(-60),
    updatedAt: iso(0),
    ...extra,
  };
  await safeUpsert("FieldDefinition", [row]);
  return row.id;
}

async function upsertCustomFieldValues(rows) {
  if (!rows.length || !(await tableExists("CustomFieldValue"))) return { count: 0 };
  const entityKeys = ["entityId", "recordId"];
  const valueKeys = ["value", "valueString", "valueJson", "valueNumber", "valueDate", "valueBoolean", "textValue", "stringValue", "fieldValue", "jsonValue"];
  let lastError = null;

  for (const entityKey of entityKeys) {
    for (const valueKey of valueKeys) {
      const shapedRows = rows.map((row) => {
        const payload = {
          id: row.id,
          tenantId: row.tenantId,
          fieldDefinitionId: row.fieldDefinitionId,
          [entityKey]: row.entityId,
          [valueKey]: valueKey === "jsonValue" || valueKey === "valueJson" ? { value: row.value } : row.value,
          createdAt: row.createdAt || iso(-1),
          updatedAt: row.updatedAt || iso(0),
        };
        return normalizeSeedIds(payload);
      });
      for (let index = 0; index < shapedRows.length; index += 500) {
        const ids = shapedRows.slice(index, index + 500).map((row) => row.id);
        const deleteResult = await supabase.from("CustomFieldValue").delete().eq("tenantId", TENANT).in("id", ids);
        if (deleteResult.error) {
          lastError = deleteResult.error;
          if (/schema cache|column|could not find/i.test(deleteResult.error.message || "")) break;
          throw new Error(`CustomFieldValue: ${deleteResult.error.message}`);
        }
      }

      let inserted = true;
      for (let index = 0; index < shapedRows.length; index += 500) {
        const chunk = shapedRows.slice(index, index + 500);
        const result = await supabase.from("CustomFieldValue").insert(chunk);
        if (result.error) {
          inserted = false;
          lastError = result.error;
          if (!/schema cache|column|could not find/i.test(result.error.message || "")) {
            throw new Error(`CustomFieldValue: ${result.error.message}`);
          }
          break;
        }
      }
      if (inserted) return { count: rows.length, entityKey, valueKey };
    }
  }

  console.warn(`Skipped CustomFieldValue rows because no supported value column shape matched: ${lastError?.message || "unknown schema"}`);
  return { count: 0, skipped: true };
}

function permissions(recordAccess = "ALL", modules = {}) {
  return {
    recordAccess,
    modules: {
      dashboard: "read",
      leads: "write",
      opportunities: "write",
      activities: "write",
      tasks: "write",
      reports: "read",
      views: "read",
      partners: "none",
      payouts: "none",
      admin: "none",
      ...modules,
    },
  };
}

async function seedOrgAccess(admin) {
  const now = iso(0);
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const roleDefs = [
    { id: "demo-role-super-admin", name: "Demo CRM Administrator", permissions: permissions("ALL", { admin: "full", partners: "write", payouts: "write", reports: "write", views: "write" }) },
    { id: "demo-role-manager", name: "Admissions Manager", permissions: permissions("TEAM", { reports: "write", views: "write" }) },
    { id: "demo-role-counselor", name: "Admissions Counselor", permissions: permissions("OWN") },
    { id: "demo-role-finance", name: "Finance & Payout Admin", permissions: permissions("ALL", { partners: "write", payouts: "write", reports: "read" }) },
    { id: "demo-role-partner", name: "External Partner", permissions: { isPartnerRole: true, recordAccess: "OWN", modules: { leads: "read", opportunities: "read", activities: "read", payouts: "read", admin: "none" } } },
  ];
  const roleIdMap = {};
  for (const [index, role] of roleDefs.entries()) {
    const id = await resolveNamedId("Role", role.name, role.id);
    roleIdMap[role.id] = id;
    await safeUpsert("Role", [{
      id,
      tenantId: TENANT,
      name: role.name,
      description: `${role.name} demo role`,
      permissions: role.permissions,
      createdAt: iso(-80 + index),
      updatedAt: now,
    }]);
  }

  await safeUpdate("User", ADMIN_USER_ID, {
    password: passwordHash,
    roleId: roleIdMap["demo-role-super-admin"],
    status: "ACTIVE",
    updatedAt: now,
  });

  const templateRows = [
    { id: "demo-template-admissions-manager", name: "Admissions Manager Full Funnel", permissions: permissions("TEAM", { reports: "write", views: "write" }) },
    { id: "demo-template-counselor-own", name: "Counselor Own Records", permissions: permissions("OWN") },
    { id: "demo-template-partner-limited", name: "Partner Limited Portal", permissions: { isPartnerRole: true, recordAccess: "OWN", modules: { leads: "read", opportunities: "read", payouts: "read" } } },
    { id: "demo-template-finance", name: "Finance Payout Operations", permissions: permissions("ALL", { payouts: "write", partners: "read", reports: "read" }) },
  ].map((template) => ({
    id: template.id,
    tenantId: TENANT,
    name: template.name,
    description: `${template.name} template for demo users`,
    permissions: template.permissions,
    isActive: true,
    createdAt: iso(-75),
    updatedAt: now,
  }));
  await safeUpsert("PermissionTemplate", templateRows);

  const userRows = [
    ["demo-user-manager-north", "Aditi Rao", "aditi.manager@demouniversity.edu", "demo-role-manager", ADMIN_USER_ID, "demo-template-admissions-manager"],
    ["demo-user-manager-south", "Rahul Menon", "rahul.manager@demouniversity.edu", "demo-role-manager", ADMIN_USER_ID, "demo-template-admissions-manager"],
    ["demo-user-counselor-1", "Neha Sharma", "neha.counselor@demouniversity.edu", "demo-role-counselor", "demo-user-manager-north", "demo-template-counselor-own"],
    ["demo-user-counselor-2", "Karan Mehta", "karan.counselor@demouniversity.edu", "demo-role-counselor", "demo-user-manager-north", "demo-template-counselor-own"],
    ["demo-user-counselor-3", "Priya Iyer", "priya.counselor@demouniversity.edu", "demo-role-counselor", "demo-user-manager-south", "demo-template-counselor-own"],
    ["demo-user-counselor-4", "Vikram Singh", "vikram.counselor@demouniversity.edu", "demo-role-counselor", "demo-user-manager-south", "demo-template-counselor-own"],
    ["demo-user-finance", "Meera Finance", "meera.finance@demouniversity.edu", "demo-role-finance", ADMIN_USER_ID, "demo-template-finance"],
    ["demo-partner-alpha-primary", "Alpha Admissions Primary", "alpha.primary@edu-partners.example", "demo-role-partner", null, "demo-template-partner-limited"],
    ["demo-partner-alpha-counselor", "Alpha Admissions Counselor", "alpha.counselor@edu-partners.example", "demo-role-partner", "demo-partner-alpha-primary", "demo-template-partner-limited"],
    ["demo-partner-beta-primary", "Beta Career Hub Primary", "beta.primary@edu-partners.example", "demo-role-partner", null, "demo-template-partner-limited"],
    ["demo-partner-gamma-primary", "Gamma Overseas Desk", "gamma.primary@edu-partners.example", "demo-role-partner", null, "demo-template-partner-limited"],
  ].map(([id, name, email, roleId, managerId, permissionTemplateId], index) => ({
    id,
    tenantId: TENANT,
    name,
    email,
    password: passwordHash,
    status: "ACTIVE",
    roleId: roleIdMap[roleId] || roleId,
    permissionTemplateId,
    managerId,
    skills: { languages: ["English", index % 2 ? "Hindi" : "Tamil"], courses: [pick(COURSES, index), pick(COURSES, index + 3)] },
    createdAt: iso(-70 + index),
    updatedAt: now,
  }));
  await safeUpsert("User", userRows);

  const teams = [
    ["demo-team-north", "North Admissions Team", "Handles North and West India admissions", "demo-user-manager-north", "Admissions"],
    ["demo-team-south", "South Admissions Team", "Handles South India and NRI admissions", "demo-user-manager-south", "Admissions"],
    ["demo-team-finance", "Partner Finance Desk", "Invoices, payouts, and adjustments", "demo-user-finance", "Finance"],
  ].map(([id, name, description, leadId, department]) => ({
    id,
    tenantId: TENANT,
    name,
    description,
    leadId,
    department,
    workingHours: { start: "09:30", end: "18:30", days: ["MON", "TUE", "WED", "THU", "FRI", "SAT"] },
    timezone: "Asia/Kolkata",
    isActive: true,
    createdAt: iso(-65),
    updatedAt: now,
  }));
  await safeUpsert("Team", teams);

  const teamMembers = [
    ["demo-tm-north-manager", "demo-team-north", "demo-user-manager-north", "LEAD"],
    ["demo-tm-north-1", "demo-team-north", "demo-user-counselor-1", "MEMBER"],
    ["demo-tm-north-2", "demo-team-north", "demo-user-counselor-2", "MEMBER"],
    ["demo-tm-south-manager", "demo-team-south", "demo-user-manager-south", "LEAD"],
    ["demo-tm-south-1", "demo-team-south", "demo-user-counselor-3", "MEMBER"],
    ["demo-tm-south-2", "demo-team-south", "demo-user-counselor-4", "MEMBER"],
    ["demo-tm-finance", "demo-team-finance", "demo-user-finance", "LEAD"],
  ].map(([id, teamId, userId, role]) => ({ id, tenantId: TENANT, teamId, userId, role, joinedAt: iso(-64) }));
  await safeUpsert("TeamMember", teamMembers, { onConflict: "tenantId,teamId,userId" });

  const groups = [
    ["demo-sales-group-engineering", "Engineering Admissions", "B.Tech and MCA lead distribution", "demo-user-manager-north", ["Karnataka", "Telangana", "Maharashtra"], ["B.Tech", "MCA"]],
    ["demo-sales-group-management", "Management Admissions", "MBA/BBA lead distribution", "demo-user-manager-south", ["Tamil Nadu", "Kerala", "Delhi"], ["MBA", "BBA"]],
    ["demo-sales-group-partner", "Partner Sourced Leads", "Partner and referral queue", "demo-user-manager-north", STATES, COURSES],
  ].map(([id, name, description, managerId, states, productLines]) => ({
    id,
    tenantId: TENANT,
    name,
    description,
    managerId,
    permissionTemplateId: "demo-template-admissions-manager",
    states,
    productLines,
    maxLeadsPerMember: 120,
    workingHours: { start: "09:30", end: "18:30" },
    timezone: "Asia/Kolkata",
    isActive: true,
    createdAt: iso(-64),
    updatedAt: now,
  }));
  await safeUpsert("SalesGroup", groups);

  const salesGroupMembers = [
    ["demo-sgm-eng-1", "demo-sales-group-engineering", "demo-user-counselor-1", "MEMBER"],
    ["demo-sgm-eng-2", "demo-sales-group-engineering", "demo-user-counselor-2", "MEMBER"],
    ["demo-sgm-mgmt-1", "demo-sales-group-management", "demo-user-counselor-3", "MEMBER"],
    ["demo-sgm-mgmt-2", "demo-sales-group-management", "demo-user-counselor-4", "MEMBER"],
    ["demo-sgm-partner-1", "demo-sales-group-partner", "demo-user-counselor-1", "MEMBER"],
    ["demo-sgm-partner-2", "demo-sales-group-partner", "demo-user-counselor-3", "MEMBER"],
  ].map(([id, groupId, userId, role]) => ({ id, tenantId: TENANT, groupId, userId, role, joinedAt: iso(-63) }));
  await safeUpsert("SalesGroupMember", salesGroupMembers);

  return {
    internalUsers: userRows.filter((user) => !String(user.id).startsWith("demo-partner")).map((user) => user.id),
    partners: ["demo-partner-alpha-primary", "demo-partner-alpha-counselor", "demo-partner-beta-primary", "demo-partner-gamma-primary"],
  };
}

async function resolveNamedId(table, name, demoId) {
  const existing = await getOne(table, "id", (q) => q.eq("tenantId", TENANT).eq("name", name).limit(1));
  return existing?.id || demoId;
}

async function resolveIdByMatch(table, matchers, demoId) {
  const existing = await getOne(table, "id", (q) =>
    matchers.reduce((qq, [column, value]) => (value === null ? qq.is(column, null) : qq.eq(column, value)), q).limit(1)
  );
  return existing?.id || demoId;
}

async function seedUniversityPipelines(opportunityObjectId) {
  const typeDefsInput = [
    ["demo-opp-type-university-1", "University 1", "Domestic undergraduate and postgraduate admissions", 1, ["B.Tech Computer Science", "B.Tech Artificial Intelligence", "BBA Digital Business", "B.Com Professional"]],
    ["demo-opp-type-university-2", "University 2", "Management, design, law, and healthcare programs", 2, ["MBA Marketing", "MBA Finance", "B.Des UX Design", "LLB Integrated", "B.Sc Nursing"]],
    ["demo-opp-type-university-3", "University 3", "International and advanced technology programs", 3, ["MCA Cloud Computing", "M.Sc Data Science", "BA Psychology", "B.Tech Artificial Intelligence"]],
  ];
  const stages = [
    ["Inquiry", 1, 10, "#64748b", false, false],
    ["Application Started", 2, 25, "#38bdf8", false, false],
    ["Docs Submitted", 3, 45, "#818cf8", false, false],
    ["Offer Issued", 4, 70, "#f59e0b", false, false],
    ["Fee Paid", 5, 100, "#22c55e", true, true],
    ["Rejected / Dropped", 6, 0, "#ef4444", true, false],
  ];

  const typeDefs = [];
  for (const [demoId, name, description, order, courses] of typeDefsInput) {
    const id = await resolveNamedId("OpportunityType", name, demoId);
    await safeUpsert("OpportunityType", [{
      id,
      tenantId: TENANT,
      objectId: opportunityObjectId,
      name,
      description,
      order,
      isActive: true,
      createdAt: iso(-60),
      updatedAt: iso(0),
    }]);
    typeDefs.push([id, name, description, order, courses]);
  }

  const stageRows = [];
  for (const [typeId] of typeDefs) {
    for (const [name, order, probability, color, isClosed, isWon] of stages) {
      const demoStageId = `${typeId}-stage-${slug(name)}`;
      const id = await resolveIdByMatch("StageDefinition", [["opportunityTypeId", typeId], ["name", name]], demoStageId);
      const row = {
        id,
        tenantId: TENANT,
        opportunityTypeId: typeId,
        name,
        order,
        probability,
        color,
        isClosed,
        isWon,
        createdAt: iso(-60),
        updatedAt: iso(0),
      };
      await safeUpsert("StageDefinition", [row]);
      stageRows.push(row);
    }
  }
  return { typeDefs, stageRows };
}

async function seedActivityTypes(activityObjectId) {
  const defs = [
    ["demo-activity-call", "Call", "Phone", "#2563eb"],
    ["demo-activity-whatsapp", "WhatsApp", "MessageCircle", "#16a34a"],
    ["demo-activity-email", "Email", "Mail", "#9333ea"],
    ["demo-activity-campus-visit", "Campus Visit", "MapPin", "#f59e0b"],
    ["demo-activity-counselling", "Counselling Session", "Users", "#0f766e"],
    ["demo-activity-document-review", "Document Review", "FileCheck", "#dc2626"],
  ];
  const resolvedIds = [];
  for (const [demoId, name, icon, color] of defs) {
    const index = resolvedIds.length;
    const id = await resolveNamedId("ActivityType", name, demoId);
    await safeUpsert("ActivityType", [{
      id,
      tenantId: TENANT,
      objectId: activityObjectId,
      name,
      icon,
      color,
      defaultOutcome: index === 2 ? "FOLLOW_UP_NEEDED" : "SUCCESS",
      defaultSLA: index === 0 ? 240 : index === 3 ? 1440 : 720,
      isActive: true,
      order: index + 1,
      createdAt: iso(-58),
      updatedAt: iso(0),
    }]);
    resolvedIds.push(id);
  }
  return resolvedIds;
}

async function seedCustomFields(leadObjectId, opportunityObjectId, typeDefs) {
  const leadFields = {
    utmCampaign: await ensureCustomField(leadObjectId, "utm_campaign", "UTM Campaign", "TEXT", null, 10),
    utmMedium: await ensureCustomField(leadObjectId, "utm_medium", "UTM Medium", "DROPDOWN", MEDIUMS, 11),
    utmSource: await ensureCustomField(leadObjectId, "utm_source", "UTM Source", "TEXT", null, 12),
    utmTerm: await ensureCustomField(leadObjectId, "utm_term", "UTM Term", "TEXT", null, 13),
    utmContent: await ensureCustomField(leadObjectId, "utm_content", "UTM Content", "TEXT", null, 14),
    preferredCampus: await ensureCustomField(leadObjectId, "preferred_campus", "Preferred Campus", "DROPDOWN", ["North Campus", "City Campus", "Global Campus"], 20),
    leadState: await ensureCustomField(leadObjectId, "student_state", "Student State", "DROPDOWN", STATES, 21),
  };
  const opportunityFields = {
    utmCampaign: await ensureCustomField(opportunityObjectId, "utm_campaign", "UTM Campaign", "TEXT", null, 10),
    utmMedium: await ensureCustomField(opportunityObjectId, "utm_medium", "UTM Medium", "DROPDOWN", MEDIUMS, 11),
    utmSource: await ensureCustomField(opportunityObjectId, "utm_source", "UTM Source", "TEXT", null, 12),
    applicationNumber: await ensureCustomField(opportunityObjectId, "application_number", "Application Number", "TEXT", null, 20),
  };

  for (const [typeId, name, , , courses] of typeDefs) {
    opportunityFields[`course_${typeId}`] = await ensureCustomField(
      opportunityObjectId,
      `course_${slug(name)}`,
      "Course",
      "DROPDOWN",
      courses,
      21,
      { entityType: "OPPORTUNITY_TYPE", entityTypeId: typeId }
    );
  }
  return { leadFields, opportunityFields };
}

function leadStatusFor(index) {
  if (index % 11 === 0) return "CONVERTED";
  if (index % 13 === 0) return "LOST";
  if (index % 5 === 0) return "QUALIFIED";
  if (index % 3 === 0) return "CONTACTED";
  return "NEW";
}

async function seedCrmRecords(refs) {
  const owners = ["demo-user-counselor-1", "demo-user-counselor-2", "demo-user-counselor-3", "demo-user-counselor-4"];
  const partnerOwners = ["demo-partner-alpha-primary", "demo-partner-alpha-counselor", "demo-partner-beta-primary", "demo-partner-gamma-primary"];
  const typeIds = refs.typeDefs.map(([id]) => id);
  const stageByType = new Map();
  for (const [typeId] of refs.typeDefs) {
    stageByType.set(typeId, refs.stageRows.filter((stage) => stage.opportunityTypeId === typeId).sort((a, b) => a.order - b.order));
  }
  const leads = [];
  const opportunities = [];
  const activities = [];
  const tasks = [];
  const stageHistory = [];
  const assignments = [];
  const customValues = [];
  const activityTypes = refs.activityTypeIds;

  for (let i = 1; i <= LEAD_COUNT; i += 1) {
    const padded = String(i).padStart(4, "0");
    const source = pick(SOURCES, i);
    const ownerId = source === "Partner" ? pick(partnerOwners, i) : pick(owners, i);
    const campaign = pick(CAMPAIGNS, i);
    const medium = source === "Google Ads" ? "cpc" : source === "Meta Ads" ? "social" : source === "Partner" ? "partner" : pick(MEDIUMS, i);
    const state = pick(STATES, i);
    const city = pick(CITIES, i);
    const status = leadStatusFor(i);
    const leadId = `demo-lead-${padded}`;
    const typeId = pick(typeIds, i);
    const stages = stageByType.get(typeId);
    const finalStage = status === "CONVERTED"
      ? stages.find((stage) => stage.isWon)
      : status === "LOST"
        ? stages.find((stage) => stage.isClosed && !stage.isWon)
        : pick(stages.filter((stage) => !stage.isClosed), i);
    const typeDef = refs.typeDefs.find(([id]) => id === typeId);
    const course = pick(typeDef[4], i);
    const createdAt = iso(-Math.min(120, i % 120), 8 + (i % 9), i % 60);
    const updatedAt = iso(-Math.min(2, i % 6), 10 + (i % 6), i % 60);
    const score = Math.max(5, Math.min(98, 35 + (status === "CONVERTED" ? 45 : status === "QUALIFIED" ? 25 : status === "CONTACTED" ? 10 : 0) + (i % 18)));

    leads.push({
      id: leadId,
      tenantId: TENANT,
      objectId: refs.leadObjectId,
      name: `${pick(["Aarav", "Diya", "Ishaan", "Ananya", "Kabir", "Meera", "Rohan", "Tara"], i)} ${pick(["Sharma", "Iyer", "Menon", "Rao", "Khan", "Patel", "Nair", "Das"], i + 3)} ${padded}`,
      email: `student${padded}@demo-university.example`,
      phone: `+91${String(9000000000 + i).slice(0, 10)}`,
      company: `${pick(["Delhi Public School", "Sri Chaitanya", "Ryan International", "DAV Public School", "Kendriya Vidyalaya", "St Xavier's"], i)} - ${city}`,
      source,
      status,
      score,
      tags: ["demo", "university", slug(source), slug(course)],
      createdBy: ADMIN_USER_ID,
      ownerId,
      createdAt,
      updatedAt,
    });

    const oppId = `demo-opp-${padded}`;
    const amount = 85000 + (i % 7) * 25000 + (typeIds.indexOf(typeId) * 40000);
    opportunities.push({
      id: oppId,
      tenantId: TENANT,
      objectId: refs.opportunityObjectId,
      leadId,
      opportunityTypeId: typeId,
      stageId: finalStage.id,
      title: `${typeDef[1]} - ${course} - ${padded}`,
      amount,
      expectedCloseDate: iso(15 + (i % 45), 9),
      priority: pick(PRIORITIES, i),
      tags: ["demo", slug(typeDef[1]), slug(course), slug(source)],
      ownerId,
      createdAt,
      updatedAt,
    });

    stageHistory.push({
      id: `demo-stage-${padded}-inquiry`,
      tenantId: TENANT,
      opportunityId: oppId,
      fromStageId: null,
      toStageId: stages[0].id,
      changedById: ownerId,
      changedAt: createdAt,
      notes: "Seed initial inquiry",
    });
    if (finalStage.id !== stages[0].id) {
      stageHistory.push({
        id: `demo-stage-${padded}-current`,
        tenantId: TENANT,
        opportunityId: oppId,
        fromStageId: stages[0].id,
        toStageId: finalStage.id,
        changedById: ownerId,
        changedAt: updatedAt,
        notes: "Seed current admissions stage",
      });
    }

    assignments.push({
      id: `demo-assign-${padded}`,
      tenantId: TENANT,
      entityType: "LEAD",
      entityId: leadId,
      assignedToId: ownerId,
      assignedById: ADMIN_USER_ID,
      reason: source === "Partner" ? "Partner referral routing" : "Sales group distribution",
      assignedAt: createdAt,
    });

    for (let a = 0; a < 2; a += 1) {
      const activityId = `demo-act-${padded}-${a + 1}`;
      const completed = a === 0 || i % 4 !== 0;
      activities.push({
        id: activityId,
        tenantId: TENANT,
        objectId: refs.activityObjectId,
        typeId: pick(activityTypes, i + a),
        leadId,
        opportunityId: oppId,
        outcome: completed ? pick(["SUCCESS", "FOLLOW_UP_NEEDED", "NO_ANSWER"], i + a) : null,
        notes: a === 0 ? `Discussed ${course}, eligibility, fee structure, and scholarship interest.` : `Follow-up for application ${typeDef[1].replace(/\s+/g, "")}-${padded}.`,
        dueAt: completed ? null : iso(-1 * (i % 9), 15),
        completedAt: completed ? iso(-Math.min(20, i % 40), 11 + a) : null,
        slaStatus: completed ? "MET" : "BREACHED",
        slaTarget: iso(-Math.min(18, i % 35), 12 + a),
        isRecurring: false,
        recurrenceRule: null,
        seriesId: null,
        createdBy: ownerId,
        createdAt: iso(-Math.min(30, i % 60), 10 + a),
        updatedAt,
      });
    }

    tasks.push({
      id: `demo-task-${padded}`,
      tenantId: TENANT,
      title: status === "CONVERTED" ? "Verify fee receipt and enrollment kit" : status === "LOST" ? "Capture loss reason" : "Follow up on application documents",
      description: `Demo task for ${course} applicant ${padded}`,
      status: status === "CONVERTED" ? "COMPLETED" : i % 9 === 0 ? "IN_PROGRESS" : "OPEN",
      priority: pick(PRIORITIES, i + 2),
      ownerId,
      createdBy: ADMIN_USER_ID,
      leadId,
      opportunityId: oppId,
      activityId: `demo-act-${padded}-1`,
      dueAt: status === "CONVERTED" ? iso(-2) : iso(1 + (i % 14), 14),
      reminderAt: status === "CONVERTED" ? null : iso(i % 7, 10),
      completedAt: status === "CONVERTED" ? iso(-1) : null,
      completedBy: status === "CONVERTED" ? ownerId : null,
      metadata: { course, university: typeDef[1], source },
      createdAt,
      updatedAt,
    });

    const leadFieldPairs = [
      [refs.leadFields.utmCampaign, campaign],
      [refs.leadFields.utmMedium, medium],
      [refs.leadFields.utmSource, source],
      [refs.leadFields.utmTerm, slug(course)],
      [refs.leadFields.utmContent, `${slug(city)}-${slug(state)}`],
      [refs.leadFields.preferredCampus, pick(["North Campus", "City Campus", "Global Campus"], i)],
      [refs.leadFields.leadState, state],
    ];
    for (const [fieldDefinitionId, value] of leadFieldPairs) {
      customValues.push({ id: `demo-cfv-${leadId}-${fieldDefinitionId}`.slice(0, 120), tenantId: TENANT, fieldDefinitionId, entityId: leadId, value });
    }
    const oppFieldPairs = [
      [refs.opportunityFields.utmCampaign, campaign],
      [refs.opportunityFields.utmMedium, medium],
      [refs.opportunityFields.utmSource, source],
      [refs.opportunityFields.applicationNumber, `APP-${typeDef[1].replace(/\s+/g, "").toUpperCase()}-${padded}`],
      [refs.opportunityFields[`course_${typeId}`], course],
    ];
    for (const [fieldDefinitionId, value] of oppFieldPairs) {
      customValues.push({ id: `demo-cfv-${oppId}-${fieldDefinitionId}`.slice(0, 120), tenantId: TENANT, fieldDefinitionId, entityId: oppId, value });
    }
  }

  await safeUpsert("Lead", leads, { chunkSize: 250 });
  await safeUpsert("Opportunity", opportunities, { chunkSize: 250 });
  await safeUpsert("OpportunityStageHistory", stageHistory, { chunkSize: 500 });
  await safeUpsert("Activity", activities, { chunkSize: 250 });
  await safeUpsert("Task", tasks, { chunkSize: 250 });
  await safeUpsert("AssignmentLog", assignments, { chunkSize: 250 });
  await upsertCustomFieldValues(customValues);
  return { leads, opportunities, activities, tasks };
}

async function seedPartnersAndPayouts(records) {
  if (await tableExists("PartnerOrganization")) {
    await safeUpsert("PartnerOrganization", [
      { id: "demo-partner-org-alpha", tenantId: TENANT, name: "Alpha Admissions Associates", status: "ACTIVE", parentOrganizationId: null, primaryUserId: "demo-partner-alpha-primary", metadata: { region: "North", tier: "Gold" }, createdBy: ADMIN_USER_ID, createdAt: iso(-55), updatedAt: iso(0) },
      { id: "demo-partner-org-beta", tenantId: TENANT, name: "Beta Career Hub", status: "ACTIVE", parentOrganizationId: null, primaryUserId: "demo-partner-beta-primary", metadata: { region: "South", tier: "Silver" }, createdBy: ADMIN_USER_ID, createdAt: iso(-54), updatedAt: iso(0) },
      { id: "demo-partner-org-gamma", tenantId: TENANT, name: "Gamma Overseas Desk", status: "ACTIVE", parentOrganizationId: null, primaryUserId: "demo-partner-gamma-primary", metadata: { region: "International", tier: "Platinum" }, createdBy: ADMIN_USER_ID, createdAt: iso(-53), updatedAt: iso(0) },
    ]);
  }

  await safeUpsert("PartnerProfile", [
    { id: "demo-partner-profile-alpha-primary", tenantId: TENANT, userId: "demo-partner-alpha-primary", legalBusinessName: "Alpha Admissions Associates LLP", gstin: "29AALFA1234F1Z5", panNumber: "AALFA1234F", registeredAddress: { city: "Delhi", state: "Delhi" }, registeredState: "Delhi", status: "ACTIVE", invoiceNumberPrefix: "ALPHA", invoiceNumberPattern: "{prefix}/{fy}/{counter}", invoiceNumberCounter: 8, invoiceNumberCountersByFy: { "2026-27": 8 }, partnerOrganizationId: "demo-partner-org-alpha", parentPartnerProfileId: null, canAccessPayouts: true, partnerLoginRole: "PRIMARY", createdBy: ADMIN_USER_ID, createdAt: iso(-50), updatedAt: iso(0) },
    { id: "demo-partner-profile-alpha-counselor", tenantId: TENANT, userId: "demo-partner-alpha-counselor", legalBusinessName: "Alpha Admissions Associates LLP", gstin: "29AALFA1234F1Z5", panNumber: "AALFA1234F", registeredAddress: { city: "Delhi", state: "Delhi" }, registeredState: "Delhi", status: "ACTIVE", invoiceNumberPrefix: "ALPHA", invoiceNumberPattern: "{prefix}/{fy}/{counter}", invoiceNumberCounter: 8, invoiceNumberCountersByFy: { "2026-27": 8 }, partnerOrganizationId: "demo-partner-org-alpha", parentPartnerProfileId: "demo-partner-profile-alpha-primary", canAccessPayouts: true, partnerLoginRole: "MEMBER", createdBy: ADMIN_USER_ID, createdAt: iso(-49), updatedAt: iso(0) },
    { id: "demo-partner-profile-beta", tenantId: TENANT, userId: "demo-partner-beta-primary", legalBusinessName: "Beta Career Hub Pvt Ltd", gstin: "33BETA5678K1Z2", panNumber: "BETA5678K", registeredAddress: { city: "Chennai", state: "Tamil Nadu" }, registeredState: "Tamil Nadu", status: "ACTIVE", invoiceNumberPrefix: "BETA", invoiceNumberPattern: "{prefix}-{counter}", invoiceNumberCounter: 6, invoiceNumberCountersByFy: {}, partnerOrganizationId: "demo-partner-org-beta", parentPartnerProfileId: null, canAccessPayouts: true, partnerLoginRole: "PRIMARY", createdBy: ADMIN_USER_ID, createdAt: iso(-48), updatedAt: iso(0) },
    { id: "demo-partner-profile-gamma", tenantId: TENANT, userId: "demo-partner-gamma-primary", legalBusinessName: "Gamma Overseas Desk", gstin: null, panNumber: "GAMMA9012P", registeredAddress: { city: "Mumbai", state: "Maharashtra" }, registeredState: "Maharashtra", status: "ACTIVE", invoiceNumberPrefix: "GAMMA", invoiceNumberPattern: "{prefix}/{counter}", invoiceNumberCounter: 3, invoiceNumberCountersByFy: {}, partnerOrganizationId: "demo-partner-org-gamma", parentPartnerProfileId: null, canAccessPayouts: true, partnerLoginRole: "PRIMARY", createdBy: ADMIN_USER_ID, createdAt: iso(-47), updatedAt: iso(0) },
  ]);

  await safeUpsert("CommissionRule", [
    { id: "demo-commission-rule-alpha", tenantId: TENANT, name: "Alpha 8% on fee paid", partnerId: "demo-partner-alpha-primary", opportunityTypeId: null, conditions: { stage: "Fee Paid", minAmount: 100000 }, ruleType: "PERCENTAGE", value: 8, priority: 50, isActive: true, effectiveFrom: iso(-60), effectiveTo: null, createdBy: ADMIN_USER_ID, createdAt: iso(-45), updatedAt: iso(0) },
    { id: "demo-commission-rule-beta", tenantId: TENANT, name: "Beta flat admission bonus", partnerId: "demo-partner-beta-primary", opportunityTypeId: null, conditions: { source: "Partner" }, ruleType: "FLAT", value: 7500, priority: 40, isActive: true, effectiveFrom: iso(-60), effectiveTo: null, createdBy: ADMIN_USER_ID, createdAt: iso(-45), updatedAt: iso(0) },
    { id: "demo-commission-rule-gamma", tenantId: TENANT, name: "Gamma international 10%", partnerId: "demo-partner-gamma-primary", opportunityTypeId: "demo-opp-type-university-3", conditions: { university: "University 3" }, ruleType: "PERCENTAGE", value: 10, priority: 60, isActive: true, effectiveFrom: iso(-60), effectiveTo: null, createdBy: ADMIN_USER_ID, createdAt: iso(-45), updatedAt: iso(0) },
  ]);

  await safeUpsert("PartnerPayoutSettings", [{
    id: "demo-payout-settings",
    tenantId: TENANT,
    cycleFrequency: "MONTHLY",
    customIntervalDays: null,
    cycleAnchorDay: 1,
    defaultHsnSacCode: "999293",
    companyLegalName: "Demo University Tenant",
    companyGstin: "29AAECD1234U1Z9",
    companyAddress: { line1: "Admissions Finance Office", city: "Bengaluru", state: "Karnataka", postalCode: "560001" },
    companyState: "Karnataka",
    gstRatePercent: 18,
    invoiceNumberPattern: "{prefix}/{fy}/{counter}",
    minimumPayoutAmount: 1000,
    approvalMode: "AUTO_BELOW_THRESHOLD",
    autoApproveBelowAmount: 10000,
    requireInvoiceBeforePayment: true,
    allowPartnerSelfInvoice: true,
    adjustmentReasons: ["Quality clawback", "Scholarship exception", "Manual campaign bonus"],
    holdReasons: ["Documents pending", "GST verification", "Duplicate application review"],
    payoutVisibilityConfig: { mode: "SELECTED_TARGETS", userIds: ["demo-user-finance"], teamIds: ["demo-team-finance"], salesGroupIds: [], partnerOrganizationIds: ["demo-partner-org-alpha", "demo-partner-org-beta", "demo-partner-org-gamma"] },
    updatedBy: ADMIN_USER_ID,
    createdAt: iso(-40),
    updatedAt: iso(0),
  }], { onConflict: "tenantId" });

  const partnerOpps = records.opportunities.filter((opp) => ["demo-partner-alpha-primary", "demo-partner-alpha-counselor", "demo-partner-beta-primary", "demo-partner-gamma-primary"].includes(opp.ownerId)).slice(0, 24);
  const ledgers = partnerOpps.map((opp, index) => ({
    id: `demo-ledger-${String(index + 1).padStart(3, "0")}`,
    tenantId: TENANT,
    partnerId: opp.ownerId === "demo-partner-alpha-counselor" ? "demo-partner-alpha-primary" : opp.ownerId,
    opportunityId: opp.id,
    commissionRuleId: opp.ownerId.includes("beta") ? "demo-commission-rule-beta" : opp.ownerId.includes("gamma") ? "demo-commission-rule-gamma" : "demo-commission-rule-alpha",
    entryType: index % 9 === 0 ? "CORRECTION_CREDIT" : "EARNED",
    baseAmount: opp.amount,
    commissionAmount: opp.ownerId.includes("beta") ? 7500 : Math.round(opp.amount * (opp.ownerId.includes("gamma") ? 0.1 : 0.08)),
    calculationSnapshot: { demo: true, amount: opp.amount, stage: opp.stageId },
    triggerEvent: "STAGE_CHANGED",
    correctsEntryId: null,
    createdBy: ADMIN_USER_ID,
    createdAt: iso(-20 + (index % 15)),
  }));
  await safeUpsert("CommissionLedger", ledgers, { ignoreDuplicates: true });

  await safeUpsert("PayoutCycle", [
    { id: "demo-payout-cycle-june", tenantId: TENANT, cycleLabel: "June 2026 Partner Payouts", startDate: "2026-06-01T00:00:00.000Z", endDate: "2026-07-01T00:00:00.000Z", status: "CLOSED", generatedAt: iso(-7), createdBy: ADMIN_USER_ID, createdAt: iso(-7) },
    { id: "demo-payout-cycle-july", tenantId: TENANT, cycleLabel: "July 2026 Partner Payouts", startDate: "2026-07-01T00:00:00.000Z", endDate: "2026-08-01T00:00:00.000Z", status: "OPEN", generatedAt: iso(-1), createdBy: ADMIN_USER_ID, createdAt: iso(-1) },
  ]);
  await safeUpsert("Payout", [
    { id: "demo-payout-alpha-june", tenantId: TENANT, payoutCycleId: "demo-payout-cycle-june", partnerId: "demo-partner-alpha-primary", partnerOrganizationId: "demo-partner-org-alpha", totalCommissionAmount: 184000, status: "INVOICED", invoiceId: null, isHeld: false, holdReason: null, approvedAt: iso(-6), approvedBy: ADMIN_USER_ID, paidAt: null, paidBy: null, paymentReference: null, createdAt: iso(-7), updatedAt: iso(-5) },
    { id: "demo-payout-beta-june", tenantId: TENANT, payoutCycleId: "demo-payout-cycle-june", partnerId: "demo-partner-beta-primary", partnerOrganizationId: "demo-partner-org-beta", totalCommissionAmount: 82500, status: "PAID", invoiceId: null, isHeld: false, holdReason: null, approvedAt: iso(-6), approvedBy: ADMIN_USER_ID, paidAt: iso(-2), paidBy: "demo-user-finance", paymentReference: "UTR-DEMO-BETA-0626", createdAt: iso(-7), updatedAt: iso(-2) },
    { id: "demo-payout-gamma-july", tenantId: TENANT, payoutCycleId: "demo-payout-cycle-july", partnerId: "demo-partner-gamma-primary", partnerOrganizationId: "demo-partner-org-gamma", totalCommissionAmount: 96000, status: "DRAFT", invoiceId: null, isHeld: true, holdReason: "GST verification", heldAt: iso(-1), heldBy: "demo-user-finance", releasedAt: null, releasedBy: null, approvedAt: null, approvedBy: null, paidAt: null, paidBy: null, paymentReference: null, createdAt: iso(-1), updatedAt: iso(0) },
  ]);
}

async function seedGamification(records) {
  await safeUpsert("GamificationSettings", [{
    id: "demo-gamification-settings",
    tenantId: TENANT,
    levels: [
      { name: "Bronze Counselor", points: 100 },
      { name: "Silver Counselor", points: 500 },
      { name: "Gold Counselor", points: 1200 },
      { name: "Admissions Champion", points: 2500 },
    ],
    leaderboardConfig: { period: "MONTHLY", metric: "POINTS", tieBreaker: "CONVERSIONS" },
    redemptionCatalog: [
      { key: "coffee-voucher", name: "Coffee Voucher", pointsCost: 100, rewardType: "INTERNAL_PERK" },
      { key: "amazon-500", name: "Amazon Voucher 500", pointsCost: 500, rewardType: "THIRD_PARTY_REWARD" },
      { key: "bonus-2500", name: "Performance Bonus 2500", pointsCost: 2000, rewardType: "MONETARY" },
    ],
    antiGamingRules: { maxSameLeadActivitiesPerDay: 3, ignoreDuplicateActivityWithinMinutes: 15 },
    participantConfig: { mode: "SELECTED_TARGETS", userIds: ["demo-user-counselor-1", "demo-user-counselor-2", "demo-user-counselor-3", "demo-user-counselor-4"], teamIds: ["demo-team-north", "demo-team-south"], salesGroupIds: ["demo-sales-group-engineering", "demo-sales-group-management"], partnerOrganizationIds: ["demo-partner-org-alpha", "demo-partner-org-beta"] },
    updatedBy: ADMIN_USER_ID,
    createdAt: iso(-30),
    updatedAt: iso(0),
  }], { onConflict: "tenantId" });
  await safeUpsert("GamificationRule", [
    { id: "demo-gamify-call", tenantId: TENANT, name: "Meaningful student conversation", triggerEventType: "ACTIVITY_CREATED", audienceScope: "INTERNAL", conditions: { activityType: "Call" }, pointsAwarded: 10, priority: 10, isActive: true, createdBy: ADMIN_USER_ID, createdAt: iso(-30), updatedAt: iso(0) },
    { id: "demo-gamify-application", tenantId: TENANT, name: "Application moved to docs submitted", triggerEventType: "STAGE_CHANGED", audienceScope: "ALL", conditions: { toStage: "Docs Submitted" }, pointsAwarded: 30, priority: 20, isActive: true, createdBy: ADMIN_USER_ID, createdAt: iso(-30), updatedAt: iso(0) },
    { id: "demo-gamify-fee-paid", tenantId: TENANT, name: "Fee paid conversion", triggerEventType: "STAGE_CHANGED", audienceScope: "ALL", conditions: { toStage: "Fee Paid" }, pointsAwarded: 100, priority: 50, isActive: true, createdBy: ADMIN_USER_ID, createdAt: iso(-30), updatedAt: iso(0) },
    { id: "demo-gamify-partner-lead", tenantId: TENANT, name: "Partner qualified referral", triggerEventType: "LEAD_CREATED", audienceScope: "PARTNER", conditions: { source: "Partner" }, pointsAwarded: 20, priority: 15, isActive: true, createdBy: ADMIN_USER_ID, createdAt: iso(-30), updatedAt: iso(0) },
  ]);
  const users = ["demo-user-counselor-1", "demo-user-counselor-2", "demo-user-counselor-3", "demo-user-counselor-4", "demo-partner-alpha-primary", "demo-partner-beta-primary", "demo-partner-gamma-primary"];
  const ledger = [];
  for (let i = 0; i < 120; i += 1) {
    ledger.push({
      id: `demo-points-${String(i + 1).padStart(3, "0")}`,
      tenantId: TENANT,
      userId: pick(users, i),
      gamificationRuleId: pick(["demo-gamify-call", "demo-gamify-application", "demo-gamify-fee-paid", "demo-gamify-partner-lead"], i),
      points: pick([10, 20, 30, 100], i),
      entryType: "EARNED",
      sourceEntityType: i % 3 === 0 ? "OPPORTUNITY" : i % 2 === 0 ? "LEAD" : "ACTIVITY",
      sourceEntityId: i % 3 === 0 ? pick(records.opportunities, i).id : i % 2 === 0 ? pick(records.leads, i).id : pick(records.activities, i).id,
      triggerEvent: "DEMO_EVENT",
      createdBy: ADMIN_USER_ID,
      createdAt: iso(-30 + (i % 30)),
    });
  }
  await safeUpsert("GamificationPointsLedger", ledger, { ignoreDuplicates: true });
  await safeUpsert("Badge", [
    { id: "demo-badge-fast-responder", tenantId: TENANT, name: "Fast Responder", description: "Responded to new leads quickly", iconEmoji: "⚡", audienceScope: "INTERNAL", criteriaRules: { activityCount: 25 }, isActive: true, createdBy: ADMIN_USER_ID, createdAt: iso(-20), updatedAt: iso(0) },
    { id: "demo-badge-fee-closer", tenantId: TENANT, name: "Fee Closer", description: "Closed fee-paid opportunities", iconEmoji: "🎓", audienceScope: "ALL", criteriaRules: { feePaid: 5 }, isActive: true, createdBy: ADMIN_USER_ID, createdAt: iso(-20), updatedAt: iso(0) },
    { id: "demo-badge-partner-star", tenantId: TENANT, name: "Partner Star", description: "High quality partner referrals", iconEmoji: "🤝", audienceScope: "PARTNER", criteriaRules: { referrals: 20 }, isActive: true, createdBy: ADMIN_USER_ID, createdAt: iso(-20), updatedAt: iso(0) },
  ]);
  await safeUpsert("UserBadge", users.slice(0, 6).map((userId, index) => ({
    id: `demo-user-badge-${index + 1}`,
    tenantId: TENANT,
    userId,
    badgeId: pick(["demo-badge-fast-responder", "demo-badge-fee-closer", "demo-badge-partner-star"], index),
    earnedAt: iso(-10 + index),
    sourcePeriodStart: iso(-30),
    sourcePeriodEnd: iso(0),
  })), { onConflict: "tenantId,userId,badgeId,sourcePeriodStart" });
  await safeUpsert("GamificationRedemption", [
    { id: "demo-redemption-1", tenantId: TENANT, userId: "demo-user-counselor-1", pointsRedeemed: 500, redemptionType: "THIRD_PARTY_REWARD", monetaryAmount: null, thirdPartyProvider: "Amazon", thirdPartyReference: "AMZ-DEMO-500", catalogItemKey: "amazon-500", rewardName: "Amazon Voucher 500", status: "FULFILLED", notes: "Demo fulfilled redemption", reviewedBy: ADMIN_USER_ID, reviewedAt: iso(-2), createdAt: iso(-3), updatedAt: iso(-2) },
    { id: "demo-redemption-2", tenantId: TENANT, userId: "demo-partner-alpha-primary", pointsRedeemed: 100, redemptionType: "INTERNAL_PERK", monetaryAmount: null, thirdPartyProvider: null, thirdPartyReference: null, catalogItemKey: "coffee-voucher", rewardName: "Coffee Voucher", status: "REQUESTED", notes: "Demo pending redemption", createdAt: iso(-1), updatedAt: iso(-1) },
  ]);
}

async function seedScoringAndViews(records) {
  await safeUpsert("LeadScoringRule", [
    { id: "demo-score-high-score-source", tenantId: TENANT, name: "High intent paid campaign", description: "Scholarship and engineering campaign boost", fieldKey: "source", operator: "EQUALS", value: "Google Ads", scoreChange: 15, isActive: true, order: 1, createdAt: iso(-35), updatedAt: iso(0) },
    { id: "demo-score-partner-referral", tenantId: TENANT, name: "Partner referral boost", description: "Partner sourced leads have higher assisted conversion", fieldKey: "source", operator: "EQUALS", value: "Partner", scoreChange: 12, isActive: true, order: 2, createdAt: iso(-35), updatedAt: iso(0) },
    { id: "demo-score-qualified", tenantId: TENANT, name: "Qualified status", description: "Qualified leads should rise to hot views", fieldKey: "status", operator: "EQUALS", value: "QUALIFIED", scoreChange: 25, isActive: true, order: 3, createdAt: iso(-35), updatedAt: iso(0) },
    { id: "demo-score-lost", tenantId: TENANT, name: "Lost penalty", description: "Lost leads move out of action queues", fieldKey: "status", operator: "EQUALS", value: "LOST", scoreChange: -40, isActive: true, order: 4, createdAt: iso(-35), updatedAt: iso(0) },
  ]);

  await safeUpsert("ScoringSettings", [{
    id: "demo-predictive-settings",
    tenantId: TENANT,
    isEnabled: true,
    targetModules: ["LEAD", "OPPORTUNITY"],
    objective: "CONVERSION",
    minimumHistoricalRecords: 25,
    lookbackDays: 180,
    retrainCadence: "MANUAL",
    fallbackMode: "RULE_SCORE",
    lastRecomputedAt: iso(0),
    updatedBy: ADMIN_USER_ID,
    createdAt: iso(-10),
    updatedAt: iso(0),
  }], { onConflict: "tenantId" });

  const scoreRows = [];
  const historyRows = [];
  const snapshotRows = [];
  const scoredLeads = (records?.leads ?? []).slice(0, 160);
  const scoredOpportunities = (records?.opportunities ?? []).slice(0, 160);
  for (const [index, lead] of scoredLeads.entries()) {
    const scoreBand = index % 10 === 0 ? "RISK" : index % 4 === 0 ? "HOT" : index % 3 === 0 ? "WARM" : "COLD";
    const conversionProbability = scoreBand === "HOT" ? 82 : scoreBand === "WARM" ? 58 : scoreBand === "RISK" ? 31 : 24;
    const scoreId = `demo-record-score-lead-${index + 1}`;
    const snapshotId = `demo-score-snapshot-lead-${index + 1}`;
    snapshotRows.push({
      id: snapshotId,
      tenantId: TENANT,
      recordType: "LEAD",
      recordId: lead.id,
      features: { source: lead.source, status: lead.status, activityCount: index % 7, taskCount: index % 4 },
      sourceDataUpdatedAt: lead.updatedAt,
      createdAt: iso(-2, 10, index % 60),
    });
    scoreRows.push({
      id: scoreId,
      tenantId: TENANT,
      recordType: "LEAD",
      recordId: lead.id,
      fitScore: scoreBand === "HOT" ? 86 : scoreBand === "WARM" ? 64 : 42,
      engagementScore: scoreBand === "RISK" ? 22 : scoreBand === "HOT" ? 78 : 45,
      conversionProbability,
      winProbability: null,
      stallRisk: scoreBand === "RISK" ? 84 : scoreBand === "HOT" ? 16 : 48,
      scoreBand,
      confidence: scoreBand === "COLD" ? 52 : 78,
      reasons: [
        { type: "POSITIVE", label: "Source historic conversion rate", value: index % 4 === 0 ? 74 : 42 },
        { type: scoreBand === "RISK" ? "NEGATIVE" : "POSITIVE", label: "Activity coverage", value: index % 7 },
      ],
      source: "PREDICTIVE_SCORING",
      featureSnapshotId: snapshotId,
      calculatedAt: iso(-1, 11, index % 60),
      createdAt: iso(-2),
      updatedAt: iso(-1),
    });
    historyRows.push({
      id: `demo-record-score-history-lead-${index + 1}`,
      tenantId: TENANT,
      recordScoreId: scoreId,
      recordType: "LEAD",
      recordId: lead.id,
      previousScore: { scoreBand: "COLD", conversionProbability: Math.max(0, conversionProbability - 12) },
      nextScore: { scoreBand, conversionProbability },
      changeReason: "DEMO_SEED",
      createdAt: iso(-1, 11, index % 60),
    });
  }
  for (const [index, opportunity] of scoredOpportunities.entries()) {
    const scoreBand = index % 9 === 0 ? "RISK" : index % 5 === 0 ? "HOT" : index % 2 === 0 ? "WARM" : "COLD";
    const winProbability = scoreBand === "HOT" ? 79 : scoreBand === "WARM" ? 54 : scoreBand === "RISK" ? 27 : 22;
    const scoreId = `demo-record-score-opp-${index + 1}`;
    const snapshotId = `demo-score-snapshot-opp-${index + 1}`;
    snapshotRows.push({
      id: snapshotId,
      tenantId: TENANT,
      recordType: "OPPORTUNITY",
      recordId: opportunity.id,
      features: { stageId: opportunity.stageId, amount: opportunity.amount, priority: opportunity.priority, activityCount: index % 5 },
      sourceDataUpdatedAt: opportunity.updatedAt,
      createdAt: iso(-2, 12, index % 60),
    });
    scoreRows.push({
      id: scoreId,
      tenantId: TENANT,
      recordType: "OPPORTUNITY",
      recordId: opportunity.id,
      fitScore: scoreBand === "HOT" ? 82 : scoreBand === "WARM" ? 62 : 40,
      engagementScore: scoreBand === "RISK" ? 24 : scoreBand === "HOT" ? 76 : 48,
      conversionProbability: null,
      winProbability,
      stallRisk: scoreBand === "RISK" ? 81 : scoreBand === "HOT" ? 18 : 46,
      scoreBand,
      confidence: scoreBand === "COLD" ? 50 : 74,
      reasons: [
        { type: "POSITIVE", label: "Stage historic win rate", value: scoreBand === "HOT" ? 71 : 38 },
        { type: scoreBand === "RISK" ? "NEGATIVE" : "POSITIVE", label: "Activity coverage", value: index % 5 },
      ],
      source: "PREDICTIVE_SCORING",
      featureSnapshotId: snapshotId,
      calculatedAt: iso(-1, 12, index % 60),
      createdAt: iso(-2),
      updatedAt: iso(-1),
    });
    historyRows.push({
      id: `demo-record-score-history-opp-${index + 1}`,
      tenantId: TENANT,
      recordScoreId: scoreId,
      recordType: "OPPORTUNITY",
      recordId: opportunity.id,
      previousScore: { scoreBand: "COLD", winProbability: Math.max(0, winProbability - 10) },
      nextScore: { scoreBand, winProbability },
      changeReason: "DEMO_SEED",
      createdAt: iso(-1, 12, index % 60),
    });
  }
  await safeUpsert("ScoringFeatureSnapshot", snapshotRows);
  await upsertRecordScores(scoreRows);
  await safeUpsert("RecordScoreHistory", historyRows);

  const smartViews = [
    {
      id: "demo-smart-view-admissions-command",
      name: "Admissions Command Center",
      tabs: [
        { id: "hot-leads", name: "Hot Leads", module: "LEADS", filters: { logic: "AND", conditions: [{ id: "c1", field: "score", operator: "greater_than", value: 70 }] }, columns: ["name", "email", "status", "source", "score", "createdAt"], density: "compact", sort: { field: "score", order: "desc" }, countChips: [{ id: "chip-qualified", label: "Qualified", field: "status", operator: "equals", value: "QUALIFIED" }], quickActions: ["create_task", "log_activity"] },
        { id: "high-value-opportunities", name: "High Value Opportunities", module: "OPPORTUNITIES", filters: { logic: "AND", conditions: [{ id: "c2", field: "amount", operator: "greater_than", value: 100000 }] }, columns: ["title", "amount", "stageId", "priority", "expectedCloseDate"], density: "comfortable", sort: { field: "amount", order: "desc" }, countChips: [] },
        { id: "followups", name: "Follow-ups Due", module: "TASKS", filters: { logic: "AND", conditions: [{ id: "c3", field: "status", operator: "equals", value: "OPEN" }] }, columns: ["title", "status", "priority", "ownerId", "dueAt"], density: "compact", quickActions: ["complete_task", "reschedule_task"] },
      ],
      scope: "TENANT_DEFAULT",
      isPublic: true,
    },
    {
      id: "demo-smart-view-partner-performance",
      name: "Partner Performance",
      tabs: [
        { id: "partner-leads", name: "Partner Leads", module: "LEADS", filters: { logic: "AND", conditions: [{ id: "c1", field: "source", operator: "equals", value: "Partner" }] }, columns: ["name", "email", "status", "source", "score"] },
        { id: "partner-payouts", name: "Payouts", module: "PAYOUTS", filters: { logic: "AND", conditions: [] }, columns: ["partnerId", "status", "amount", "isHeld", "createdAt"] },
      ],
      scope: "SHARED",
      isPublic: true,
      sharedUserIds: ["demo-user-finance"],
      sharedTeamIds: ["demo-team-finance"],
      sharedSalesGroupIds: [],
      sharedRoleIds: [],
    },
  ];
  await safeUpsert("CustomReport", smartViews.map((view) => ({
    id: view.id,
    tenantId: TENANT,
    name: view.name,
    description: "Demo Smart View",
    module: "LEADS",
    config: {
      scope: view.scope,
      isDefault: view.scope === "TENANT_DEFAULT",
      isPinned: true,
      tabs: view.tabs,
      filters: view.tabs[0].filters,
      sharedUserIds: view.sharedUserIds || [],
      sharedTeamIds: view.sharedTeamIds || [],
      sharedSalesGroupIds: view.sharedSalesGroupIds || [],
      sharedRoleIds: view.sharedRoleIds || [],
    },
    schedule: null,
    chartType: "SAVED_VIEW",
    isPublic: view.isPublic,
    isActive: true,
    createdBy: ADMIN_USER_ID,
    createdAt: iso(-5),
    updatedAt: iso(0),
  })));
}

async function seedReports(records) {
  const reportKeys = [
    ["funnel_conversion_by_stage", "Funnel by Stage", "FUNNEL"],
    ["funnel_conversion_by_source_campaign", "Funnel by Source/Campaign", "FUNNEL"],
    ["rep_performance", "Rep Performance", "PERFORMANCE"],
    ["sla_response_breaches", "SLA Response Breaches", "SLA"],
    ["lead_source_roi", "Lead Source ROI", "ROI"],
    ["reassignment_impact", "Reassignment Impact", "REASSIGNMENT"],
    ["activity_call_volume_trends", "Activity/Call Volume Trends", "ACTIVITY"],
    ["commission_payout_summary", "Commission/Payout Summary", "PAYOUT"],
    ["cohort_funnel_progression", "Cohort Funnel Progression", "COHORT"],
    ["data_quality", "Data Quality", "DATA_QUALITY"],
  ];
  await safeUpsert("ReportDefinition", reportKeys.map(([key, name, category]) => ({
    id: `demo-report-def-${key}`,
    tenantId: TENANT,
    reportKey: key,
    name,
    description: `${name} demo definition with seeded university admissions data`,
    category,
    queryDefinition: { demo: true, key },
    visualization: { defaultChart: category === "FUNNEL" ? "funnel" : "table" },
    isSystem: true,
    isActive: true,
    createdBy: ADMIN_USER_ID,
    createdAt: iso(-8),
    updatedAt: iso(0),
  })), { onConflict: "tenantId,reportKey" });
  await safeUpsert("ReportRollup", [
    { id: "demo-rollup-funnel-fee-paid", tenantId: TENANT, reportKey: "funnel_conversion_by_stage", scopeType: "ORG", scopeId: null, periodStart: "2026-07-01T00:00:00.000Z", periodEnd: "2026-08-01T00:00:00.000Z", grain: "MONTHLY", dimensions: { stage: "Fee Paid" }, metrics: { count: records.opportunities.filter((_, i) => i % 11 === 0).length, value: 4800000, conversionFromFirst: 0.18 }, sourceWatermark: iso(0), lastComputedAt: iso(0), createdAt: iso(-1), updatedAt: iso(0) },
    { id: "demo-rollup-source-partner", tenantId: TENANT, reportKey: "lead_source_roi", scopeType: "ORG", scopeId: null, periodStart: "2026-07-01T00:00:00.000Z", periodEnd: "2026-08-01T00:00:00.000Z", grain: "MONTHLY", dimensions: { source: "Partner" }, metrics: { leads: records.leads.filter((lead) => lead.source === "Partner").length, opportunities: 65, wonOpportunities: 14, wonValue: 2800000, spend: 420000, roi: 5.6 }, sourceWatermark: iso(0), lastComputedAt: iso(0), createdAt: iso(-1), updatedAt: iso(0) },
    { id: "demo-rollup-data-quality", tenantId: TENANT, reportKey: "data_quality", scopeType: "ORG", scopeId: null, periodStart: null, periodEnd: null, grain: "CURRENT", dimensions: {}, metrics: { duplicateLeads: 8, staleLeads: 21, missingOwner: 0, missingEmail: 0 }, sourceWatermark: iso(0), lastComputedAt: iso(0), createdAt: iso(-1), updatedAt: iso(0) },
  ]);
  for (const [key] of reportKeys) {
    const demoId = `demo-refresh-state-${key}`;
    const id = await resolveIdByMatch("ReportRefreshState", [["tenantId", TENANT], ["reportKey", key], ["scopeType", "ORG"], ["scopeId", null]], demoId);
    await safeUpsert("ReportRefreshState", [{
      id,
      tenantId: TENANT,
      reportKey: key,
      scopeType: "ORG",
      scopeId: null,
      lastStartedAt: iso(0),
      lastCompletedAt: iso(0),
      lastSuccessfulAt: iso(0),
      lastSourceWatermark: iso(0),
      status: "FRESH",
      error: null,
      refreshIntervalMinutes: 30,
      manualRefreshRequestedAt: null,
      manualRefreshRequestedBy: null,
      createdAt: iso(-1),
      updatedAt: iso(0),
    }]);
  }
  await safeUpsert("ReportSchedule", [
    { id: "demo-report-schedule-weekly-funnel", tenantId: TENANT, userId: ADMIN_USER_ID, reportKey: "funnel_conversion_by_stage", queryDefinition: null, recipients: ["admissions@demouniversity.edu"], format: "LINK", frequency: "WEEKLY", dayOfWeek: 1, dayOfMonth: null, nextRunAt: iso(5), lastRunAt: iso(-2), lastStatus: "SUCCESS", isActive: true, createdAt: iso(-6), updatedAt: iso(0) },
    { id: "demo-report-schedule-payout", tenantId: TENANT, userId: "demo-user-finance", reportKey: "commission_payout_summary", queryDefinition: null, recipients: ["finance@demouniversity.edu"], format: "CSV", frequency: "MONTHLY", dayOfWeek: null, dayOfMonth: 1, nextRunAt: "2026-08-01T09:00:00.000Z", lastRunAt: null, lastStatus: null, isActive: true, createdAt: iso(-6), updatedAt: iso(0) },
  ]);
}

async function seedDistributionAndAutomation() {
  await safeUpsert("AssignmentRule", [
    { id: "demo-assignment-rule-engineering", tenantId: TENANT, name: "Engineering course routing", description: "Route B.Tech/MCA to engineering admissions group", entityType: "LEAD", conditions: { courseFamily: "Engineering" }, strategy: "ROUND_ROBIN", targetGroupId: "demo-sales-group-engineering", targetUserIds: [], priority: 100, isActive: true, createdAt: iso(-20), updatedAt: iso(0) },
    { id: "demo-assignment-rule-partner", tenantId: TENANT, name: "Partner source routing", description: "Route partner leads to partner sourced queue", entityType: "LEAD", conditions: { source: "Partner" }, strategy: "ROUND_ROBIN", targetGroupId: "demo-sales-group-partner", targetUserIds: [], priority: 110, isActive: true, createdAt: iso(-20), updatedAt: iso(0) },
  ]);
}

async function seedLeadLists(records) {
  const hotLeadIds = records.leads.filter((lead) => ["QUALIFIED", "CONVERTED"].includes(lead.status)).slice(0, 60).map((lead) => lead.id);
  const engineeringLeadIds = records.leads.filter((lead) => (lead.tags || []).some((tag) => tag.startsWith("b-tech") || tag.startsWith("mca"))).slice(0, 60).map((lead) => lead.id);

  await safeUpsert("LeadList", [
    {
      id: "demo-list-hot-leads",
      tenantId: TENANT,
      name: "Hot Admissions Leads",
      description: "Qualified and converted leads ready for fast follow-up",
      type: "STATIC",
      filters: null,
      isActive: true,
      createdBy: ADMIN_USER_ID,
      createdAt: iso(-20),
      updatedAt: iso(0),
    },
    {
      id: "demo-list-engineering-inquiries",
      tenantId: TENANT,
      name: "Engineering Program Inquiries",
      description: "Static shortlist of B.Tech and MCA interested applicants",
      type: "STATIC",
      filters: null,
      isActive: true,
      createdBy: ADMIN_USER_ID,
      createdAt: iso(-20),
      updatedAt: iso(0),
    },
    {
      id: "demo-list-partner-sourced",
      tenantId: TENANT,
      name: "Partner Sourced Leads (Smart)",
      description: "Dynamically tracks every partner-referred lead",
      type: "SMART",
      filters: [{ logic: "AND", conditions: [{ id: "c1", field: "source", operator: "equals", value: "Partner" }] }],
      isActive: true,
      createdBy: ADMIN_USER_ID,
      createdAt: iso(-18),
      updatedAt: iso(0),
    },
    {
      id: "demo-list-stale-new",
      tenantId: TENANT,
      name: "Stale New Leads (Smart)",
      description: "New leads that still need a first touch",
      type: "SMART",
      filters: [{ logic: "AND", conditions: [{ id: "c1", field: "status", operator: "equals", value: "NEW" }] }],
      isActive: true,
      createdBy: ADMIN_USER_ID,
      createdAt: iso(-18),
      updatedAt: iso(0),
    },
  ]);

  const members = [
    ...hotLeadIds.map((leadId, index) => ({ id: `demo-list-member-hot-${index + 1}`, tenantId: TENANT, listId: "demo-list-hot-leads", leadId, addedBy: ADMIN_USER_ID, createdAt: iso(-15) })),
    ...engineeringLeadIds.map((leadId, index) => ({ id: `demo-list-member-eng-${index + 1}`, tenantId: TENANT, listId: "demo-list-engineering-inquiries", leadId, addedBy: ADMIN_USER_ID, createdAt: iso(-15) })),
  ];
  await safeUpsert("LeadListMember", members, { onConflict: "tenantId,listId,leadId" });
}

async function seedForms(leadObjectId, records) {
  const forms = [
    {
      id: "demo-form-admissions-inquiry",
      name: "Admissions Inquiry Form",
      description: "General website inquiry form for prospective students",
      fields: [
        { id: "f1", name: "name", label: "Full Name", type: "TEXT", required: true },
        { id: "f2", name: "email", label: "Email Address", type: "EMAIL", required: true },
        { id: "f3", name: "phone", label: "Phone Number", type: "TEXT", required: true },
        { id: "f4", name: "utm_source", label: "How did you hear about us?", type: "SELECT", required: false, options: SOURCES },
        { id: "f5", name: "message", label: "What would you like to know?", type: "TEXTAREA", required: false },
      ],
      submitButtonText: "Request Information",
      successMessage: "Thanks! Our admissions team will reach out within one business day.",
    },
    {
      id: "demo-form-campus-visit",
      name: "Campus Visit Request Form",
      description: "Lets prospective students book a campus tour",
      fields: [
        { id: "f1", name: "name", label: "Full Name", type: "TEXT", required: true },
        { id: "f2", name: "email", label: "Email Address", type: "EMAIL", required: true },
        { id: "f3", name: "phone", label: "Phone Number", type: "TEXT", required: true },
        { id: "f4", name: "preferred_campus", label: "Preferred Campus", type: "SELECT", required: true, options: ["North Campus", "City Campus", "Global Campus"] },
        { id: "f5", name: "preferred_date", label: "Preferred Visit Date", type: "DATE", required: false },
      ],
      submitButtonText: "Book My Visit",
      successMessage: "Your visit request has been received — our team will confirm a slot shortly.",
    },
  ];

  await safeUpsert("Form", forms.map((form) => ({
    id: form.id,
    tenantId: TENANT,
    objectId: leadObjectId,
    name: form.name,
    description: form.description,
    fields: form.fields,
    isActive: true,
    submitButtonText: form.submitButtonText,
    successMessage: form.successMessage,
    redirectUrl: null,
    spamProtection: true,
    captchaEnabled: false,
    rateLimit: 20,
    duplicateAction: "CREATE",
    defaultOwnerId: null,
    automationId: null,
    theme: "default",
    config: { sourceModules: ["lead"], layoutColumns: 1, placements: [], visibilityMode: "ALL" },
    createdAt: iso(-25),
    updatedAt: iso(0),
  })));

  const sampleLeads = records.leads.slice(0, 24);
  const submissions = sampleLeads.map((lead, index) => {
    const formId = index % 2 === 0 ? "demo-form-admissions-inquiry" : "demo-form-campus-visit";
    const data = index % 2 === 0
      ? { name: lead.name, email: lead.email, phone: lead.phone, utm_source: lead.source, message: "Interested in scholarship options and eligibility criteria." }
      : { name: lead.name, email: lead.email, phone: lead.phone, preferred_campus: pick(["North Campus", "City Campus", "Global Campus"], index), preferred_date: iso(7 + (index % 10)) };
    return {
      id: `demo-form-submission-${index + 1}`,
      tenantId: TENANT,
      formId,
      leadId: lead.id,
      data,
      utmParams: index % 2 === 0 ? { utm_source: lead.source } : null,
      ipAddress: null,
      userAgent: null,
      referrer: "https://demouniversity.example/admissions",
      status: "PROCESSED",
      spamScore: 0,
      isDuplicate: false,
      duplicateLeadId: null,
      errorMessage: null,
      createdAt: lead.createdAt,
    };
  });
  await safeUpsert("FormSubmission", submissions);
}

async function seedAutomationsV2() {
  const now = iso(0);
  const automations = [
    {
      id: "demo-automation-partner-routing",
      name: "New Partner Lead - Fast Follow-up",
      description: "When a partner-sourced lead comes in, create a same-day call task and notify the manager.",
      isActive: true,
      trigger: { type: "LEAD_CREATED", conditions: [{ id: "c1", field: "source", operator: "equals", value: "Partner" }] },
      workflow: {
        nodes: [
          { id: "n1", type: "trigger", position: { x: 0, y: 0 }, data: { type: "LEAD_CREATED", label: "Lead Created" } },
          { id: "n2", type: "condition", position: { x: 0, y: 150 }, data: { type: "condition", field: "source", operator: "equals", value: "Partner", label: "Is Partner Source?" } },
          { id: "n3", type: "create_task", position: { x: 0, y: 300 }, data: { type: "create_task", title: "Call new partner lead within 1 hour", priority: "HIGH", label: "Create Follow-up Task" } },
          { id: "n4", type: "notify_user", position: { x: 0, y: 450 }, data: { type: "notify_user", userId: "demo-user-manager-north", title: "New partner lead assigned", label: "Notify Manager" } },
        ],
        edges: [
          { id: "e1", source: "n1", target: "n2" },
          { id: "e2", source: "n2", target: "n3" },
          { id: "e3", source: "n3", target: "n4" },
        ],
      },
      createdAt: iso(-25),
      updatedAt: now,
    },
    {
      id: "demo-automation-fee-paid-finance",
      name: "Fee Paid - Notify Finance",
      description: "When an opportunity reaches the Fee Paid stage, notify finance and create a receipt verification task.",
      isActive: true,
      trigger: { type: "STAGE_CHANGED", conditions: [{ id: "c1", field: "toStageName", operator: "equals", value: "Fee Paid" }] },
      workflow: {
        nodes: [
          { id: "n1", type: "trigger", position: { x: 0, y: 0 }, data: { type: "STAGE_CHANGED", label: "Stage Changed" } },
          { id: "n2", type: "notify_user", position: { x: 0, y: 150 }, data: { type: "notify_user", userId: "demo-user-finance", title: "Fee paid - review for payout", label: "Notify Finance" } },
          { id: "n3", type: "create_task", position: { x: 0, y: 300 }, data: { type: "create_task", title: "Verify fee receipt and enrollment kit", priority: "MEDIUM", label: "Create Verification Task" } },
        ],
        edges: [
          { id: "e1", source: "n1", target: "n2" },
          { id: "e2", source: "n2", target: "n3" },
        ],
      },
      createdAt: iso(-22),
      updatedAt: now,
    },
    {
      id: "demo-automation-stale-lead-nudge",
      name: "Stale New Lead Re-engagement (Draft)",
      description: "Draft example: waits 3 days, then emails leads still marked NEW. Left inactive so it does not send real email.",
      isActive: false,
      trigger: { type: "LEAD_CREATED", conditions: [] },
      workflow: {
        nodes: [
          { id: "n1", type: "trigger", position: { x: 0, y: 0 }, data: { type: "LEAD_CREATED", label: "Lead Created" } },
          { id: "n2", type: "delay", position: { x: 0, y: 150 }, data: { type: "delay", durationMinutes: 4320, label: "Wait 3 Days" } },
          { id: "n3", type: "condition", position: { x: 0, y: 300 }, data: { type: "condition", field: "status", operator: "equals", value: "NEW", label: "Still New?" } },
          { id: "n4", type: "send_email", position: { x: 0, y: 450 }, data: { type: "send_email", channel: "EMAIL", subject: "Still exploring your options?", message: "We noticed you haven't heard back yet - let us help with your application.", label: "Send Nudge Email" } },
        ],
        edges: [
          { id: "e1", source: "n1", target: "n2" },
          { id: "e2", source: "n2", target: "n3" },
          { id: "e3", source: "n3", target: "n4" },
        ],
      },
      createdAt: iso(-15),
      updatedAt: now,
    },
  ];

  await safeUpsert("AutomationV2", automations.map((automation) => ({
    id: automation.id,
    tenantId: TENANT,
    name: automation.name,
    description: automation.description,
    trigger: automation.trigger,
    steps: null,
    workflow: automation.workflow,
    isActive: automation.isActive,
    createdAt: automation.createdAt,
    updatedAt: automation.updatedAt,
  })));
}

async function summarize() {
  const tables = ["User", "Role", "PermissionTemplate", "Team", "SalesGroup", "PartnerProfile", "Lead", "Opportunity", "Activity", "Task", "FieldDefinition", "CustomFieldValue", "GamificationRule", "GamificationPointsLedger", "CommissionRule", "CommissionLedger", "Payout", "ReportDefinition", "ReportRollup", "CustomReport", "LeadList", "LeadListMember", "Form", "FormSubmission", "AutomationV2"];
  const summary = {};
  for (const table of tables) {
    if (!(await tableExists(table))) {
      summary[table] = "missing";
      continue;
    }
    const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("tenantId", TENANT);
    summary[table] = error ? `count failed: ${error.message}` : count || 0;
  }
  return summary;
}

async function main() {
  if (typeof supabase.connect === "function") await supabase.connect();
  console.log(`Seeding demo data through ${seedConnection.mode} data path.`);
  const tenant = await getOne("Tenant", "id,name", (q) => q.eq("id", TENANT));
  if (!tenant) throw new Error(`Tenant ${TENANT} not found`);
  let admin = await getOne("User", "id,email,name", (q) => q.eq("tenantId", TENANT).eq("id", ADMIN_USER_ID));
  if (!admin) {
    let fallbackAdmin = await getOne("User", "id,email,name", (q) =>
      q.eq("tenantId", TENANT).eq("email", ADMIN_EMAIL_FALLBACK).limit(1)
    );
    if (!fallbackAdmin) {
      fallbackAdmin = await getOne("User", "id,email,name", (q) =>
        q.eq("tenantId", TENANT).eq("status", "ACTIVE").order("createdAt", { ascending: true }).limit(1)
      );
    }
    if (!fallbackAdmin) throw new Error(`No active admin/user found in tenant ${TENANT}`);
    console.warn(`Admin user ${ADMIN_USER_ID} was not found in tenant ${TENANT}; using ${fallbackAdmin.id} (${fallbackAdmin.email}) instead.`);
    ADMIN_USER_ID = fallbackAdmin.id;
    admin = fallbackAdmin;
  }

  const leadObjectId = await ensureObject("lead", "Lead");
  const opportunityObjectId = await ensureObject("opportunity", "Opportunity");
  const activityObjectId = await ensureObject("activity", "Activity");
  const access = await seedOrgAccess(admin);
  const typeRefs = await seedUniversityPipelines(opportunityObjectId);
  const activityTypeIds = await seedActivityTypes(activityObjectId);
  const fields = await seedCustomFields(leadObjectId, opportunityObjectId, typeRefs.typeDefs);
  const records = await seedCrmRecords({ leadObjectId, opportunityObjectId, activityObjectId, activityTypeIds, ...typeRefs, ...fields });
  await seedPartnersAndPayouts(records);
  await seedGamification(records);
  await seedScoringAndViews(records);
  await seedReports(records);
  await seedDistributionAndAutomation();
  await seedLeadLists(records);
  await seedForms(leadObjectId, records);
  await seedAutomationsV2();
  const summary = await summarize();

  console.log(JSON.stringify({
    tenant,
    admin,
    seeded: {
      leadCount: records.leads.length,
      opportunityCount: records.opportunities.length,
      activityCount: records.activities.length,
      taskCount: records.tasks.length,
      internalDemoUsers: access.internalUsers.length,
      partnerLogins: access.partners.length,
      opportunityTypes: typeRefs.typeDefs.map(([, name]) => name),
      passwordForSeededUsers: PASSWORD,
    },
    summary,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => {
  if (typeof supabase.close === "function") await supabase.close();
});
