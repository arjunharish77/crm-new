import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/db";
import { ownsLead } from "@/lib/lead-capture";

export async function GET(request: NextRequest) {
  const [id, token] = (request.cookies.get("uv_compare_access")?.value || "").split(".");
  let unlocked = false;
  if (z.string().uuid().safeParse(id).success && /^[a-f0-9]{64}$/.test(token || "")) {
    const row = (await query("select edit_token_hash,edit_expires_at,email_otp_verified,preferences_completed_at from lead_capture where id=$1", [id])).rows[0];
    unlocked = !!(row && row.email_otp_verified && row.preferences_completed_at && ownsLead(token, row as {edit_token_hash:string;edit_expires_at:string}));
  }
  return NextResponse.json({ unlocked }, { headers: { "Cache-Control": "no-store" } });
}
