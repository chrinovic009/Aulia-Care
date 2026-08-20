import { useEffect, useState } from "react";

export type ActionFeedback = {
  kind: "success" | "error" | "warning";
  title: string;
  message: string;
};

export const showActionFeedback = (feedback: ActionFeedback) =>
  window.dispatchEvent(new CustomEvent<ActionFeedback>("aulia:action-feedback", { detail: feedback }));

/** A single, accessible outcome modal for every API failure and opted-in success. */
export function ActionFeedbackProvider({ children }: { children: React.ReactNode }) {
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  useEffect(() => {
    const receive = (event: Event) => setFeedback((event as CustomEvent<ActionFeedback>).detail);
    window.addEventListener("aulia:action-feedback", receive);
    return () => window.removeEventListener("aulia:action-feedback", receive);
  }, []);
  return <>{children}{feedback && <div className="fixed inset-0 z-[1000000] grid place-items-center overflow-y-auto bg-slate-950/60 p-4" role="alertdialog" aria-modal="true" aria-labelledby="aulia-action-feedback-title"><section className="w-full max-w-md rounded-2xl border border-aulia-teal/25 bg-white p-5 shadow-2xl dark:bg-slate-950"><p className={`text-xs font-bold uppercase tracking-[.16em] ${feedback.kind === "error" ? "text-red-600" : feedback.kind === "warning" ? "text-amber-600" : "text-aulia-teal"}`}>Aulia Care · {feedback.kind === "error" ? "action non effectuée" : feedback.kind === "warning" ? "attention" : "action réussie"}</p><h2 id="aulia-action-feedback-title" className="mt-2 text-lg font-bold text-aulia-navy dark:text-white">{feedback.title}</h2><p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{feedback.message}</p><button type="button" onClick={() => setFeedback(null)} className="mt-5 w-full rounded-xl bg-aulia-teal px-4 py-2.5 text-sm font-bold text-white hover:bg-[#087c73]">Compris</button></section></div>}</>;
}
