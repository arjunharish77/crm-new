import { NextResponse } from 'next/server';
import { requireInternalUser } from '@/lib/server/auth';
import { applicationOptions } from '@/lib/repositories/applications-postgres';
import { applicationHttpError } from '@/lib/server/application-http';
export async function GET(request: Request){try{const user=await requireInternalUser(request);const p=new URL(request.url).searchParams;return NextResponse.json(await applicationOptions(user,p.get('search')||'',p.get('programId'),p.get('leadId')));}catch(error){return applicationHttpError(error);}}
