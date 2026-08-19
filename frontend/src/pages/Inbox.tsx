import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  archiveConversation,
  createLeadFromConversation,
  deleteConversationMessage,
  fetchConversationMessages,
  fetchConversations,
  fetchStages,
  sendConversationMedia,
  sendConversationMessage,
} from "../api/resources";
import { apiErrorMessage } from "../api/client";
import { useToastStore } from "../state/toast";
import { useAuthStore } from "../state/auth";
import { BusinessLine } from "../types";
import { formatDateOnly } from "../utils/date";
import { useDebouncedValue } from "../utils/useDebouncedValue";
import { MessageMedia, messageHasVisibleCaption } from "../components/MessageMedia";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

const FUNNEL_LABELS: Record<BusinessLine, string> = { SHOW: "Shows contratados", EVENTO: "Eventos próprios" };

export function Inbox() {
  const { user } = useAuthStore();
  const toast = useToastStore();
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [stageFilter, setStageFilter] = useState("");

  const stagesQuery = useQuery({ queryKey: ["stages"], queryFn: fetchStages });
  const sortedStages = useMemo(
    () => [...(stagesQuery.data ?? [])].sort((a, b) => a.businessLine.localeCompare(b.businessLine) || a.order - b.order),
    [stagesQuery.data]
  );

  const conversationsQuery = useQuery({
    queryKey: ["conversations", showArchived, debouncedSearch, stageFilter],
    queryFn: () =>
      fetchConversations({ archived: showArchived, q: debouncedSearch || undefined, stageId: stageFilter || undefined }),
    refetchInterval: 4000,
  });

  const conversations = conversationsQuery.data ?? [];
  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  const messagesQuery = useQuery({
    queryKey: ["conversation-messages", selectedId],
    queryFn: () => fetchConversationMessages(selectedId as string),
    enabled: Boolean(selectedId),
    refetchInterval: 3000,
  });

  useEffect(() => {
    if (selectedId) {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const canCreateLead = user?.role === "GESTOR" || user?.role === "ATENDENTE";

  const sendMutation = useMutation({
    mutationFn: (payload: { contactId: string; text: string }) => sendConversationMessage(payload.contactId, payload.text),
    onSuccess: () => {
      setText("");
      queryClient.invalidateQueries({ queryKey: ["conversation-messages", selectedId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (err) => toast.show(apiErrorMessage(err), "error"),
  });

  const sendMediaMutation = useMutation({
    mutationFn: (payload: { contactId: string; file: File | Blob; fileName?: string; ptt?: boolean }) =>
      sendConversationMedia(payload.contactId, payload.file, { fileName: payload.fileName, ptt: payload.ptt }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversation-messages", selectedId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (err) => toast.show(apiErrorMessage(err), "error"),
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !selectedId) return;
    sendMediaMutation.mutate({ contactId: selectedId, file, fileName: file.name });
  }

  async function handleToggleRecording() {
    if (!selectedId) return;

    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordedChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size > 0 && selectedId) {
          sendMediaMutation.mutate({ contactId: selectedId, file: blob, fileName: "audio.webm", ptt: true });
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      toast.show("Não foi possível acessar o microfone.", "error");
    }
  }

  const archiveMutation = useMutation({
    mutationFn: (contactId: string) => archiveConversation(contactId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setSelectedId(null);
    },
    onError: (err) => toast.show(apiErrorMessage(err), "error"),
  });

  const deleteMessageMutation = useMutation({
    mutationFn: (payload: { contactId: string; messageId: string }) =>
      deleteConversationMessage(payload.contactId, payload.messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversation-messages", selectedId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (err) => toast.show(apiErrorMessage(err), "error"),
  });

  function handleDeleteMessage(messageId: string) {
    if (!selectedId) return;
    if (!confirm("Apagar esta mensagem do CRM? Ela continua existindo no WhatsApp normalmente.")) return;
    deleteMessageMutation.mutate({ contactId: selectedId, messageId });
  }

  const createLeadMutation = useMutation({
    mutationFn: (payload: { contactId: string; businessLine: BusinessLine }) =>
      createLeadFromConversation(payload.contactId, payload.businessLine),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast.show("Lead criado a partir da conversa.");
    },
    onError: (err) => toast.show(apiErrorMessage(err), "error"),
  });

  function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!selectedId || !text.trim()) return;
    sendMutation.mutate({ contactId: selectedId, text: text.trim() });
  }

  const messages = messagesQuery.data?.messages ?? [];

  return (
    <div className="inbox">
      <aside className="inbox-list">
        <div className="inbox-list-header">
          <div className="funnel-tabs">
            <button className={!showArchived ? "active" : ""} onClick={() => setShowArchived(false)}>
              Conversas
            </button>
            <button className={showArchived ? "active" : ""} onClick={() => setShowArchived(true)}>
              Arquivadas
            </button>
          </div>
          <input
            className="search-input"
            style={{ maxWidth: "none", marginTop: 10 }}
            placeholder="Buscar por nome, telefone ou mensagem..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} style={{ marginTop: 8, width: "100%" }}>
            <option value="">Todas as etapas</option>
            <option value="none">Sem lead vinculado</option>
            {sortedStages.map((s) => (
              <option key={s.id} value={s.id}>
                {FUNNEL_LABELS[s.businessLine]} — {s.name}
              </option>
            ))}
          </select>
        </div>

        {conversations.length === 0 ? (
          <p className="hint-text" style={{ padding: 16 }}>
            {debouncedSearch || stageFilter
              ? "Nenhuma conversa encontrada com esses filtros."
              : showArchived
              ? "Nenhuma conversa arquivada."
              : "Nenhuma conversa ainda."}
          </p>
        ) : (
          <ul className="conversation-list">
            {conversations.map((c) => (
              <li
                key={c.id}
                className={`conversation-item ${c.id === selectedId ? "selected" : ""} ${c.unread ? "unread" : ""}`}
                onClick={() => setSelectedId(c.id)}
              >
                <div className="conversation-item-top">
                  <span className="conversation-name">{c.name || c.phone}</span>
                  {c.lastMessage && <span className="conversation-time">{formatTime(c.lastMessage.createdAt)}</span>}
                </div>
                <div className="conversation-item-bottom">
                  <span className="conversation-preview">
                    {c.lastMessage
                      ? `${c.lastMessage.direction === "OUT" ? "Você: " : ""}${c.lastMessage.content}`
                      : "Sem mensagens"}
                  </span>
                  {c.unread && <span className="unread-dot" />}
                </div>
                {c.currentLead && (
                  <span className="tag-pill" style={{ marginTop: 4 }}>
                    Lead: {c.currentLead.stage.name}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="inbox-thread">
        {!selected ? (
          <div className="empty-state">Selecione uma conversa para ver as mensagens.</div>
        ) : (
          <>
            <div className="inbox-thread-header">
              <div>
                <div className="conversation-name">{selected.name || selected.phone}</div>
                <div className="hint-text">{selected.phone}</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {selected.currentLead ? (
                  <span className="tag-pill">
                    Lead em {selected.currentLead.businessLine === "SHOW" ? "Shows contratados" : "Eventos próprios"} ·{" "}
                    {selected.currentLead.stage.name}
                  </span>
                ) : (
                  canCreateLead && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        className="btn btn-secondary btn-small"
                        disabled={createLeadMutation.isPending}
                        onClick={() => createLeadMutation.mutate({ contactId: selected.id, businessLine: "SHOW" })}
                      >
                        Criar lead (Show)
                      </button>
                      <button
                        className="btn btn-secondary btn-small"
                        disabled={createLeadMutation.isPending}
                        onClick={() => createLeadMutation.mutate({ contactId: selected.id, businessLine: "EVENTO" })}
                      >
                        Criar lead (Evento)
                      </button>
                    </div>
                  )
                )}
                <button
                  className="btn btn-secondary btn-small"
                  onClick={() => archiveMutation.mutate(selected.id)}
                  disabled={archiveMutation.isPending}
                >
                  {selected.archivedAt ? "Desarquivar" : "Arquivar"}
                </button>
              </div>
            </div>

            <div className="inbox-messages">
              {messages.map((m) => (
                <div key={m.id} className={`message-bubble ${m.direction === "OUT" ? "out" : "in"}`}>
                  <button
                    type="button"
                    className="message-delete-btn"
                    title="Apagar mensagem"
                    onClick={() => handleDeleteMessage(m.id)}
                  >
                    ×
                  </button>
                  <MessageMedia message={m} />
                  {messageHasVisibleCaption(m) && <div>{m.content}</div>}
                  <div className="message-meta">
                    {m.direction === "OUT" && m.sender ? `${m.sender.name} · ` : ""}
                    {formatDateOnly(m.createdAt)} {formatTime(m.createdAt)}
                  </div>
                </div>
              ))}
              {messages.length === 0 && <p className="hint-text">Sem mensagens ainda.</p>}
            </div>

            <form className="inbox-reply" onSubmit={handleSend}>
              <input type="file" ref={fileInputRef} style={{ display: "none" }} onChange={handleFileSelected} />
              <button
                type="button"
                className="btn btn-secondary btn-small"
                title="Anexar arquivo ou foto"
                onClick={() => fileInputRef.current?.click()}
                disabled={sendMediaMutation.isPending || isRecording}
              >
                📎
              </button>
              <button
                type="button"
                className={`btn btn-small ${isRecording ? "btn-danger" : "btn-secondary"}`}
                title={isRecording ? "Parar e enviar áudio" : "Gravar áudio"}
                onClick={handleToggleRecording}
                disabled={sendMediaMutation.isPending}
              >
                {isRecording ? "⏹" : "🎤"}
              </button>
              <input
                placeholder="Escreva uma mensagem..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={sendMutation.isPending}
              />
              <button className="btn btn-primary" type="submit" disabled={sendMutation.isPending || !text.trim()}>
                Enviar
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
