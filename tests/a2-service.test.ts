import {describe,it,expect,vi,afterEach} from 'vitest';
import {dealsService} from '../src/lib/crm/service';
import {demoDeals} from '../src/lib/demo/deals';
afterEach(()=>vi.unstubAllGlobals());
describe('CRM adapter failures',()=>{
 it('propagates rejected API writes so the optimistic caller can restore its snapshot',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:409}));await expect(dealsService(false).save(demoDeals(),{movement:{id:'a',to:'qualified',index:0}})).rejects.toThrow();});
 it('writes stage and position together to the existing endpoint',async()=>{const fetch=vi.fn().mockResolvedValue({ok:true});vi.stubGlobal('fetch',fetch);await dealsService(false).save(demoDeals(),{movement:{id:'a',to:'proposal',index:2}});expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({id:'a',stage:'proposal',position:2});});
 it('does not silently claim persistence when browser storage rejects the write',async()=>{vi.stubGlobal('localStorage',{setItem(){throw Error('Quota exceeded')}});await expect(dealsService(true).save(demoDeals(),{})).rejects.toThrow('Quota');});
});
