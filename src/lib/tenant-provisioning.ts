import { z } from 'zod';
import { dependencyViolations } from '@/lib/module-dependencies';
export const TENANT_FEATURE_LABELS = {
 opportunityEnabled:'Opportunities', automationEnabled:'Automations', salesGroupsEnabled:'Sales Groups',
 formBuilderEnabled:'Form Builder', advancedReporting:'Advanced Reporting', apiAccessEnabled:'API Access',
 payoutsEnabled:'Payouts & Commissions', gamificationEnabled:'Gamification',
} as const;
export type TenantFeatureKey = keyof typeof TENANT_FEATURE_LABELS;
export const MODULE_FEATURE_KEYS: Record<string,TenantFeatureKey> = {
 OPPORTUNITIES:'opportunityEnabled', AUTOMATIONS:'automationEnabled', FORMS:'formBuilderEnabled',
 REPORTS:'advancedReporting', PAYOUTS:'payoutsEnabled', GAMIFICATION:'gamificationEnabled',
};
export type PlatformModuleOption = {key:string;name:string;description?:string;category:string;isCore:boolean};
const featureShape = Object.fromEntries(Object.keys(TENANT_FEATURE_LABELS).map(key=>[key,z.boolean().optional()])) as Record<TenantFeatureKey,z.ZodOptional<z.ZodBoolean>>;
export const tenantProvisioningSchema=z.object({
 name:z.string().trim().min(1).max(200),plan:z.enum(['Basic','Pro','Enterprise','BASIC','PRO','ENTERPRISE']).optional(),
 adminName:z.string().trim().min(1).max(200),adminEmail:z.email().trim().max(254),adminPassword:z.string().min(1).max(1024),
 opportunityEnabled:z.boolean().optional(),features:z.object(featureShape).strict().optional(),modules:z.record(z.string().min(1).max(100),z.boolean()).optional(),
 limits:z.object({maxActiveUsers:z.number().int().min(1).max(10_000_000).nullable().optional(),maxPartnerLogins:z.number().int().min(0).max(10_000_000).nullable().optional(),maxStorageMb:z.number().int().min(1).max(10_000_000).nullable().optional(),maxMonthlyMessages:z.number().int().min(0).max(10_000_000).nullable().optional()}).strict().optional(),
}).strict();
export type TenantProvisioningInput=z.infer<typeof tenantProvisioningSchema>;
export function resolveTenantProvisioning(catalog:PlatformModuleOption[], input:TenantProvisioningInput){
 if(!catalog.length)throw new Error('MODULE_CATALOG_UNAVAILABLE');
 const keys=new Set(catalog.map(m=>m.key));
 for(const key of Object.keys(input.modules??{}))if(!keys.has(key))throw new Error('UNKNOWN_MODULE_SELECTION');
 const features:Record<TenantFeatureKey,boolean>={opportunityEnabled:input.opportunityEnabled??true,automationEnabled:true,salesGroupsEnabled:true,formBuilderEnabled:true,advancedReporting:true,apiAccessEnabled:false,payoutsEnabled:true,gamificationEnabled:true,...input.features};
 const modules=catalog.map(module=>{
  const feature=MODULE_FEATURE_KEYS[module.key];
  const enabled=input.modules?.[module.key]??(feature?features[feature]:true);
  if(module.isCore&&!enabled)throw new Error('CORE_MODULE_CANNOT_BE_DISABLED');
  if(feature)features[feature]=enabled;
  return {moduleKey:module.key,status:enabled?'ENABLED' as const:'DISABLED' as const};
 });
 const names=Object.fromEntries(catalog.map(m=>[m.key,m.name]));
 const violations=dependencyViolations(Object.fromEntries(modules.map(m=>[m.moduleKey,m.status==='ENABLED'])),key=>names[key]??key);
 if(violations.length)throw new Error(`MODULE_DEPENDENCY: ${violations.map(v=>v.message).join(' ')}`);
 return {features,modules};
}

// The features a workspace has. The six that are modules follow the module alone (decision 15,
// migration 0126); the stored flag values for them are ignored.
export function effectiveTenantFeatures(features:Record<string,boolean>, statuses:Record<string,string>){
 const result={...features};
 for(const [module,feature] of Object.entries(MODULE_FEATURE_KEYS))result[feature]=statuses[module]!=='DISABLED'&&statuses[module]!=='SUSPENDED';
 return result;
}

/** Operator-facing limits: catalog membership is not proof of complete feature delivery. */
export const MODULE_COVERAGE_NOTES:Record<string,string>={
 TELEPHONY:'Off: call center, campaigns, scripts, dispositions, recordings, click-to-call and telephony reports are blocked, and provider call events are refused. Existing call activities stay on lead timelines.',
 DATA_PLATFORM:'Off: outbound webhooks (pending deliveries are cancelled), inbound lead capture, external push and the dedupe & merge center are blocked. Imports, exports, audit logs and GDPR requests stay available.',
 COUNSELING:'Catalog entry for counseling workflows; the full workspace is not yet available.',
 QUALITY_MANAGEMENT:'Catalog entry for quality workflows; the full workspace is not yet available.',
 DEVOPS_OPS:'Catalog entry for operations workflows; the full workspace is not yet available.',
};
