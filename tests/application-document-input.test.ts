import { describe,it,expect } from 'vitest';
import { applicationUploadSchema,applicationReviewSchema,applicationDocumentMime,APPLICATION_DOCUMENT_MAX_BYTES } from '../src/lib/application-document-input';
describe('application document input',()=>{
 it.each(['../a.pdf','a/b.pdf','a\\b.pdf','a\n.pdf'])('rejects unsafe filename %s',filename=>expect(applicationUploadSchema.safeParse({filename,checklistItemId:'c',requestKey:'77777777-7777-4777-8777-777777777777'}).success).toBe(false));
 it('accepts allowed signatures',()=>{expect(applicationDocumentMime(Buffer.from('%PDF-1.4'))).toBe('application/pdf');expect(applicationDocumentMime(Buffer.from([137,80,78,71,13,10,26,10]))).toBe('image/png');expect(applicationDocumentMime(Buffer.from([255,216,255]))).toBe('image/jpeg');});
 it.each([Buffer.alloc(0),Buffer.from('<script>'),Buffer.alloc(APPLICATION_DOCUMENT_MAX_BYTES+1)])('rejects empty, unsupported or oversized content',data=>expect(()=>applicationDocumentMime(data)).toThrow());
 it('requires a rejection reason',()=>expect(applicationReviewSchema.safeParse({version:0,status:'REJECTED'}).success).toBe(false));
 it.each(['2026-02-30','2026-13-01','bad'])('rejects invalid expiry %s',expiryDate=>expect(applicationReviewSchema.safeParse({version:0,status:'VERIFIED',expiryDate}).success).toBe(false));
 it('accepts valid leap dates and optional expiry',()=>{expect(applicationReviewSchema.safeParse({version:0,status:'VERIFIED',expiryDate:'2028-02-29'}).success).toBe(true);expect(applicationReviewSchema.parse({version:0,status:'VERIFIED'}).expiryDate).toBe(null);});
});
