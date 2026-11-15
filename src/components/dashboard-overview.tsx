import { pipelineStages, money, type Deal } from "@/lib/crm/deals";
export function DashboardOverview({
  items,
  total,
  won,
  contacts,
  setSelected,
}: {
  items: Deal[];
  total: number;
  won: number;
  contacts: number;
  setSelected: (id: string) => void;
}) {
  return (
    <>
      <div className="sheep-metrics">
        {[
          ["Receita prevista", money(total)],
          [
            "Negócios ativos",
            items.filter((item) => !["won", "lost"].includes(item.stage))
              .length,
          ],
          ["Total de contatos", contacts],
          [
            "Taxa de conversão",
            `${items.length ? Math.round((won / items.length) * 100) : 0}%`,
          ],
        ].map(([label, value]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>Calculado com os dados disponíveis</small>
          </article>
        ))}
      </div>
      <div className="dashboard-panels">
        <section className="dashboard-chart">
          <h2>Pipeline de vendas</h2>
          <p>Distribuição dos negócios por etapa</p>
          <div className="chart-bars">
            {pipelineStages.map((stage) => {
              const count = items.filter(
                (item) => item.stage === stage.id,
              ).length;
              return (
                <div key={stage.id}>
                  <strong>{count}</strong>
                  <div
                    style={{
                      height: `${Math.max(4, (count / Math.max(1, ...pipelineStages.map((s) => items.filter((i) => i.stage === s.id).length))) * 210)}px`,
                      background: stage.color,
                    }}
                  />
                  <span>{stage.name}</span>
                </div>
              );
            })}
          </div>
        </section>
        <section className="dashboard-activities">
          <h2>Próximas atividades</h2>
          {items
            .filter((item) => item.followupAt)
            .sort(
              (a, b) => Date.parse(a.followupAt!) - Date.parse(b.followupAt!),
            )
            .slice(0, 5)
            .map((item) => (
              <button key={item.id} onClick={() => setSelected(item.id)}>
                <strong>{item.nextAction || "Acompanhar oportunidade"}</strong>
                <span>
                  {item.name} ·{" "}
                  {new Date(item.followupAt!).toLocaleString("pt-BR")}
                </span>
              </button>
            ))}
          {!items.some((item) => item.followupAt) && (
            <p>Nenhum acompanhamento agendado.</p>
          )}
        </section>
      </div>
    </>
  );
}
