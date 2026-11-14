import { describe,expect,it } from 'vitest';
import { syncOpportunities,summarizeCRM,type CRMOpportunity } from '../src/lib/crm/model';
describe('CRM pipeline',()=>{
 it('creates one opportunity per eligible contact, even with repeat events',()=>{const contacts=[{id:'a',name:'Ana',eligible:true,tags:[]},{id:'a',name:'Ana',eligible:true,tags:[]},{id:'b',name:'Bia',eligible:false,tags:[]}];const first=syncOpportunities(contacts,[]);expect(first).toHaveLength(1);expect(syncOpportunities(contacts,first)).toEqual(first);});
 it('preserves state and counts conversion once per contact',()=>{const opportunities:CRMOpportunity[]=[{id:'1',contactId:'a',name:'Ana',stage:'won',assignee:'',nextAction:'',valueCents:100,tags:[]},{id:'2',contactId:'b',name:'Bia',stage:'new',assignee:'',nextAction:'',valueCents:null,tags:[]}];expect(summarizeCRM([...opportunities,opportunities[0]],2,1)).toEqual({leads:1,pending:2,followups:1,won:1,conversion:50,total:2});expect(syncOpportunities([{id:'a',name:'Ana',eligible:true,tags:[]}],opportunities)[0].stage).toBe('won');});
});
