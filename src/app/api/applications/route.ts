import { NextResponse } from 'next/server';
import { requireInternalUser } from '@/lib/server/auth';
import { createApplication, listApplications } from '@/lib/repositories/applications-postgres';
import { applicationHttpError } from '@/lib/server/application-http';
export async function GET(request: Request) {
    try { const user=await requireInternalUser(request);const p=new URL(request.url).searchParams;const page=Math.min(100000,Math.max(1,Math.floor(Number(p.get('page'))||1)));return NextResponse.json(await listApplications(user,p.get('search')||'',page)); } catch(error){return applicationHttpError(error);}
}
export async function POST(request: Request) {
    try {const user=await requireInternalUser(request);const result=await createApplication(user,await request.json().catch(()=>null));return NextResponse.json(result.record,{status:result.replayed?200:201});}catch(error){return applicationHttpError(error);}
}
