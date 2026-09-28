import { NextResponse } from 'next/server';
import { requireInternalUser } from '@/lib/server/auth';
import { setApplicationDocumentReminder } from '@/lib/repositories/applications-postgres';
import { applicationHttpError } from '@/lib/server/application-http';
export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){
    try{return NextResponse.json(await setApplicationDocumentReminder(await requireInternalUser(request),(await params).id,await request.json().catch(()=>null)));}catch(error){return applicationHttpError(error);}
}
