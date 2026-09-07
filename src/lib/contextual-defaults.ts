// "Contextual defaults from the current page/view" (gap checklist Module 10's global create
// menu item) -- a Lead or Opportunity detail page is the only place in this app with a real
// record id in the URL that Activity/Task creation can sensibly pre-link to. Shared by the
// header's persistent Create menu and the command palette's Quick Create commands so both
// derive the same context the same way.
export function contextualRecordDefaults(pathname: string | null | undefined): { leadId?: string; opportunityId?: string } {
    if (!pathname) return {};
    const leadMatch = pathname.match(/^\/dashboard\/leads\/([^/]+)$/);
    if (leadMatch) return { leadId: leadMatch[1] };
    const opportunityMatch = pathname.match(/^\/dashboard\/opportunities\/([^/]+)$/);
    if (opportunityMatch) return { opportunityId: opportunityMatch[1] };
    return {};
}
