import { FormEvent, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createEventEdition,
  deleteEventEdition,
  downloadEditionGuestsCsv,
  fetchEditionGuests,
  fetchEventEditions,
  updateEventEdition,
} from "../../api/resources";
import { apiErrorMessage } from "../../api/client";
import { useToastStore } from "../../state/toast";
import { EventEdition } from "../../types";
import { formatDateOnly } from "../../utils/date";

const emptyForm = { name: "", date: "", location: "", ticketPrice: "" };

export function AdminEventEditions() {
  const queryClient = useQueryClient();
  const toast = useToastStore();
  const editionsQuery = useQuery({ queryKey: ["editions"], queryFn: fetchEventEditions });

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [guestsEditionId, setGuestsEditionId] = useState<string | null>(null);

  const guestsQuery = useQuery({
    queryKey: ["guests", guestsEditionId],
    queryFn: () => fetchEditionGuests(guestsEditionId as string),
    enabled: Boolean(guestsEditionId),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["editions"] });
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(edition: EventEdition) {
    setEditingId(edition.id);
    setForm({
      name: edition.name,
      date: edition.date ? edition.date.slice(0, 10) : "",
      location: edition.location ?? "",
      ticketPrice: edition.ticketPrice?.toString() ?? "",
    });
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name,
      date: form.date ? new Date(form.date).toISOString() : null,
      location: form.location || null,
      ticketPrice: form.ticketPrice ? Number(form.ticketPrice) : null,
    };
    try {
      if (editingId) {
        await updateEventEdition(editingId, payload);
      } else {
        await createEventEdition(payload);
      }
      setShowForm(false);
      invalidate();
    } catch (err) {
      toast.show(apiErrorMessage(err), "error");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Apagar esta edição? Só é possível se não houver leads vinculados.")) return;
    try {
      await deleteEventEdition(id);
      invalidate();
    } catch (err) {
      toast.show(apiErrorMessage(err), "error");
    }
  }

  async function handleExport(edition: EventEdition) {
    try {
      await downloadEditionGuestsCsv(edition.id, edition.name);
    } catch (err) {
      toast.show(apiErrorMessage(err), "error");
    }
  }

  return (
    <div>
      <h2>Edições de evento</h2>
      <div className="toolbar">
        <button className="btn btn-primary" onClick={openCreate}>
          Nova edição
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} style={{ maxWidth: 420, marginBottom: 20 }}>
          <div className="form-field">
            <label>Nome</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>Data</label>
              <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="form-field">
              <label>Preço do ingresso (R$)</label>
              <input
                type="number"
                value={form.ticketPrice}
                onChange={(e) => setForm((f) => ({ ...f, ticketPrice: e.target.value }))}
              />
            </div>
          </div>
          <div className="form-field">
            <label>Local</label>
            <input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary" type="submit">
              Salvar
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => setShowForm(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Data</th>
            <th>Local</th>
            <th>Ingresso</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {editionsQuery.data?.map((edition) => (
            <tr key={edition.id}>
              <td>{edition.name}</td>
              <td>{formatDateOnly(edition.date)}</td>
              <td>{edition.location ?? "-"}</td>
              <td>{edition.ticketPrice !== null ? `R$ ${edition.ticketPrice}` : "-"}</td>
              <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button className="btn btn-secondary btn-small" onClick={() => openEdit(edition)}>
                  Editar
                </button>
                <button className="btn btn-secondary btn-small" onClick={() => setGuestsEditionId(edition.id)}>
                  Lista de convidados
                </button>
                <button className="btn btn-secondary btn-small" onClick={() => handleExport(edition)}>
                  Exportar CSV
                </button>
                <button className="btn btn-danger btn-small" onClick={() => handleDelete(edition.id)}>
                  Apagar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {guestsEditionId && (
        <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && setGuestsEditionId(null)}>
          <div className="modal-panel center">
            <div className="modal-header">
              <h2>Convidados: {guestsQuery.data?.edition.name}</h2>
              <button className="close-btn" onClick={() => setGuestsEditionId(null)}>
                ×
              </button>
            </div>
            {guestsQuery.data?.guests.length === 0 ? (
              <p className="empty-state">Nenhum lead vinculado a esta edição ainda.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Telefone</th>
                    <th>Etapa</th>
                  </tr>
                </thead>
                <tbody>
                  {guestsQuery.data?.guests.map((g) => (
                    <tr key={g.id}>
                      <td>{g.name}</td>
                      <td>{g.phone}</td>
                      <td>{g.stage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
