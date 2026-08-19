import { Draggable } from "@hello-pangea/dnd";
import { Lead } from "../types";
import { formatDateOnly } from "../utils/date";

interface LeadCardProps {
  lead: Lead;
  index: number;
  canDrag: boolean;
  onClick: () => void;
}

function formatCurrency(value: number | null) {
  if (value === null) return null;
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function LeadCard({ lead, index, canDrag, onClick }: LeadCardProps) {
  return (
    <Draggable draggableId={lead.id} index={index} isDragDisabled={!canDrag}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className="lead-card"
          style={{ ...provided.draggableProps.style, opacity: snapshot.isDragging ? 0.85 : 1 }}
          onClick={onClick}
        >
          <div className="lead-card-name">{lead.contactName}</div>
          <div className="lead-card-meta">{lead.contact.phone}</div>
          {lead.estimatedValue !== null && (
            <div className="lead-card-value">{formatCurrency(lead.estimatedValue)}</div>
          )}
          {(lead.eventType || lead.eventDate || lead.location) && (
            <div className="lead-card-event">
              {lead.eventType && (
                <span>
                  <span className="lead-card-event-icon">🎉</span>
                  {lead.eventType}
                </span>
              )}
              {lead.eventDate && (
                <span>
                  <span className="lead-card-event-icon">📅</span>
                  {formatDateOnly(lead.eventDate)}
                </span>
              )}
              {lead.location && (
                <span>
                  <span className="lead-card-event-icon">📍</span>
                  {lead.location}
                </span>
              )}
            </div>
          )}
          {lead.tags.length > 0 && (
            <div className="lead-card-tags">
              {lead.tags.map((tag) => (
                <span key={tag.id} className="tag-pill">
                  {tag.name}
                </span>
              ))}
            </div>
          )}
          <div className="lead-card-owner">
            <span className={`owner-chip ${lead.owner ? "" : "unassigned"}`}>
              {lead.owner ? lead.owner.name : "Sem responsável"}
            </span>
          </div>
        </div>
      )}
    </Draggable>
  );
}
