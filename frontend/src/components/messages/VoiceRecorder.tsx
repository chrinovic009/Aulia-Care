import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, Mic, Send, Square, Trash2 } from "lucide-react";
import { formatVoiceDuration } from "./message-format";

type VoiceDraft = { blob: Blob; url: string; durationMs: number };

type VoiceRecorderProps = {
  disabled: boolean;
  onSend: (blob: Blob, durationMs: number) => Promise<void>;
};

export default function VoiceRecorder({ disabled, onSend }: VoiceRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [draft, setDraft] = useState<VoiceDraft | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const maxTimerRef = useRef<number | null>(null);
  const draftUrlRef = useRef<string | null>(null);

  const clearTimers = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (maxTimerRef.current) window.clearTimeout(maxTimerRef.current);
    timerRef.current = null;
    maxTimerRef.current = null;
  }, []);

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const discardDraft = useCallback(() => {
    if (draftUrlRef.current) URL.revokeObjectURL(draftUrlRef.current);
    draftUrlRef.current = null;
    setDraft(null);
  }, []);

  useEffect(() => () => {
    clearTimers();
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    streamRef.current?.getTracks().forEach(track => track.stop());
    if (draftUrlRef.current) URL.revokeObjectURL(draftUrlRef.current);
  }, [clearTimers]);

  const startRecording = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("L’enregistrement vocal n’est pas pris en charge par ce navigateur.");
      return;
    }
    try {
      discardDraft();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const mimeType = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"]
        .find(value => MediaRecorder.isTypeSupported(value));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = event => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => setError("L’enregistrement a échoué. Vérifiez le microphone puis réessayez.");
      recorder.onstop = () => {
        const durationMs = Date.now() - startedAtRef.current;
        clearTimers();
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (durationMs < 250 || !blob.size) {
          setError("La note vocale est trop courte.");
          return;
        }
        const url = URL.createObjectURL(blob);
        draftUrlRef.current = url;
        setDraft({ blob, url, durationMs });
      };
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      recorder.start(250);
      setRecording(true);
      timerRef.current = window.setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 250);
      maxTimerRef.current = window.setTimeout(stopRecording, 120_000);
    } catch {
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setError("Microphone inaccessible. Autorisez son utilisation dans le navigateur, puis réessayez.");
    }
  };

  const sendDraft = async () => {
    if (!draft || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(draft.blob, draft.durationMs);
      discardDraft();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "La note vocale n’a pas été envoyée.");
    } finally {
      setSending(false);
    }
  };

  if (recording) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-3 rounded-full bg-red-50 px-3 py-2 text-red-700 dark:bg-red-950/30 dark:text-red-200" role="status" aria-live="polite">
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-30" />
          <Mic className="relative h-5 w-5" />
        </span>
        <div className="flex h-6 items-center gap-1" aria-hidden="true">
          {[10, 20, 14, 24, 12].map((height, index) => (
            <span key={index} className="w-1 animate-pulse rounded-full bg-red-500" style={{ height, animationDelay: `${index * 120}ms` }} />
          ))}
        </div>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">Écoute… {formatVoiceDuration(elapsedMs)}</span>
        <button type="button" onClick={stopRecording} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-600 text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500" aria-label="Terminer l’enregistrement">
          <Square className="h-4 w-4 fill-current" />
        </button>
      </div>
    );
  }

  if (draft) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <audio src={draft.url} controls preload="metadata" className="h-10 min-w-0 flex-1" aria-label="Écouter la note vocale avant l’envoi" />
        <span className="hidden text-xs font-semibold text-slate-500 sm:inline">{formatVoiceDuration(draft.durationMs)}</span>
        <button type="button" onClick={discardDraft} disabled={sending} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700" aria-label="Supprimer la note vocale">
          <Trash2 className="h-5 w-5" />
        </button>
        <button type="button" onClick={sendDraft} disabled={sending} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white shadow-sm transition hover:bg-[#008f72] disabled:opacity-60" aria-label="Envoyer la note vocale">
          {sending ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </button>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      {error && <span className="sr-only" role="alert">{error}</span>}
      <button type="button" onClick={startRecording} disabled={disabled} className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-200 hover:text-[#00a884] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00a884] disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700" aria-label="Enregistrer une note vocale" title="Enregistrer une note vocale">
        <Mic className="h-6 w-6" />
      </button>
      {error && <p className="absolute bottom-full left-0 right-0 mb-2 rounded-xl bg-red-50 p-3 text-sm text-red-700 shadow-lg dark:bg-red-950 dark:text-red-100" role="alert">{error}</p>}
    </div>
  );
}
