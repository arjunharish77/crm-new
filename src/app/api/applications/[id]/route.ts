import { NextResponse } from 'next/server';
import { requireInternalUser } from '@/lib/server/auth';
import { getApplication } from '@/lib/repositories/applications-postgres';
import { query } from '@/lib/db/query';
import { applicationHttpError } from '@/lib/server/application-http';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{const user=await requireInternalUser(request);const {id}=await params;const record=await getApplication(user,id);if(!record)return NextResponse.json({message:'Application not found'},{status:404});const history=await query(`select h.id,h."changedAt",h.notes,s.name as "stageName",u.name as "changedByName" from "ApplicationStageHistory" h join "ApplicationStage" s on s.id=h."toStageId" and s."tenantId"=h."tenantId" left join "User" u on u.id=h."changedById" and u."tenantId"=h."tenantId" where h."tenantId"=$1 and h."applicationId"=$2 order by h."changedAt" desc,h.id limit 100`,[user.tenantId,id]);return NextResponse.json({...record,history});}catch(error){return applicationHttpError(error);}}
