export const stages=['new','qualified','proposal','negotiation','won','lost'] as const;
export type Stage=typeof stages[number];
export const stageLabels:Record<Stage,string>={new:'Novos leads',qualified:'Qualificação',proposal:'Proposta enviada',negotiation:'Negociação',won:'Ganho',lost:'Perdido'};
export type CRMContact={id:string;name:string;eligible:boolean;tags:string[]};
export type CRMOpportunity={id:string;contactId:string;name:string;stage:Stage;assignee:string;nextAction:string;valueCents:number|null;tags:string[]};
export function syncOpportunities(contacts:CRMContact[],opportunities:CRMOpportunity[]):CRMOpportunity[]{
 const map=new Map(opportunities.map(item=>[item.contactId,item]));
 for(const contact of contacts) if(contact.eligible&&!map.has(contact.id)) map.set(contact.id,{id:`demo-opp:${contact.id}`,contactId:contact.id,name:contact.name,stage:'new',assignee:'',nextAction:'',valueCents:null,tags:contact.tags});
 return [...map.values()];
}
export function summarizeCRM(opportunities:CRMOpportunity[],unanswered:number,followups:number){
 const unique=[...new Map(opportunities.map(item=>[item.contactId,item])).values()];
 const won=unique.filter(item=>item.stage==='won').length;
 return {leads:unique.filter(item=>item.stage==='new').length,pending:unanswered,followups,won,conversion:unique.length?Math.round(won/unique.length*100):0,total:unique.length};
}
