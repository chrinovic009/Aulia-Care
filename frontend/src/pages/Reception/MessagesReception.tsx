import { useEffect, useRef, useState } from "react";
import { Phone, Video } from "lucide-react";
import PageBreadcrumb from "../../components/common/PageBreadCrumb";
import PageMeta from "../../components/common/PageMeta";
import { PlusIcon, PaperPlaneIcon, ChevronLeftIcon } from "../../icons";
import { getConversations } from "../../api/reception";
import { useLocation } from "react-router";



const Messages = () => {
  const [message, setMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const location = useLocation();
  const [conversations, setConversations] = useState<any[]>(() => getConversations());
  const [selectedContact, setSelectedContact] = useState<any>(conversations?.[0] ?? null);
  const [showConversation, setShowConversation] = useState(false);
  const [isDesktop, setIsDesktop] = useState<boolean>(typeof window !== "undefined" ? window.innerWidth >= 1280 : true);
  const [messages, setMessages] = useState<any[]>([
    { id: 1, from: "Lindsey", type: "text", text: "I want to make an appointment tomorrow from 2:00 to 5:00pm?", time: "2 hours ago" },
    { id: 2, from: "Patient", type: "text", text: "If don't like something, I'll stay away from it.", time: "2 hours ago" },
    { id: 3, from: "Lindsey", type: "text", text: "I want more detailed information.", time: "2 hours ago" },
    { id: 4, from: "Lindsey", type: "file", filename: "report.pdf", fileType: "pdf", time: "2 hours ago" },
    { id: 5, from: "Patient", type: "text", text: "They got there early, and got really good seats.", time: "2 hours ago" },
  ]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const handler = (e: MediaQueryListEvent | MediaQueryList) => setIsDesktop(e.matches ?? mq.matches);
    // initial
    setIsDesktop(mq.matches);
    if (mq.addEventListener) mq.addEventListener("change", handler);
    else mq.addListener(handler);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", handler as any);
      else mq.removeListener(handler as any);
    };
  }, []);

  useEffect(() => {
    // handle navigation from notifications: location.state?.convId
    try {
      const convId = (location as any)?.state?.convId;
      if (convId) {
        const convs = getConversations();
        setConversations(convs);
        const found = convs.find((c: any) => c.id === convId);
        if (found) {
          setSelectedContact(found);
          setMessages(found.messages.map((m: any) => ({ id: m.id, from: m.from === 'Patient' ? 'Patient' : 'LC', type: 'text', text: m.text, time: m.time })));
        }
      }
    } catch {}
  }, [location]);

  useEffect(() => {
    const handler = (ev: any) => {
      const { convId, message } = ev.detail || {};
      // reload conversations
      const convs = getConversations();
      setConversations(convs);
      if (selectedContact && selectedContact.id === convId) {
        setMessages((prev) => [...prev, { id: message.id, from: 'Patient', type: 'text', text: message.text, time: message.time }]);
      }
    };
    window.addEventListener('d7:incomingMessage', handler as EventListener);
    return () => window.removeEventListener('d7:incomingMessage', handler as EventListener);
  }, [selectedContact]);

  return (
    <div>
      <PageMeta
        title="Messages | D7 Clinique"
        description="Page de messagerie pour le suivi du patient en convalescence ou hospitalisation"
      />
      <PageBreadcrumb pageTitle="Messages" />

      <div className="min-h-screen rounded-2xl border border-gray-200 bg-white px-5 py-7 dark:border-gray-800 dark:bg-white/[0.03] xl:px-10 xl:py-12">
        <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
            {/* LEFT: conversation list - on mobile hide when a conversation is opened */}
            {isDesktop || !showConversation ? (
              <div className="rounded-3xl border border-gray-200 bg-slate-50 p-5 dark:border-gray-800 dark:bg-slate-900/70">
                <div className="mb-5 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-slate-950">
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.25em] text-gray-500 dark:text-gray-400">
                    Chat
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Vous ne pouvez discuter qu'avec les personnes autorisées par la clinique pour le suivi.
                  </p>
                </div>

                <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-slate-950">
                  <label className="block text-xs font-medium uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">
                    Rechercher
                  </label>
                  <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    type="text"
                    placeholder="Rechercher une conversation..."
                    className="mt-3 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-gray-800 dark:bg-slate-900 dark:text-gray-200 dark:focus:border-blue-400 dark:focus:ring-blue-500/20"
                  />
                </div>

                <div className="space-y-3">
                  {conversations
                    .filter((c) => (c.patientName + " " + (c.messages?.[c.messages.length - 1]?.text || "")).toLowerCase().includes(searchTerm.toLowerCase()))
                    .map((contact) => (
                      <button
                        key={contact.id}
                        onClick={() => {
                          setSelectedContact(contact);
                          setMessages(contact.messages.map((m: any) => ({ id: m.id, from: m.from === 'Patient' ? 'Patient' : 'LC', type: 'text', text: m.text, time: m.time })));
                          if (!isDesktop) setShowConversation(true);
                        }}
                        className={`flex w-full items-center gap-3 rounded-3xl border p-3 text-left transition hover:border-blue-200 hover:bg-blue-50 dark:bg-slate-950 dark:hover:border-blue-500/40 dark:hover:bg-slate-900 ${
                          selectedContact?.id === contact.id ? "border-blue-200 bg-blue-50 dark:border-blue-500/40 dark:bg-slate-900" : "border-transparent bg-white"
                        }`}
                      >
                        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500 text-sm font-semibold text-white">
                          {contact.patientName
                            .split(" ")
                            .map((part: string) => part[0])
                            .join("")}
                        </span>
                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                                {contact.patientName}
                              </h4>
                              <p className="text-xs text-gray-500 dark:text-gray-400">Patient</p>
                            </div>
                            <span className="text-[11px] text-gray-400">{new Date(contact.updatedAt).toLocaleTimeString()}</span>
                          </div>
                          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{contact.messages?.[contact.messages.length - 1]?.text}</p>
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            ) : null}

          {/* RIGHT: conversation pane - on mobile show only when a conversation is selected */}
          {(isDesktop || showConversation) && (
            <div className="flex min-h-[640px] flex-col rounded-3xl border border-gray-200 bg-slate-50 dark:border-gray-800 dark:bg-slate-950">
              <div className="flex items-center justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800">
              <div className="flex items-center gap-4">
                {/* Back button for mobile */}
                {!isDesktop && (
                  <button onClick={() => setShowConversation(false)} className="mr-2 inline-flex items-center justify-center rounded-lg bg-white p-2 text-gray-600 dark:bg-slate-900 dark:text-gray-200">
                    <ChevronLeftIcon className="h-5 w-5" />
                  </button>
                )}

                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500 text-sm font-semibold text-white">
                  LC
                </span>
                <div>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                    Lindsey Curtis
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Autorisé par la clinique · en ligne</p>
                </div>
              </div>
                <div className="flex items-center gap-3">
                  <button
                    title="Appel vocal"
                    className="rounded-2xl bg-white p-2 text-sm font-medium text-gray-600 shadow-sm transition hover:bg-gray-100 dark:bg-slate-900 dark:text-gray-200 dark:hover:bg-slate-800"
                  >
                    <Phone className="h-5 w-5" />
                  </button>

                  <button
                    title="Appel vidéo"
                    className="rounded-2xl bg-white p-2 text-sm font-medium text-gray-600 shadow-sm transition hover:bg-gray-100 dark:bg-slate-900 dark:text-gray-200 dark:hover:bg-slate-800"
                  >
                    <Video className="h-5 w-5" />
                  </button>
                </div>
            </div>

              <div className="flex-1 overflow-y-auto px-5 py-6">
                <div className="space-y-4">
                  {messages.map((m) => {
                    if (m.type === "text") {
                      if (m.from === "Patient") {
                        return (
                          <div key={m.id} className="flex items-end justify-end gap-3">
                            <div className="max-w-[75%] rounded-3xl bg-blue-600 px-4 py-3 text-sm text-white">
                              {m.text}
                              <span className="mt-2 block text-right text-[11px] text-blue-200">{m.time}</span>
                            </div>
                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-500 text-xs font-semibold text-white">PT</div>
                          </div>
                        );
                      }
                      return (
                        <div key={m.id} className="flex items-start gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-200 text-xs font-semibold text-slate-700">LC</div>
                          <div className="rounded-3xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
                            {m.text}
                            <span className="mt-2 block text-xs text-gray-400">{m.from}, {m.time}</span>
                          </div>
                        </div>
                      );
                    }
                    if (m.type === "file") {
                      return (
                        <div key={m.id} className="mx-auto w-full max-w-md overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
                          <div className="p-4 text-sm text-gray-500">Fichier partagé: <span className="font-medium text-gray-800">{m.filename}</span></div>
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              </div>

              <div className="border-t border-gray-200 px-5 py-4 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tapez un message..."
                  className="min-h-[52px] flex-1 rounded-3xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-gray-800 dark:bg-slate-900 dark:text-gray-200 dark:focus:border-blue-400 dark:focus:ring-blue-500/20"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={(e) => {
                    const files = e.target.files;
                    if (!files) return;
                    const fileArr = Array.from(files);
                    fileArr.forEach((f) => {
                      setMessages((prev) => [
                        ...prev,
                        { id: Date.now() + Math.random(), from: "Patient", type: "file", filename: f.name, fileType: f.type, time: "now" },
                      ]);
                    });
                    // reset
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.mp3,.mp4"
                  className="hidden"
                />
                <button onClick={() => fileInputRef.current?.click()} title="Attacher" className="inline-flex h-12 items-center justify-center rounded-3xl bg-white px-4 text-sm font-semibold text-gray-600 transition hover:bg-gray-100 dark:bg-slate-900 dark:text-gray-200 dark:hover:bg-slate-800">
                  <PlusIcon className="h-5 w-5" />
                </button>
                <button
                  onClick={() => {
                    if (!message) return;
                    setMessages((prev) => [
                      ...prev,
                      { id: Date.now(), from: "Patient", type: "text", text: message, time: "now" },
                    ]);
                    setMessage("");
                  }}
                  className="inline-flex h-12 items-center justify-center rounded-3xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  <PaperPlaneIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Messages;
