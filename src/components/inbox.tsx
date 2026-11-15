"use client";
import { useEffect, useRef, useState } from "react";
import {
  demoConversations,
  filterConversations,
  manualReply,
  type InboxConversation,
} from "@/lib/demo/inbox";
import { stageLabels, type Stage } from "@/lib/crm/model";
import { Navigation, Drawer } from "./a2-ui";
import { ConversationDeal } from "./conversation-deal";
import { Followups } from "./followups";
import "./workspace.css";
const labels: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
};
export function Inbox({ simulated = false }: { simulated?: boolean }) {
  const [items, setItems] = useState<InboxConversation[]>([]);
  const [selectedId, select] = useState("");
  const [filter, setFilter] = useState("all");
  const [responsible, setResponsible] = useState("");
  const [query, search] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const requestKey = useRef<string | null>(null);
  const [sending, setSending] = useState(false);
  const [mobile, setMobile] = useState("list");
  const [suggestion, setSuggestion] = useState(false);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        if (simulated) {
          let data = demoConversations;
          try {
            const saved = localStorage.getItem("sheep:inbox:demo:v1");
            if (saved) {
              const parsed = JSON.parse(saved);
              if (
                Array.isArray(parsed) &&
                parsed.every(
                  (item) =>
                    typeof item.id === "string" && Array.isArray(item.messages),
                )
              )
                data = parsed;
            }
          } catch {
            /* corrupted demo storage resets safely */
          }
          try {
            const crm = JSON.parse(
              localStorage.getItem("a2:deals:v2") ?? "[]",
            ) as {
              contactId: string;
              stage: string;
              nextAction: string;
              tags: string[];
            }[];
            data = data.map((item) => ({
              ...item,
              opportunity: crm.find((opp) => opp.contactId === item.contactId),
            }));
          } catch {
            /* optional CRM context */
          }
          if (active) {
            setItems(data);
            select(data[0]?.id ?? "");
          }
        } else {
          const result = await fetch("/api/inbox");
          if (!result.ok)
            throw new Error(
              "Não foi possível carregar as conversas. Verifique sua sessão e tente novamente.",
            );
          const data: InboxConversation[] = await result.json();
          if (active) {
            setItems(data);
            select(data[0]?.id ?? "");
          }
        }
      } catch (failure) {
        if (active)
          setError(
            failure instanceof Error ? failure.message : "Falha ao carregar.",
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
  function persist(next: InboxConversation[]) {
    setItems(next);
    if (simulated) {
      try {
        localStorage.setItem("sheep:inbox:demo:v1", JSON.stringify(next));
      } catch {
        setNotice(
          "Alterações disponíveis nesta sessão; armazenamento local indisponível.",
        );
      }
    }
  }
  const selected = items.find((item) => item.id === selectedId);
  async function update(patch: Partial<InboxConversation>) {
    if (!selected) return;
    if (!simulated) {
      const response = await fetch(`/api/inbox/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiPaused: patch.aiPaused,
          attendanceState: patch.attendanceState,
          handoff: patch.handoff,
          ...(patch.assignee !== undefined
            ? { assignToMe: !!patch.assignee }
            : {}),
        }),
      });
      if (!response.ok) {
        setError("Não foi possível salvar a alteração.");
        return;
      }
    }
    persist(
      items.map((item) =>
        item.id === selected.id ? { ...item, ...patch } : item,
      ),
    );
  }
  async function reply(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!selected || sending) return;
    if (!simulated) {
      setSending(true);
      requestKey.current ??= crypto.randomUUID();
      try {
        const result = await fetch(`/api/inbox/${selected.id}/reply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: draft,
            idempotencyKey: requestKey.current,
          }),
        });
        const data = await result.json();
        if (!result.ok || data.status !== "sent") {
          setError(data.error ?? "Envio não confirmado.");
          return;
        }
        const message = {
          author: "human" as const,
          id: data.messageId,
          text: draft.trim(),
          direction: "outbound" as const,
          at: new Date().toISOString(),
          origin: data.origin as "meta" | "simulated",
          status: "sent",
        };
        persist(
          items.map((item) =>
            item.id === selected.id
              ? {
                  ...item,
                  unread: false,
                  aiPaused: true,
                  messages: [...item.messages, message],
                }
              : item,
          ),
        );
        setDraft("");
        requestKey.current = null;
        setNotice(
          data.origin === "simulated"
            ? "Resposta simulada registrada."
            : "Resposta aceita pelo provedor oficial.",
        );
      } catch {
        setError(
          "Resultado de envio desconhecido. Confira o histórico antes de reenviar.",
        );
      } finally {
        setSending(false);
      }
      return;
    }
    try {
      const next = manualReply(
        selected,
        draft,
        crypto.randomUUID(),
        new Date().toISOString(),
      );
      persist(items.map((item) => (item.id === next.id ? next : item)));
      setDraft("");
      setNotice(
        "Resposta simulada adicionada. IA pausada pela intervenção humana.",
      );
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Falha ao responder.",
      );
    }
  }
  const visible = filterConversations(items, filter, query).filter(
    (item) => !responsible || item.assignee === responsible,
  );
  return (
    <main className="sheep-workspace">
      <Navigation simulated={simulated} active="conversations" />
      <section className="sheep-main">
        <header className="sheep-header">
          <div>
            <span className="sheep-eyebrow">CENTRAL DE ATENDIMENTO</span>
            <h1>Central de Conversas</h1>
            <p>WhatsApp + Instagram • atendimento inteligente</p>
          </div>
          <span className="sheep-status">
            {simulated ? "Ambiente de demonstração" : "Workspace autenticado"}
          </span>
        </header>
        {simulated && (
          <div className="sheep-demo-banner" role="note">
            <strong>Dados e envios simulados.</strong> WhatsApp e Instagram não
            estão conectados. As alterações ficam somente neste navegador.
          </div>
        )}
        {error && (
          <div className="sheep-error" role="alert">
            {error}
            <button onClick={() => setError("")} aria-label="Fechar erro">
              ×
            </button>
          </div>
        )}
        <div className="sheep-sr" role="status" aria-live="polite">
          {notice}
        </div>
        <div className={`sheep-inbox mobile-${mobile}`}>
          <section className="sheep-conversation-list" aria-label="Conversas">
            <div className="sheep-list-top">
              <h2>
                Caixa de entrada{" "}
                <span>{items.filter((item) => item.unread).length}</span>
              </h2>
              <label className="sheep-sr" htmlFor="conversation-search">
                Buscar conversas
              </label>
              <input
                id="conversation-search"
                placeholder="Buscar por nome ou mensagem"
                value={query}
                onChange={(event) => search(event.target.value)}
              />
              <div className="sheep-filters" aria-label="Filtrar conversas">
                {[
                  ["all", "Todas"],
                  ["whatsapp", "WhatsApp"],
                  ["instagram", "Instagram"],
                  ["unanswered", "Não respondidos"],
                  ["ai", "Atendimento por IA"],
                  ["human", "Atendimento humano"],
                  ["waiting-customer", "Aguardando cliente"],
                  ["waiting-agent", "Aguardando atendente"],
                  ["paused", "Pausado"],
                  ["closed", "Encerrado"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    aria-pressed={filter === key}
                    onClick={() => setFilter(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <select
                aria-label="Filtrar por responsável"
                value={responsible}
                onChange={(e) => setResponsible(e.target.value)}
              >
                <option value="">Todos os responsáveis</option>
                {[
                  ...new Set(
                    items.map((item) => item.assignee).filter(Boolean),
                  ),
                ].map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </div>
            {loading ? (
              <p role="status" className="sheep-empty">
                Carregando conversas…
              </p>
            ) : visible.length === 0 ? (
              <p className="sheep-empty">Nenhuma conversa encontrada.</p>
            ) : (
              visible.map((item) => (
                <button
                  key={item.id}
                  className={`sheep-conversation ${selected?.id === item.id ? "is-selected" : ""}`}
                  onClick={() => {
                    select(item.id);
                    setMobile("thread");
                    setDraft("");
                    setError("");
                  }}
                  aria-pressed={selected?.id === item.id}
                >
                  <span className={`sheep-avatar ${item.channel}`}>
                    {item.name
                      .split(" ")
                      .map((part) => part[0])
                      .slice(0, 2)
                      .join("")}
                  </span>
                  <span className="sheep-preview">
                    <strong>{item.name}</strong>
                    <small>
                      {labels[item.channel]} ·{" "}
                      {item.messages.at(-1)?.at
                        ? new Date(item.messages.at(-1)!.at).toLocaleTimeString(
                            "pt-BR",
                            { hour: "2-digit", minute: "2-digit" },
                          )
                        : ""}{" "}
                      {item.unread && "· Pendente"}
                    </small>
                    <span>{item.messages.at(-1)?.text}</span>
                  </span>
                  {item.unread && (
                    <span
                      className="sheep-unread"
                      aria-label="Não respondida"
                    />
                  )}
                </button>
              ))
            )}
          </section>
          {selected ? (
            <section
              className="sheep-thread"
              aria-label={`Conversa com ${selected.name}`}
            >
              <button className="mobile-back" onClick={() => setMobile("list")}>
                ← Caixa de entrada
              </button>
              <header className="sheep-thread-header">
                <div>
                  <h2>{selected.name}</h2>
                  <span>
                    {labels[selected.channel]} ·{" "}
                    {simulated
                      ? "Simulado"
                      : selected.connectionStatus === "connected"
                        ? "Canal oficial"
                        : "Canal sem conexão oficial ativa"}
                  </span>
                </div>
                <button
                  className="sheep-toggle"
                  aria-pressed={!selected.aiPaused}
                  onClick={() =>
                    void update({
                      aiPaused: !selected.aiPaused,
                      attendanceState: selected.aiPaused ? "ai" : "paused",
                    })
                  }
                >
                  IA {selected.aiPaused ? "pausada" : "ativa"}
                </button>
              </header>
              <div className="inbox-actions">
                <strong className="attendance-state">
                  {selected.attendanceState === "closed"
                    ? "Encerrado"
                    : selected.attendanceState === "human"
                      ? "Humano ativo"
                      : selected.aiPaused
                        ? "Pausado"
                        : "IA ativa"}
                </strong>
                <button
                  onClick={() =>
                    void update({
                      aiPaused: true,
                      attendanceState: "human",
                      assignee: "Você",
                    })
                  }
                >
                  Assumir conversa
                </button>
                <button
                  onClick={() =>
                    void update({ aiPaused: true, attendanceState: "paused" })
                  }
                >
                  Pausar automação
                </button>
                <button
                  onClick={() =>
                    void update({ aiPaused: false, attendanceState: "ai" })
                  }
                >
                  Retomar IA
                </button>
                <button
                  onClick={() =>
                    void update({ aiPaused: true, attendanceState: "closed" })
                  }
                >
                  Encerrar atendimento
                </button>
                <button onClick={() => setMobile("contact")}>
                  Detalhes do contato
                </button>
              </div>
              <div
                className="sheep-timeline"
                role="log"
                aria-label="Histórico de mensagens"
              >
                {selected.messages.map((message) => (
                  <article
                    key={message.id}
                    className={`sheep-message ${message.direction}`}
                  >
                    <p className="message-author">
                      {message.direction === "inbound"
                        ? selected.name
                        : message.author === "ai"
                          ? "A2 IA ✦"
                          : message.author === "human"
                            ? "Atendente humano"
                            : "Origem do autor não informada"}
                    </p>
                    <p>{message.text}</p>
                    <footer>
                      <time dateTime={message.at}>
                        {new Date(message.at).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>{" "}
                      · {message.origin === "simulated" ? "Simulado" : "Meta"}{" "}
                      {message.status && `· ${message.status}`}
                    </footer>
                  </article>
                ))}
              </div>
              <form className="sheep-compose" onSubmit={reply}>
                <button
                  type="button"
                  className="sheep-toggle"
                  onClick={() => setSuggestion(true)}
                >
                  ✦ Sugerir resposta
                </button>
                <label htmlFor="reply">Resposta manual</label>
                <textarea
                  id="reply"
                  value={draft}
                  maxLength={4096}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Escreva sua mensagem…"
                  rows={3}
                />
                <div>
                  <small>A intervenção humana pausa a IA.</small>
                  <button
                    className="sheep-primary"
                    disabled={
                      !draft.trim() ||
                      sending ||
                      selected.attendanceState === "closed"
                    }
                    type="submit"
                  >
                    {simulated ? "Simular envio" : "Enviar resposta"} ↗
                  </button>
                </div>
              </form>
            </section>
          ) : (
            <section className="sheep-empty">
              Selecione uma conversa para começar.
            </section>
          )}
          <aside className="sheep-context">
            <button className="mobile-back" onClick={() => setMobile("thread")}>
              ← Conversa
            </button>
            <h2>Detalhes do contato</h2>
            {selected ? (
              <>
                <div className="contact-profile">
                  <span className="sheep-avatar">
                    {selected.name
                      .split(" ")
                      .map((part) => part[0])
                      .slice(0, 2)
                      .join("")}
                  </span>
                  <strong>{selected.name}</strong>
                  <p>
                    {labels[selected.channel]} · {selected.contactId}
                  </p>
                </div>
                <dl className="contact-fields">
                  <dt>Identificação do canal</dt>
                  <dd>
                    {selected.externalId ||
                      (simulated ? "Contato de demonstração" : "Não informada")}
                  </dd>
                  <dt>Empresa</dt>
                  <dd>{selected.company || "Não informada"}</dd>
                  <dt>Origem do lead</dt>
                  <dd>{labels[selected.channel]}</dd>
                  <dt>Último contato</dt>
                  <dd>
                    {selected.messages.at(-1)?.at
                      ? new Date(selected.messages.at(-1)!.at).toLocaleString(
                          "pt-BR",
                        )
                      : "Sem interações"}
                  </dd>
                </dl>
                <ConversationDeal
                  contactId={selected.contactId}
                  name={selected.name}
                  simulated={simulated}
                />
                <Followups
                  contactId={selected.contactId}
                  simulated={simulated}
                />
                {selected.opportunity && (
                  <>
                    <span className="sheep-context-label">OPORTUNIDADE</span>
                    <strong>
                      {stageLabels[selected.opportunity.stage as Stage] ??
                        selected.opportunity.stage}
                    </strong>
                    <p>
                      {selected.opportunity.nextAction ||
                        "Próxima ação não definida."}
                    </p>
                    <p>{selected.opportunity.tags.join(" · ")}</p>
                  </>
                )}
                <span className="sheep-context-label">RESPONSÁVEL</span>
                <label className="sheep-sr" htmlFor="assignee">
                  Responsável
                </label>
                <input
                  id="assignee"
                  readOnly={!simulated}
                  value={selected.assignee}
                  placeholder="Sem responsável"
                  onChange={(event) =>
                    void update({
                      assignee: event.target.value,
                      aiPaused: true,
                    })
                  }
                />
                {!simulated && (
                  <button
                    className="sheep-toggle"
                    onClick={() =>
                      void update({ assignee: "Você", aiPaused: true })
                    }
                  >
                    Atribuir a mim
                  </button>
                )}
                <span className="sheep-context-label">
                  TRANSFERÊNCIA HUMANA
                </span>
                <label className="sheep-sr" htmlFor="handoff">
                  Contexto da transferência
                </label>
                <textarea
                  id="handoff"
                  rows={5}
                  key={selected.id}
                  defaultValue={selected.handoff}
                  placeholder="Registre o motivo e os próximos passos…"
                  onBlur={(event) => {
                    if (event.target.value !== selected.handoff)
                      void update({
                        handoff: event.target.value,
                        aiPaused: true,
                      });
                  }}
                />
                <div className="sheep-context-note">
                  {selected.aiPaused
                    ? "A IA está pausada. O atendimento está sob controle humano."
                    : "A IA está ativa para as regras aprovadas."}
                </div>
              </>
            ) : (
              <p>Nenhum contato selecionado.</p>
            )}
          </aside>
        </div>
        {suggestion && (
          <Drawer
            title="Sugestão de resposta"
            onClose={() => setSuggestion(false)}
          >
            <p>
              {simulated
                ? "Sugestão de demonstração, sem IA conectada. Revise antes de enviar."
                : "Serviço de sugestão por IA ainda não conectado."}
            </p>
            {simulated && (
              <>
                <p>
                  Olá! Posso ajudar a esclarecer suas dúvidas. Qual horário é
                  melhor para uma demonstração?
                </p>
                <button
                  className="sheep-primary"
                  onClick={() => {
                    setDraft(
                      "Olá! Posso ajudar a esclarecer suas dúvidas. Qual horário é melhor para uma demonstração?",
                    );
                    setSuggestion(false);
                  }}
                >
                  Usar no rascunho
                </button>
              </>
            )}
          </Drawer>
        )}
      </section>
    </main>
  );
}
