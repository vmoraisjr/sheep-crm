import {describe,it,expect} from 'vitest';
import {usageReport,type MeterEvent} from './limits';
const event=(organization_id:string,event_key:string):MeterEvent=>({organization_id,event_key,kind:'automated_conversation',quantity:1,cost_micros:0,created_at:'2026-11-14T10:00:00Z'});
describe('three tenant usage reports',()=>{
 it('isolates 3 tenants, deduplicates, excludes other billing periods',()=>{
  const events=[event('a','one'),event('a','one'),event('b','one'),event('c','one'),{...event('a','old'),created_at:'2026-10-01T00:00:00Z'}];
  for(const org of ['a','b','c']){const report=usageReport(org,events,1,'hard',new Date('2026-11-14T00:00:00Z'));expect(report.automatedConversations).toBe(1);expect(report.remaining).toBe(0);expect(report.exceeded).toBe(true);expect(report.billingEnabled).toBe(false);}
 });
 it('keeps soft cap observable without billing',()=>{expect(usageReport('a',[event('a','1'),event('a','2')],1,'soft',new Date('2026-11-14T00:00:00Z'))).toMatchObject({automatedConversations:2,remaining:0,mode:'soft',billingEnabled:false});});
});
