import { apiFetch } from "../config/api";

export type ContactType = "USER" | "PATIENT";

export type MessageContact = {
  id: string;
  patientId?: string;
  type: ContactType;
  name: string;
  role: string;
  subtitle?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type StoredMessage = {
  id: string;
  senderId: string;
  recipientId: string;
  recipientType: ContactType;
  text: string;
  status: "SENT" | "DELIVERED" | "READ";
  createdAt: string;
  deliveredAt?: string | null;
  readAt?: string | null;
  sender?: { id: string; displayName?: string; username?: string };
  recipient?: { id: string; displayName?: string; username?: string };
};

export const fetchMessageContacts = async (): Promise<MessageContact[]> => {
  return apiFetch<MessageContact[]>("/users/contacts");
};

export const fetchConversationMessages = async (contactId: string): Promise<StoredMessage[]> => {
  return apiFetch<StoredMessage[]>(`/messages/with/${encodeURIComponent(contactId)}`);
};

export const fetchUnreadMessages = async (): Promise<StoredMessage[]> => {
  return apiFetch<StoredMessage[]>("/messages/unread");
};

export const markMessagesRead = async (senderId: string, messageIds?: string[]) => {
  return apiFetch("/messages/read", {
    method: "PATCH",
    body: JSON.stringify({ senderId, messageIds }),
  });
};
