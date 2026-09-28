import { NextResponse } from 'next/server';
import { requireInternalUser } from '@/lib/server/auth';
import { getApplicationEligibility,saveApplicationEligibility } from '@/lib/repositories/applications-postgres';
import { applicationHttpError } from '@/lib/server/application-http';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,{params}:Context){try{return NextResponse.json(await getApplicationEligibility(await requireInternalUser(request),(await params).id));}catch(error){return applicationHttpError(error);}}
export async function PUT(request:Request,{params}:Context){try{return NextResponse.json(await saveApplicationEligibility(await requireInternalUser(request),(await params).id,await request.json().catch(()=>null)));}catch(error){return applicationHttpError(error);}}
