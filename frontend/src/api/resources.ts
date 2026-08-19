import { api } from "./client";
import { BusinessLine, Contact, Conversation, EventEdition, Lead, Message, Stage, Tag, User, WhatsappState } from "../types";

// Auth
export const loginRequest = (email: string, password: string) =>
  api.post<{ token: string; user: User }>("/auth/login", { email, password });

export const changePasswordRequest = (currentPassword: string, newPassword: string) =>
  api.put("/auth/change-password", { currentPassword, newPassword });

// Leads
export const fetchLeads = (params: { businessLine?: BusinessLine }) =>
  api.get<{ leads: Lead[] }>("/leads", { params }).then((r) => r.data.leads);

export const fetchLead = (id: string) => api.get<{ lead: Lead }>(`/leads/${id}`).then((r) => r.data.lead);

export const createLead = (payload: Record<string, unknown>) =>
  api.post<{ lead: Lead }>("/leads", payload).then((r) => r.data.lead);

export const updateLead = (id: string, payload: Record<string, unknown>) =>
  api.put<{ lead: Lead }>(`/leads/${id}`, payload).then((r) => r.data.lead);

export const deleteLead = (id: string) => api.delete(`/leads/${id}`);

// Stages
export const fetchStages = () => api.get<{ stages: Stage[] }>("/stages").then((r) => r.data.stages);

export const createStage = (businessLine: BusinessLine, name: string) =>
  api.post<{ stage: Stage }>("/stages", { businessLine, name }).then((r) => r.data.stage);

export const renameStage = (id: string, name: string) =>
  api.put<{ stage: Stage }>(`/stages/${id}`, { name }).then((r) => r.data.stage);

export const reorderStages = (businessLine: BusinessLine, orderedIds: string[]) =>
  api.put<{ stages: Stage[] }>("/stages/reorder/all", { businessLine, orderedIds }).then((r) => r.data.stages);

export const deleteStage = (id: string) => api.delete(`/stages/${id}`);

// Tags
export const fetchTags = () => api.get<{ tags: Tag[] }>("/tags").then((r) => r.data.tags);

export const createTag = (name: string) => api.post<{ tag: Tag }>("/tags", { name }).then((r) => r.data.tag);

export const deleteTag = (id: string) => api.delete(`/tags/${id}`);

// Event editions
export const fetchEventEditions = () =>
  api.get<{ editions: EventEdition[] }>("/event-editions").then((r) => r.data.editions);

export const createEventEdition = (payload: Partial<EventEdition>) =>
  api.post<{ edition: EventEdition }>("/event-editions", payload).then((r) => r.data.edition);

export const updateEventEdition = (id: string, payload: Partial<EventEdition>) =>
  api.put<{ edition: EventEdition }>(`/event-editions/${id}`, payload).then((r) => r.data.edition);

export const deleteEventEdition = (id: string) => api.delete(`/event-editions/${id}`);

export const fetchEditionGuests = (id: string) =>
  api
    .get<{ edition: EventEdition; guests: { id: string; name: string; phone: string; stage: string }[] }>(
      `/event-editions/${id}/guests`
    )
    .then((r) => r.data);

export async function downloadEditionGuestsCsv(id: string, editionName: string) {
  const response = await api.get(`/event-editions/${id}/guests/export`, { responseType: "blob" });
  const url = URL.createObjectURL(response.data as Blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `convidados-${editionName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// Users
export const fetchUsers = () => api.get<{ users: User[] }>("/users").then((r) => r.data.users);

export const createUser = (payload: { name: string; email: string; role: string }) =>
  api
    .post<{ user: User; provisionalPassword: string }>("/users", payload)
    .then((r) => r.data);

export const updateUser = (id: string, payload: Partial<{ name: string; email: string; role: string; active: boolean }>) =>
  api.put<{ user: User }>(`/users/${id}`, payload).then((r) => r.data.user);

export const resetUserPassword = (id: string) =>
  api.post<{ provisionalPassword: string }>(`/users/${id}/reset-password`).then((r) => r.data);

// WhatsApp connection (Gestor)
export const fetchWhatsappStatus = () => api.get<WhatsappState>("/whatsapp/status").then((r) => r.data);

export const logoutWhatsapp = () => api.post("/whatsapp/logout");

// Caixa de entrada
export const fetchConversations = (params: { archived?: boolean } = {}) =>
  api
    .get<{ conversations: Conversation[] }>("/conversations", { params })
    .then((r) => r.data.conversations);

export const fetchConversationMessages = (contactId: string) =>
  api
    .get<{ contact: Contact; messages: Message[] }>(`/conversations/${contactId}/messages`)
    .then((r) => r.data);

export const sendConversationMessage = (contactId: string, text: string) =>
  api.post<{ message: Message }>(`/conversations/${contactId}/messages`, { text }).then((r) => r.data.message);

export const archiveConversation = (contactId: string) =>
  api.post<{ contact: Contact }>(`/conversations/${contactId}/archive`).then((r) => r.data.contact);

export const createLeadFromConversation = (contactId: string, businessLine: BusinessLine) =>
  api.post<{ lead: Lead }>(`/conversations/${contactId}/lead`, { businessLine }).then((r) => r.data.lead);
