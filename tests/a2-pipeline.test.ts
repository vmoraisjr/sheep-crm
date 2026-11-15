import { describe,it,expect } from 'vitest';
import { demoDeals } from '../src/lib/demo/deals';
import { moveDeal } from '../src/lib/crm/deals';
describe('A2 ordered pipeline',()=>{
 it('moves forward, back, maintains totals and logs transitions once',()=>{const initial=demoDeals(),sum=initial.reduce((n,d)=>n+(d.valueCents??0),0);let next=initial;for(const stage of ['qualified','proposal','negotiation','won','new'] as const){next=moveDeal(next,initial[0].id,stage,0);expect(next.find(d=>d.id===initial[0].id)?.stage).toBe(stage);}expect(next.find(d=>d.id===initial[0].id)?.history).toHaveLength(5);expect(next.reduce((n,d)=>n+(d.valueCents??0),0)).toBe(sum);expect(next.find(d=>d.id===initial[0].id)?.status).toBe('open');});
 it('reorders within a column without adding false stage history',()=>{const items=demoDeals(),next=moveDeal(items,items[0].id,'new',2);expect(next.filter(d=>d.stage==='new').sort((a,b)=>a.position-b.position).map(d=>d.id)).toEqual([items[1].id,items[2].id,items[0].id]);expect(next[0].history).toHaveLength(0);expect(items[0].position).toBe(0);});
 it('ignores unknown opportunity ids',()=>{const items=demoDeals();expect(moveDeal(items,'unknown','qualified',0)).toBe(items);});
});
