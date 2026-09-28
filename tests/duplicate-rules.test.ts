import { describe,it,expect } from 'vitest';
import { duplicateRuleInput } from '@/lib/duplicate-rules';
import { apiLeadCreate,apiOpportunityCreate,combinedCreate,validIdempotencyKey } from '@/lib/server/create-records';
describe('duplicate rule configuration',()=>{
 const rule={entity:'Lead',name:'Email',fields:['email'],action:'BLOCK',enabled:true};
 it('accepts administrator-selected block or warning behavior',()=>{for(const action of ['BLOCK','WARN'])expect(duplicateRuleInput.safeParse({...rule,action}).success).toBe(true);});
 it('rejects unsupported fields and repeated fields',()=>{for(const fields of [['secret'],['email','email'],[]])expect(duplicateRuleInput.safeParse({...rule,fields}).success).toBe(false);});
 it('accepts composite opportunity rules',()=>expect(duplicateRuleInput.safeParse({...rule,entity:'Opportunity',fields:['leadId','opportunityTypeId']}).success).toBe(true));
 it('requires an optimistic version for edits',()=>expect(duplicateRuleInput.safeParse({...rule,id:'11111111-1111-4111-8111-111111111111'}).success).toBe(false));
});
describe('external create contracts',()=>{
 it('rejects blank names and unknown write fields',()=>{expect(apiLeadCreate.safeParse({name:' '}).success).toBe(false);expect(apiLeadCreate.safeParse({name:'Person',tenantId:'other'}).success).toBe(false);});
 it('rejects invalid amounts and dates',()=>{const base={title:'New',leadId:'lead',opportunityTypeId:'type'};expect(apiOpportunityCreate.safeParse({...base,amount:-1}).success).toBe(false);expect(apiOpportunityCreate.safeParse({...base,expectedCloseDate:'2026-02-30'}).success).toBe(false);expect(apiOpportunityCreate.safeParse({...base,amount:0}).success).toBe(true);});
 it('does not let a combined caller supply a different lead link',()=>expect(combinedCreate.safeParse({lead:{name:'New'},opportunity:{title:'New',opportunityTypeId:'type',leadId:'other'}}).success).toBe(false));
 it('bounds idempotency keys and rejects whitespace/control characters',()=>{expect(validIdempotencyKey('retry-123')).toBe(true);for(const value of ['', 'a\nb','a'.repeat(201)])expect(validIdempotencyKey(value)).toBe(false);});
});
