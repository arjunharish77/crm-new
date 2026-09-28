export type ApplicationActor = {
    id: string; tenantId: string | null; teamId?: string | null;
    isPartner?: boolean; isTenantAdmin?: boolean; isPlatformAdmin?: boolean;
    role?: string | { permissions?: any } | null;
};
export function canUseApplications(user: Partial<ApplicationActor> | null | undefined, action: 'read' | 'create' | 'update' | 'manage') {
    if (!user?.tenantId || user.isPartner) return false;
    const permissions = typeof user.role === 'object' ? user.role?.permissions : null;
    if (permissions?.isPartnerRole) return false;
    if (user.isTenantAdmin || user.isPlatformAdmin || permissions?.modules?.admin === 'full') return true;
    const grants = permissions?.modules?.applications;
    return grants === 'full' || (typeof grants === 'object' && grants?.[action] === true);
}
