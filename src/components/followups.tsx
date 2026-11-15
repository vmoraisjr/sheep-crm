"use client";
import { useNow } from "@/hooks/use-now";
import { useEffect, useState } from "react";
import { Drawer } from "./a2-ui";
type Followup = {
  id: string;
  contactId: string;
  dueAt: string;
  assignee: string;
  notes: string;
  completed: boolean;
};
export function Followups({
  contactId,
  simulated,
}: {
  contactId: string;
  simulated: boolean;
}) {
  const now = useNow();
  const [items, setItems] = useState<Followup[]>([]),
    [editing, setEditing] = useState<Partial<Followup> | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const data = simulated
          ? JSON.parse(localStorage.getItem("a2:followups:v1") ?? "[]")
          : await fetch("/api/tasks").then(async (r) => {
              if (!r.ok) throw Error();
              return r.json();
            });
        if (active) setItems(data);
      } catch {
        if (active) setError("Não foi possível carregar os acompanhamentos.");
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [simulated]);
  async function save(item: Followup) {
    try {
      setError("");
      const next = items.some((i) => i.id === item.id)
        ? items.map((i) => (i.id === item.id ? item : i))
        : [...items, item];
      if (simulated)
        localStorage.setItem("a2:followups:v1", JSON.stringify(next));
      else {
        const response = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item),
        });
        if (!response.ok) throw Error();
      }
      setItems(next);
      setEditing(null);
    } catch {
      setError("Não foi possível salvar o acompanhamento.");
    }
  }
  return (
    <section className="followup-card">
      <h3>◷ Próximos follow-ups</h3>
      {error && <p role="alert">{error}</p>}
      {items
        .filter((i) => i.contactId === contactId)
        .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))
        .map((item) => (
          <article key={item.id}>
            <strong
              className={
                !item.completed && Date.parse(item.dueAt) < now ? "overdue" : ""
              }
            >
              {item.completed
                ? "Concluído"
                : new Date(item.dueAt).toLocaleString("pt-BR")}
            </strong>
            <p>{item.notes}</p>
            <small>{item.assignee || "Sem responsável"}</small>
            <div>
              <button onClick={() => setEditing(item)}>
                Editar acompanhamento
              </button>
              {!item.completed && (
                <button onClick={() => void save({ ...item, completed: true })}>
                  Concluir
                </button>
              )}
            </div>
          </article>
        ))}
      <button onClick={() => setEditing({ contactId, completed: false })}>
        + Criar follow-up
      </button>
      {editing && (
        <Drawer title="Agendar follow-up" onClose={() => setEditing(null)}>
          <p>
            Cria uma tarefa interna. Nenhuma mensagem será enviada
            automaticamente.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              void save({
                id: editing.id ?? crypto.randomUUID(),
                contactId,
                completed: editing.completed ?? false,
                dueAt: new Date(String(form.get("dueAt"))).toISOString(),
                assignee: String(form.get("assignee")),
                notes: String(form.get("notes")),
              });
            }}
          >
            <label>
              Data e horário
              <input
                type="datetime-local"
                name="dueAt"
                required
                defaultValue={
                  editing.dueAt
                    ? new Date(
                        Date.parse(editing.dueAt) -
                          new Date().getTimezoneOffset() * 60000,
                      )
                        .toISOString()
                        .slice(0, 16)
                    : ""
                }
              />
            </label>
            <label>
              Responsável
              <input
                name="assignee"
                defaultValue={editing.assignee}
                maxLength={200}
              />
            </label>
            <label>
              Observações
              <textarea
                name="notes"
                defaultValue={editing.notes}
                required
                maxLength={2000}
              />
            </label>
            <button className="sheep-primary">Salvar acompanhamento</button>
          </form>
        </Drawer>
      )}
    </section>
  );
}
