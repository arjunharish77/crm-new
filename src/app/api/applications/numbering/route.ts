import { NextResponse } from 'next/server';
import { requireInternalUser } from '@/lib/server/auth';
import { numberingSettings,saveNumberingRule } from '@/lib/repositories/applications-postgres';
import { applicationHttpError } from '@/lib/server/application-http';
export async function GET(request:Request){try{return NextResponse.json(await numberingSettings(await requireInternalUser(request)));}catch(error){return applicationHttpError(error);}}
export async function POST(request:Request){try{const user=await requireInternalUser(request);return NextResponse.json(await saveNumberingRule(user,await request.json().catch(()=>null)));}catch(error){return applicationHttpError(error);}}
