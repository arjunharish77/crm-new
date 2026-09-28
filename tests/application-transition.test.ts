import { describe,it,expect } from 'vitest';
import { applicationTransitionSchema } from '../src/lib/repositories/applications-postgres';
import { canUseApplications } from '../src/lib/application-access';
describe('application transition input',()=>{
 const input={expectedStageId:'initial',stageId:'review',reason:' Ready for review '};
 it('trims the required reason',()=>expect(applicationTransitionSchema.parse(input).reason).toBe('Ready for review'));
 it.each(['','  ','ab','x'.repeat(2001)])('rejects invalid reason length',reason=>expect(applicationTransitionSchema.safeParse({...input,reason}).success).toBe(false));
 it('requires the expected stage for stale-write detection',()=>expect(applicationTransitionSchema.safeParse({stageId:'review',reason:'Review'}).success).toBe(false));
 it('does not infer update from read or create',()=>expect(canUseApplications({tenantId:'t',role:{permissions:{modules:{applications:{read:true,create:true}}}}},'update')).toBe(false));
 it('supports update independently from manage',()=>{const actor={tenantId:'t',role:{permissions:{modules:{applications:{read:true,update:true}}}}};expect(canUseApplications(actor,'update')).toBe(true);expect(canUseApplications(actor,'manage')).toBe(false);});
});
