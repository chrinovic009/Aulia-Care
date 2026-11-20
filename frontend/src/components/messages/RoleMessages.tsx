import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Image as ImageIcon, LoaderCircle, ScanLine, Search, Send, ShieldCheck, X } from "lucide-react";
import {
  fetchConversationMessages,
  fetchMessageContacts,
  markMessagesRead,
  sendMediaMessage,
  type MessageContact,
  type MessageKind,
  type SharedImaging,
  type StoredMessage,
} from "../../api/messages";
import { useAuth } from "../../context/AuthContext";
import { useRealtime } from "../../context/RealtimeContext";
import PageBreadcrumb from "../common/PageBreadCrumb";
import PageMeta from "../common/PageMeta";
import MessageBubble, { type ChatMessage } from "./MessageBubble";
import VoiceRecorder from "./VoiceRecorder";
import ImagingPicker from "./ImagingPicker";
import { canShareImaging, messagePreview } from "./message-format";

type RealtimeMessage = {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientName?: string;
  recipientType?: "USER" | "PATIENT";
  text: string;
  kind?: MessageKind;
  sentAt: string;
  status?: "SENT" | "DELIVERED" | "READ";
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentMimeType?: string | null;
  audioDurationMs?: number | null;
  imaging?: SharedImaging | null;
};

type RoleMessagesProps = { title: string; description: string };
type PhotoDraft = { file: File; url: string };

const roleLabels: Record<string, string> = {
  RECEPTIONIST: "Réception",
  NURSE: "Infirmier",
  PHYSICIAN: "Médecin",
  LAB_TECHNICIAN: "Laboratoire",
  RADIOLOGIST: "Radiologie",
  PHARMACIST: "Pharmacie",
  PATIENT: "Patient",
  ADMIN: "Administration",
  SUPER_ADMIN: "Administration",
  FINANCE: "Finance",
  CASHIER: "Caisse",
};

const timeLabel = (value: string) => new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));

const mapStoredMessage = (stored: StoredMessage, currentUserId: string): ChatMessage => ({
  id: stored.id,
  contactId: stored.senderId === currentUserId ? stored.recipientId : stored.senderId,
  from: stored.senderId === currentUserId ? "me" : "contact",
  text: stored.text,
  kind: stored.kind || "TEXT",
  time: timeLabel(stored.createdAt),
  status: stored.status.toLowerCase() as ChatMessage["status"],
  attachmentUrl: stored.attachmentUrl,
  attachmentName: stored.attachmentName,
  attachmentMimeType: stored.attachmentMimeType,
  audioDurationMs: stored.audioDurationMs,
  imaging: stored.imaging,
});

const orderContactsByActivity = (items: MessageContact[]) => [...items].sort((left, right) => {
  const rightAt = right.lastMessageAt ? new Date(right.lastMessageAt).getTime() : 0;
  const leftAt = left.lastMessageAt ? new Date(left.lastMessageAt).getTime() : 0;
  return rightAt - leftAt || (right.unreadCount || 0) - (left.unreadCount || 0) || left.name.localeCompare(right.name, "fr");
});

const initials = (name: string) => name.split(" ").map(part => part[0]).join("").slice(0, 2).toUpperCase();

export default function RoleMessages({ title, description }: RoleMessagesProps) {
  const location = useLocation();
  const state = location.state as { patientInfo?: string; patientId?: string; contactId?: string } | undefined;
  const { currentUser } = useAuth();
  const { socket } = useRealtime();
  const [contacts, setContacts] = useState<MessageContact[]>([]);
  const [selectedContact, setSelectedContact] = useState<MessageContact | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSendingMedia, setIsSendingMedia] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<Record<string, boolean>>({});
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
  const [photoDraft, setPhotoDraft] = useState<PhotoDraft | null>(null);
  const [showImagingPicker, setShowImagingPicker] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const photoDraftUrlRef = useRef<string | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const readAcknowledgedIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const loadContacts = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchMessageContacts();
        setContacts(orderContactsByActivity(data));
        const preferredId = state?.contactId || state?.patientId;
        const preferred = preferredId ? data.find(contact => contact.id === preferredId || contact.patientId === preferredId) : data[0];
        setSelectedContact(preferred || data[0] || null);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Impossible de charger les contacts.");
      } finally {
        setIsLoading(false);
      }
    };
    void loadContacts();
  }, [state?.contactId, state?.patientId]);

  useEffect(() => () => {
    if (photoDraftUrlRef.current) URL.revokeObjectURL(photoDraftUrlRef.current);
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
  }, []);

  useEffect(() => {
    const handleIncoming = (event: Event) => {
      const incoming = (event as CustomEvent<RealtimeMessage>).detail;
      if (!incoming || !currentUser?.id || incoming.senderId === currentUser.id) return;
      if (!contacts.some(contact => contact.id === incoming.senderId)) return;
      const stored: StoredMessage = {
        id: incoming.id,
        senderId: incoming.senderId,
        recipientId: incoming.recipientId,
        recipientType: incoming.recipientType || "USER",
        text: incoming.text,
        kind: incoming.kind || "TEXT",
        status: incoming.status || "DELIVERED",
        createdAt: incoming.sentAt,
        attachmentUrl: incoming.attachmentUrl,
        attachmentName: incoming.attachmentName,
        attachmentMimeType: incoming.attachmentMimeType,
        audioDurationMs: incoming.audioDurationMs,
        imaging: incoming.imaging,
      };
      setMessages(current => current.some(item => item.id === incoming.id) ? current : [...current, mapStoredMessage(stored, currentUser!.id)]);
      setContacts(current => {
        const contact = current.find(item => item.id === incoming.senderId);
        if (!contact) return current;
        return orderContactsByActivity([{
          ...contact,
          lastMessageAt: incoming.sentAt,
          lastMessagePreview: messagePreview(stored.kind, incoming.text),
          unreadCount: selectedContact?.id === incoming.senderId ? 0 : (contact.unreadCount || 0) + 1,
        }, ...current.filter(item => item.id !== incoming.senderId)]);
      });
      if (selectedContact?.id === incoming.senderId && currentUser?.id) {
        socket?.emit("message.read", { readerId: currentUser.id, senderId: incoming.senderId, messageIds: [incoming.id] });
      }
    };
    window.addEventListener("aulia:message.received", handleIncoming);
    return () => window.removeEventListener("aulia:message.received", handleIncoming);
  }, [contacts, currentUser, selectedContact?.id, socket]);

  useEffect(() => {
    if (!selectedContact || !currentUser?.id) return;
    window.dispatchEvent(new CustomEvent("aulia:messages.read", { detail: { contactId: selectedContact.id } }));
    const unreadIds = messages
      .filter(chatMessage => chatMessage.contactId === selectedContact.id && chatMessage.from === "contact")
      .map(chatMessage => chatMessage.id)
      .filter(messageId => !readAcknowledgedIdsRef.current.has(messageId));
    if (unreadIds.length > 0) {
      unreadIds.forEach(messageId => readAcknowledgedIdsRef.current.add(messageId));
      socket?.emit("message.read", { readerId: currentUser.id, senderId: selectedContact.id, messageIds: unreadIds });
      markMessagesRead(selectedContact.id, unreadIds).catch(() => unreadIds.forEach(messageId => readAcknowledgedIdsRef.current.delete(messageId)));
    }
    setContacts(current => current.map(contact => contact.id === selectedContact.id ? { ...contact, unreadCount: 0 } : contact));
  }, [currentUser?.id, messages, selectedContact, socket]);

  useEffect(() => {
    if (!selectedContact || !currentUser?.id) return;
    let cancelled = false;
    fetchConversationMessages(selectedContact.id)
      .then(storedMessages => {
        if (cancelled) return;
        const mapped = storedMessages.map(stored => mapStoredMessage(stored, currentUser.id));
        setMessages(current => [...current.filter(chatMessage => chatMessage.contactId !== selectedContact.id), ...mapped]);
      })
      .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Impossible de charger cette conversation autorisée."); });
    return () => { cancelled = true; };
  }, [currentUser?.id, selectedContact]);

  useEffect(() => {
    const handleStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ messageId?: string; status?: ChatMessage["status"] }>).detail;
      if (!detail?.messageId || !detail.status) return;
      setMessages(current => current.map(chatMessage => chatMessage.id === detail.messageId ? { ...chatMessage, status: detail.status } : chatMessage));
    };
    const handleRead = (event: Event) => {
      const detail = (event as CustomEvent<{ readerId?: string; messageIds?: string[] }>).detail;
      if (!detail?.readerId) return;
      setMessages(current => current.map(chatMessage => chatMessage.from === "me" && chatMessage.contactId === detail.readerId && (!detail.messageIds?.length || detail.messageIds.includes(chatMessage.id)) ? { ...chatMessage, status: "read" } : chatMessage));
    };
    const handlePresence = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; online?: boolean }>).detail;
      if (detail?.userId) setOnlineUsers(current => ({ ...current, [detail.userId as string]: Boolean(detail.online) }));
    };
    const handleTyping = (event: Event) => {
      const detail = (event as CustomEvent<{ senderId?: string; isTyping?: boolean }>).detail;
      if (detail?.senderId) setTypingUsers(current => ({ ...current, [detail.senderId as string]: Boolean(detail.isTyping) }));
    };
    window.addEventListener("aulia:message.status", handleStatus);
    window.addEventListener("aulia:message.read", handleRead);
    window.addEventListener("aulia:user.presence", handlePresence);
    window.addEventListener("aulia:message.typing", handleTyping);
    return () => {
      window.removeEventListener("aulia:message.status", handleStatus);
      window.removeEventListener("aulia:message.read", handleRead);
      window.removeEventListener("aulia:user.presence", handlePresence);
      window.removeEventListener("aulia:message.typing", handleTyping);
    };
  }, []);

  const filteredContacts = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return orderContactsByActivity(contacts);
    return orderContactsByActivity(contacts.filter(contact => [contact.name, contact.role, contact.subtitle, contact.phone, contact.email].filter(Boolean).join(" ").toLowerCase().includes(query)));
  }, [contacts, searchTerm]);

  const selectedMessages = selectedContact ? messages.filter(chatMessage => chatMessage.contactId === selectedContact.id) : [];
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end" }); }, [selectedContact?.id, selectedMessages.length]);

  const updateAfterSent = (stored: StoredMessage) => {
    if (!currentUser || !selectedContact) return;
    setMessages(current => [...current.filter(item => item.id !== stored.id), mapStoredMessage(stored, currentUser.id)]);
    setContacts(current => orderContactsByActivity(current.map(contact => contact.id === selectedContact.id ? {
      ...contact,
      lastMessageAt: stored.createdAt,
      lastMessagePreview: messagePreview(stored.kind, stored.text),
      unreadCount: 0,
    } : contact)));
  };

  const sendMessage = () => {
    if (!selectedContact || !message.trim() || !currentUser || photoDraft) return;
    if (!socket) {
      setError("La connexion sécurisée de messagerie est indisponible. Le message n’a pas été envoyé.");
      return;
    }
    const text = message.trim();
    const sentAt = new Date().toISOString();
    const optimisticId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setMessages(current => [...current, { id: optimisticId, contactId: selectedContact.id, from: "me", text, kind: "TEXT", time: timeLabel(sentAt), status: onlineUsers[selectedContact.id] ? "delivered" : "sent" }]);
    setContacts(current => orderContactsByActivity(current.map(contact => contact.id === selectedContact.id ? { ...contact, lastMessageAt: sentAt, lastMessagePreview: text, unreadCount: 0 } : contact)));
    socket.emit("message.send", {
      id: optimisticId,
      senderId: currentUser.id,
      senderName: currentUser.displayName || currentUser.username || "Utilisateur",
      recipientId: selectedContact.id,
      recipientName: selectedContact.name,
      recipientType: selectedContact.type,
      text,
      sentAt,
    }, (response: { status?: ChatMessage["status"]; error?: string } | undefined) => {
      if (!response?.status) {
        setMessages(current => current.filter(chatMessage => chatMessage.id !== optimisticId));
        setError(response?.error || "Le message n’a pas été accepté par le serveur.");
        return;
      }
      setMessages(current => current.map(chatMessage => chatMessage.id === optimisticId ? { ...chatMessage, status: response.status } : chatMessage));
    });
    setMessage("");
  };

  const handleMessageChange = (value: string) => {
    setMessage(value);
    if (!selectedContact || !currentUser?.id || !socket) return;
    socket.emit("message.typing", { senderId: currentUser.id, recipientId: selectedContact.id, isTyping: true });
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => socket.emit("message.typing", { senderId: currentUser.id, recipientId: selectedContact.id, isTyping: false }), 1200);
  };

  const choosePhoto = (file?: File) => {
    if (!file) return;
    setError(null);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) {
      setError("Choisissez une photo JPEG, PNG ou WebP de 8 Mo maximum.");
      return;
    }
    if (photoDraftUrlRef.current) URL.revokeObjectURL(photoDraftUrlRef.current);
    const url = URL.createObjectURL(file);
    photoDraftUrlRef.current = url;
    setPhotoDraft({ file, url });
  };

  const discardPhoto = () => {
    if (photoDraftUrlRef.current) URL.revokeObjectURL(photoDraftUrlRef.current);
    photoDraftUrlRef.current = null;
    setPhotoDraft(null);
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  const sendPhoto = async () => {
    if (!photoDraft || !selectedContact || isSendingMedia) return;
    setIsSendingMedia(true);
    setError(null);
    try {
      const sent = await sendMediaMessage(selectedContact.id, { kind: "PHOTO", file: photoDraft.file, fileName: photoDraft.file.name, caption: message });
      updateAfterSent(sent);
      discardPhoto();
      setMessage("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "La photo n’a pas été envoyée.");
    } finally {
      setIsSendingMedia(false);
    }
  };

  const sendVoice = async (blob: Blob, durationMs: number) => {
    if (!selectedContact) throw new Error("Choisissez d’abord un contact.");
    setIsSendingMedia(true);
    try {
      const extension = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "m4a" : "webm";
      const sent = await sendMediaMessage(selectedContact.id, { kind: "VOICE", file: blob, fileName: `note-vocale.${extension}`, durationMs });
      updateAfterSent(sent);
    } finally {
      setIsSendingMedia(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-col px-3 py-3 sm:px-6 sm:py-4 lg:px-8">
      <PageMeta title={title} description={description} />
      <PageBreadcrumb pageTitle="Messages" />
      <div className="h-[calc(100dvh-9rem)] min-h-[540px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="grid h-full min-h-0 xl:grid-cols-[350px_minmax(0,1fr)]">
          <aside className={`min-h-0 flex-col border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 ${selectedContact ? "hidden xl:flex xl:border-r" : "flex"}`}>
            <div className="shrink-0 border-b border-slate-200 px-4 py-4 dark:border-slate-800">
              <div className="flex items-center justify-between gap-3">
                <div><h2 className="text-xl font-extrabold text-slate-900 dark:text-white">Discussions</h2><p className="mt-0.5 text-xs text-slate-500">Contacts autorisés par votre rôle</p></div>
                <ShieldCheck className="h-6 w-6 text-[#00a884]" aria-label="Messagerie privée" />
              </div>
              <label className="mt-4 flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2.5 focus-within:ring-2 focus-within:ring-[#00a884]/25 dark:bg-slate-800">
                <Search className="h-4 w-4 text-slate-500" />
                <input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} type="search" placeholder="Rechercher une discussion" className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none dark:text-slate-100" />
              </label>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
              {isLoading ? <p className="p-4 text-sm text-slate-500">Chargement des contacts…</p>
                : filteredContacts.length === 0 ? <p className="p-4 text-sm text-slate-500">Aucun contact disponible.</p>
                : filteredContacts.map(contact => (
                  <button key={`${contact.type}-${contact.id}`} onClick={() => setSelectedContact(contact)} className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a884]/40 dark:hover:bg-slate-800 ${selectedContact?.id === contact.id ? "bg-slate-100 dark:bg-slate-800" : ""}`}>
                    <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white">{initials(contact.name)}{onlineUsers[contact.id] && <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-[#00a884] dark:border-slate-900" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2"><span className="truncate text-[15px] font-semibold text-slate-900 dark:text-white">{contact.name}</span>{contact.lastMessageAt && <span className="shrink-0 text-[11px] text-slate-400">{timeLabel(contact.lastMessageAt)}</span>}</span>
                      <span className="mt-0.5 flex items-center gap-2"><span className={`min-w-0 flex-1 truncate text-[13px] ${contact.unreadCount ? "font-semibold text-slate-800 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"}`}>{contact.lastMessagePreview || `${roleLabels[contact.role] || contact.role} · ${contact.subtitle || "Disponible"}`}</span>{(contact.unreadCount || 0) > 0 && <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[#00a884] px-1 text-[11px] font-bold text-white">{contact.unreadCount! > 99 ? "99+" : contact.unreadCount}</span>}</span>
                    </span>
                  </button>
                ))}
            </div>
          </aside>

          <section className={`min-h-0 flex-col bg-[#efeae2] dark:bg-slate-950 ${selectedContact ? "flex" : "hidden xl:flex"}`}>
            <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900 sm:px-4">
              {selectedContact && <button type="button" onClick={() => setSelectedContact(null)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 xl:hidden" aria-label="Retour aux contacts"><span className="text-3xl leading-none">‹</span></button>}
              {selectedContact ? <>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white">{initials(selectedContact.name)}</span>
                <div className="min-w-0 flex-1"><h2 className="truncate text-[15px] font-bold text-slate-900 dark:text-white">{selectedContact.name}</h2><p className="truncate text-xs text-slate-500 dark:text-slate-400">{typingUsers[selectedContact.id] ? "est en train d’écrire…" : onlineUsers[selectedContact.id] ? "En ligne" : `${roleLabels[selectedContact.role] || selectedContact.role} · ${selectedContact.subtitle || "Contact autorisé"}`}</p></div>
                <ShieldCheck className="h-5 w-5 shrink-0 text-teal-600" aria-label="Conversation autorisée" />
              </> : <h2 className="text-base font-semibold text-slate-700 dark:text-slate-200">Choisissez une discussion</h2>}
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-6 sm:py-5" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(15, 118, 110, 0.09) 1px, transparent 0)", backgroundSize: "24px 24px" }}>
              {state?.patientInfo && selectedContact?.id === state.patientId && <div className="mx-auto mb-4 max-w-xl rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100"><p className="mb-1 font-bold">Contexte patient</p><p className="whitespace-pre-wrap">{state.patientInfo}</p></div>}
              {error && <div className="sticky top-0 z-10 mx-auto mb-4 flex max-w-2xl items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700 shadow-sm dark:bg-red-950 dark:text-red-100" role="alert"><span className="min-w-0 flex-1">{error}</span><button type="button" onClick={() => setError(null)} aria-label="Fermer l’erreur"><X className="h-4 w-4" /></button></div>}
              {selectedMessages.length === 0 ? <div className="mx-auto mt-12 max-w-md rounded-2xl bg-white/85 p-5 text-center shadow-sm dark:bg-slate-900/90"><ShieldCheck className="mx-auto mb-3 h-8 w-8 text-[#00a884]" /><p className="font-semibold text-slate-800 dark:text-slate-100">Conversation privée</p><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Écrivez, envoyez une photo ou une note vocale. Les imageries suivent les autorisations cliniques.</p></div>
                : <div className="mx-auto max-w-5xl space-y-2">{selectedMessages.map(chatMessage => <MessageBubble key={chatMessage.id} message={chatMessage} onOpenImage={setPreviewImage} />)}</div>}
              <div ref={bottomRef} />
            </div>

            <footer className="relative shrink-0 border-t border-slate-200 bg-[#f0f2f5] px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] dark:border-slate-800 dark:bg-slate-900 sm:px-3 sm:py-3">
              {photoDraft && <div className="mb-2 flex items-center gap-3 rounded-2xl bg-white p-2 shadow-sm dark:bg-slate-800"><img src={photoDraft.url} alt="Photo à envoyer" className="h-16 w-16 rounded-xl object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-800 dark:text-white">{photoDraft.file.name}</p><p className="text-xs text-slate-500">Ajoutez une légende puis envoyez.</p></div><button type="button" onClick={discardPhoto} className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700" aria-label="Retirer la photo"><X className="h-5 w-5" /></button><button type="button" onClick={sendPhoto} disabled={isSendingMedia} className="flex h-11 w-11 items-center justify-center rounded-full bg-[#00a884] text-white disabled:opacity-50" aria-label="Envoyer la photo">{isSendingMedia ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}</button></div>}
              <div className="flex items-end gap-1 sm:gap-2">
                <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={event => choosePhoto(event.target.files?.[0])} />
                <button type="button" onClick={() => photoInputRef.current?.click()} disabled={!selectedContact || isSendingMedia} className="flex h-11 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-200 hover:text-[#00a884] disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700" aria-label="Envoyer une photo" title="Envoyer une photo"><ImageIcon className="h-6 w-6" /></button>
                {canShareImaging(currentUser?.primaryRole) && <button type="button" onClick={() => setShowImagingPicker(true)} disabled={!selectedContact || isSendingMedia} className="flex h-11 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-200 hover:text-teal-700 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700" aria-label="Partager une imagerie PACS" title="Partager une imagerie PACS"><ScanLine className="h-6 w-6" /></button>}
                <label className="min-w-0 flex-1"><span className="sr-only">Message</span><textarea value={message} onChange={event => handleMessageChange(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (photoDraft) void sendPhoto(); else sendMessage(); } }} disabled={!selectedContact || isSendingMedia} rows={1} placeholder={selectedContact ? "Tapez un message" : "Choisissez d’abord un contact"} className="max-h-28 min-h-11 w-full resize-none rounded-3xl border border-transparent bg-white px-4 py-3 text-[15px] text-slate-800 outline-none transition focus:border-[#00a884]/40 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-800 dark:text-slate-100" /></label>
                {message.trim() && !photoDraft ? <button type="button" onClick={sendMessage} disabled={!selectedContact || isSendingMedia} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white shadow-sm transition hover:bg-[#008f72] disabled:opacity-40" aria-label="Envoyer le message"><Send className="h-5 w-5" /></button>
                  : !photoDraft && <VoiceRecorder disabled={!selectedContact || isSendingMedia} onSend={sendVoice} />}
              </div>
            </footer>
          </section>
        </div>
      </div>

      {showImagingPicker && selectedContact && <ImagingPicker contact={selectedContact} onClose={() => setShowImagingPicker(false)} onSent={updateAfterSent} />}
      {previewImage && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/90 p-4" role="dialog" aria-modal="true" aria-label="Aperçu de l’image" onMouseDown={event => { if (event.target === event.currentTarget) setPreviewImage(null); }}><button type="button" onClick={() => setPreviewImage(null)} className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Fermer l’image"><X className="h-6 w-6" /></button><img src={previewImage} alt="Aperçu agrandi" className="max-h-[90dvh] max-w-full rounded-xl object-contain" /></div>}
    </div>
  );
}
