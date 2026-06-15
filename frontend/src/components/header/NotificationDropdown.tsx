import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dropdown } from "../ui/dropdown/Dropdown";
import { DropdownItem } from "../ui/dropdown/DropdownItem";
import { RoleSlug, useAuth } from "../../context/AuthContext";
import { fetchUnreadMessages, StoredMessage } from "../../api/messages";

type RealtimeMessage = {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  text: string;
  sentAt: string;
};

type ToastState = {
  visible: boolean;
  message?: RealtimeMessage;
};

const messageRoutes: Partial<Record<RoleSlug, string>> = {
  RECEPTIONIST: "/reception/messages",
  NURSE: "/nurse/messages",
  PHYSICIAN: "/doctor/messages",
  CASHIER: "/caissier/messages",
  PATIENT: "/messages",
  LAB_TECHNICIAN: "/laboratoire/messages",
  RADIOLOGIST: "/radiologie/messages",
  PHARMACIST: "/pharmacie/messages",
};

const truncate = (value: string, size = 90) => {
  if (value.length <= size) return value;
  return `${value.slice(0, size).trim()}...`;
};

const playMessageSound = () => {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;

    const ctx = new Ctx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.45);
    oscillator.start();
    window.setTimeout(() => {
      oscillator.stop();
      ctx.close();
    }, 500);
  } catch {
    // Browsers may block audio until the user interacts with the page.
  }
};

const mapStoredUnread = (message: StoredMessage): RealtimeMessage => ({
  id: message.id,
  senderId: message.senderId,
  senderName: message.sender?.displayName || message.sender?.username || "Utilisateur",
  recipientId: message.recipientId,
  text: message.text,
  sentAt: message.createdAt,
});

const showBrowserNotification = (message: RealtimeMessage, onClick: () => void) => {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const notification = new Notification(`Message de ${message.senderName}`, {
    body: truncate(message.text, 140),
    tag: message.id,
    silent: true,
  });
  notification.onclick = () => {
    window.focus();
    onClick();
    notification.close();
  };
  window.setTimeout(() => notification.close(), 30000);
};

export default function NotificationDropdown() {
  const { currentUser } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState<RealtimeMessage[]>([]);
  const [toast, setToast] = useState<ToastState>({ visible: false });
  const toastTimerRef = useRef<number | null>(null);
  const navigate = useNavigate();

  const messagePath = useMemo(() => {
    return currentUser?.primaryRole ? messageRoutes[currentUser.primaryRole] || "/messages" : "/messages";
  }, [currentUser?.primaryRole]);

  useEffect(() => {
    if (!currentUser?.id) return;
    fetchUnreadMessages()
      .then((messages) => setUnreadMessages(messages.map(mapStoredUnread)))
      .catch(() => undefined);
  }, [currentUser?.id]);

  useEffect(() => {
    const handleIncoming = (event: Event) => {
      const incoming = (event as CustomEvent<RealtimeMessage>).detail;
      if (!incoming || incoming.recipientId !== currentUser?.id) return;

      setUnreadMessages((current) => {
        if (current.some((message) => message.id === incoming.id)) return current;
        return [incoming, ...current].slice(0, 20);
      });
      setToast({ visible: true, message: incoming });
      playMessageSound();
      showBrowserNotification(incoming, () => openConversation(incoming.senderId));

      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
      toastTimerRef.current = window.setTimeout(() => setToast({ visible: false }), 30000);
    };

    const handleRead = (event: Event) => {
      const detail = (event as CustomEvent<{ contactId?: string }>).detail;
      if (!detail?.contactId) return;
      setUnreadMessages((current) => current.filter((message) => message.senderId !== detail.contactId));
    };

    window.addEventListener("d7:message.received", handleIncoming);
    window.addEventListener("d7:messages.read", handleRead);
    return () => {
      window.removeEventListener("d7:message.received", handleIncoming);
      window.removeEventListener("d7:messages.read", handleRead);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, [currentUser?.id]);

  const unreadCount = unreadMessages.length;

  const openConversation = (senderId?: string) => {
    if (senderId) {
      setUnreadMessages((current) => current.filter((message) => message.senderId !== senderId));
      navigate(messagePath, { state: { contactId: senderId } });
    } else {
      navigate(messagePath);
    }
    setToast({ visible: false });
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        className="relative flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors dropdown-toggle hover:bg-gray-100 hover:text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
        onClick={() => {
          if ("Notification" in window && Notification.permission === "default") {
            Notification.requestPermission().catch(() => undefined);
          }
          setIsOpen((value) => !value);
        }}
        aria-label="Messages non lus"
      >
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 z-10 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
            <span className="absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-60 animate-ping"></span>
          </span>
        )}
        <svg className="fill-current" width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M10.75 2.29248C10.75 1.87827 10.4143 1.54248 10 1.54248C9.58583 1.54248 9.25004 1.87827 9.25004 2.29248V2.83613C6.08266 3.20733 3.62504 5.9004 3.62504 9.16748V14.4591H3.33337C2.91916 14.4591 2.58337 14.7949 2.58337 15.2091C2.58337 15.6234 2.91916 15.9591 3.33337 15.9591H16.6667C17.0809 15.9591 17.4167 15.6234 17.4167 15.2091C17.4167 14.7949 17.0809 14.4591 16.6667 14.4591H16.375V9.16748C16.375 5.9004 13.9174 3.20733 10.75 2.83613V2.29248ZM14.875 14.4591V9.16748C14.875 6.47509 12.6924 4.29248 10 4.29248C7.30765 4.29248 5.12504 6.47509 5.12504 9.16748V14.4591H14.875ZM8.00004 17.7085C8.00004 18.1228 8.33583 18.4585 8.75004 18.4585H11.25C11.6643 18.4585 12 18.1228 12 17.7085C12 17.2943 11.6643 16.9585 11.25 16.9585H8.75004C8.33583 16.9585 8.00004 17.2943 8.00004 17.7085Z"
            fill="currentColor"
          />
        </svg>
      </button>

      {toast.visible && toast.message && (
        <button
          onClick={() => openConversation(toast.message?.senderId)}
          className="fixed bottom-6 right-6 z-50 w-[320px] rounded-lg bg-blue-600 p-4 text-left text-white shadow-2xl shadow-blue-600/20 ring-1 ring-blue-700/20"
        >
          <span className="block text-sm font-semibold">Nouveau message de {toast.message.senderName}</span>
          <span className="mt-1 block text-xs leading-5 text-white/85">{truncate(toast.message.text, 140)}</span>
          <span className="mt-3 block text-xs font-semibold text-white/90">Ouvrir la discussion</span>
        </button>
      )}

      <Dropdown
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        className="absolute -right-[240px] mt-[17px] flex h-[420px] w-[350px] flex-col rounded-lg border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark sm:w-[361px] lg:right-0"
      >
        <div className="mb-3 flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-700">
          <div>
            <h5 className="text-base font-semibold text-gray-800 dark:text-gray-200">Messages</h5>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {unreadCount > 0 ? `${unreadCount} message${unreadCount > 1 ? "s" : ""} non lu${unreadCount > 1 ? "s" : ""}` : "Aucun message non lu"}
            </p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="text-gray-500 transition hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            aria-label="Fermer"
          >
            <svg className="fill-current" width="22" height="22" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M6.21967 7.28131C5.92678 6.98841 5.92678 6.51354 6.21967 6.22065C6.51256 5.92775 6.98744 5.92775 7.28033 6.22065L11.999 10.9393L16.7176 6.22078C17.0105 5.92789 17.4854 5.92788 17.7782 6.22078C18.0711 6.51367 18.0711 6.98855 17.7782 7.28144L13.0597 12L17.7782 16.7186C18.0711 17.0115 18.0711 17.4863 17.7782 17.7792C17.4854 18.0721 17.0105 18.0721 16.7176 17.7792L11.999 13.0607L7.28033 17.7794C6.98744 18.0722 6.51256 18.0722 6.21967 17.7794C5.92678 17.4865 5.92678 17.0116 6.21967 16.7187L10.9384 12L6.21967 7.28131Z"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {unreadMessages.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 p-5 text-center text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
              Les nouveaux messages apparaîtront ici.
            </div>
          ) : (
            unreadMessages.map((message) => (
              <DropdownItem
                key={message.id}
                onItemClick={() => openConversation(message.senderId)}
                className="mb-2 flex gap-3 rounded-lg border border-gray-100 p-3 hover:bg-gray-100 dark:border-gray-800 dark:hover:bg-white/5"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-xs font-semibold text-white">
                  {message.senderName
                    .split(" ")
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-gray-800 dark:text-white/90">
                    {message.senderName}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-gray-500 dark:text-gray-400">
                    {truncate(message.text)}
                  </span>
                </span>
              </DropdownItem>
            ))
          )}
        </div>

        <button
          onClick={() => openConversation()}
          className="mt-3 block rounded-lg border border-gray-300 bg-white px-4 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
        >
          Ouvrir la messagerie
        </button>
      </Dropdown>
    </div>
  );
}
