import { FormEvent, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createStage, deleteStage, fetchStages, renameStage, reorderStages } from "../../api/resources";
import { apiErrorMessage } from "../../api/client";
import { useToastStore } from "../../state/toast";
import { BusinessLine, Stage } from "../../types";

function StageFunnel({ businessLine, title, stages }: { businessLine: BusinessLine; title: string; stages: Stage[] }) {
  const queryClient = useQueryClient();
  const toast = useToastStore();
  const [newStageName, setNewStageName] = useState("");
  const [names, setNames] = useState<Record<string, string>>({});

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["stages"] });
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const name = newStageName.trim();
    if (!name) return;
    try {
      await createStage(businessLine, name);
      setNewStageName("");
      invalidate();
    } catch (err) {
      toast.show(apiErrorMessage(err), "error");
    }
  }

  async function handleRename(id: string) {
    const name = (names[id] ?? "").trim();
    if (!name) return;
    try {
      await renameStage(id, name);
      invalidate();
    } catch (err) {
      toast.show(apiErrorMessage(err), "error");
    }
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= stages.length) return;
    const reordered = [...stages];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    try {
      await reorderStages(businessLine, reordered.map((s) => s.id));
      invalidate();
    } catch (err) {
      toast.show(apiErrorMessage(err), "error");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Apagar esta etapa? Só é possível se ela estiver vazia.")) return;
    try {
      await deleteStage(id);
      invalidate();
    } catch (err) {
      toast.show(apiErrorMessage(err), "error");
    }
  }

  return (
    <div style={{ marginBottom: 32 }}>
      <h3>{title}</h3>
      <div className="stage-list">
        {stages.map((stage, index) => (
          <div key={stage.id} className="stage-row">
            <div className="order-btns">
              <button onClick={() => handleMove(index, -1)} disabled={index === 0}>
                ▲
              </button>
              <button onClick={() => handleMove(index, 1)} disabled={index === stages.length - 1}>
                ▼
              </button>
            </div>
            <input
              defaultValue={stage.name}
              onChange={(e) => setNames((n) => ({ ...n, [stage.id]: e.target.value }))}
              onBlur={() => handleRename(stage.id)}
              onKeyDown={(e) => e.key === "Enter" && handleRename(stage.id)}
            />
            <button className="btn btn-secondary btn-small" onClick={() => handleDelete(stage.id)}>
              Apagar
            </button>
          </div>
        ))}
      </div>
      <form onSubmit={handleAdd} style={{ display: "flex", gap: 8, marginTop: 10, maxWidth: 460 }}>
        <input placeholder="Nova etapa" value={newStageName} onChange={(e) => setNewStageName(e.target.value)} />
        <button className="btn btn-secondary btn-small" type="submit">
          Adicionar
        </button>
      </form>
    </div>
  );
}

export function AdminStages() {
  const stagesQuery = useQuery({ queryKey: ["stages"], queryFn: fetchStages });

  const showStages = useMemo(
    () => (stagesQuery.data ?? []).filter((s) => s.businessLine === "SHOW").sort((a, b) => a.order - b.order),
    [stagesQuery.data]
  );
  const eventoStages = useMemo(
    () => (stagesQuery.data ?? []).filter((s) => s.businessLine === "EVENTO").sort((a, b) => a.order - b.order),
    [stagesQuery.data]
  );

  return (
    <div>
      <h2>Etapas dos funis</h2>
      <StageFunnel businessLine="SHOW" title="Shows contratados" stages={showStages} />
      <StageFunnel businessLine="EVENTO" title="Eventos próprios" stages={eventoStages} />
    </div>
  );
}
