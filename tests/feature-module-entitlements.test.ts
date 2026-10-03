import { beforeEach,describe,it,expect,vi } from 'vitest';
const mocks=vi.hoisted(()=>({flags:vi.fn(),enabled:vi.fn()}));
vi.mock('@/lib/server/admin',()=>({getTenantFeatureFlags:mocks.flags}));
vi.mock('@/lib/server/module-entitlements',()=>({isModuleEnabledForTenant:mocks.enabled}));
import { isFeatureEnabledForTenant,assertFeatureEnabled } from '@/lib/server/entitlements';
import { MODULE_FEATURE_KEYS } from '@/lib/tenant-provisioning';
beforeEach(()=>{vi.clearAllMocks();mocks.flags.mockResolvedValue({});mocks.enabled.mockResolvedValue(true);});
describe('legacy features and module entitlements',()=>{
 it('checks the matching catalog entitlement for each mapped feature',async()=>{for(const [module,feature] of Object.entries(MODULE_FEATURE_KEYS)){if(feature==='salesGroupsEnabled')continue;await isFeatureEnabledForTenant('tenant',feature as Parameters<typeof isFeatureEnabledForTenant>[1]);expect(mocks.enabled).toHaveBeenLastCalledWith('tenant',module);}});
 it('does not allow an enabled flag to bypass a disabled module',async()=>{mocks.flags.mockResolvedValue({opportunityEnabled:true});mocks.enabled.mockResolvedValue(false);await expect(assertFeatureEnabled('tenant','opportunityEnabled')).rejects.toThrow('FEATURE_DISABLED');});
 // Decision 15: a feature that is a module follows the module alone; its old flag is ignored.
 it('follows the module for a feature that is a module, ignoring its old flag',async()=>{mocks.flags.mockResolvedValue({opportunityEnabled:false});mocks.enabled.mockResolvedValue(true);expect(await isFeatureEnabledForTenant('tenant','opportunityEnabled')).toBe(true);expect(mocks.enabled).toHaveBeenCalledWith('tenant','OPPORTUNITIES');mocks.enabled.mockResolvedValue(false);expect(await isFeatureEnabledForTenant('tenant','opportunityEnabled')).toBe(false);});
 it('keeps API Access independently controlled',async()=>{mocks.flags.mockResolvedValue({apiAccessEnabled:false});expect(await isFeatureEnabledForTenant('tenant','apiAccessEnabled')).toBe(false);expect(mocks.enabled).not.toHaveBeenCalled();});
});
