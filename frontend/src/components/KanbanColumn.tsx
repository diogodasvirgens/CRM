import { Droppable } from "@hello-pangea/dnd";
import { Lead, Stage } from "../types";
import { LeadCard } from "./LeadCard";

interface KanbanColumnProps {
  stage: Stage;
  leads: Lead[];
  canDragLead: (lead: Lead) => boolean;
  onCardClick: (leadId: string) => void;
}

export function KanbanColumn({ stage, leads, canDragLead, onCardClick }: KanbanColumnProps) {
  return (
    <div className="column">
      <div className="column-header">
        <span className="column-title">{stage.name}</span>
        <span className="column-count">{leads.length}</span>
      </div>
      <Droppable droppableId={stage.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`column-body ${snapshot.isDraggingOver ? "dragging-over" : ""}`}
          >
            {leads.map((lead, index) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                index={index}
                canDrag={canDragLead(lead)}
                onClick={() => onCardClick(lead.id)}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}
