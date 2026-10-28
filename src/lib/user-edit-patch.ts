export type UserEditValues = {
  name: string;
  phone: string;
  roleId: string;
  permissionTemplateId?: string;
  teamId?: string;
  managerId?: string;
  skills: { category: string; values: string[] }[];
  isAvailableForAssignment: boolean;
};

export type UserEditPatch = {
  name?: string;
  phone?: string;
  roleId?: string;
  permissionTemplateId?: string | null;
  teamId?: string;
  managerId?: string;
  skills?: Record<string, string[]>;
  isAvailableForAssignment?: boolean;
};

// Send only edited fields. A profile edit must not revalidate or rewrite stale team,
// manager, role or template references that the admin did not change.
export function buildUserEditPatch(values: UserEditValues, dirty: Partial<Record<keyof UserEditValues, unknown>>): UserEditPatch {
  const patch: UserEditPatch = {};
  if (dirty.name) patch.name = values.name;
  if (dirty.phone) patch.phone = values.phone;
  if (dirty.roleId) patch.roleId = values.roleId;
  if (dirty.permissionTemplateId) patch.permissionTemplateId = values.permissionTemplateId || null;
  if (dirty.teamId) patch.teamId = values.teamId || "";
  if (dirty.managerId) patch.managerId = values.managerId || "";
  if (dirty.skills) {
    patch.skills = Object.fromEntries(values.skills.map(({ category, values: skillValues }) => [category, skillValues]));
  }
  if (dirty.isAvailableForAssignment) patch.isAvailableForAssignment = values.isAvailableForAssignment;
  return patch;
}
