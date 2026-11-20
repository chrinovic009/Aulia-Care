import { apiFetch } from "../config/api";

export type ContactType = "USER" | "PATIENT";
export type MessageKind = "TEXT" | "VOICE" | "PHOTO" | "IMAGING";

export type MessageContact = {
  id: string;
  patientId?: string;
  type: ContactType;
  name: string;
  role: string;
  subtitle?: string | null;
  phone?: string | null;
  email?: string | null;
  lastMessageAt?: string | null;
  lastMessagePreview?: string | null;
  unreadCount?: number;
};

export type SharedImaging = {
  id: string;
  modality: string;
  bodyPart: string;
  examName: string;
  status: string;
  patientName: string;
  requestedByName: string;
  verified: boolean;
  findings?: string | null;
  impression?: string | null;
  recommendations?: string | null;
  dicomStudyInstanceUid?: string | null;
  hasPreview: boolean;
};

export type StoredMessage = {
  id: string;
  senderId: string;
  recipientId: string;
  recipientType: ContactType;
  text: string;
  kind: MessageKind;
  status: "SENT" | "DELIVERED" | "READ";
  createdAt: string;
  deliveredAt?: string | null;
  readAt?: string | null;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentMimeType?: string | null;
  attachmentSizeBytes?: number | null;
  audioDurationMs?: number | null;
  imaging?: SharedImaging | null;
  sender?: { id: string; displayName?: string; username?: string };
  recipient?: { id: string; displayName?: string; username?: string };
};

export const fetchMessageContacts = async (): Promise<MessageContact[]> => apiFetch<MessageContact[]>("/users/contacts");

export const fetchConversationMessages = async (contactId: string): Promise<StoredMessage[]> =>
  apiFetch<StoredMessage[]>(`/messages/with/${encodeURIComponent(contactId)}`);

export const fetchUnreadMessages = async (): Promise<StoredMessage[]> => apiFetch<StoredMessage[]>("/messages/unread");

export const markMessagesRead = async (senderId: string, messageIds?: string[]) => apiFetch("/messages/read", {
  method: "PATCH",
  body: JSON.stringify({ senderId, messageIds }),
});

export const sendMediaMessage = async (
  contactId: string,
  input: { kind: "PHOTO" | "VOICE"; file: Blob; fileName: string; caption?: string; durationMs?: number },
): Promise<StoredMessage> => {
  const body = new FormData();
  body.append("file", input.file, input.fileName);
  body.append("kind", input.kind);
  body.append("caption", input.caption || "");
  if (input.durationMs !== undefined) body.append("durationMs", String(Math.round(input.durationMs)));
  return apiFetch<StoredMessage>(`/messages/media/${encodeURIComponent(contactId)}`, { method: "POST", body }, 30000);
};

export const fetchAvailableImaging = async (contactId: string): Promise<SharedImaging[]> =>
  apiFetch<SharedImaging[]>(`/messages/imaging/available/${encodeURIComponent(contactId)}`);

export const sendImagingMessage = async (
  contactId: string,
  input: { imagingRequestId: string; caption?: string; authorizePatient: boolean },
): Promise<StoredMessage> => apiFetch<StoredMessage>(`/messages/imaging/${encodeURIComponent(contactId)}`, {
  method: "POST",
  body: JSON.stringify(input),
});
