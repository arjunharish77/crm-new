import { NextResponse } from 'next/server';
import { requireInternalUser } from '@/lib/server/auth';
import { transitionApplication } from '@/lib/repositories/applications-postgres';
import { applicationHttpError } from '@/lib/server/application-http';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try { const result=await transitionApplication(await requireInternalUser(request), (await params).id, await request.json().catch(()=>null)); return NextResponse.json({ id:result.id,stageId:result.stageId }); }
    catch (error) { return applicationHttpError(error); }
}
