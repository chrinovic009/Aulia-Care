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
};

const mapStoredMessage = (stored: StoredMessage, currentUserId: string): ChatMessage => ({
  id: stored.id,
  contactId: stored.senderId === currentUserId ? stored.recipientId : stored.senderId,
  from: stored.senderId === currentUserId ? "me" : "contact",
  text: stored.text,
  time: new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(stored.createdAt)),
  status: stored.status.toLowerCase() as ChatMessage["status"],
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
        setContacts(data);
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

      if (selectedContact?.id === incoming.senderId && currentUser?.id) {
        socket?.emit("message.read", {
          readerId: currentUser.id,
          senderId: incoming.senderId,
          messageIds: [incoming.id],
        });
      }
    };

    window.addEventListener("d7:message.received", handleIncoming);
    return () => window.removeEventListener("d7:message.received", handleIncoming);
  }, [currentUser?.id, selectedContact?.id, socket]);

  useEffect(() => {
    if (!selectedContact || !currentUser?.id) return;
    window.dispatchEvent(new CustomEvent("d7:messages.read", { detail: { contactId: selectedContact.id } }));
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

    window.addEventListener("d7:message.status", handleStatus);
    window.addEventListener("d7:message.read", handleRead);
    window.addEventListener("d7:user.presence", handlePresence);
    window.addEventListener("d7:message.typing", handleTyping);
    return () => {
      window.removeEventListener("d7:message.status", handleStatus);
      window.removeEventListener("d7:message.read", handleRead);
      window.removeEventListener("d7:user.presence", handlePresence);
      window.removeEventListener("d7:message.typing", handleTyping);
    };
  }, []);

  const filteredContacts = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return contacts;
    return contacts.filter((contact) =>
      [contact.name, contact.role, contact.subtitle, contact.phone, contact.email]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
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
    <div>
      <PageMeta title={title} description={description} />
      <PageBreadcrumb pageTitle="Messages" />

      <div className="min-h-screen rounded-lg border border-gray-200 bg-white px-5 py-7 dark:border-gray-800 dark:bg-white/[0.03] xl:px-10 xl:py-12">
        <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
          <aside className="rounded-lg border border-gray-200 bg-slate-50 p-5 dark:border-gray-800 dark:bg-slate-900/70">
            <div className="mb-5 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-slate-950">
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
              className="mb-4 w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 outline-none focus:border-blue-500 dark:border-gray-800 dark:bg-slate-950 dark:text-gray-200"
            />

            {error && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>}

            <div className="space-y-3">
              {isLoading ? (
                <p className="text-sm text-gray-500">Chargement des contacts...</p>
              ) : filteredContacts.length === 0 ? (
                <p className="text-sm text-gray-500">Aucun contact disponible.</p>
              ) : (
                filteredContacts.map((contact) => (
                  <button
                    key={`${contact.type}-${contact.id}`}
                    onClick={() => setSelectedContact(contact)}
                    className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition hover:border-blue-200 hover:bg-blue-50 dark:bg-slate-950 dark:hover:border-blue-500/40 dark:hover:bg-slate-900 ${
                      selectedContact?.id === contact.id && selectedContact?.type === contact.type
                        ? "border-blue-200 bg-blue-50 dark:border-blue-500/40 dark:bg-slate-900"
                        : "border-transparent bg-white"
                    }`}
                  >
                    <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-500 text-sm font-semibold text-white">
                      {contact.name
                        .split(" ")
                        .map((part) => part[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-gray-900 dark:text-white">{contact.name}</span>
                      <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                        {roleLabels[contact.role] || contact.role} - {contact.subtitle || "Disponible"}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </aside>

          <section className="flex min-h-[640px] flex-col rounded-lg border border-gray-200 bg-slate-50 dark:border-gray-800 dark:bg-slate-950">
            <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
              {selectedContact ? (
                <>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white">{selectedContact.name}</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {roleLabels[selectedContact.role] || selectedContact.role} - {selectedContact.subtitle || "Contact autorise"}
                  </p>
                  {typingUsers[selectedContact.id] && (
                    <p className="mt-1 text-xs font-medium text-blue-600 dark:text-blue-300">est en train d'ecrire...</p>
                  )}
                </>
              ) : (
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Choisir un contact</h2>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-6">
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
                            ? "bg-blue-600 text-white"
                            : "border border-gray-200 bg-white text-gray-700"
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

            <div className="border-t border-gray-200 px-5 py-4 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <input
                  value={message}
                  onChange={(event) => handleMessageChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") sendMessage();
                  }}
                  disabled={!selectedContact}
                  placeholder={selectedContact ? "Tapez un message..." : "Choisissez d'abord un contact"}
                  className="min-h-[52px] flex-1 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-800 dark:bg-slate-900 dark:text-gray-200"
                />
                <button
                  onClick={sendMessage}
                  disabled={!selectedContact || !message.trim()}
                  className="inline-flex h-12 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
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
