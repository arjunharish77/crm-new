import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import { notFound, serverError, unauthorized } from "@/lib/server/http";
import { leadAudienceForList } from "@/lib/repositories/lead-lists-postgres";
import { listLeadAudiencePageForTenant } from "@/lib/repositories/leads-postgres";

const CAP = 5000;

// Every lead in the list that this person can see, by id (a smart list's live filter, or a static
// list's members), up to 5,000: for acting on the whole list (voice bot plan wave F).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const audience = await leadAudienceForList(user as any, id);
    if (!audience) return notFound("Lead list not found");
    const ids: string[] = [];
    let afterId: string | null = null;
    while (ids.length <= CAP) {
      const page: Array<{ id: string }> = await listLeadAudiencePageForTenant(user as any, audience, afterId, 1000);
      ids.push(...page.map((lead) => String(lead.id)));
      if (page.length < 1000) break;
      afterId = String(page[page.length - 1].id);
    }
    const truncated = ids.length > CAP;
    return NextResponse.json({ ids: ids.slice(0, CAP), truncated, cap: CAP });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to list the leads in this list", error);
  }
}
