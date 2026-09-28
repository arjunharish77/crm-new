import { NextResponse } from 'next/server';
import { requireInternalUser } from '@/lib/server/auth';
import { assertApplicationAccess, getApplication, uploadApplicationDocument, ApplicationError } from '@/lib/repositories/applications-postgres';
import { APPLICATION_DOCUMENT_MAX_BYTES, applicationUploadSchema } from '@/lib/application-document-input';
import { applicationHttpError } from '@/lib/server/application-http';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
    try {
        const user=await requireInternalUser(request),{id}=await params;
        await assertApplicationAccess(user,'update');
        if(!await getApplication(user,id))throw new ApplicationError(404,'Application not found.');
        const input=applicationUploadSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
        if(Number(request.headers.get('content-length'))>APPLICATION_DOCUMENT_MAX_BYTES)throw new ApplicationError(413,'Choose a file up to 5 MB.');
        if(!request.body)throw new ApplicationError(400,'Choose a file to upload.');
        const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
        try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>APPLICATION_DOCUMENT_MAX_BYTES){await reader.cancel();throw new ApplicationError(413,'Choose a file up to 5 MB.');}chunks.push(value);}}finally{reader.releaseLock();}
        return NextResponse.json(await uploadApplicationDocument(user,id,input,Buffer.concat(chunks)),{status:201});
    } catch(error){return applicationHttpError(error);}
}
