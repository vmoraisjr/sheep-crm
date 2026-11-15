"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { demoDeals } from "@/lib/demo/deals";
import { normalizeDeal } from "@/lib/crm/deals";
export function ConversationDeal({
  contactId,
  name,
  simulated,
}: {
  contactId: string;
  name: string;
  simulated: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    try {
      let id;
      if (simulated) {
        const items =
          JSON.parse(localStorage.getItem("a2:deals:v2") ?? "null") ??
          demoDeals();
        let deal = items.find(
          (i: { contactId: string }) => i.contactId === contactId,
        );
        if (!deal) {
          deal = normalizeDeal(
            {
              id: crypto.randomUUID(),
              contactId,
              name,
              stage: "new",
              assignee: "",
              nextAction: "",
              valueCents: 0,
              tags: [],
            },
            items.length,
          );
          items.push(deal);
        }
        localStorage.setItem("a2:deals:v2", JSON.stringify(items));
        id = deal.id;
      } else {
        const response = await fetch("/api/crm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactId }),
        });
        if (!response.ok) throw Error();
        id = (await response.json()).id;
      }
      router.push(
        `${simulated ? "/demo/crm" : "/negocios"}?id=${encodeURIComponent(id)}`,
      );
    } catch {
      setError("Não foi possível abrir o negócio. Tente novamente.");
      setBusy(false);
    }
  }
  return (
    <div>
      <button
        className="sheep-primary"
        disabled={busy}
        onClick={() => void open()}
      >
        + Criar / abrir negócio
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
