import { z } from 'zod';
export const APPLICATION_DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
export const applicationUploadSchema = z.object({
    checklistItemId:z.string().trim().min(1).max(100),
    filename:z.string().trim().min(1).max(160).refine(value=>!/[\\/\x00-\x1f\x7f]/.test(value),'Use a filename without folders or control characters'),
    requestKey:z.string().uuid(),
});
export const applicationReviewSchema = z.object({
    version:z.number().int().min(0),
    status:z.enum(['VERIFIED','REJECTED']),
    comments:z.string().trim().max(2000).default(''),
    rejectionReason:z.string().trim().max(1000).default(''),
    expiryDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const date=new Date(value+'T00:00:00Z');return !Number.isNaN(date.valueOf())&&date.toISOString().slice(0,10)===value;},'Enter a valid expiry date').nullable().default(null),
}).refine(value=>value.status!=='REJECTED'||value.rejectionReason.length>=3,'Provide a rejection reason of at least 3 characters');
export function applicationDocumentMime(data:Buffer) {
    if (!data.length || data.length>APPLICATION_DOCUMENT_MAX_BYTES) throw new Error('Choose a nonempty file up to 5 MB.');
    if(data.subarray(0,5).toString()==='%PDF-')return 'application/pdf';
    if(data.length>=8 && data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
    if(data.length>=3 && data[0]===255 && data[1]===216 && data[2]===255)return 'image/jpeg';
    throw new Error('Only PDF, PNG and JPEG files are accepted.');
}
