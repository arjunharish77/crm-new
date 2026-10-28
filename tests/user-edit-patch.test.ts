import { describe, expect, it } from "vitest";
import { buildUserEditPatch, type UserEditValues } from "@/lib/user-edit-patch";

const values: UserEditValues = {
  name: "Sales Agent",
  phone: "+91 98765 43210",
  roleId: "role-1",
  permissionTemplateId: "",
  teamId: "unassigned",
  managerId: "manager-1",
  skills: [{ category: "Language", values: ["Hindi"] }],
  isAvailableForAssignment: true,
};

describe("buildUserEditPatch", () => {
  it("sends only a changed phone, without a display-only or stale team ID", () => {
    expect(buildUserEditPatch(values, { phone: true })).toEqual({ phone: "+91 98765 43210" });
  });

  it("preserves explicit clearing of editable references", () => {
    expect(buildUserEditPatch({ ...values, teamId: "", managerId: "" }, { teamId: true, managerId: true, permissionTemplateId: true }))
      .toEqual({ teamId: "", managerId: "", permissionTemplateId: null });
  });

  it("sends changed assignment skills without resending role permissions", () => {
    expect(buildUserEditPatch(values, { skills: [{ values: true }] })).toEqual({ skills: { Language: ["Hindi"] } });
  });
});
