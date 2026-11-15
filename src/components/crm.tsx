"use client";
import { useNow } from "@/hooks/use-now";
import { useEffect, useState } from "react";
import { Navigation, Drawer } from "./a2-ui";
import { LiveDealForm } from "./live-deal-form";
import { StageRules } from "./stage-rules";
import { DashboardOverview } from "./dashboard-overview";
import { DealDetailsDrawer } from "./deal-details";
import { KanbanBoard } from "./kanban";
import { dealsService } from "@/lib/crm/service";
import { normalizeDeal, moveDeal, money, type Deal } from "@/lib/crm/deals";
import { type Stage } from "@/lib/crm/model";
import "./workspace.css";
export function CRM({
  dashboard = false,
  simulated = false,
  initialId = "",
}: {
  dashboard?: boolean;
  simulated?: boolean;
  initialId?: string;
}) {
  const now = useNow();
  const [items, setItems] = useState<Deal[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(initialId),
    [query, setQuery] = useState(""),
    [owner, setOwner] = useState(""),
    [channel, setChannel] = useState(""),
    [priority, setPriority] = useState(""),
    [period, setPeriod] = useState(""),
    [followup, setFollowup] = useState(""),
    [creating, setCreating] = useState(false),
    [rulesOpen, setRulesOpen] = useState(false);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const data = await dealsService(simulated).load();
        if (active) {
          setItems(data.map(normalizeDeal));
          const requested = new URLSearchParams(window.location.search).get(
            "id",
          );
          if (requested) setSelected(requested);
        }
      } catch {
        if (active)
          setError(
            "Não foi possível carregar o CRM. Verifique a conexão e tente novamente.",
          );
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [simulated]);
  async function persist(
    next: Deal[],
    movement?: { id: string; to: Stage; index: number },
    patch?: { id: string; [key: string]: unknown },
  ) {
    if (busy) return;
    const before = items;
    setItems(next);
    setBusy(true);
    setError("");
    try {
      await dealsService(simulated).save(next, { movement, patch });
      if (!simulated) {
        try {
          setItems(await dealsService(false).load());
        } catch {
          /* A confirmed write must not be reverted merely because refreshing fails. */
        }
      }
      setNotice("Alteração salva.");
    } catch {
      setItems(before);
      setError("Não foi possível salvar. A alteração foi desfeita.");
    } finally {
      setBusy(false);
    }
  }
  function move(id: string, to: Stage, index: number) {
    void persist(moveDeal(items, id, to, index), { id, to, index });
  }
  const visible = items.filter(
    (item) =>
      (!query ||
        `${item.name} ${item.company}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (!owner || item.assignee === owner) &&
      (!channel || item.channel === channel) &&
      (!priority || item.priority === priority) &&
      (!period ||
        Date.parse(item.createdAt) >= now - Number(period) * 86400000) &&
      (!followup ||
        (followup === "overdue"
          ? !!item.followupAt && Date.parse(item.followupAt) < now
          : !!item.followupAt)),
  );
  const deal = items.find((item) => item.id === selected),
    won = items.filter((item) => item.stage === "won").length,
    total = items.reduce(
      (sum, item) =>
        sum +
        (item.stage !== "won" && item.stage !== "lost"
          ? (item.valueCents ?? 0)
          : 0),
      0,
    ),
    contacts = new Set(items.map((item) => item.contactId)).size;
  function patch(value: Partial<Deal>) {
    if (!deal) return;
    void persist(
      items.map((item) => (item.id === deal.id ? { ...item, ...value } : item)),
      undefined,
      { id: deal.id, ...value },
    );
  }
  return (
    <main className="sheep-workspace">
      <Navigation
        simulated={simulated}
        active={dashboard ? "dashboard" : "deals"}
      />
      <section className="sheep-main">
        <div className="a2-topbar">
          <span>Workspace / {dashboard ? "Visão geral" : "Negócios"}</span>
          <input
            aria-label="Buscar no CRM"
            placeholder="⌕  Buscar no CRM"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <header className="sheep-header">
          <div>
            <h1>
              {dashboard ? (
                simulated ? (
                  <>
                    <span className="desktop-greeting">Bom dia, Ana 👋</span>
                    <span className="mobile-greeting">Olá, Ana! 👋</span>
                  </>
                ) : (
                  "Visão geral"
                )
              ) : (
                "Funil de Negócios"
              )}
            </h1>
            <p>
              {dashboard
                ? "Veja o que está acontecendo com seu time hoje."
                : "Acompanhe oportunidades e próximos passos em um só lugar"}
            </p>
          </div>
          <button className="sheep-primary" onClick={() => setCreating(true)}>
            + Novo negócio
          </button>
        </header>
        {simulated && (
          <div className="sheep-demo-banner">
            <strong>Demonstração.</strong> Dados fictícios salvos neste
            navegador. Nenhuma integração externa ativa.
          </div>
        )}
        {error && (
          <p className="sheep-error" role="alert">
            {error}
          </p>
        )}
        <p className="sheep-sr" role="status">
          {notice}
        </p>
        {loading ? (
          <p className="sheep-empty" role="status">
            Carregando oportunidades…
          </p>
        ) : dashboard ? (
          <DashboardOverview
            items={items}
            total={total}
            won={won}
            contacts={contacts}
            setSelected={setSelected}
          />
        ) : (
          <>
            <div className="pipeline-heading-row">
              <h2 className="pipeline-heading">Pipeline comercial</h2>
              <button
                className="sheep-toggle"
                onClick={() => setRulesOpen(true)}
              >
                ✦ Automações
              </button>
            </div>
            <div className="pipeline-summary">
              <span>{items.length} oportunidades</span>
              <span>{money(total)} em aberto</span>
              <span>
                {
                  items.filter(
                    (item) =>
                      item.followupAt && Date.parse(item.followupAt) < now,
                  ).length
                }{" "}
                follow-ups atrasados
              </span>
            </div>
            <div className="deal-filters">
              <select aria-label="Pipeline">
                <option value="default">Pipeline padrão</option>
              </select>
              <select
                aria-label="Responsável"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
              >
                <option value="">Todos os responsáveis</option>
                {[...new Set(items.map((i) => i.assignee).filter(Boolean))].map(
                  (name) => (
                    <option key={name}>{name}</option>
                  ),
                )}
              </select>
              <select
                aria-label="Canal"
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
              >
                <option value="">Todos os canais</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="instagram">Instagram</option>
              </select>
              <select
                aria-label="Prioridade"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                <option value="">Prioridades</option>
                <option value="high">Alta</option>
                <option value="normal">Normal</option>
                <option value="low">Baixa</option>
              </select>
              <select
                aria-label="Período"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              >
                <option value="">Todo o período</option>
                <option value="7">Últimos 7 dias</option>
                <option value="30">Últimos 30 dias</option>
              </select>
              <select
                aria-label="Follow-up"
                value={followup}
                onChange={(e) => setFollowup(e.target.value)}
              >
                <option value="">Todos os follow-ups</option>
                <option value="overdue">Atrasados</option>
                <option value="scheduled">Agendados</option>
              </select>
              <input
                aria-label="Buscar oportunidade"
                placeholder="⌕ Buscar oportunidade"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <KanbanBoard
              items={visible}
              allItems={items}
              disabled={busy}
              move={move}
              open={setSelected}
            />
            {!visible.length && (
              <p className="sheep-empty">Nenhuma oportunidade encontrada.</p>
            )}
          </>
        )}
        {deal && (
          <DealDetailsDrawer
            deal={deal}
            busy={busy}
            simulated={simulated}
            move={move}
            patch={patch}
            onClose={() => setSelected("")}
          />
        )}
        {rulesOpen && (
          <StageRules
            simulated={simulated}
            onClose={() => setRulesOpen(false)}
          />
        )}
        {creating && (
          <Drawer title="Novo negócio" onClose={() => setCreating(false)}>
            {simulated ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  const item = normalizeDeal(
                    {
                      id: crypto.randomUUID(),
                      contactId: crypto.randomUUID(),
                      name: String(form.get("title")),
                      stage: "new",
                      assignee: "",
                      nextAction: "",
                      valueCents: Math.round(Number(form.get("value")) * 100),
                      tags: [],
                    },
                    items.length,
                  );
                  void persist([...items, item]);
                  setCreating(false);
                }}
              >
                <label>
                  Nome do negócio
                  <input required name="title" maxLength={200} />
                </label>
                <label>
                  Valor estimado
                  <input
                    name="value"
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue="0"
                  />
                </label>
                <button className="sheep-primary">
                  Criar negócio de demonstração
                </button>
              </form>
            ) : (
              <LiveDealForm
                items={items}
                onSaved={(id) => {
                  void dealsService(false)
                    .load()
                    .then(setItems)
                    .catch(() =>
                      setError("Não foi possível atualizar a lista."),
                    );
                  setCreating(false);
                  setSelected(id);
                }}
              />
            )}
          </Drawer>
        )}
      </section>
    </main>
  );
}
