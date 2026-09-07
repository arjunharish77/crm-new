import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ query: vi.fn(), queryOne: vi.fn(), execute: vi.fn() }));
const crmMocks = vi.hoisted(() => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }));
const policyMocks = vi.hoisted(() => ({ getEffectiveSecurityPolicy: vi.fn() }));
const adminMocks = vi.hoisted(() => ({
  changeTenantStatus: vi.fn().mockResolvedValue(undefined),
  impersonateTenantUser: vi.fn().mockResolvedValue({ token: "impersonation-token", user: { id: "target-user" } }),
  updatePermissionTemplateForTenant: vi.fn().mockResolvedValue({ id: "template-1" }),
}));
const apiKeyMocks = vi.hoisted(() => ({ rotateApiKeyForTenant: vi.fn().mockResolvedValue({ id: "key-1", secret: "new-secret" }) }));

vi.mock("@/lib/db/query", () => dbMocks);
vi.mock("@/lib/server/crm", () => crmMocks);
vi.mock("@/lib/server/security-policy", () => policyMocks);
vi.mock("@/lib/server/admin", () => adminMocks);
vi.mock("@/lib/server/api-keys", () => apiKeyMocks);

import {
  isPrivilegedActionApprovalRequired,
  getPlatformSecuritySettings,
  updatePlatformSecuritySettings,
  createPrivilegedActionRequest,
  listPrivilegedActionRequests,
  approvePrivilegedActionRequest,
  rejectPrivilegedActionRequest,
  claimApprovedImpersonation,
} from "@/lib/server/privileged-actions";

const admin1 = { id: "admin-1", tenantId: "tenant-a" };
const admin2 = { id: "admin-2", tenantId: "tenant-a" };
const platformAdmin1 = { id: "platform-1", tenantId: null };
const platformAdmin2 = { id: "platform-2", tenantId: null };

function pendingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "request-1",
    tenantId: "tenant-a",
    actionType: "PERMISSION_TEMPLATE_UPDATE",
    targetType: "PERMISSION_TEMPLATE",
    targetId: "template-1",
    payload: { name: "Updated", permissions: {} },
    reason: null,
    status: "PENDING",
    requestedBy: "admin-1",
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
    executedAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  dbMocks.query.mockReset().mockResolvedValue([]);
  dbMocks.queryOne.mockReset();
  dbMocks.execute.mockReset().mockResolvedValue(undefined);
  crmMocks.createAuditLog.mockClear();
  policyMocks.getEffectiveSecurityPolicy.mockReset().mockResolvedValue({ privilegedActionApprovalRequired: false });
  adminMocks.changeTenantStatus.mockClear();
  adminMocks.impersonateTenantUser.mockClear();
  adminMocks.updatePermissionTemplateForTenant.mockClear();
  apiKeyMocks.rotateApiKeyForTenant.mockClear();
});

describe("isPrivilegedActionApprovalRequired", () => {
  it("reads PlatformSecuritySettings for a platform-scoped action", async () => {
    dbMocks.queryOne.mockResolvedValueOnce({ privilegedActionApprovalRequired: true });
    expect(await isPrivilegedActionApprovalRequired("TENANT_SUSPEND", null)).toBe(true);
    expect(policyMocks.getEffectiveSecurityPolicy).not.toHaveBeenCalled();
  });

  it("reads SecurityPolicy for a tenant-scoped action", async () => {
    policyMocks.getEffectiveSecurityPolicy.mockResolvedValueOnce({ privilegedActionApprovalRequired: true });
    expect(await isPrivilegedActionApprovalRequired("PERMISSION_TEMPLATE_UPDATE", "tenant-a")).toBe(true);
    expect(dbMocks.queryOne).not.toHaveBeenCalled();
  });

  it("defaults to false with no PlatformSecuritySettings row", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    expect(await isPrivilegedActionApprovalRequired("IMPERSONATION_START", null)).toBe(false);
  });
});

describe("getPlatformSecuritySettings / updatePlatformSecuritySettings", () => {
  it("returns safe defaults with no row", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    const settings = await getPlatformSecuritySettings();
    expect(settings).toEqual({ privilegedActionApprovalRequired: false, updatedBy: null, updatedAt: null });
  });

  it("upserts on update", async () => {
    await updatePlatformSecuritySettings(platformAdmin1, true);
    expect(dbMocks.execute).toHaveBeenCalledWith(expect.stringContaining("on conflict"), [true, "platform-1", expect.any(String)]);
  });
});

describe("createPrivilegedActionRequest", () => {
  it("inserts a PENDING row and audits the request", async () => {
    const { id } = await createPrivilegedActionRequest(admin1, {
      tenantId: "tenant-a",
      actionType: "CONNECTOR_SECRET_UPDATE",
      targetType: "API_KEY",
      targetId: "key-1",
      payload: {},
    });
    expect(id).toEqual(expect.any(String));
    expect(dbMocks.execute).toHaveBeenCalledWith(expect.stringContaining("insert into \"PrivilegedActionRequest\""), expect.arrayContaining(["admin-1"]));
    expect(crmMocks.createAuditLog).toHaveBeenCalledWith(admin1, "PRIVILEGED_ACTION_REQUESTED", "API_KEY", "key-1", null, null, expect.objectContaining({ actionType: "CONNECTOR_SECRET_UPDATE" }));
  });
});

describe("listPrivilegedActionRequests", () => {
  it("filters to null tenantId for the platform scope", async () => {
    await listPrivilegedActionRequests({ tenantId: null });
    expect(dbMocks.query.mock.calls[0][0]).toContain('"tenantId" is null');
  });

  it("filters to a specific tenant and status", async () => {
    await listPrivilegedActionRequests({ tenantId: "tenant-a" }, "PENDING");
    const [sql, params] = dbMocks.query.mock.calls[0];
    expect(sql).toContain('"tenantId" = $1');
    expect(sql).toContain("status = $2");
    expect(params).toEqual(["tenant-a", "PENDING"]);
  });
});

describe("approvePrivilegedActionRequest", () => {
  it("throws when no matching pending request exists", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(approvePrivilegedActionRequest(admin2, "request-1")).rejects.toThrow("REQUEST_NOT_PENDING");
  });

  it("refuses self-approval", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(pendingRow());
    await expect(approvePrivilegedActionRequest(admin1, "request-1")).rejects.toThrow("CANNOT_APPROVE_OWN_REQUEST");
  });

  it("refuses a tenant admin approving another tenant's request", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(pendingRow({ tenantId: "tenant-b" }));
    await expect(approvePrivilegedActionRequest(admin2, "request-1")).rejects.toThrow("FORBIDDEN");
  });

  it("executes TENANT_SUSPEND and marks EXECUTED", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(pendingRow({ tenantId: null, actionType: "TENANT_SUSPEND", targetId: "tenant-x", requestedBy: "platform-1" }));
    const result = await approvePrivilegedActionRequest(platformAdmin2, "request-1");
    expect(adminMocks.changeTenantStatus).toHaveBeenCalledWith("tenant-x", "SUSPENDED");
    expect(dbMocks.execute).toHaveBeenCalledWith(expect.stringContaining("status = 'EXECUTED'"), expect.anything());
    expect(result).toEqual({ status: "EXECUTED" });
  });

  it("executes TENANT_UNSUSPEND", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(pendingRow({ tenantId: null, actionType: "TENANT_UNSUSPEND", targetId: "tenant-x", requestedBy: "platform-1" }));
    await approvePrivilegedActionRequest(platformAdmin2, "request-1");
    expect(adminMocks.changeTenantStatus).toHaveBeenCalledWith("tenant-x", "ACTIVE");
  });

  it("executes PERMISSION_TEMPLATE_UPDATE with the stored payload", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(pendingRow());
    await approvePrivilegedActionRequest(admin2, "request-1");
    expect(adminMocks.updatePermissionTemplateForTenant).toHaveBeenCalledWith("tenant-a", "template-1", { name: "Updated", permissions: {} });
  });

  it("executes CONNECTOR_SECRET_UPDATE (API_KEY) via rotateApiKeyForTenant", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(pendingRow({ actionType: "CONNECTOR_SECRET_UPDATE", targetType: "API_KEY", targetId: "key-1" }));
    await approvePrivilegedActionRequest(admin2, "request-1");
    expect(apiKeyMocks.rotateApiKeyForTenant).toHaveBeenCalledWith({ id: "admin-1", tenantId: "tenant-a" }, "key-1");
  });

  it("does NOT execute impersonation immediately -- leaves it APPROVED for the requester to claim", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(pendingRow({
      tenantId: null, actionType: "IMPERSONATION_START", targetType: "USER", targetId: "target-user",
      requestedBy: "platform-1", payload: { tenantId: "tenant-a", userId: "target-user", reason: "support" },
    }));
    const result = await approvePrivilegedActionRequest(platformAdmin2, "request-1");
    expect(adminMocks.impersonateTenantUser).not.toHaveBeenCalled();
    expect(dbMocks.execute).toHaveBeenCalledWith(expect.stringContaining("status = 'APPROVED'"), expect.anything());
    expect(result).toEqual({ status: "APPROVED" });
  });
});

describe("rejectPrivilegedActionRequest", () => {
  it("throws when no matching pending request exists", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(rejectPrivilegedActionRequest(admin2, "request-1")).rejects.toThrow("REQUEST_NOT_PENDING");
  });

  it("refuses self-rejection the same way as self-approval", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(pendingRow());
    await expect(rejectPrivilegedActionRequest(admin1, "request-1")).rejects.toThrow("CANNOT_APPROVE_OWN_REQUEST");
  });

  it("marks REJECTED with a decision note and audits it", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(pendingRow());
    await rejectPrivilegedActionRequest(admin2, "request-1", "Not authorized");
    expect(dbMocks.execute).toHaveBeenCalledWith(expect.stringContaining("status = 'REJECTED'"), [admin2.id, expect.any(String), "Not authorized", "request-1"]);
    expect(crmMocks.createAuditLog).toHaveBeenCalledWith(admin2, "PRIVILEGED_ACTION_REJECTED", "PERMISSION_TEMPLATE", "template-1", null, null, expect.objectContaining({ requestId: "request-1" }));
  });
});

describe("claimApprovedImpersonation", () => {
  it("throws when there's no matching APPROVED impersonation request", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(null);
    await expect(claimApprovedImpersonation(platformAdmin1, "request-1")).rejects.toThrow("REQUEST_NOT_APPROVED");
  });

  it("refuses a claim by someone other than the original requester", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(pendingRow({
      status: "APPROVED", actionType: "IMPERSONATION_START", requestedBy: "platform-1",
      payload: { tenantId: "tenant-a", userId: "target-user", reason: "support" },
    }));
    await expect(claimApprovedImpersonation(platformAdmin2, "request-1")).rejects.toThrow("FORBIDDEN");
  });

  it("starts the impersonation session and marks EXECUTED on success", async () => {
    dbMocks.queryOne.mockResolvedValueOnce(pendingRow({
      status: "APPROVED", actionType: "IMPERSONATION_START", requestedBy: "platform-1",
      payload: { tenantId: "tenant-a", userId: "target-user", reason: "support" },
    }));
    const result = await claimApprovedImpersonation(platformAdmin1, "request-1");
    expect(adminMocks.impersonateTenantUser).toHaveBeenCalledWith("platform-1", "tenant-a", "target-user", "support");
    expect(dbMocks.execute).toHaveBeenCalledWith(expect.stringContaining("status = 'EXECUTED'"), expect.anything());
    expect(result).toEqual({ token: "impersonation-token", user: { id: "target-user" } });
  });
});
