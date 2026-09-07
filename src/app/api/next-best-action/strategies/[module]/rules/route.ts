import { NextResponse } from "next/server";
import { requireCurrentUser, requireTenantAdmin } from "@/lib/server/auth";
import {
  createNextBestActionRule,
  getNextBestActionStrategyForModule,
  listNextBestActionRulesForStrategy,
  upsertNextBestActionStrategy,
} from "@/lib/server/next-best-action";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

function isValidModule(value: string): value is "LEAD" | "OPPORTUNITY" {
  return value === "LEAD" || value === "OPPORTUNITY";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ module: string }> }
) {
  try {
    const user = await requireCurrentUser(request);
    const { module } = await params;
    if (!isValidModule(module)) return badRequest("Invalid module");
    const strategy = await getNextBestActionStrategyForModule(user, module);
    if (!strategy) return NextResponse.json([]);
    const rules = await listNextBestActionRulesForStrategy(user, strategy.id);
    return NextResponse.json(rules);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch Next-Best-Action rules", error);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ module: string }> }
) {
  try {
    const user = await requireTenantAdmin(request);
    const { module } = await params;
    if (!isValidModule(module)) return badRequest("Invalid module");
    // A rule needs a parent strategy row to hang off; create one with defaults on
    // first use rather than requiring a separate "initialize strategy" admin step.
    const strategy =
      (await getNextBestActionStrategyForModule(user, module)) ??
      (await upsertNextBestActionStrategy(user, module, { name: `${module} Next-Best-Action Strategy` }));
    const body = await request.json().catch(() => ({}));
    const rule = await createNextBestActionRule(user, strategy.id, body);
    return NextResponse.json(rule);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to create Next-Best-Action rule", error);
  }
}
