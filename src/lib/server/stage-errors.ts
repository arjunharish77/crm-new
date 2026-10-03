import { NextResponse } from "next/server";

// The stage editor's rule errors (repositories/stages-postgres.ts) as plain messages.
const MESSAGES: Record<string, [number, string]> = {
  OPPORTUNITY_TYPE_NOT_FOUND: [404, "Opportunity type not found"],
  STAGE_NOT_FOUND: [404, "Stage not found"],
  STAGE_NAME_REQUIRED: [400, "Enter a name for the stage"],
  STAGE_NAME_TOO_LONG: [400, "Use 60 characters or fewer"],
  STAGE_NAME_TAKEN: [409, "Another stage in this type already has that name"],
  STAGE_PROBABILITY_INVALID: [400, "Probability must be between 0 and 100"],
  STAGE_COLOR_INVALID: [400, "Choose a colour such as #1b6c31"],
  STAGE_KIND_IN_USE: [409, "Opportunities are in this stage, so it can't change between open, Won and Lost. Move them first."],
  STAGE_LAST_OPEN: [409, "A type needs at least one open stage"],
  STAGE_LAST_WON: [409, "A type needs at least one Won stage"],
  STAGE_LAST_LOST: [409, "A type needs at least one Lost stage"],
  STAGE_CLOSED_IN_USE: [409, "Opportunities are in this Won or Lost stage, so it can't be removed"],
  STAGE_MOVE_TARGET_REQUIRED: [400, "Choose the stage to move this stage's opportunities to"],
  STAGE_MOVE_TARGET_INVALID: [400, "Choose another stage of this type to move the opportunities to"],
  STAGE_ORDER_INVALID: [400, "The new order must list every stage of the type once"],
};

export function stageErrorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  const entry = MESSAGES[code];
  return entry ? NextResponse.json({ message: entry[1], code }, { status: entry[0] }) : null;
}
