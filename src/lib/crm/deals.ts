import type { CRMOpportunity, Stage } from "./model";
export type Movement = {
  id: string;
  opportunityId: string;
  from: Stage;
  to: Stage;
  actor: string;
  at: string;
  source: "manual" | "api" | "automation";
};
export type Deal = CRMOpportunity & {
  pipelineId: string;
  position: number;
  companyId: string | null;
  company: string;
  channel: "whatsapp" | "instagram";
  priority: "high" | "normal" | "low";
  status: "open" | "won" | "lost";
  createdAt: string;
  lastInteractionAt: string;
  followupAt: string | null;
  expectedCloseAt: string | null;
  history: Movement[];
};
export const pipelineStages = [
  { id: "new", name: "Novos leads", color: "#4b6bfb" },
  { id: "qualified", name: "Qualificação", color: "#8658d9" },
  { id: "proposal", name: "Proposta enviada", color: "#e8a15b" },
  { id: "negotiation", name: "Negociação", color: "#16835a" },
  { id: "won", name: "Fechado ganho", color: "#16835a" },
] as const;
export function normalizeDeal(item: CRMOpportunity, index: number): Deal {
  return {
    pipelineId: "default",
    position: index,
    companyId: null,
    company: "",
    channel: "whatsapp",
    priority: "normal",
    status:
      item.stage === "won" ? "won" : item.stage === "lost" ? "lost" : "open",
    createdAt: new Date().toISOString(),
    lastInteractionAt: new Date().toISOString(),
    followupAt: null,
    expectedCloseAt: null,
    history: [],
    ...item,
  } as Deal;
}
export function moveDeal(
  items: Deal[],
  id: string,
  to: Stage,
  index: number,
  actor = "Você",
  at = new Date().toISOString(),
): Deal[] {
  const current = items.find((item) => item.id === id);
  if (!current) return items;
  const target = items
    .filter((item) => item.stage === to && item.id !== id)
    .sort((a, b) => a.position - b.position);
  const changed = {
    ...current,
    stage: to,
    status:
      to === "won"
        ? ("won" as const)
        : to === "lost"
          ? ("lost" as const)
          : ("open" as const),
    history:
      current.stage === to
        ? current.history
        : [
            ...current.history,
            {
              id: crypto.randomUUID(),
              opportunityId: id,
              from: current.stage,
              to,
              actor,
              at,
              source: "manual" as const,
            },
          ],
  };
  target.splice(Math.max(0, Math.min(index, target.length)), 0, changed);
  const positions = new Map(
    target.map((item, position) => [item.id, { ...item, position }]),
  );
  return items.map((item) => positions.get(item.id) ?? item);
}
export const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(cents / 100);
