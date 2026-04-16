import { serverError, unauthorized } from "@/lib/server/http";
import { requireCurrentUser } from "@/lib/server/auth";
import { exportFormSubmissionsForTenant } from "@/lib/server/crm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { id } = await params;
    const csv = await exportFormSubmissionsForTenant(user, id);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="form-submissions-${id}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to export form submissions");
  }
}
