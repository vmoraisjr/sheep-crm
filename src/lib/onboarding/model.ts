export type IntegrationState = 'disconnected' | 'pending_permissions' | 'connected';
export interface CompanyDraft {
  companyName: string;
  website: string;
  documents: string;
  products: string;
  hours: string;
  faq: string;
  rules: string;
}
export interface OnboardingRecord {
  organization_id: string;
  draft: CompanyDraft;
  revision: number;
  approved_revision: number | null;
  approved_at: string | null;
  agent_enabled: boolean;
  whatsapp_state: IntegrationState;
  instagram_state: IntegrationState;
}
export const emptyDraft: CompanyDraft = {companyName:'',website:'',documents:'',products:'',hours:'',faq:'',rules:''};
export function validateDraft(value: unknown): CompanyDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Dados inválidos');
  const data = value as Record<string,unknown>;
  const result = {...emptyDraft};
  for (const key of Object.keys(result) as (keyof CompanyDraft)[]) {
    if (typeof data[key] !== 'string' || data[key].length > 20000) throw new Error(`Campo inválido: ${key}`);
    result[key] = data[key].trim();
  }
  if (!result.companyName || !result.faq || !result.rules) throw new Error('Empresa, FAQ e regras são obrigatórias');
  if (result.website && !/^https?:\/\//.test(result.website)) throw new Error('Informe URL HTTP(S)');
  return result;
}
export function approvedContext(record: OnboardingRecord): string | null {
  if (!record.agent_enabled || record.approved_revision !== record.revision || !record.approved_at) return null;
  return [record.draft.companyName,record.draft.documents,record.draft.products,record.draft.hours,record.draft.faq,record.draft.rules].filter(Boolean).join('\n\n');
}
