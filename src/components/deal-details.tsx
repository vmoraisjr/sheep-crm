import { Drawer } from "./a2-ui";
import { money, type Deal } from "@/lib/crm/deals";
import { stageLabels, type Stage } from "@/lib/crm/model";
export function DealDetailsDrawer({
  deal,
  busy,
  simulated,
  move,
  patch,
  onClose,
}: {
  deal: Deal;
  busy: boolean;
  simulated: boolean;
  move: (id: string, to: Stage, index: number) => void;
  patch: (patch: Partial<Deal>) => void;
  onClose: () => void;
}) {
  return (
    <Drawer title={deal.name} onClose={onClose}>
      <p>
        {money(deal.valueCents ?? 0)} ·{" "}
        {deal.company || "Empresa não informada"}
      </p>
      <label>
        Etapa de {deal.name}
        <select
          value={deal.stage}
          disabled={busy}
          onChange={(e) => move(deal.id, e.target.value as Stage, 0)}
        >
          {Object.entries(stageLabels).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Responsável de {deal.name}
        <input
          defaultValue={deal.assignee}
          readOnly={!simulated}
          onBlur={(e) => {
            if (simulated) patch({ assignee: e.target.value });
          }}
        />
      </label>
      <label>
        Valor (R$)
        <input
          type="number"
          min="0"
          step="0.01"
          defaultValue={(deal.valueCents ?? 0) / 100}
          onBlur={(e) => {
            const cents = Math.round(Number(e.target.value) * 100);
            if (Number.isSafeInteger(cents) && cents >= 0)
              patch({ valueCents: cents });
          }}
        />
      </label>
      <label>
        Próxima ação
        <input
          defaultValue={deal.nextAction}
          onBlur={(e) => patch({ nextAction: e.target.value })}
        />
      </label>
      <label>
        Prioridade
        <select
          value={deal.priority}
          onChange={(e) =>
            patch({ priority: e.target.value as Deal["priority"] })
          }
        >
          <option value="high">Alta</option>
          <option value="normal">Normal</option>
          <option value="low">Baixa</option>
        </select>
      </label>
      <label>
        Empresa
        <input
          defaultValue={deal.company}
          onBlur={(e) => patch({ company: e.target.value })}
        />
      </label>
      <label>
        Previsão de fechamento
        <input
          type="date"
          defaultValue={deal.expectedCloseAt?.slice(0, 10)}
          onBlur={(e) =>
            patch({
              expectedCloseAt: e.target.value
                ? new Date(e.target.value + "T12:00:00").toISOString()
                : null,
            })
          }
        />
      </label>
      <h3>Histórico de movimentações</h3>
      <ol>
        {deal.history.map((event) => (
          <li key={event.id}>
            {stageLabels[event.from]} → {stageLabels[event.to]}
            <br />
            {event.actor} · {new Date(event.at).toLocaleString("pt-BR")} ·{" "}
            {event.source}
          </li>
        ))}
      </ol>
      {!deal.history.length && <p>Nenhuma movimentação registrada.</p>}
    </Drawer>
  );
}
