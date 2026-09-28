import { NextResponse } from 'next/server';
import { requireInternalUser } from '@/lib/server/auth';
import { getApplicationWorkflow } from '@/lib/repositories/applications-postgres';
import { applicationHttpError } from '@/lib/server/application-http';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try { return NextResponse.json(await getApplicationWorkflow(await requireInternalUser(request), (await params).id)); }
    catch (error) { return applicationHttpError(error); }
}
