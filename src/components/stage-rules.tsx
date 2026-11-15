"use client";
import { useEffect, useState } from "react";
import { Drawer } from "./a2-ui";
import { pipelineStages } from "@/lib/crm/deals";
export function StageRules({
  simulated,
  onClose,
}: {
  simulated: boolean;
  onClose: () => void;
}) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({}),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!simulated)
      void fetch("/api/stage-rules")
        .then(async (r) => {
          if (!r.ok) throw Error();
          const rows = await r.json();
          setEnabled(
            Object.fromEntries(
              rows.map(
                (i: {
                  from_stage: string;
                  to_stage: string;
                  enabled: boolean;
                }) => [`${i.from_stage}:${i.to_stage}`, i.enabled],
              ),
            ),
          );
        })
        .catch(() => setNotice("Não foi possível carregar as regras."));
  }, [simulated]);
  async function toggle(from: string, to: string, value: boolean) {
    setBusy(true);
    try {
      const response = await fetch("/api/stage-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to,
          enabled: value,
          notes: "Acompanhar oportunidade após mudança de etapa",
          delay: 24,
        }),
      });
      if (!response.ok) throw Error();
      setEnabled({ ...enabled, [`${from}:${to}`]: value });
      setNotice(
        "Regra salva. Cria somente tarefas internas, sem mensagens externas.",
      );
    } catch {
      setNotice(
        "Não foi possível salvar. Apenas administradores podem configurar regras.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Drawer title="Automações do pipeline" onClose={onClose}>
      <p>
        Ao mudar de etapa, crie uma tarefa interna para o responsável, com prazo
        de 24 horas. As regras começam desabilitadas.
      </p>
      {simulated && (
        <p className="auth-feedback">
          Prévia de configuração. A execução confiável destas regras exige o
          Supabase configurado.
        </p>
      )}
      {pipelineStages.slice(0, -1).map((stage, index) => {
        const target = pipelineStages[index + 1];
        return (
          <label className="stage-rule" key={stage.id}>
            <span>
              {stage.name} → {target.name}
            </span>
            <input
              type="checkbox"
              disabled={simulated || busy}
              checked={!!enabled[`${stage.id}:${target.id}`]}
              onChange={(e) =>
                void toggle(stage.id, target.id, e.target.checked)
              }
            />
          </label>
        );
      })}
      <p role="status">{notice}</p>
    </Drawer>
  );
}
