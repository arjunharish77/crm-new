import { NextResponse } from 'next/server';
import { requireInternalUser } from '@/lib/server/auth';
import { downloadApplicationDocument, reviewApplicationDocument } from '@/lib/repositories/applications-postgres';
import { applicationHttpError } from '@/lib/server/application-http';
import { safeContentDispositionFilename } from '@/lib/server/http';
type Context={params:Promise<{id:string;documentId:string}>};
export async function GET(request:Request,{params}:Context){
    try{const user=await requireInternalUser(request),{id,documentId}=await params;const file=await downloadApplicationDocument(user,id,documentId);return new NextResponse(file.data,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${safeContentDispositionFilename(file.filename||'document')}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});}catch(error){return applicationHttpError(error);}
}
export async function PATCH(request:Request,{params}:Context){
    try{const user=await requireInternalUser(request),{id,documentId}=await params;return NextResponse.json(await reviewApplicationDocument(user,id,documentId,await request.json().catch(()=>null)));}catch(error){return applicationHttpError(error);}
}
