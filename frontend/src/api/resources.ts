import { api } from "./client";
import { supabase } from "./supabaseClient";
import { BusinessLine, Contact, Conversation, EventEdition, Lead, Message, Stage, Tag, User, WhatsappState } from "../types";

function assert<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  return data as T;
}

// Leads
const leadSelect = `
  *,
  stage:Stage!Lead_stageId_fkey(*),
  owner:profiles!Lead_ownerId_fkey(id,name),
  eventEdition:EventEdition!Lead_eventEditionId_fkey(id,name),
  contact:Contact!Lead_contactId_fkey(*),
  tags:LeadTag(tag:Tag(*))
`;

function serializeLead(row: any): Lead {
  return { ...row, tags: (row.tags ?? []).map((t: any) => t.tag) };
}

export async function fetchLeads(params: { businessLine?: BusinessLine; q?: string }) {
  let query = supabase.from("Lead").select(leadSelect).order("updatedAt", { ascending: false });
  if (params.businessLine) query = query.eq("businessLine", params.businessLine);

  if (params.q) {
    const { data: ids, error } = await supabase.rpc("search_lead_ids", { q: params.q });
    assert(ids, error);
    query = query.in("id", ids && ids.length ? ids : ["__none__"]);
  }

  const { data, error } = await query;
  return assert(data, error).map(serializeLead);
}

export async function fetchLead(id: string) {
  const { data, error } = await supabase
    .from("Lead")
    .select(`${leadSelect}, history:LeadHistory(*, changedBy:profiles!LeadHistory_changedById_fkey(id,name))`)
    .eq("id", id)
    .single();
  const lead = serializeLead(assert(data, error));

  const { data: messages } = await supabase
    .from("Message")
    .select("*, sender:profiles!Message_senderId_fkey(id,name)")
    .eq("contactId", lead.contact.id)
    .order("createdAt", { ascending: true });

  lead.contact.messages = messages ?? [];
  lead.history = (lead.history ?? []).sort(
    (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return lead;
}

export async function createLead(payload: Record<string, unknown>) {
  const { data, error } = await supabase.rpc("create_lead", {
    p_contact_name: payload.contactName,
    p_phone: payload.phone,
    p_business_line: payload.businessLine,
    p_stage_id: payload.stageId ?? null,
    p_estimated_value: payload.estimatedValue ?? null,
    p_event_date: payload.eventDate ?? null,
    p_event_type: payload.eventType ?? null,
    p_location: payload.location ?? null,
    p_owner_id: payload.ownerId ?? null,
    p_origin: payload.origin,
    p_origin_detail: payload.originDetail ?? null,
    p_notes: payload.notes ?? null,
    p_event_edition_id: payload.eventEditionId ?? null,
    p_tag_ids: payload.tagIds ?? null,
  });
  const created = assert(data, error);
  return fetchLead(created.id);
}

export async function updateLead(id: string, payload: Record<string, unknown>) {
  if (payload.phone !== undefined) {
    const { error } = await supabase.rpc("update_lead_contact", {
      p_lead_id: id,
      p_phone: payload.phone,
      p_contact_name: payload.contactName ?? null,
    });
    if (error) throw new Error(error.message);
  }

  const patch: Record<string, unknown> = { ...payload };
  delete patch.phone;
  const tagIds = patch.tagIds as string[] | undefined;
  delete patch.tagIds;

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from("Lead").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  }

  if (tagIds !== undefined) {
    await supabase.from("LeadTag").delete().eq("leadId", id);
    if (tagIds.length) {
      await supabase.from("LeadTag").insert(tagIds.map((tagId) => ({ leadId: id, tagId })));
    }
  }

  return fetchLead(id);
}

export async function deleteLead(id: string) {
  const { error } = await supabase.from("Lead").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// Stages
export async function fetchStages() {
  const { data, error } = await supabase.from("Stage").select("*").order("businessLine").order("order");
  return assert(data, error) as Stage[];
}

export async function createStage(businessLine: BusinessLine, name: string) {
  const { data: last } = await supabase
    .from("Stage")
    .select("order")
    .eq("businessLine", businessLine)
    .order("order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from("Stage")
    .insert({ businessLine, name, order: (last?.order ?? -1) + 1 })
    .select()
    .single();
  return assert(data, error) as Stage;
}

export async function renameStage(id: string, name: string) {
  const { data, error } = await supabase.from("Stage").update({ name }).eq("id", id).select().single();
  return assert(data, error) as Stage;
}

export async function reorderStages(businessLine: BusinessLine, orderedIds: string[]) {
  const { data, error } = await supabase.rpc("reorder_stages", {
    p_business_line: businessLine,
    p_ordered_ids: orderedIds,
  });
  return assert(data, error) as Stage[];
}

export async function deleteStage(id: string) {
  const { error } = await supabase.from("Stage").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// Tags
export async function fetchTags() {
  const { data, error } = await supabase.from("Tag").select("*").order("name");
  return assert(data, error) as Tag[];
}

export async function createTag(name: string) {
  const trimmed = name.trim();
  const { data: existing } = await supabase.from("Tag").select("*").eq("name", trimmed).maybeSingle();
  if (existing) return existing as Tag;
  const { data, error } = await supabase.from("Tag").insert({ name: trimmed }).select().single();
  return assert(data, error) as Tag;
}

export async function deleteTag(id: string) {
  const { error } = await supabase.from("Tag").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// Event editions
export async function fetchEventEditions() {
  const { data, error } = await supabase.from("EventEdition").select("*").order("date", { ascending: false });
  return assert(data, error) as EventEdition[];
}

export async function createEventEdition(payload: Partial<EventEdition>) {
  const { data, error } = await supabase.from("EventEdition").insert(payload).select().single();
  return assert(data, error) as EventEdition;
}

export async function updateEventEdition(id: string, payload: Partial<EventEdition>) {
  const { data, error } = await supabase.from("EventEdition").update(payload).eq("id", id).select().single();
  return assert(data, error) as EventEdition;
}

export async function deleteEventEdition(id: string) {
  const { error } = await supabase.from("EventEdition").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function fetchEditionGuests(id: string) {
  const { data: edition, error: editionError } = await supabase.from("EventEdition").select("*").eq("id", id).single();
  assert(edition, editionError);

  const { data: leads, error } = await supabase
    .from("Lead")
    .select("id, contactName, stage:Stage!Lead_stageId_fkey(name), contact:Contact!Lead_contactId_fkey(phone)")
    .eq("eventEditionId", id)
    .order("contactName");
  assert(leads, error);

  const guests = (leads ?? []).map((l: any) => ({
    id: l.id,
    name: l.contactName,
    phone: l.contact.phone,
    stage: l.stage.name,
  }));

  return { edition: edition as EventEdition, guests };
}

export async function downloadEditionGuestsCsv(id: string, editionName: string) {
  const { guests } = await fetchEditionGuests(id);
  const escapeCsv = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const rows = [
    ["Nome", "Telefone", "Etapa"].map(escapeCsv).join(","),
    ...guests.map((g) => [g.name, g.phone, g.stage].map(escapeCsv).join(",")),
  ];
  const blob = new Blob(["﻿" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `convidados-${editionName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// Usuários (via Edge Function pra ações que precisam de privilégio)
async function invokeAdminUsers<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("admin-users", { body });
  if (error) {
    const message = (error as any)?.context?.error ?? error.message;
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

function serializeProfile(row: any): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    active: row.active,
    mustChangePassword: row.must_change_password,
  };
}

export async function fetchUsers() {
  const { data, error } = await supabase.from("profiles").select("*").order("name");
  return assert(data, error).map(serializeProfile);
}

export async function createUser(payload: { name: string; email: string; role: string }) {
  const result = await invokeAdminUsers<{ user: any; provisionalPassword: string }>({ action: "create", ...payload });
  return { user: serializeProfile(result.user), provisionalPassword: result.provisionalPassword };
}

export async function updateUser(
  id: string,
  payload: Partial<{ name: string; email: string; role: string; active: boolean }>
) {
  const result = await invokeAdminUsers<{ user: any }>({ action: "update", userId: id, ...payload });
  return serializeProfile(result.user);
}

export async function resetUserPassword(id: string) {
  return invokeAdminUsers<{ provisionalPassword: string }>({ action: "resetPassword", userId: id });
}

// WhatsApp connection (Gestor) — depende do Baileys, continua no backend Express
export const fetchWhatsappStatus = () => api.get<WhatsappState>("/whatsapp/status").then((r) => r.data);

export const logoutWhatsapp = () => api.post("/whatsapp/logout");

// Caixa de entrada
const conversationSelect = `
  id, phone, name, archivedAt, lastMessageAt, lastReadAt, currentLeadId,
  currentLead:Lead!Contact_currentLeadId_fkey(id, contactName, businessLine, stage:Stage!Lead_stageId_fkey(id,name)),
  messages:Message(content, direction, createdAt)
`;

function serializeConversation(row: any): Conversation {
  // A query já pede a mensagem mais recente via .order()+.limit() no embed
  // (ver fetchConversations), então o array aqui tem no máximo 1 item.
  const lastMessage = row.messages?.[0];
  const unread = Boolean(
    lastMessage && lastMessage.direction === "IN" && (!row.lastReadAt || lastMessage.createdAt > row.lastReadAt)
  );

  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    archivedAt: row.archivedAt,
    lastMessageAt: row.lastMessageAt,
    unread,
    lastMessage: lastMessage
      ? { content: lastMessage.content, direction: lastMessage.direction, createdAt: lastMessage.createdAt }
      : null,
    currentLead: row.currentLead
      ? {
          id: row.currentLead.id,
          contactName: row.currentLead.contactName,
          businessLine: row.currentLead.businessLine,
          stage: row.currentLead.stage,
        }
      : null,
  };
}

export async function fetchConversations(params: { archived?: boolean; q?: string; stageId?: string } = {}) {
  let query = supabase
    .from("Contact")
    .select(conversationSelect)
    .order("createdAt", { referencedTable: "Message", ascending: false })
    .limit(1, { referencedTable: "Message" });
  query = params.archived ? query.not("archivedAt", "is", null) : query.is("archivedAt", null);

  if (params.stageId === "none") {
    query = query.is("currentLeadId", null);
  }

  if (params.q) {
    const { data: ids, error } = await supabase.rpc("search_contact_ids", { q: params.q });
    assert(ids, error);
    query = query.in("id", ids && ids.length ? ids : ["__none__"]);
  }

  const { data, error } = await query.order("lastMessageAt", { ascending: false, nullsFirst: false });
  const conversations = assert(data, error).map(serializeConversation);

  // O PostgREST não filtra linhas principais por campo de uma relação
  // embutida — refiltra aqui client-side (volume baixo o suficiente pra
  // não precisar de índice/RPC dedicado pra isso).
  return params.stageId && params.stageId !== "none"
    ? conversations.filter((c) => c.currentLead?.stage.id === params.stageId)
    : conversations;
}

export async function fetchConversationMessages(contactId: string) {
  const { data: contact, error: contactError } = await supabase.from("Contact").select("*").eq("id", contactId).single();
  assert(contact, contactError);

  const { data: messages, error } = await supabase
    .from("Message")
    .select("*, sender:profiles!Message_senderId_fkey(id,name)")
    .eq("contactId", contactId)
    .order("createdAt", { ascending: true });
  assert(messages, error);

  await supabase.from("Contact").update({ lastReadAt: new Date().toISOString() }).eq("id", contactId);

  return { contact: contact as Contact, messages: messages as Message[] };
}

export const sendConversationMessage = (contactId: string, text: string) =>
  api.post<{ message: Message }>(`/conversations/${contactId}/messages`, { text }).then((r) => r.data.message);

export const deleteConversationMessage = async (_contactId: string, messageId: string) => {
  const { error } = await supabase.from("Message").delete().eq("id", messageId);
  if (error) throw new Error(error.message);
};

export async function archiveConversation(contactId: string) {
  const { data: currentData, error: fetchError } = await supabase
    .from("Contact")
    .select("archivedAt")
    .eq("id", contactId)
    .single();
  const current = assert(currentData, fetchError);

  const { data, error } = await supabase
    .from("Contact")
    .update({ archivedAt: current.archivedAt ? null : new Date().toISOString() })
    .eq("id", contactId)
    .select()
    .single();
  return assert(data, error) as Contact;
}

export async function createLeadFromConversation(contactId: string, businessLine: BusinessLine) {
  const { data, error } = await supabase.rpc("create_lead_from_conversation", {
    p_contact_id: contactId,
    p_business_line: businessLine,
  });
  return assert(data, error) as Lead;
}

export const sendConversationMedia = (
  contactId: string,
  file: File | Blob,
  options: { fileName?: string; caption?: string; ptt?: boolean } = {}
) => {
  const formData = new FormData();
  formData.append("file", file, options.fileName ?? (file instanceof File ? file.name : "arquivo"));
  if (options.caption) formData.append("caption", options.caption);
  if (options.ptt) formData.append("ptt", "true");
  return api
    .post<{ message: Message }>(`/conversations/${contactId}/media`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then((r) => r.data.message);
};

export async function downloadMessageMedia(messageId: string, fileName: string) {
  const response = await api.get(`/media/${messageId}`, { responseType: "blob" });
  const url = URL.createObjectURL(response.data as Blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
