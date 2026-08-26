import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../config/api";
import { useAuth } from "../../context/AuthContext";

const keyFor = (userId?: string) => `aulia.session-lock.minutes.${userId || "anonymous"}`;

export function setSessionLockMinutes(userId: string, minutes: number) {
  localStorage.setItem(keyFor(userId), String(minutes));
  window.dispatchEvent(new CustomEvent("aulia:session-lock-setting", { detail: { userId, minutes } }));
}

export default function SessionLock() {
  const { currentUser } = useAuth();
  const [minutes, setMinutes] = useState(0);
  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!currentUser?.id) return;
    const refresh = () => setMinutes(Number(localStorage.getItem(keyFor(currentUser.id)) || 0));
    refresh();
    window.addEventListener("aulia:session-lock-setting", refresh);
    return () => window.removeEventListener("aulia:session-lock-setting", refresh);
  }, [currentUser?.id]);

  useEffect(() => {
    if (!minutes || locked || !currentUser?.id) return;
    const reset = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setLocked(true), minutes * 60_000);
    };
    const events = ["pointerdown", "keydown", "touchstart", "mousemove"];
    events.forEach((name) => window.addEventListener(name, reset, { passive: true }));
    reset();
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      events.forEach((name) => window.removeEventListener(name, reset));
    };
  }, [currentUser?.id, locked, minutes]);

  const unlock = async () => {
    try {
      setError(null);
      await apiFetch("/auth/verify-pin", { method: "POST", body: JSON.stringify({ pin }) });
      setPin(""); setLocked(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Code PIN incorrect.");
      setPin("");
    }
  };

  if (!locked) return null;
  return <div className="fixed inset-0 z-[1000000] grid place-items-center bg-slate-950 bg-cover bg-center p-4" style={{ backgroundImage: "linear-gradient(rgba(2, 12, 27, .72), rgba(2, 12, 27, .84)), url('/images/lock_screen.jpg')" }}>
    <section className="w-full max-w-sm rounded-3xl border border-white/20 bg-slate-950/75 p-6 text-center text-white shadow-2xl backdrop-blur-xl">
      <img src="/logo/logo.png" alt="Aulia Care" className="mx-auto h-16 w-16 object-contain" onError={(event) => { event.currentTarget.style.display = "none"; }} />
      <h1 className="mt-4 text-xl font-bold">Session verrouillée</h1><p className="mt-2 text-sm text-slate-200">{currentUser?.displayName}, saisissez votre code PIN pour reprendre.</p>
      <input autoFocus inputMode="numeric" pattern="[0-9]*" type="password" value={pin} maxLength={6} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} onKeyDown={(event) => { if (event.key === "Enter") void unlock(); }} className="mt-5 w-full rounded-xl border border-white/30 bg-white/10 px-4 py-3 text-center text-xl tracking-[.55em] outline-none focus:border-aulia-teal" placeholder="••••" />
      {error && <p className="mt-3 text-sm text-red-200">{error}</p>}
      <div className="mt-5 grid grid-cols-3 gap-2 sm:hidden">{[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((value) => <button key={String(value)} type="button" onClick={() => value === "⌫" ? setPin((v) => v.slice(0, -1)) : value !== "" && setPin((v) => `${v}${value}`.slice(0, 6))} className="h-12 rounded-xl bg-white/10 text-lg font-semibold active:bg-aulia-teal">{value}</button>)}</div>
      <button type="button" onClick={() => void unlock()} className="mt-5 w-full rounded-xl bg-aulia-teal px-4 py-3 font-bold text-white hover:bg-aulia-teal/90">Déverrouiller</button>
    </section>
  </div>;
}
