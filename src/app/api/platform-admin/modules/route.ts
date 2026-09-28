import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/auth";
import { getModuleCatalog } from "@/lib/server/module-entitlements";
import { forbidden,unauthorized,serverError } from "@/lib/server/http";
export async function GET(request:Request){try{await requirePlatformAdmin(request);return NextResponse.json(await getModuleCatalog());}catch(error){if(error instanceof Error&&error.message==="UNAUTHORIZED")return unauthorized();if(error instanceof Error&&error.message==="FORBIDDEN")return forbidden();return serverError("Unable to load the module catalog",error);}}
