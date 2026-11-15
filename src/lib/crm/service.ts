import type { Deal } from "./deals";
import type { Stage } from "./model";
import { normalizeDeal } from "./deals";
import { demoDeals } from "../demo/deals";
export interface DealsService {
  load(): Promise<Deal[]>;
  save(
    next: Deal[],
    change: {
      movement?: { id: string; to: Stage; index: number };
      patch?: { id: string; [key: string]: unknown };
    },
  ): Promise<void>;
}
export function dealsService(simulated: boolean): DealsService {
  return simulated
    ? {
        async load() {
          const saved = localStorage.getItem("a2:deals:v2");
          return (saved ? JSON.parse(saved) : demoDeals()).map(normalizeDeal);
        },
        async save(next) {
          localStorage.setItem("a2:deals:v2", JSON.stringify(next));
        },
      }
    : {
        async load() {
          const response = await fetch("/api/crm");
          if (!response.ok) throw Error("CRM indisponível");
          return (await response.json()).opportunities.map(normalizeDeal);
        },
        async save(_next, { movement, patch }) {
          const response = await fetch("/api/crm", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              movement
                ? {
                    id: movement.id,
                    stage: movement.to,
                    position: movement.index,
                  }
                : patch,
            ),
          });
          if (!response.ok) throw Error("Não foi possível salvar");
        },
      };
}
