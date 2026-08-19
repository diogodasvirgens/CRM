import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createLead,
  createTag,
  deleteLead,
  fetchEventEditions,
  fetchLead,
  fetchTags,
  fetchUsers,
  updateLead,
} from "../api/resources";
import { apiErrorMessage } from "../api/client";
import { useAuthStore } from "../state/auth";
import { useToastStore } from "../state/toast";
import { BusinessLine, LeadOrigin, ORIGIN_LABELS, Stage } from "../types";
import { formatDateOnly } from "../utils/date";

interface LeadModalProps {
  businessLine: BusinessLine;
  stages: Stage[];
  leadId: string | null;
  defaultStageId?: string;
  onClose: () => void;
  onSaved: () => void;
}

const emptyForm = {
  contactName: "",
  phone: "",
  estimatedValue: "",
  eventDate: "",
  eventType: "",
  location: "",
  origin: "INDICACAO" as LeadOrigin,
  originDetail: "",
  notes: "",
  eventEditionId: "",
  stageId: "",
  ownerId: null as string | null,
  tagIds: [] as string[],
};

export function LeadModal({ businessLine, stages, leadId, defaultStageId, onClose, onSaved }: LeadModalProps) {
  const { user } = useAuthStore();
  const toast = useToastStore();
  const queryClient = useQueryClient();
  const isEditing = Boolean(leadId);

  const [form, setForm] = useState(emptyForm);
  const [newTagName, setNewTagName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const leadQuery = useQuery({
    queryKey: ["lead", leadId],
    queryFn: () => fetchLead(leadId as string),
    enabled: isEditing,
  });

  const tagsQuery = useQuery({ queryKey: ["tags"], queryFn: fetchTags });
  const editionsQuery = useQuery({ queryKey: ["editions"], queryFn: fetchEventEditions, enabled: businessLine === "EVENTO" });
  const usersQuery = useQuery({ queryKey: ["users"], queryFn: fetchUsers, enabled: user?.role === "GESTOR" });

  useEffect(() => {
    const lead = leadQuery.data;
    if (isEditing && lead) {
      setForm({
        contactName: lead.contactName,
        phone: lead.contact.phone,
        estimatedValue: lead.estimatedValue?.toString() ?? "",
        eventDate: lead.eventDate ? lead.eventDate.slice(0, 10) : "",
        eventType: lead.eventType ?? "",
        location: lead.location ?? "",
        origin: lead.origin,
        originDetail: lead.originDetail ?? "",
        notes: lead.notes ?? "",
        eventEditionId: lead.eventEditionId ?? "",
        stageId: lead.stageId,
        ownerId: lead.ownerId,
        tagIds: lead.tags.map((t) => t.id),
      });
    } else if (!isEditing) {
      setForm({ ...emptyForm, stageId: defaultStageId ?? stages[0]?.id ?? "" });
    }
  }, [isEditing, leadQuery.data, defaultStageId, stages]);

  const lead = leadQuery.data;

  const canEdit = useMemo(() => {
    if (!user) return false;
    if (!isEditing) return user.role === "GESTOR" || user.role === "ATENDENTE";
    if (user.role === "GESTOR") return true;
    if (user.role === "FINANCEIRO") return false;
    return !lead || lead.ownerId === null || lead.ownerId === user.id;
  }, [user, isEditing, lead]);

  const canDelete = canEdit && isEditing;

  function updateField<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleTag(tagId: string) {
    setForm((f) => ({
      ...f,
      tagIds: f.tagIds.includes(tagId) ? f.tagIds.filter((id) => id !== tagId) : [...f.tagIds, tagId],
    }));
  }

  async function handleCreateTag() {
    const name = newTagName.trim();
    if (!name) return;
    try {
      const tag = await createTag(name);
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      toggleTag(tag.id);
      setNewTagName("");
    } catch (err) {
      toast.show(apiErrorMessage(err), "error");
    }
  }

  async function handleSubmit() {
    setError(null);

    if (!form.contactName.trim() || !form.phone.trim()) {
      setError("Nome e telefone são obrigatórios.");
      return;
    }

    const payload: Record<string, unknown> = {
      contactName: form.contactName,
      phone: form.phone,
      estimatedValue: form.estimatedValue ? Number(form.estimatedValue) : null,
      eventDate: form.eventDate ? new Date(form.eventDate).toISOString() : null,
      eventType: form.eventType || null,
      location: form.location || null,
      origin: form.origin,
      originDetail: form.origin === "OUTRO" ? form.originDetail : null,
      notes: form.notes || null,
      eventEditionId: businessLine === "EVENTO" ? form.eventEditionId || null : null,
      tagIds: form.tagIds,
      ownerId: form.ownerId,
    };

    if (isEditing) {
      payload.stageId = form.stageId;
    }

    setSaving(true);
    try {
      if (isEditing && leadId) {
        await updateLead(leadId, payload);
      } else {
        await createLead({ ...payload, businessLine, stageId: form.stageId || undefined });
      }
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!leadId) return;
    if (!confirm("Apagar este lead? Essa ação não pode ser desfeita.")) return;
    try {
      await deleteLead(leadId);
      onSaved();
    } catch (err) {
      toast.show(apiErrorMessage(err), "error");
    }
  }

  function selfAssign() {
    if (!user) return;
    updateField("ownerId", form.ownerId === user.id ? null : user.id);
  }

  const disabled = !canEdit || saving;

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel">
        <div className="modal-header">
          <h2>{isEditing ? "Editar lead" : "Novo lead"}</h2>
          <button className="close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        {isEditing && leadQuery.isLoading ? (
          <p className="hint-text">Carregando...</p>
        ) : (
          <>
            {!canEdit && (
              <p className="hint-text" style={{ marginBottom: 12 }}>
                {user?.role === "FINANCEIRO"
                  ? "Seu papel é somente leitura. Você pode ver os dados, mas não editar."
                  : "Este lead é de outro responsável. Você só pode ver os dados."}
              </p>
            )}

            <div className="form-row">
              <div className="form-field">
                <label>Nome do contato</label>
                <input
                  value={form.contactName}
                  disabled={disabled}
                  onChange={(e) => updateField("contactName", e.target.value)}
                />
              </div>
              <div className="form-field">
                <label>Telefone</label>
                <input value={form.phone} disabled={disabled} onChange={(e) => updateField("phone", e.target.value)} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-field">
                <label>Valor estimado (R$)</label>
                <input
                  type="number"
                  value={form.estimatedValue}
                  disabled={disabled}
                  onChange={(e) => updateField("estimatedValue", e.target.value)}
                />
              </div>
              <div className="form-field">
                <label>Data do evento</label>
                <input
                  type="date"
                  value={form.eventDate}
                  disabled={disabled}
                  onChange={(e) => updateField("eventDate", e.target.value)}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-field">
                <label>Tipo do evento</label>
                <input
                  placeholder="Ex.: Casamento, Aniversário, Formatura"
                  value={form.eventType}
                  disabled={disabled}
                  onChange={(e) => updateField("eventType", e.target.value)}
                />
              </div>
              <div className="form-field">
                <label>Local</label>
                <input
                  placeholder="Ex.: Salão Vitória, Salvador - BA"
                  value={form.location}
                  disabled={disabled}
                  onChange={(e) => updateField("location", e.target.value)}
                />
              </div>
            </div>

            {isEditing && (
              <div className="form-field">
                <label>Etapa</label>
                <select value={form.stageId} disabled={disabled} onChange={(e) => updateField("stageId", e.target.value)}>
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {businessLine === "EVENTO" && (
              <div className="form-field">
                <label>Edição do evento</label>
                <select
                  value={form.eventEditionId}
                  disabled={disabled}
                  onChange={(e) => updateField("eventEditionId", e.target.value)}
                >
                  <option value="">Sem edição vinculada</option>
                  {editionsQuery.data?.map((edition) => (
                    <option key={edition.id} value={edition.id}>
                      {edition.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="form-row">
              <div className="form-field">
                <label>Origem</label>
                <select value={form.origin} disabled={disabled} onChange={(e) => updateField("origin", e.target.value as LeadOrigin)}>
                  {Object.entries(ORIGIN_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              {form.origin === "OUTRO" && (
                <div className="form-field">
                  <label>Qual origem</label>
                  <input
                    value={form.originDetail}
                    disabled={disabled}
                    onChange={(e) => updateField("originDetail", e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="form-field">
              <label>Responsável</label>
              {user?.role === "GESTOR" ? (
                <select
                  value={form.ownerId ?? ""}
                  disabled={disabled}
                  onChange={(e) => updateField("ownerId", e.target.value || null)}
                >
                  <option value="">Sem responsável</option>
                  {usersQuery.data?.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div>
                  <p className="hint-text" style={{ margin: "0 0 8px" }}>
                    {form.ownerId === user?.id
                      ? "Este lead é seu."
                      : form.ownerId
                      ? `Responsável: ${lead?.owner?.name ?? "outra pessoa"}.`
                      : "Este lead está sem responsável."}
                  </p>
                  {(form.ownerId === null || form.ownerId === user?.id) && (
                    <button type="button" className="btn btn-secondary btn-small" onClick={selfAssign} disabled={saving}>
                      {form.ownerId === user?.id ? "Soltar lead" : "Assumir para mim"}
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="form-field">
              <label>Observações</label>
              <textarea value={form.notes} disabled={disabled} onChange={(e) => updateField("notes", e.target.value)} />
            </div>

            <div className="form-field">
              <label>Etiquetas</label>
              <div className="tag-picker">
                {tagsQuery.data?.map((tag) => (
                  <button
                    type="button"
                    key={tag.id}
                    className={`tag-toggle ${form.tagIds.includes(tag.id) ? "selected" : ""}`}
                    onClick={() => toggleTag(tag.id)}
                    disabled={disabled}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
              {!disabled && (
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <input
                    placeholder="Nova etiqueta"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleCreateTag())}
                  />
                  <button type="button" className="btn btn-secondary btn-small" onClick={handleCreateTag}>
                    Criar
                  </button>
                </div>
              )}
            </div>

            {error && <p className="error-text">{error}</p>}

            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              {canEdit && (
                <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
                  {saving ? "Salvando..." : "Salvar"}
                </button>
              )}
              {canDelete && (
                <button className="btn btn-danger" onClick={handleDelete} disabled={saving}>
                  Apagar
                </button>
              )}
              <button className="btn btn-secondary" onClick={onClose}>
                Fechar
              </button>
            </div>

            {isEditing && lead?.contact.messages && lead.contact.messages.length > 0 && (
              <div className="form-field">
                <label>Conversa no WhatsApp</label>
                <div className="inbox-messages" style={{ maxHeight: 260, border: "1px solid var(--border)", borderRadius: 6 }}>
                  {lead.contact.messages.map((m) => (
                    <div key={m.id} className={`message-bubble ${m.direction === "OUT" ? "out" : "in"}`}>
                      <div>{m.content}</div>
                      <div className="message-meta">
                        {m.direction === "OUT" && m.sender ? `${m.sender.name} · ` : ""}
                        {formatDateOnly(m.createdAt)} {new Date(m.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isEditing && lead?.history && lead.history.length > 0 && (
              <div className="history-list">
                <label>Histórico</label>
                {lead.history.map((h) => (
                  <div key={h.id} className="history-item">
                    <b>{h.changedBy.name}</b> mudou {h.field === "STAGE" ? "a etapa" : "o responsável"} de{" "}
                    <b>{h.oldValue ?? "nada"}</b> para <b>{h.newValue ?? "nada"}</b> em{" "}
                    {new Date(h.createdAt).toLocaleString("pt-BR")}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
