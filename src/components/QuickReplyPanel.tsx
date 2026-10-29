import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createQuickReply, deleteQuickReply, fetchQuickReplies, updateQuickReply } from "../api/resources";
import { apiErrorMessage } from "../api/client";
import { useToastStore } from "../state/toast";
import { QuickReply } from "../types";

interface QuickReplyPanelProps {
  onSend: (content: string) => void;
  onClose: () => void;
}

const emptyForm = { title: "", content: "" };

export function QuickReplyPanel({ onSend, onClose }: QuickReplyPanelProps) {
  const toast = useToastStore();
  const queryClient = useQueryClient();
  const quickRepliesQuery = useQuery({ queryKey: ["quick-replies"], queryFn: fetchQuickReplies });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["quick-replies"] });
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(reply: QuickReply) {
    setEditingId(reply.id);
    setForm({ title: reply.title, content: reply.content });
    setShowForm(true);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      editingId ? updateQuickReply(editingId, form) : createQuickReply(form.title.trim(), form.content.trim()),
    onSuccess: () => {
      invalidate();
      setShowForm(false);
      setForm(emptyForm);
      setEditingId(null);
    },
    onError: (err) => toast.show(apiErrorMessage(err), "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteQuickReply(id),
    onSuccess: invalidate,
    onError: (err) => toast.show(apiErrorMessage(err), "error"),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) return;
    saveMutation.mutate();
  }

  function handleDelete(id: string) {
    if (!confirm("Apagar esta mensagem rápida?")) return;
    deleteMutation.mutate(id);
  }

  const replies = quickRepliesQuery.data ?? [];

  return (
    <div className="quickreply-panel">
      <div className="quickreply-panel-header">
        <b>Mensagens rápidas</b>
        <button type="button" className="close-btn" onClick={onClose}>
          ×
        </button>
      </div>

      {!showForm && (
        <>
          {replies.length === 0 ? (
            <p className="hint-text" style={{ padding: "8px 2px" }}>
              Nenhuma mensagem rápida ainda. Crie saudação, encerramento de atendimento etc.
            </p>
          ) : (
            <ul className="quickreply-list">
              {replies.map((r) => (
                <li key={r.id} className="quickreply-item">
                  <button type="button" className="quickreply-send" onClick={() => onSend(r.content)}>
                    <span className="quickreply-title">{r.title}</span>
                    <span className="quickreply-preview">{r.content}</span>
                  </button>
                  <div className="quickreply-actions">
                    <button type="button" title="Editar" onClick={() => openEdit(r)}>
                      ✎
                    </button>
                    <button type="button" title="Apagar" onClick={() => handleDelete(r.id)}>
                      ×
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn btn-secondary btn-small" style={{ marginTop: 8 }} onClick={openCreate}>
            + Nova mensagem rápida
          </button>
        </>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} style={{ marginTop: 8 }}>
          <div className="form-field">
            <label>Nome (só pra você identificar)</label>
            <input
              placeholder="Ex.: Saudação, Encerramento"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              autoFocus
            />
          </div>
          <div className="form-field">
            <label>Mensagem</label>
            <textarea
              placeholder="Texto que será enviado"
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              rows={4}
            />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary btn-small" type="submit" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Salvando..." : "Salvar"}
            </button>
            <button
              className="btn btn-secondary btn-small"
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
