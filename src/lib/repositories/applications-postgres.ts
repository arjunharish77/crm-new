import { createHash, randomUUID } from 'crypto';
import { z } from 'zod';
import { query, queryOne, execute, type Queryable } from '@/lib/db/query';
import { withTransaction } from '@/lib/db/transaction';
import { assertModuleEnabled } from '@/lib/server/module-entitlements';
import { assertStorageAvailable } from '@/lib/server/usage-limits';
import { applyRecordScopeClause, recordAccessLevel } from '@/lib/server/record-scope';
import { canUseApplications, type ApplicationActor } from '@/lib/application-access';
import { applicationRuleSchema, defaultApplicationRule, formatApplicationNumber } from '@/lib/application-numbering';

export class ApplicationError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
const id = z.string().trim().min(1).max(100);
export const createApplicationSchema = z.object({ leadId: id, programId: id, stageId: id, courseId: id.nullable().default(null), intakeId: id.nullable().default(null), opportunityId: id.nullable().default(null), requestKey: z.string().uuid() });
export async function assertApplicationAccess(user: ApplicationActor, action: 'read' | 'create' | 'update' | 'manage') {
    if (!canUseApplications(user, action)) throw new ApplicationError(403, 'You do not have permission to access this application action.');
    await assertModuleEnabled(user.tenantId, 'PRODUCT_CATALOG');
}
function appScope(user: ApplicationActor, values: unknown[], clauses: string[]) {
    if (user.isTenantAdmin || user.isPlatformAdmin || recordAccessLevel(user) === 'ALL') return;
    values.push(user.id);
    const actor = values.length;
    if (recordAccessLevel(user) === 'TEAM' && user.teamId) {
        values.push(user.teamId);
        clauses.push(`(a."ownerId" = $${actor} or a."ownerId" in (select id from "User" where "tenantId"=$1 and "teamId"::text=$${values.length}))`);
    } else clauses.push(`a."ownerId"=$${actor}`);
}
const selectApplication = `select a.id, a."applicationNumber", a."leadId", a."opportunityId", a."programId", a."courseId", a."intakeId", a."stageId", a."ownerId", a."createdAt", l.name as "applicantName", p.name as "programName", u.name as "universityName", s.name as "stageName", c.name as "courseName", i.name as "intakeName", o.name as "ownerName"
 from "Application" a join "Program" p on p.id=a."programId" and p."tenantId"=a."tenantId"
 join "University" u on u.id=p."universityId" and u."tenantId"=a."tenantId"
 join "ApplicationStage" s on s.id=a."stageId" and s."tenantId"=a."tenantId"
 left join "Lead" l on l.id=a."leadId" and l."tenantId"=a."tenantId"
 left join "Course" c on c.id=a."courseId" and c."tenantId"=a."tenantId"
 left join "Intake" i on i.id=a."intakeId" and i."tenantId"=a."tenantId"
 left join "User" o on o.id=a."ownerId" and o."tenantId"=a."tenantId"`;
export async function getApplication(user: ApplicationActor, applicationId: string, tx?: Queryable) {
    await assertApplicationAccess(user, 'read');
    return findApplication(user, applicationId, tx);
}
// Authorization is checked before opening create transactions; avoid acquiring another
// pool connection while a transaction holds locks under concurrent submissions.
async function findApplication(user: ApplicationActor, applicationId: string, tx?: Queryable, lock = false) {
    const values: unknown[] = [user.tenantId, applicationId]; const clauses = ['a."tenantId"=$1', 'a.id=$2']; appScope(user, values, clauses);
    // Lock the base row first, then read its joins in a fresh statement snapshot.
    // Locking a joined stage snapshot can miss a row after another writer changes stageId.
    if (lock && !await queryOne(`select a.id from "Application" a where ${clauses.join(' and ')} for update`, values, tx)) return null;
    return queryOne<any>(`${selectApplication} where ${clauses.join(' and ')}`, values, tx);
}
export async function listApplications(user: ApplicationActor, search: string, page: number) {
    await assertApplicationAccess(user, 'read');
    const values: unknown[] = [user.tenantId, `%${search.slice(0, 150)}%`];
    const clauses = ['a."tenantId"=$1', '(a."applicationNumber" ilike $2 or l.name ilike $2 or p.name ilike $2)']; appScope(user, values, clauses);
    const where = clauses.join(' and ');
    const count = await queryOne<{ total: string }>(`select count(*)::text as total from (${selectApplication} where ${where}) x`, values);
    values.push((Math.max(1, page) - 1) * 25);
    const data = await query(`${selectApplication} where ${where} order by a."createdAt" desc,a.id desc limit 25 offset $${values.length}`, values);
    return { data, total: Number(count?.total ?? 0), page, limit: 25 };
}
export async function applicationOptions(user: ApplicationActor, search: string, programId: string | null, leadId: string | null) {
    await assertApplicationAccess(user, 'read');
    const values: unknown[] = [user.tenantId, `%${search.slice(0, 100)}%`, leadId];
    const clauses = ['l."tenantId"=$1', '(l.name ilike $2 or l.id=$3)']; applyRecordScopeClause(clauses, values, user, 'LEAD', 1, 'l');
    const leads = await query(`select l.id,l.name from "Lead" l where ${clauses.join(' and ')} order by (l.id=$3) desc nulls last,l.name,l.id limit 50`, values);
    const programs = await query(`select p.id,p.name,u.id as "universityId",u.name as "universityName" from "Program" p join "University" u on u.id=p."universityId" and u."tenantId"=p."tenantId" where p."tenantId"=$1 and p."isActive" and u."isActive" order by u.name,p.name`, [user.tenantId]);
    const stages = programId ? await query(`select id,name from "ApplicationStage" where "tenantId"=$1 and "programId"=$2 and not "isClosed" and not "isWon" and not "requiresVerifiedDocuments" and not "requiresEligibility" order by "order",name`, [user.tenantId, programId]) : [];
    const courses = programId ? await query(`select id,name from "Course" where "tenantId"=$1 and "programId"=$2 and "isActive" order by name`, [user.tenantId, programId]) : [];
    const intakes = programId ? await query(`select id,name from "Intake" where "tenantId"=$1 and "programId"=$2 and "isActive" order by "startDate" desc nulls last,name`, [user.tenantId, programId]) : [];
    const ov: unknown[] = [user.tenantId, leadId, programId];
    const oc = ['o."tenantId"=$1', 'o."leadId"=$2', 't."programId"=$3']; applyRecordScopeClause(oc, ov, user, 'OPPORTUNITY', 1, 'o');
    const opportunities = leadId && programId ? await query(`select o.id,o.title as name from "Opportunity" o join "OpportunityType" t on t.id=o."opportunityTypeId" and t."tenantId"=o."tenantId" where ${oc.join(' and ')} order by o.title limit 100`, ov) : [];
    return { leads, programs, stages, courses, intakes, opportunities };
}
async function audit(user: ApplicationActor, type: string, entityId: string, after: unknown, tx: Queryable) {
    await execute(`insert into "AuditLog" (id,"tenantId","userId",action,"entityType","entityId",after,"createdAt") values ($1,$2,$3,'CREATE',$4,$5,$6,now())`, [randomUUID(),user.tenantId,user.id,type,entityId,JSON.stringify(after)], tx);
}
export async function createApplication(user: ApplicationActor, raw: unknown) {
    await assertApplicationAccess(user, 'create'); await assertApplicationAccess(user, 'read');
    const input = createApplicationSchema.parse(raw);
    const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    return withTransaction({ id: user.id, tenantId: user.tenantId }, async tx => {
        await query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`application:${user.tenantId}:${user.id}:${input.requestKey}`], tx);
        const prior = await queryOne<{ id: string; requestHash: string }>(`select id,"requestHash" from "Application" where "tenantId"=$1 and "createdBy"=$2 and "requestKey"=$3`, [user.tenantId,user.id,input.requestKey],tx);
        if (prior) {
            if (prior.requestHash !== hash) throw new ApplicationError(409, 'This request was already used for different application details. Start a new application.');
            const record = await findApplication(user, prior.id, tx);
            if (!record) throw new ApplicationError(404, 'Application is no longer accessible.');
            return { record, replayed: true };
        }
        const lv: unknown[] = [user.tenantId,input.leadId]; const lc = ['l."tenantId"=$1','l.id=$2']; applyRecordScopeClause(lc,lv,user,'LEAD',1,'l');
        if (!await queryOne(`select l.id from "Lead" l where ${lc.join(' and ')}`,lv,tx)) throw new ApplicationError(400,'Select an accessible applicant.');
        const program = await queryOne<{ universityId: string }>(`select p."universityId" from "Program" p join "University" u on u.id=p."universityId" and u."tenantId"=p."tenantId" where p.id=$1 and p."tenantId"=$2 and p."isActive" and u."isActive"`,[input.programId,user.tenantId],tx);
        if (!program) throw new ApplicationError(400,'Select an active program in this workspace.');
        if (!await queryOne(`select id from "ApplicationStage" where id=$1 and "tenantId"=$2 and "programId"=$3 and not "isClosed" and not "isWon" and not "requiresVerifiedDocuments" and not "requiresEligibility"`,[input.stageId,user.tenantId,input.programId],tx)) throw new ApplicationError(400,'Select an open initial stage without document or eligibility requirements for this program.');
        for (const [table, value] of [['Course',input.courseId],['Intake',input.intakeId]] as const) {
            if (value && !await queryOne(`select id from "${table}" where id=$1 and "tenantId"=$2 and "programId"=$3 and "isActive"`,[value,user.tenantId,input.programId],tx)) throw new ApplicationError(400,`Select an active ${table.toLowerCase()} for this program.`);
        }
        let opportunityTypeId: string | null = null;
        if (input.opportunityId) {
            const ov: unknown[]=[user.tenantId,input.opportunityId,input.leadId,input.programId]; const oc=['o."tenantId"=$1','o.id=$2','o."leadId"=$3','t."programId"=$4']; applyRecordScopeClause(oc,ov,user,'OPPORTUNITY',1,'o');
            const opportunity = await queryOne<{ opportunityTypeId: string }>(`select o."opportunityTypeId" from "Opportunity" o join "OpportunityType" t on t.id=o."opportunityTypeId" and t."tenantId"=o."tenantId" where ${oc.join(' and ')}`,ov,tx);
            if (!opportunity) throw new ApplicationError(400,'Select an accessible opportunity linked to this applicant and program.');
            opportunityTypeId=opportunity.opportunityTypeId;
        }
        const configured = await queryOne<any>(`select * from "ApplicationNumberRule" where "tenantId"=$1 and ("universityId" is null or "universityId"=$2) and ("opportunityTypeId" is null or "opportunityTypeId"=$3) and ("intakeId" is null or "intakeId"=$4) order by (("universityId" is not null)::int+("opportunityTypeId" is not null)::int+("intakeId" is not null)::int) desc,("intakeId" is not null) desc,("opportunityTypeId" is not null) desc,id limit 1`,[user.tenantId,program.universityId,opportunityTypeId,input.intakeId],tx);
        const rule = configured ? applicationRuleSchema.parse(configured) : defaultApplicationRule;
        let applicationNumber = '';
        for (let attempt=0;attempt<100;attempt++) {
            const sequence=await queryOne<{ value: string }>(`insert into "ApplicationNumberCounter" ("tenantId",value) values ($1,1) on conflict ("tenantId") do update set value="ApplicationNumberCounter".value+1 returning value::text`,[user.tenantId],tx);
            applicationNumber=formatApplicationNumber(rule,sequence!.value,new Date());
            if (!await queryOne(`select id from "Application" where "tenantId"=$1 and "applicationNumber"=$2`,[user.tenantId,applicationNumber],tx)) break;
            applicationNumber='';
        }
        if (!applicationNumber) throw new ApplicationError(409,'Numbering rules conflict with existing numbers. Ask an administrator to review them.');
        const applicationId=randomUUID();
        await execute(`insert into "Application" (id,"tenantId","applicationNumber","leadId","opportunityId","programId","courseId","intakeId","stageId","ownerId","createdBy","requestKey","requestHash") values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11,$12)`,[applicationId,user.tenantId,applicationNumber,input.leadId,input.opportunityId,input.programId,input.courseId,input.intakeId,input.stageId,user.id,input.requestKey,hash],tx);
        await execute(`insert into "ApplicationStageHistory" (id,"tenantId","applicationId","toStageId","changedById",notes) values ($1,$2,$3,$4,$5,'Application created')`,[randomUUID(),user.tenantId,applicationId,input.stageId,user.id],tx);
        await audit(user,'APPLICATION',applicationId,{applicationNumber,programId:input.programId},tx);
        return { record: await findApplication(user,applicationId,tx), replayed: false };
    });
}
export async function numberingSettings(user: ApplicationActor) {
    await assertApplicationAccess(user,'manage');
    const rules=await query(`select r.*,u.name as "universityName",t.name as "opportunityTypeName",i.name as "intakeName" from "ApplicationNumberRule" r left join "University" u on u.id=r."universityId" and u."tenantId"=r."tenantId" left join "OpportunityType" t on t.id=r."opportunityTypeId" and t."tenantId"=r."tenantId" left join "Intake" i on i.id=r."intakeId" and i."tenantId"=r."tenantId" where r."tenantId"=$1 order by r."updatedAt" desc`,[user.tenantId]);
    const universities=await query(`select id,name from "University" where "tenantId"=$1 and "isActive" order by name`,[user.tenantId]);
    const types=await query(`select t.id,t.name,p."universityId",t."programId" from "OpportunityType" t join "Program" p on p.id=t."programId" and p."tenantId"=t."tenantId" where t."tenantId"=$1 order by t.name`,[user.tenantId]);
    const intakes=await query(`select i.id,i.name,i."programId",p."universityId" from "Intake" i join "Program" p on p.id=i."programId" and p."tenantId"=i."tenantId" where i."tenantId"=$1 and i."isActive" order by i.name`,[user.tenantId]);
    return {rules,universities,types,intakes,defaults:defaultApplicationRule};
}
export async function saveNumberingRule(user: ApplicationActor, raw: unknown) {
    await assertApplicationAccess(user,'manage'); const rule=applicationRuleSchema.parse(raw);
    return withTransaction({id:user.id,tenantId:user.tenantId},async tx=>{
        for (const [table,value] of [['University',rule.universityId],['OpportunityType',rule.opportunityTypeId],['Intake',rule.intakeId]] as const) {
            if(value&&!await queryOne(`select id from "${table}" where id=$1 and "tenantId"=$2`,[value,user.tenantId],tx)) throw new ApplicationError(400,'Numbering scope must belong to this workspace.');
        }
        if(rule.opportunityTypeId || rule.intakeId) {
            const scope=await queryOne<any>(`select (select "programId" from "OpportunityType" where id=$1 and "tenantId"=$3) as "typeProgram", (select "programId" from "Intake" where id=$2 and "tenantId"=$3) as "intakeProgram"`,[rule.opportunityTypeId,rule.intakeId,user.tenantId],tx);
            if(rule.opportunityTypeId&&!scope?.typeProgram) throw new ApplicationError(400,'Link the opportunity type to a catalog program first.');
            if(scope?.typeProgram&&scope?.intakeProgram&&scope.typeProgram!==scope.intakeProgram) throw new ApplicationError(400,'Opportunity type and intake must use the same program.');
            if(rule.universityId&&!await queryOne(`select id from "Program" where id=$1 and "tenantId"=$2 and "universityId"=$3`,[scope.typeProgram||scope.intakeProgram,user.tenantId,rule.universityId],tx)) throw new ApplicationError(400,'Numbering scope must use the same university.');
        }
        const result=await queryOne<any>(`insert into "ApplicationNumberRule" (id,"tenantId","universityId","opportunityTypeId","intakeId",prefix,suffix,padding,"financialYearStartMonth",timezone,"updatedBy") values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict ("tenantId",(coalesce("universityId",'')),(coalesce("opportunityTypeId",'')),(coalesce("intakeId",''))) do update set prefix=excluded.prefix,suffix=excluded.suffix,padding=excluded.padding,"financialYearStartMonth"=excluded."financialYearStartMonth",timezone=excluded.timezone,"updatedBy"=excluded."updatedBy","updatedAt"=now() returning *`,[randomUUID(),user.tenantId,rule.universityId,rule.opportunityTypeId,rule.intakeId,rule.prefix,rule.suffix,rule.padding,rule.financialYearStartMonth,rule.timezone,user.id],tx);
        await audit(user,'APPLICATION_NUMBER_RULE',result.id,rule,tx);return result;
    });
}

export const applicationTransitionSchema = z.object({
    expectedStageId: id,
    stageId: id,
    reason: z.string().trim().min(3, 'Explain why this stage is changing (at least 3 characters).').max(2000),
});

async function applicationChecklist(user: ApplicationActor, application: any, tx?: Queryable) {
    // The latest document is authoritative: an older verified file cannot hide a rejected replacement.
    return query<any>(`select c.id,c.name,c.description,c."isRequired",d.id as "documentId",d.name as "filename",d."fileObjectId",d."reviewVersion",d.comments,d."verificationStatus",d."uploadStatus",d."rejectionReason",d."expiryDate",d."verifiedAt",u.name as "reviewerName",
      case when d.id is null or d."uploadStatus"<>'UPLOADED' then 'MISSING'
           when d."expiryDate" < current_date then 'EXPIRED'
           when d."verificationStatus"='VERIFIED' and nullif(btrim(d."fileStoragePath"),'') is not null and d."verifiedAt" is not null and u.id is not null then 'VERIFIED'
           when d."verificationStatus"='REJECTED' then 'REJECTED' else 'PENDING' end as status
      from "ApplicationChecklist" c
      left join lateral (select * from "ApplicationDocument" d where d."tenantId"=c."tenantId" and d."applicationId"=$2 and d."checklistItemId"=c.id order by d."createdAt" desc,d.id desc limit 1) d on true
      left join "User" u on u.id=d."reviewerId" and u."tenantId"=c."tenantId"
      where c."tenantId"=$1 and c."programId"=$3 and c."isActive" order by c."order",c.name,c.id`, [user.tenantId, application.id, application.programId], tx);
}

export async function getApplicationWorkflow(user: ApplicationActor, applicationId: string) {
    const application = await getApplication(user, applicationId);
    if (!application) throw new ApplicationError(404, 'Application not found.');
    const checklist = await applicationChecklist(user, application);
    const stages = await query(`select id,name,"isClosed","isWon","requiresVerifiedDocuments","requiresEligibility" from "ApplicationStage" where "tenantId"=$1 and "programId"=$2 order by "order",name,id`, [user.tenantId,application.programId]);
    const reminder=await queryOne<any>(`select enabled,"nextRunAt","lastSentAt" from "ApplicationDocumentReminder" where "applicationId"=$1 and "tenantId"=$2 and "userId"=$3`,[application.id,user.tenantId,user.id]);
    return { checklist, stages, reminder:reminder??{enabled:false}, canManageReminder:application.ownerId===user.id };
}

export async function transitionApplication(user: ApplicationActor, applicationId: string, raw: unknown) {
    await assertApplicationAccess(user, 'read');
    await assertApplicationAccess(user, 'update');
    const input = applicationTransitionSchema.parse(raw);
    return withTransaction({ id:user.id, tenantId:user.tenantId }, async tx => {
        const application = await findApplication(user, applicationId, tx, true);
        if (!application) throw new ApplicationError(404, 'Application not found.');
        // A retry after a committed response must not add another history/audit event.
        if (application.stageId === input.stageId) return application;
        if (application.stageId !== input.expectedStageId) throw new ApplicationError(409, 'The stage changed since you opened this application. Refresh before trying again.');
        const stages = await query<any>(`select id,"isClosed","isWon","requiresVerifiedDocuments","requiresEligibility" from "ApplicationStage" where "tenantId"=$1 and "programId"=$2 and id in ($3,$4) for share`, [user.tenantId,application.programId,application.stageId,input.stageId],tx);
        const target = stages.find(stage=>stage.id===input.stageId);
        const source = stages.find(stage=>stage.id===application.stageId);
        if (!target || !source) throw new ApplicationError(400, 'Select a stage belonging to this application’s program.');
        if ((source.isClosed || source.isWon || target.isClosed || target.isWon) && !canUseApplications(user,'manage')) throw new ApplicationError(403, 'Applications manage permission is required to close, mark won or reopen an application.');
        if (target.requiresEligibility) {
            const eligibility=await evaluateSavedApplicationEligibility(user,application,tx);
            if(eligibility.evaluation.status!=='MET')throw new ApplicationError(409,'Eligibility requirements are not fully met. Open Eligibility to resolve missing information, failed checks or rules requiring manual review before entering this stage.');
        }
        if (target.requiresVerifiedDocuments) {
            const missing = (await applicationChecklist(user, application, tx)).filter(item=>item.isRequired && item.status!=='VERIFIED');
            if (missing.length) throw new ApplicationError(409, `${missing.length} required document(s) need valid verification before entering this stage: ${missing.map(item=>item.name).join(', ')}.`);
        }
        await execute(`update "Application" set "stageId"=$3,"updatedAt"=now() where id=$1 and "tenantId"=$2`, [applicationId,user.tenantId,input.stageId],tx);
        await execute(`insert into "ApplicationStageHistory" (id,"tenantId","applicationId","fromStageId","toStageId","changedById",notes) values ($1,$2,$3,$4,$5,$6,$7)`, [randomUUID(),user.tenantId,applicationId,application.stageId,input.stageId,user.id,input.reason],tx);
        await execute(`insert into "AuditLog" (id,"tenantId","userId",action,"entityType","entityId",before,after,metadata,"createdAt") values ($1,$2,$3,'UPDATE','APPLICATION',$4,$5,$6,$7,now())`, [randomUUID(),user.tenantId,user.id,applicationId,JSON.stringify({stageId:application.stageId}),JSON.stringify({stageId:input.stageId}),JSON.stringify({reason:input.reason})],tx);
        return { ...application, stageId:input.stageId };
    });
}

export async function uploadApplicationDocument(user:ApplicationActor, applicationId:string, raw:unknown, data:Buffer) {
    if(user.tenantId) await assertStorageAvailable(user.tenantId,data.length); // storage limit: refuse before writing
    await assertApplicationAccess(user,'read'); await assertApplicationAccess(user,'update');
    const { applicationUploadSchema, applicationDocumentMime } = await import('@/lib/application-document-input');
    const input=applicationUploadSchema.parse(raw);
    let contentType:string;
    try { contentType=applicationDocumentMime(data); } catch(e) { throw new ApplicationError(400,(e as Error).message); }
    const checksum=createHash('sha256').update(data).digest('hex');
    const {writePrivateFile,deletePrivateFile}=await import('@/lib/storage/file-storage');
    let storageKey:string|null=null;
    try {
        return await withTransaction({id:user.id,tenantId:user.tenantId},async tx=>{
            const application=await findApplication(user,applicationId,tx,true);
            if(!application)throw new ApplicationError(404,'Application not found.');
            const previous=await queryOne<any>(`select d.id,d.name,d."checklistItemId",f.checksum from "ApplicationDocument" d join "FileObject" f on f.id=d."fileObjectId" and f."tenantId"=d."tenantId" where d."tenantId"=$1 and d."applicationId"=$2 and d."uploadedById"=$3 and d."uploadRequestKey"=$4`,[user.tenantId,applicationId,user.id,input.requestKey],tx);
            if(previous){
                if(previous.checksum!==checksum||previous.name!==input.filename||previous.checklistItemId!==input.checklistItemId)throw new ApplicationError(409,'This upload request was already used for a different file. Select the file again.');
                return {id:previous.id};
            }
            if(!await queryOne(`select id from "ApplicationChecklist" where id=$1 and "tenantId"=$2 and "programId"=$3 and "isActive"`,[input.checklistItemId,user.tenantId,application.programId],tx))throw new ApplicationError(400,'Choose an active checklist requirement for this program.');
            const documentId=randomUUID(),fileId=randomUUID();
            storageKey=`applications/${fileId}`;
            const file=await writePrivateFile(storageKey,data,{bucket:'application-documents',contentType});
            await execute(`insert into "FileObject" (id,"tenantId","storageDriver",bucket,"storageKey","originalFilename","contentType","byteSize",checksum,"entityType","entityId",visibility,metadata,"createdBy","createdAt","updatedAt") values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'APPLICATION_DOCUMENT',$10,'PRIVATE',$11,$12,now(),now())`,[fileId,user.tenantId,file.driver,file.bucket,file.storageKey,input.filename,contentType,file.byteSize,file.checksum,documentId,JSON.stringify({scanEngine:'none-configured'}),user.id],tx);
            await execute(`insert into "ApplicationDocument" (id,"tenantId","applicationId","checklistItemId",name,"fileStoragePath","fileObjectId","uploadedById","uploadRequestKey","uploadStatus","uploadedAt","createdAt") values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'UPLOADED',clock_timestamp(),clock_timestamp())`,[documentId,user.tenantId,applicationId,input.checklistItemId,input.filename,file.storageKey,fileId,user.id,input.requestKey],tx);
            await audit(user,'APPLICATION_DOCUMENT',documentId,{applicationId,checklistItemId:input.checklistItemId,filename:input.filename},tx);
            return {id:documentId};
        });
    } catch(error) {
        // Do not delete a committed file after an ambiguous connection failure.
        if(storageKey)try{const linked=await queryOne(`select id from "FileObject" where "tenantId"=$1 and "storageKey"=$2`,[user.tenantId,storageKey]);if(!linked)await deletePrivateFile(storageKey);}catch{/* Retain unconfirmed files for reconciliation. */}
        throw error;
    }
}

export async function reviewApplicationDocument(user:ApplicationActor, applicationId:string, documentId:string, raw:unknown) {
    await assertApplicationAccess(user,'read');await assertApplicationAccess(user,'manage');
    const {applicationReviewSchema}=await import('@/lib/application-document-input');
    const input=applicationReviewSchema.parse(raw);
    return withTransaction({id:user.id,tenantId:user.tenantId},async tx=>{
        const application=await findApplication(user,applicationId,tx,true);
        if(!application)throw new ApplicationError(404,'Application not found.');
        const document=await queryOne<any>(`select d.* from "ApplicationDocument" d join "FileObject" f on f.id=d."fileObjectId" and f."tenantId"=d."tenantId" and f."entityType"='APPLICATION_DOCUMENT' and f."entityId"=d.id where d.id=$1 and d."tenantId"=$2 and d."applicationId"=$3 and d."uploadStatus"='UPLOADED'`,[documentId,user.tenantId,applicationId],tx);
        if(!document)throw new ApplicationError(404,'Uploaded document not found.');
        if(document.reviewVersion!==input.version)throw new ApplicationError(409,'This document was reviewed since you opened it. Refresh its status before reviewing again.');
        const latest=await queryOne<any>(`select id from "ApplicationDocument" where "tenantId"=$1 and "applicationId"=$2 and "checklistItemId"=$3 order by "createdAt" desc,id desc limit 1`,[user.tenantId,applicationId,document.checklistItemId],tx);
        if(latest?.id!==documentId)throw new ApplicationError(409,'A newer replacement was uploaded. Review the latest document.');
        await execute(`update "ApplicationDocument" set "verificationStatus"=$4,"rejectionReason"=$5,comments=$6,"expiryDate"=$7,"reviewerId"=$8,"verifiedAt"=case when $4='VERIFIED' then now() else null end,"reviewVersion"="reviewVersion"+1,"updatedAt"=now() where id=$1 and "tenantId"=$2 and "applicationId"=$3`,[documentId,user.tenantId,applicationId,input.status,input.status==='REJECTED'?input.rejectionReason:null,input.comments,input.expiryDate,user.id],tx);
        await execute(`insert into "AuditLog" (id,"tenantId","userId",action,"entityType","entityId",before,after,"createdAt") values ($1,$2,$3,'UPDATE','APPLICATION_DOCUMENT',$4,$5,$6,now())`,[randomUUID(),user.tenantId,user.id,documentId,JSON.stringify({verificationStatus:document.verificationStatus,reviewVersion:document.reviewVersion}),JSON.stringify(input)],tx);
        return {id:documentId,reviewVersion:input.version+1};
    });
}

export async function downloadApplicationDocument(user:ApplicationActor, applicationId:string, documentId:string) {
    const application=await getApplication(user,applicationId);
    if(!application)throw new ApplicationError(404,'Application not found.');
    // Fresh account and tenant check at the point raw data leaves the app.
    const active=await queryOne(`select u.id from "User" u join "Tenant" t on t.id=u."tenantId" where u.id=$1 and u."tenantId"=$2 and u.status='ACTIVE' and t.status<>'SUSPENDED'`,[user.id,user.tenantId]);
    if(!active)throw new ApplicationError(403,'Your account cannot download documents.');
    const file=await queryOne<any>(`select f."storageKey",f."storageDriver",f."originalFilename" from "ApplicationDocument" d join "FileObject" f on f.id=d."fileObjectId" and f."tenantId"=d."tenantId" and f."entityType"='APPLICATION_DOCUMENT' and f."entityId"=d.id where d.id=$1 and d."tenantId"=$2 and d."applicationId"=$3`,[documentId,user.tenantId,applicationId]);
    if(!file)throw new ApplicationError(404,'Document file not found.');
    if(file.storageDriver!=='local')throw new ApplicationError(503,'This storage driver is not configured.');
    const {readPrivateFile}=await import('@/lib/storage/file-storage');
    try{return {data:await readPrivateFile(file.storageKey),filename:file.originalFilename};}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')throw new ApplicationError(404,'Document file is unavailable.');throw e;}
}

export async function setApplicationDocumentReminder(user:ApplicationActor, applicationId:string, raw:unknown) {
    await assertApplicationAccess(user,'read');
    const {enabled}=z.object({enabled:z.boolean()}).parse(raw);
    return withTransaction({id:user.id,tenantId:user.tenantId},async tx=>{
        const application=await findApplication(user,applicationId,tx,true);
        if(!application)throw new ApplicationError(404,'Application not found.');
        if(application.ownerId!==user.id)throw new ApplicationError(403,'Only the application owner can opt in to reminders for themselves.');
        const result=await queryOne<any>(`insert into "ApplicationDocumentReminder" ("applicationId","tenantId","userId",enabled,"nextRunAt") values ($1,$2,$3,$4,now()+interval '24 hours') on conflict ("applicationId") do update set "lastSentAt"=case when "ApplicationDocumentReminder"."userId"=excluded."userId" then "ApplicationDocumentReminder"."lastSentAt" else null end,"userId"=excluded."userId",enabled=excluded.enabled,"nextRunAt"=case when "ApplicationDocumentReminder".enabled and excluded.enabled and "ApplicationDocumentReminder"."userId"=excluded."userId" then "ApplicationDocumentReminder"."nextRunAt" else excluded."nextRunAt" end,"updatedAt"=now() returning enabled,"nextRunAt","lastSentAt"`,[applicationId,user.tenantId,user.id,enabled],tx);
        return result;
    });
}

export async function processApplicationDocumentReminders(limit=100,now=new Date(),onlyApplicationId?:string) {
    const {queryAsSystem}=await import('@/lib/db/query');
    const {getCurrentUserById}=await import('@/lib/repositories/auth-admin-postgres');
    const {isModuleEnabledForTenant}=await import('@/lib/server/module-entitlements');
    const due=await queryAsSystem<any>(`select "applicationId","tenantId","userId" from "ApplicationDocumentReminder" where enabled and "nextRunAt"<=$1 and ($3::text is null or "applicationId"=$3) order by "nextRunAt","applicationId" limit $2`,[now,Math.max(1,Math.min(500,limit)),onlyApplicationId??null]);
    let sent=0;
    for(const candidate of due){
        const user=await getCurrentUserById(candidate.userId);
        const moduleEnabled=await isModuleEnabledForTenant(candidate.tenantId,'PRODUCT_CATALOG');
        const delivered=await withTransaction({id:candidate.userId,tenantId:candidate.tenantId},async tx=>{
            // Same lock order as uploads/reviews and reminder settings.
            const application=await queryOne<any>(`select * from "Application" where id=$1 and "tenantId"=$2 for update`,[candidate.applicationId,candidate.tenantId],tx);
            if(!application)return false;
            const reminder=await queryOne<any>(`select * from "ApplicationDocumentReminder" where "applicationId"=$1 and "tenantId"=$2 for update`,[candidate.applicationId,candidate.tenantId],tx);
            if(!reminder?.enabled||new Date(reminder.nextRunAt)>now)return false;
            if(reminder.userId!==candidate.userId)return false;
            if(application.ownerId!==reminder.userId||!user||user.tenantId!==candidate.tenantId||!canUseApplications(user,'read')){
                await execute(`update "ApplicationDocumentReminder" set enabled=false,"updatedAt"=$2 where "applicationId"=$1`,[application.id,now],tx);return false;
            }
            const next=new Date(now.valueOf()+24*60*60*1000);
            await execute(`update "ApplicationDocumentReminder" set "nextRunAt"=$3,"updatedAt"=$4 where "applicationId"=$1 and "tenantId"=$2`,[application.id,candidate.tenantId,next,now],tx);
            const target=await queryOne<any>(`select u.status,u.preferences,t.status as "tenantStatus" from "User" u join "Tenant" t on t.id=u."tenantId" where u.id=$1 and u."tenantId"=$2`,[candidate.userId,candidate.tenantId],tx);
            if(!target||target.status!=='ACTIVE'||target.tenantStatus==='SUSPENDED'||!moduleEnabled)return false;
            if(target.preferences?.notifications?.mutedCategories?.includes('APPLICATIONS'))return false;
            const stage=await queryOne<any>(`select "isClosed","isWon" from "ApplicationStage" where id=$1 and "tenantId"=$2`,[application.stageId,candidate.tenantId],tx);
            if(!stage||stage.isClosed||stage.isWon)return false;
            const outstanding=(await applicationChecklist(user,application,tx)).filter(item=>item.isRequired&&item.status!=='VERIFIED');
            if(!outstanding.length)return false;
            await execute(`insert into "Notification" (id,"tenantId","userId",title,message,data,category,"isRead","createdAt") values ($1,$2,$3,$4,$5,$6,'APPLICATIONS',false,$7)`,[randomUUID(),candidate.tenantId,candidate.userId,'Application documents need attention',`${application.applicationNumber}: ${outstanding.length} required document(s) are missing, awaiting verification, rejected or expired.`,JSON.stringify({entityType:'APPLICATION',entityId:application.id,applicationId:application.id,type:'APPLICATION_DOCUMENT_REMINDER'}),now],tx);
            await execute(`update "ApplicationDocumentReminder" set "lastSentAt"=$3 where "applicationId"=$1 and "tenantId"=$2`,[application.id,candidate.tenantId,now],tx);
            return true;
        });
        if(delivered)sent++;
    }
    return {checked:due.length,sent};
}

export async function getApplicationEligibility(user:ApplicationActor,applicationId:string) {
    const application=await getApplication(user,applicationId);
    if(!application)throw new ApplicationError(404,'Application not found.');
    return evaluateSavedApplicationEligibility(user,application);
}

// Stage transitions call this inside the existing application lock so facts and stage
// changes serialize. Catalog rules are evaluated at the time this query executes.
async function evaluateSavedApplicationEligibility(user:ApplicationActor,application:any,tx?:Queryable) {
    const applicationId=application.id;
    const {eligibilityFactsSchema,evaluateApplicationEligibility}=await import('@/lib/application-eligibility');
    const row=await queryOne<any>(`select "eligibilityFacts","eligibilityVersion" from "Application" where id=$1 and "tenantId"=$2`,[applicationId,user.tenantId],tx);
    if(!row)throw new ApplicationError(404,'Application not found.');
    const facts=eligibilityFactsSchema.parse(row.eligibilityFacts);
    const rules=await query<any>(`select id,name,"minEducationLevel","minPercentage","requiredEntranceExam",criteria from "EligibilityRule" where "tenantId"=$1 and "programId"=$2 and "isActive" and ("courseId" is null or "courseId"=$3) order by "createdAt",id`,[user.tenantId,application.programId,application.courseId],tx);
    return {facts,version:row.eligibilityVersion,evaluation:evaluateApplicationEligibility(facts,rules)};
}

export async function saveApplicationEligibility(user:ApplicationActor,applicationId:string,raw:unknown) {
    await assertApplicationAccess(user,'read');await assertApplicationAccess(user,'update');
    const {eligibilityFactsSchema}=await import('@/lib/application-eligibility');
    const input=z.object({version:z.number().int().min(0),facts:eligibilityFactsSchema}).parse(raw);
    return withTransaction({id:user.id,tenantId:user.tenantId},async tx=>{
        if(!await findApplication(user,applicationId,tx,true))throw new ApplicationError(404,'Application not found.');
        const previous=await queryOne<any>(`select "eligibilityFacts","eligibilityVersion" from "Application" where id=$1 and "tenantId"=$2`,[applicationId,user.tenantId],tx);
        if(previous.eligibilityVersion!==input.version)throw new ApplicationError(409,'Eligibility information changed since you opened it. Discard and reload before editing again.');
        await execute(`update "Application" set "eligibilityFacts"=$3,"eligibilityVersion"="eligibilityVersion"+1,"updatedAt"=now() where id=$1 and "tenantId"=$2`,[applicationId,user.tenantId,JSON.stringify(input.facts)],tx);
        await execute(`insert into "AuditLog" (id,"tenantId","userId",action,"entityType","entityId",before,after,"createdAt") values ($1,$2,$3,'UPDATE','APPLICATION',$4,$5,$6,now())`,[randomUUID(),user.tenantId,user.id,applicationId,JSON.stringify({eligibilityFacts:previous.eligibilityFacts}),JSON.stringify({eligibilityFacts:input.facts})],tx);
        return {version:input.version+1};
    });
}
