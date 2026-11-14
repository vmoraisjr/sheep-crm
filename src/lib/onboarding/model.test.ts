import {describe,it,expect} from 'vitest';
import {emptyDraft,validateDraft,approvedContext, type OnboardingRecord} from './model';
describe('onboarding approval',()=>{
 it('rejects missing facts and untrusted types',()=>{
  expect(()=>validateDraft(emptyDraft)).toThrow();
  expect(()=>validateDraft({...emptyDraft,companyName:'A',faq:'B',rules:'C',products:[]})).toThrow();
 });
 it('uses only supplied facts and invalidates edited approval',()=>{
  const draft=validateDraft({...emptyDraft,companyName:'A',faq:'Pergunte ao vendedor',rules:'Transferir desconhecido'});
  const record:OnboardingRecord={organization_id:'a',draft,revision:1,approved_revision:null,approved_at:null,agent_enabled:false,whatsapp_state:'disconnected',instagram_state:'disconnected'};
  expect(approvedContext(record)).toBeNull();
  expect(approvedContext({...record,approved_revision:1,approved_at:'2026-01-01',agent_enabled:true})).toContain(draft.faq);
  expect(approvedContext({...record,revision:2,approved_revision:1,approved_at:'2026-01-01',agent_enabled:true})).toBeNull();
 });
});
