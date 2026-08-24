import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { PaperPlaneIcon } from "../../icons";
import {
  fetchConversationMessages,
  fetchMessageContacts,
  markMessagesRead,
  MessageContact,
  StoredMessage,
} from "../../api/messages";
import { useAuth } from "../../context/AuthContext";
import { useRealtime } from "../../context/RealtimeContext";
import PageBreadcrumb from "../common/PageBreadCrumb";
import PageMeta from "../common/PageMeta";

type ChatMessage = {
  id: string;
  contactId: string;
  from: "me" | "contact";
  text: string;
  time: string;
  status?: "sent" | "delivered" | "read";
};

type RealtimeMessage = {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientName?: string;
  recipientType?: "USER" | "PATIENT";
  text: string;
  sentAt: string;
};

type RoleMessagesProps = {
  title: string;
  description: string;
};

const roleLabels: Record<string, string> = {
  RECEPTIONIST: "Reception",
  NURSE: "Infirmier",
  PHYSICIAN: "Medecin",
  LAB_TECHNICIAN: "Laboratoire",
  RADIOLOGIST: "Radiologie",
  PHARMACIST: "Pharmacie",
  PATIENT: "Patient",
  ADMIN: "Administration",
  SUPER_ADMIN: "Administration",
  FINANCE: "Finance",
};

const mapStoredMessage = (stored: StoredMessage, currentUserId: string): ChatMessage => ({
  id: stored.id,
  contactId: stored.senderId === currentUserId ? stored.recipientId : stored.senderId,
  from: stored.senderId === currentUserId ? "me" : "contact",
  text: stored.text,
  time: new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(stored.createdAt)),
  status: stored.status.toLowerCase() as ChatMessage["status"],
});

const orderContactsByActivity = (items: MessageContact[]) => [...items].sort((left, right) => {
  const rightAt = right.lastMessageAt ? new Date(right.lastMessageAt).getTime() : 0;
  const leftAt = left.lastMessageAt ? new Date(left.lastMessageAt).getTime() : 0;
  return rightAt - leftAt || (right.unreadCount || 0) - (left.unreadCount || 0) || left.name.localeCompare(right.name, "fr");
});

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
  const [error, setError] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<Record<string, boolean>>({});
  const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});
  const typingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const loadContacts = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchMessageContacts();
        setContacts(orderContactsByActivity(data));
        const preferredId = state?.contactId || state?.patientId;
        const preferred = preferredId
          ? data.find((contact) => contact.id === preferredId || contact.patientId === preferredId)
          : data[0];
        setSelectedContact(preferred || data[0] || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Impossible de charger les contacts.");
      } finally {
        setIsLoading(false);
      }
    };

    loadContacts();
  }, [state?.contactId, state?.patientId]);

  useEffect(() => {
    const handleIncoming = (event: Event) => {
      const incoming = (event as CustomEvent<RealtimeMessage>).detail;
      if (!incoming || incoming.senderId === currentUser?.id) return;

      setMessages((current) => {
        if (current.some((item) => item.id === incoming.id)) return current;
        return [
          ...current,
          {
            id: incoming.id,
            contactId: incoming.senderId,
            from: "contact",
            text: incoming.text,
            time: new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(
              new Date(incoming.sentAt),
            ),
            status: "delivered",
          },
        ];
      });

      setContacts((current) => {
        const known = current.find((contact) => contact.id === incoming.senderId);
        const contact: MessageContact = known || {
          id: incoming.senderId,
          type: "USER",
          name: incoming.senderName || "Nouveau contact",
          role: "CONTACT",
        };
        return orderContactsByActivity([
          {
            ...contact,
            lastMessageAt: incoming.sentAt,
            lastMessagePreview: incoming.text,
            unreadCount: selectedContact?.id === incoming.senderId ? 0 : (contact.unreadCount || 0) + 1,
          },
          ...current.filter((item) => item.id !== incoming.senderId),
        ]);
      });

      if (selectedContact?.id === incoming.senderId && currentUser?.id) {
        socket?.emit("message.read", {
          readerId: currentUser.id,
          senderId: incoming.senderId,
          messageIds: [incoming.id],
        });
      }
    };

    window.addEventListener("aulia:message.received", handleIncoming);
    return () => window.removeEventListener("aulia:message.received", handleIncoming);
  }, [currentUser?.id, selectedContact?.id, socket]);

  useEffect(() => {
    if (!selectedContact || !currentUser?.id) return;
    window.dispatchEvent(new CustomEvent("aulia:messages.read", { detail: { contactId: selectedContact.id } }));
    const unreadIds = messages
      .filter((chatMessage) => chatMessage.contactId === selectedContact.id && chatMessage.from === "contact")
      .map((chatMessage) => chatMessage.id);
    if (unreadIds.length > 0) {
      socket?.emit("message.read", {
        readerId: currentUser.id,
        senderId: selectedContact.id,
        messageIds: unreadIds,
      });
      markMessagesRead(selectedContact.id, unreadIds).catch(() => undefined);
    }
    setContacts((current) => current.map((contact) => contact.id === selectedContact.id ? { ...contact, unreadCount: 0 } : contact));
  }, [currentUser?.id, messages, selectedContact, socket]);

  useEffect(() => {
    if (!selectedContact || !currentUser?.id) return;
    let cancelled = false;

    fetchConversationMessages(selectedContact.id)
      .then((storedMessages) => {
        if (cancelled) return;
        const mapped = storedMessages.map((stored) => mapStoredMessage(stored, currentUser.id));
        setMessages((current) => [
          ...current.filter((chatMessage) => chatMessage.contactId !== selectedContact.id),
          ...mapped,
        ]);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, selectedContact]);

  useEffect(() => {
    const handleStatus = (event: Event) => {
      const detail = (event as CustomEvent<{ messageId?: string; status?: ChatMessage["status"] }>).detail;
      if (!detail?.messageId || !detail.status) return;
      setMessages((current) =>
        current.map((chatMessage) =>
          chatMessage.id === detail.messageId ? { ...chatMessage, status: detail.status } : chatMessage,
        ),
      );
    };

    const handleRead = (event: Event) => {
      const detail = (event as CustomEvent<{ readerId?: string; messageIds?: string[] }>).detail;
      if (!detail?.readerId) return;
      setMessages((current) =>
        current.map((chatMessage) =>
          chatMessage.from === "me" &&
          chatMessage.contactId === detail.readerId &&
          (!detail.messageIds?.length || detail.messageIds.includes(chatMessage.id))
            ? { ...chatMessage, status: "read" }
            : chatMessage,
        ),
      );
    };

    const handlePresence = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; online?: boolean }>).detail;
      if (!detail?.userId) return;
      setOnlineUsers((current) => ({ ...current, [detail.userId as string]: Boolean(detail.online) }));
    };

    const handleTyping = (event: Event) => {
      const detail = (event as CustomEvent<{ senderId?: string; isTyping?: boolean }>).detail;
      if (!detail?.senderId) return;
      setTypingUsers((current) => ({ ...current, [detail.senderId as string]: Boolean(detail.isTyping) }));
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
    return orderContactsByActivity(contacts.filter((contact) =>
      [contact.name, contact.role, contact.subtitle, contact.phone, contact.email]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query),
    ));
  }, [contacts, searchTerm]);

  const selectedMessages = selectedContact
    ? messages.filter((chatMessage) => chatMessage.contactId === selectedContact.id)
    : [];

  const sendMessage = () => {
    if (!selectedContact || !message.trim() || !currentUser) return;
    const text = message.trim();
    const sentAt = new Date().toISOString();
    const optimisticId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    setMessages((current) => [
      ...current,
      {
        id: optimisticId,
        contactId: selectedContact.id,
        from: "me",
        text,
        time: new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(sentAt)),
        status: onlineUsers[selectedContact.id] ? "delivered" : "sent",
      },
    ]);
    setContacts((current) => orderContactsByActivity(current.map((contact) => contact.id === selectedContact.id
      ? { ...contact, lastMessageAt: sentAt, lastMessagePreview: text, unreadCount: 0 }
      : contact,
    )));
    socket?.emit(
      "message.send",
      {
        id: optimisticId,
        senderId: currentUser.id,
        senderName: currentUser.displayName || currentUser.username || "Utilisateur",
        recipientId: selectedContact.id,
        recipientName: selectedContact.name,
        recipientType: selectedContact.type,
        text,
        sentAt,
      },
      (response: { status?: ChatMessage["status"] } | undefined) => {
        if (!response?.status) return;
        setMessages((current) =>
          current.map((chatMessage) =>
            chatMessage.id === optimisticId ? { ...chatMessage, status: response.status } : chatMessage,
          ),
        );
      },
    );
    setMessage("");
  };

  const handleMessageChange = (value: string) => {
    setMessage(value);
    if (!selectedContact || !currentUser?.id || !socket) return;

    socket.emit("message.typing", {
      senderId: currentUser.id,
      recipientId: selectedContact.id,
      isTyping: true,
    });

    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => {
      socket.emit("message.typing", {
        senderId: currentUser.id,
        recipientId: selectedContact.id,
        isTyping: false,
      });
    }, 1200);
  };

  const renderStatus = (status?: ChatMessage["status"]) => {
    if (status === "read") return <span className="font-semibold text-emerald-300">✓✓</span>;
    if (status === "delivered") return <span className="font-semibold text-white/80">✓✓</span>;
    return <span className="font-semibold text-white/70">✓</span>;
  };

  return (
    <div className="flex min-h-0 flex-col px-4 py-4 sm:px-6 lg:px-8">
      <PageMeta title={title} description={description} />
      <PageBreadcrumb pageTitle="Messages" />

      <div className="min-h-[calc(100dvh-9.5rem)] flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950 xl:min-h-[calc(100dvh-10rem)]">
        <div className="grid h-full min-h-0 xl:grid-cols-[340px_minmax(0,1fr)]">
          <aside
            className={`min-h-0 flex-col border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/45 ${
              selectedContact ? "hidden xl:flex xl:border-r" : "flex"
            }`}
          >
            <div className="shrink-0 border-b border-slate-200 p-4 dark:border-slate-800 sm:p-5">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <h3 className="mb-2 text-sm font-semibold uppercase text-gray-500 dark:text-gray-400">Contacts autorises</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                La liste vient de la base et depend de votre role.
              </p>
              </div>

              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                type="text"
                placeholder="Rechercher un contact..."
                className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />

              {error && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700 dark:bg-red-950/30 dark:text-red-200">{error}</p>}
            </div>

            <div className="h-[390px] min-h-0 space-y-2 overflow-y-auto overscroll-contain p-3 sm:p-4">
              {isLoading ? (
                <p className="text-sm text-gray-500">Chargement des contacts...</p>
              ) : filteredContacts.length === 0 ? (
                <p className="text-sm text-gray-500">Aucun contact disponible.</p>
              ) : (
                filteredContacts.map((contact) => (
                  <button
                    key={`${contact.type}-${contact.id}`}
                    onClick={() => setSelectedContact(contact)}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/50 hover:border-teal-300 hover:bg-teal-50/70 dark:bg-slate-950 dark:hover:border-teal-500/50 dark:hover:bg-teal-950/25 ${
                      selectedContact?.id === contact.id && selectedContact?.type === contact.type
                        ? "border-teal-300 bg-teal-50 dark:border-teal-500/50 dark:bg-teal-950/25"
                        : "border-transparent bg-white"
                    }`}
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#009488] to-[#0a1d3a] text-sm font-semibold text-white shadow-sm">
                      {contact.name
                        .split(" ")
                        .map((part) => part[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-gray-900 dark:text-white">{contact.name}</span>
                        {(contact.unreadCount || 0) > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#009488] px-1 text-[10px] font-bold text-white">{contact.unreadCount! > 99 ? "99+" : contact.unreadCount}</span>}
                      </span>
                      <span className={`block truncate text-xs ${contact.unreadCount ? "font-semibold text-slate-700 dark:text-slate-200" : "text-gray-500 dark:text-gray-400"}`}>
                        {contact.lastMessagePreview || `${roleLabels[contact.role] || contact.role} · ${contact.subtitle || "Disponible"}`}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </aside>

          <section
            className={`min-h-0 flex-col bg-slate-50/50 dark:bg-slate-950 ${
              selectedContact ? "flex" : "hidden xl:flex"
            }`}
          >
            <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950 sm:px-5 sm:py-4">
              {selectedContact && (
                <button
                  type="button"
                  onClick={() => setSelectedContact(null)}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/50 dark:text-slate-300 dark:hover:bg-slate-800 xl:hidden"
                  aria-label="Retour aux contacts"
                >
                  <span aria-hidden="true" className="text-2xl leading-none">‹</span>
                </button>
              )}
              {selectedContact ? (
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white">{selectedContact.name}</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {roleLabels[selectedContact.role] || selectedContact.role} - {selectedContact.subtitle || "Contact autorise"}
                  </p>
                  {typingUsers[selectedContact.id] && (
                    <p className="mt-1 text-xs font-medium text-blue-600 dark:text-blue-300">est en train d'ecrire...</p>
                  )}
                </div>
              ) : (
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Choisir un contact</h2>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-5 sm:py-6">
              {state?.patientInfo && selectedContact?.id === state.patientId && (
                <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                  <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Infos patient</p>
                  <p className="whitespace-pre-wrap">{state.patientInfo}</p>
                </div>
              )}

              {selectedMessages.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Aucun message dans cette discussion. Vous pouvez commencer la conversation.
                </p>
              ) : (
                <div className="space-y-4">
                  {selectedMessages.map((chatMessage) => (
                  <div
                      key={chatMessage.id}
                      className={`flex ${chatMessage.from === "me" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-lg px-4 py-3 text-sm ${
                          chatMessage.from === "me"
                            ? "bg-gradient-to-br from-[#0a1d3a] to-[#009488] text-white"
                            : "border border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                        }`}
                        >
                        {chatMessage.text}
                        <span className="mt-2 flex items-center justify-end gap-2 text-xs opacity-70">
                          <span>{chatMessage.time}</span>
                          {chatMessage.from === "me" && renderStatus(chatMessage.status)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-slate-800 dark:bg-slate-950 sm:px-5 sm:py-4">
              <div className="flex items-center gap-3">
                <input
                  value={message}
                  onChange={(event) => handleMessageChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") sendMessage();
                  }}
                  disabled={!selectedContact}
                  placeholder={selectedContact ? "Tapez un message..." : "Choisissez d'abord un contact"}
                  className="min-h-[52px] min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
                <button
                  onClick={sendMessage}
                  disabled={!selectedContact || !message.trim()}
                  className="inline-flex h-12 shrink-0 items-center justify-center rounded-2xl bg-[#009488] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#007c73] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <PaperPlaneIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
