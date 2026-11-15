"use client";
import { useState, type FormEvent } from "react";
import type { Deal } from "@/lib/crm/deals";
export function LiveDealForm({
  items,
  onSaved,
}: {
  items: Deal[];
  onSaved: (id: string) => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch("/api/crm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: form.get("contactId") }),
      });
      if (!response.ok) throw Error();
      const { id } = await response.json();
      const updated = await fetch("/api/crm", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          title: String(form.get("title")),
          valueCents: Math.round(Number(form.get("value")) * 100),
        }),
      });
      if (!updated.ok) throw Error();
      onSaved(id);
    } catch {
      setError("Não foi possível salvar. Confira o contato e tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  return items.length ? (
    <form onSubmit={submit}>
      <p>
        Uma oportunidade por contato. Caso já exista, o título e o valor serão
        atualizados.
      </p>
      <label>
        Contato
        <select required name="contactId">
          {[
            ...new Map(items.map((item) => [item.contactId, item])).values(),
          ].map((item) => (
            <option key={item.contactId} value={item.contactId}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Título do negócio
        <input required name="title" maxLength={200} />
      </label>
      <label>
        Valor estimado
        <input
          type="number"
          name="value"
          min="0"
          step="0.01"
          defaultValue="0"
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button className="sheep-primary" disabled={busy}>
        {busy ? "Salvando…" : "Salvar oportunidade"}
      </button>
    </form>
  ) : (
    <p>
      Receba uma conversa pelo canal conectado para cadastrar um contato
      elegível e criar a primeira oportunidade.
    </p>
  );
}
