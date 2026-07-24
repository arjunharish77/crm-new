import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/server/auth";
import {
  listGamificationRedemptionsForUser,
  requestGamificationRedemption,
} from "@/lib/server/gamification";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const redemptions = await listGamificationRedemptionsForUser(user, user.id);
    return NextResponse.json(redemptions);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    return serverError("Failed to fetch redemptions", error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser(request);
    const body = await request.json().catch(() => ({}));
    const redemption = await requestGamificationRedemption(user, body);
    return NextResponse.json(redemption);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") return unauthorized();
    if (error instanceof Error && error.message === "REDEMPTION_REWARD_NOT_FOUND") {
      return badRequest("This reward is not available");
    }
    if (error instanceof Error && error.message === "INSUFFICIENT_POINTS") {
      return badRequest("You do not have enough points for this reward");
    }
    if (error instanceof Error && error.message === "INVALID_REDEMPTION_POINTS") {
      return badRequest("Reward points cost must be greater than zero");
    }
    return serverError("Failed to request redemption", error);
  }
}
