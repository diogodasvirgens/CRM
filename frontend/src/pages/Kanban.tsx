import { useMemo, useState } from "react";
import { DragDropContext, DropResult } from "@hello-pangea/dnd";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchLeads, fetchStages, updateLead } from "../api/resources";
import { apiErrorMessage } from "../api/client";
import { useAuthStore } from "../state/auth";
import { useToastStore } from "../state/toast";
import { BusinessLine, Lead } from "../types";
import { KanbanColumn } from "../components/KanbanColumn";
import { LeadModal } from "../components/LeadModal";

export function Kanban() {
  const { user } = useAuthStore();
  const toast = useToastStore();
  const queryClient = useQueryClient();
  const [businessLine, setBusinessLine] = useState<BusinessLine>("SHOW");
  const [modalState, setModalState] = useState<{ open: boolean; leadId: string | null; defaultStageId?: string }>({
    open: false,
    leadId: null,
  });

  const stagesQuery = useQuery({ queryKey: ["stages"], queryFn: fetchStages });
  const leadsQuery = useQuery({
    queryKey: ["leads", businessLine],
    queryFn: () => fetchLeads({ businessLine }),
  });

  const stages = useMemo(
    () => (stagesQuery.data ?? []).filter((s) => s.businessLine === businessLine).sort((a, b) => a.order - b.order),
    [stagesQuery.data, businessLine]
  );

  const leadsByStage = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    for (const stage of stages) map[stage.id] = [];
    for (const lead of leadsQuery.data ?? []) {
      if (map[lead.stageId]) map[lead.stageId].push(lead);
    }
    return map;
  }, [leadsQuery.data, stages]);

  function canDragLead(lead: Lead): boolean {
    if (!user) return false;
    if (user.role === "GESTOR") return true;
    if (user.role === "FINANCEIRO") return false;
    return lead.ownerId === null || lead.ownerId === user.id;
  }

  async function handleDragEnd(result: DropResult) {
    const { source, destination, draggableId } = result;
    if (!destination || destination.droppableId === source.droppableId) return;

    const lead = (leadsQuery.data ?? []).find((l) => l.id === draggableId);
    if (!lead || !canDragLead(lead)) return;

    const previous = queryClient.getQueryData<Lead[]>(["leads", businessLine]);
    queryClient.setQueryData<Lead[]>(["leads", businessLine], (old) =>
      (old ?? []).map((l) => (l.id === draggableId ? { ...l, stageId: destination.droppableId } : l))
    );

    try {
      await updateLead(draggableId, { stageId: destination.droppableId });
      queryClient.invalidateQueries({ queryKey: ["leads", businessLine] });
    } catch (err) {
      queryClient.setQueryData(["leads", businessLine], previous);
      toast.show(apiErrorMessage(err), "error");
    }
  }

  function closeModal() {
    setModalState({ open: false, leadId: null });
  }

  function handleSaved() {
    queryClient.invalidateQueries({ queryKey: ["leads", businessLine] });
    closeModal();
  }

  const canCreate = user?.role === "GESTOR" || user?.role === "ATENDENTE";

  return (
    <div className="page">
      <div className="page-header">
        <div className="funnel-tabs">
          <button className={businessLine === "SHOW" ? "active" : ""} onClick={() => setBusinessLine("SHOW")}>
            Shows contratados
          </button>
          <button className={businessLine === "EVENTO" ? "active" : ""} onClick={() => setBusinessLine("EVENTO")}>
            Eventos próprios
          </button>
        </div>
        {canCreate && (
          <button
            className="btn btn-primary"
            onClick={() => setModalState({ open: true, leadId: null, defaultStageId: stages[0]?.id })}
          >
            Novo lead
          </button>
        )}
      </div>

      {stages.length === 0 ? (
        <div className="empty-state">Nenhuma etapa cadastrada para este funil ainda. Crie na Administração.</div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="board">
            {stages.map((stage) => (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                leads={leadsByStage[stage.id] ?? []}
                canDragLead={canDragLead}
                onCardClick={(leadId) => setModalState({ open: true, leadId })}
              />
            ))}
          </div>
        </DragDropContext>
      )}

      {modalState.open && (
        <LeadModal
          businessLine={businessLine}
          stages={stages}
          leadId={modalState.leadId}
          defaultStageId={modalState.defaultStageId}
          onClose={closeModal}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
