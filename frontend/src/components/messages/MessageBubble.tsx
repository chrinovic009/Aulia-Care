import { Check, CheckCheck, FileImage, Mic, ScanLine, ShieldCheck } from "lucide-react";
import type { MessageKind, SharedImaging } from "../../api/messages";
import { buildUrl } from "../../config/api";
import { formatVoiceDuration } from "./message-format";

export type ChatMessage = {
  id: string;
  contactId: string;
  from: "me" | "contact";
  text: string;
  kind: MessageKind;
  time: string;
  status?: "sent" | "delivered" | "read";
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentMimeType?: string | null;
  audioDurationMs?: number | null;
  imaging?: SharedImaging | null;
};

const statusIcon = (status?: ChatMessage["status"]) => {
  if (status === "read") return <CheckCheck className="h-4 w-4 text-sky-500" aria-label="Lu" />;
  if (status === "delivered") return <CheckCheck className="h-4 w-4" aria-label="Distribué" />;
  return <Check className="h-4 w-4" aria-label="Envoyé" />;
};

export default function MessageBubble({ message, onOpenImage }: { message: ChatMessage; onOpenImage: (url: string) => void }) {
  const mine = message.from === "me";
  const mediaUrl = message.attachmentUrl ? buildUrl(message.attachmentUrl) : null;
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[94%] overflow-hidden rounded-2xl px-2 py-1.5 text-sm shadow-sm sm:max-w-[75%] ${mine
        ? "rounded-br-md bg-[#d9fdd3] text-slate-900 dark:bg-emerald-900 dark:text-emerald-50"
        : "rounded-bl-md bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100"}`}>
        {message.kind === "PHOTO" && mediaUrl && (
          <button type="button" onClick={() => onOpenImage(mediaUrl)} className="group relative block overflow-hidden rounded-xl" aria-label="Agrandir la photo">
            <img src={mediaUrl} alt={message.text || "Photo privée jointe à la discussion"} className="max-h-80 w-full min-w-52 object-cover transition group-hover:opacity-95" loading="lazy" />
            <span className="absolute bottom-2 right-2 rounded-full bg-slate-950/60 px-2 py-1 text-xs text-white">Agrandir</span>
          </button>
        )}

        {message.kind === "VOICE" && mediaUrl && (
          <div className="flex w-56 min-w-0 items-center gap-2 px-1 py-2 sm:w-80">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${mine ? "bg-emerald-200 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-100" : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-200"}`}>
              <Mic className="h-5 w-5" />
            </span>
            <audio src={mediaUrl} controls preload="none" className="h-10 w-0 min-w-0 flex-1" aria-label="Lire le message vocal" />
            <span className="hidden text-xs text-slate-500 sm:inline dark:text-slate-300">{formatVoiceDuration(message.audioDurationMs)}</span>
          </div>
        )}

        {message.kind === "IMAGING" && message.imaging && (
          <div className="w-full min-w-0 max-w-md p-1">
            <div className="mb-2 flex items-center gap-2 border-b border-slate-900/10 pb-2 dark:border-white/10">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white"><ScanLine className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{message.imaging.examName}</p>
                <p className="text-xs opacity-70">{message.imaging.modality} · {message.imaging.bodyPart}</p>
              </div>
              <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${message.imaging.verified ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                {message.imaging.verified ? "Vérifié" : "Non vérifié"}
              </span>
            </div>
            {mediaUrl && message.imaging.hasPreview ? (
              <button type="button" onClick={() => onOpenImage(mediaUrl)} className="mb-2 block w-full overflow-hidden rounded-xl" aria-label="Agrandir l’aperçu PACS">
                <img src={mediaUrl} alt={`Aperçu PACS : ${message.imaging.examName}`} className="max-h-72 w-full bg-slate-900 object-contain" loading="lazy" />
              </button>
            ) : (
              <div className="mb-2 flex items-center gap-2 rounded-xl bg-slate-100 p-3 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                <FileImage className="h-5 w-5 shrink-0" /> Aperçu indisponible ; la référence PACS et le compte rendu restent accessibles.
              </div>
            )}
            <p className="text-xs"><span className="font-semibold">Patient :</span> {message.imaging.patientName}</p>
            <p className="mt-1 text-xs"><span className="font-semibold">Demandeur :</span> {message.imaging.requestedByName}</p>
            {message.imaging.dicomStudyInstanceUid && <p className="mt-1 break-all font-mono text-[10px] opacity-60">DICOM Study UID · {message.imaging.dicomStudyInstanceUid}</p>}
            {(message.imaging.impression || message.imaging.findings) && (
              <details className="mt-2 rounded-xl bg-white/60 p-2 dark:bg-slate-900/40">
                <summary className="cursor-pointer text-xs font-bold">Lire le compte rendu partagé</summary>
                {message.imaging.findings && <p className="mt-2 whitespace-pre-wrap text-xs"><span className="font-semibold">Constatations : </span>{message.imaging.findings}</p>}
                {message.imaging.impression && <p className="mt-2 whitespace-pre-wrap text-xs"><span className="font-semibold">Conclusion : </span>{message.imaging.impression}</p>}
                {message.imaging.recommendations && <p className="mt-2 whitespace-pre-wrap text-xs"><span className="font-semibold">Recommandations : </span>{message.imaging.recommendations}</p>}
              </details>
            )}
            <p className="mt-2 flex items-center gap-1 text-[11px] text-teal-800 dark:text-teal-200"><ShieldCheck className="h-3.5 w-3.5" /> Partage clinique autorisé et journalisé</p>
          </div>
        )}

        {message.text && <p className="whitespace-pre-wrap break-words px-2 py-1 leading-relaxed">{message.text}</p>}
        <div className="flex items-center justify-end gap-1 px-1 text-[11px] text-slate-500 dark:text-slate-300">
          <span>{message.time}</span>
          {mine && statusIcon(message.status)}
        </div>
      </div>
    </div>
  );
}
