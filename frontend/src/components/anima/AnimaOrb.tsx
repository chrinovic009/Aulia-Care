import { useEffect, useRef, useState } from "react";

/**
 * Orbe ANIMA — présente sur toutes les interfaces d'AULIA Care, aux couleurs de Care
 * (clair : nacre et sarcelle ; sombre : nuit marine et sarcelle lumineuse).
 * Pour l'instant elle annonce seulement, de vive voix, que l'agent Care arrive avec
 * la couche Diagnostic Agent. Aucune donnée n'est lue ni envoyée.
 */

const MESSAGE =
  "Je suis ANIMA. Cette fonctionnalité est réservée à la couche Diagnostic Agent d'AULIA Care. " +
  "L'agent Care sera développé en même temps que cette couche.";

type RGB = [number, number, number];
const PALETTE = {
  dark: {
    glow: [13, 148, 136] as RGB, // #0d9488
    bright: [94, 234, 212] as RGB, // sarcelle lumineuse
    cream: [230, 247, 244] as RGB, // #e6f7f4
    ring: [102, 200, 187] as RGB, // #66c8bb
    body: ["#14365a", "#0a1d3a", "#061229"],
    shine: "rgba(204,255,246,.22)",
  },
  light: {
    glow: [13, 148, 136] as RGB,
    bright: [50, 173, 159] as RGB, // #32ad9f
    cream: [10, 79, 75] as RGB, // #0a4f4b (étincelles foncées sur fond clair)
    ring: [8, 124, 115] as RGB, // #087c73
    body: ["#ffffff", "#e6f7f4", "#9ddfd5"],
    shine: "rgba(255,255,255,.8)",
  },
};

const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
const SIZE = 64;

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  const fr = voices.filter((v) => v.lang?.toLowerCase().startsWith("fr"));
  return fr.find((v) => /hortense|denise|julie|amelie|audrey|google/i.test(v.name)) ?? fr[0];
}

export default function AnimaOrb() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const speaking = useRef(false);
  const ripples = useRef<number[]>([]);
  const [bubble, setBubble] = useState(false);
  const [talking, setTalking] = useState(false);
  const [raised, setRaised] = useState(false);
  const hideTimer = useRef<number | undefined>(undefined);

  // Sur les pages de connexion, le bouton de thème occupe déjà le coin : l'orbe se place au-dessus.
  useEffect(() => {
    const check = () => setRaised(/^\/(signin|signup)\b/.test(window.location.pathname));
    check();
    const id = window.setInterval(check, 800);
    return () => window.clearInterval(id);
  }, []);

  // Dessin : respiration permanente ; ondes et pulsation quand ANIMA parle.
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = cv.height = Math.round(SIZE * 1.5 * dpr);
    const ctx = cv.getContext("2d")!;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const slow = reduce ? 0.2 : 1;
    const sparks = Array.from({ length: 6 }, (_, s) => ({
      a: Math.random() * 6.28, r: 0.92 + Math.random() * 0.2, v: (0.00014 + Math.random() * 0.00018) * (s % 2 ? 1 : -1), z: Math.random() * 6.28,
    }));
    let speak = 0, amp = 0, raf = 0;

    const frame = (t: number) => {
      const P = document.documentElement.classList.contains("dark") ? PALETTE.dark : PALETTE.light;
      const light = P === PALETTE.light;
      const w = cv.width, C = w / 2, lw = w / 110;
      speak += ((speaking.current ? 1 : 0) - speak) * 0.07;
      const target = speaking.current ? 0.45 + 0.35 * Math.abs(Math.sin(t / 170)) * (0.7 + 0.3 * Math.sin(t / 53)) : 0;
      amp += (target - amp) * 0.15;
      const breath = 0.5 + 0.5 * Math.sin((t / 820) * slow);
      const core = C * 0.42 * (1 + 0.045 * (breath - 0.5) * 2 * (reduce ? 0.3 : 1) + 0.05 * amp * speak);
      const ring = C * 0.53;
      ctx.clearRect(0, 0, w, w);

      // halo
      const halo = (light ? 0.2 : 0.26) + 0.16 * breath + 0.3 * amp * speak;
      const g0 = ctx.createRadialGradient(C, C, core * 0.7, C, C, C);
      g0.addColorStop(0, rgba(P.glow, halo)); g0.addColorStop(0.55, rgba(P.glow, halo * 0.35)); g0.addColorStop(1, rgba(P.glow, 0));
      ctx.fillStyle = g0; ctx.fillRect(0, 0, w, w);

      // ondes de parole
      const now = performance.now();
      ripples.current = ripples.current.filter((r) => now - r < 2400);
      for (const r of ripples.current) {
        const k = (now - r) / 2400, rad = ring + k * (C * 0.97 - ring);
        ctx.beginPath(); ctx.arc(C, C, rad, 0, 6.2832);
        ctx.strokeStyle = rgba(P.ring, (1 - k) * 0.6); ctx.lineWidth = lw * (1.2 - k * 0.7); ctx.stroke();
      }

      // étincelles en orbite
      sparks.forEach((p, i) => {
        const a = p.a + t * p.v * (1 + 1.5 * speak) * slow;
        const rr = ring * p.r + Math.sin(t / 1300 + p.z) * C * 0.02;
        ctx.beginPath(); ctx.arc(C + Math.cos(a) * rr, C + Math.sin(a) * rr * 0.92, lw * (0.8 + (i % 3) * 0.3), 0, 6.2832);
        ctx.fillStyle = rgba(P.cream, 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t / 900 + p.z))); ctx.fill();
      });

      // sphère
      const body = ctx.createRadialGradient(C - core * 0.35, C - core * 0.42, core * 0.05, C, C, core);
      body.addColorStop(0, P.body[0]); body.addColorStop(0.6, P.body[1]); body.addColorStop(1, P.body[2]);
      ctx.beginPath(); ctx.arc(C, C, core, 0, 6.2832); ctx.fillStyle = body; ctx.fill();

      // lumière liquide intérieure
      ctx.save(); ctx.beginPath(); ctx.arc(C, C, core, 0, 6.2832); ctx.clip();
      const ang = (t / 9000) * slow + (speak * t) / 2600;
      const glow = (light ? 0.36 : 0.34) + 0.22 * breath + 0.35 * amp * speak;
      for (let k = 0; k < 2; k++) {
        const gx = C + Math.cos(ang + k * 3.1) * core * 0.34, gy = C + core * 0.18 + Math.sin(ang * 1.3 + k * 2) * core * 0.24;
        const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, core * (k ? 0.8 : 1.05));
        g.addColorStop(0, rgba(k ? P.glow : P.bright, glow * (k ? 0.7 : 1))); g.addColorStop(0.5, rgba(P.glow, glow * 0.35)); g.addColorStop(1, rgba(P.glow, 0));
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, w);
      }
      const hl = ctx.createRadialGradient(C - core * 0.4, C - core * 0.45, 0, C - core * 0.4, C - core * 0.45, core * 0.6);
      hl.addColorStop(0, P.shine); hl.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = hl; ctx.fillRect(0, 0, w, w);
      ctx.restore();
      ctx.beginPath(); ctx.arc(C, C, core, 0, 6.2832); ctx.strokeStyle = rgba(P.ring, light ? 0.6 : 0.45); ctx.lineWidth = lw * 0.7; ctx.stroke();

      // anneau (ondule quand ANIMA parle)
      const a2 = C * 0.035 * amp * speak;
      ctx.beginPath();
      for (let i = 0; i <= 120; i++) {
        const th = (i / 120) * 6.2832;
        const rr2 = ring + a2 * (Math.sin(th * 6 + t / 240) * 0.6 + Math.sin(th * 3 - t / 380) * 0.4);
        const x = C + Math.cos(th) * rr2, y = C + Math.sin(th) * rr2;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.strokeStyle = rgba(P.ring, 0.5 + 0.25 * breath + 0.2 * speak); ctx.lineWidth = lw * (1 + 0.8 * speak); ctx.stroke();
      // lueur qui tourne lentement sur l'anneau
      const from = (t / 7000) * 6.2832 * slow - 1.57;
      ctx.beginPath(); ctx.arc(C, C, ring, from, from + 0.55);
      ctx.strokeStyle = rgba(P.cream, 0.6 * (1 - 0.5 * speak)); ctx.lineWidth = lw * 1.6; ctx.lineCap = "round"; ctx.stroke();

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    window.speechSynthesis?.getVoices(); // précharge la liste des voix
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") stop(); };
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("keydown", esc); stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stop() {
    window.speechSynthesis?.cancel();
    speaking.current = false;
    setTalking(false);
  }

  function finish() {
    speaking.current = false;
    setTalking(false);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setBubble(false), 4500);
  }

  function onClick() {
    if (speaking.current) { stop(); setBubble(false); return; }
    window.clearTimeout(hideTimer.current);
    setBubble(true);
    ripples.current.push(performance.now());
    const synth = window.speechSynthesis;
    if (!synth) { finish(); return; }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(MESSAGE);
    u.lang = "fr-FR"; u.rate = 0.96; u.pitch = 1;
    const v = pickVoice(); if (v) u.voice = v;
    u.onstart = () => { speaking.current = true; setTalking(true); ripples.current.push(performance.now()); };
    u.onboundary = () => { if (Math.random() < 0.35) ripples.current.push(performance.now()); };
    u.onend = finish;
    u.onerror = finish;
    speaking.current = true; setTalking(true);
    synth.speak(u);
  }

  return (
    <div
      className="pointer-events-none fixed right-3 z-[99990] flex flex-col items-end gap-2 sm:right-5 print:hidden"
      style={{ bottom: raised ? 84 : 14, transition: "bottom .4s ease" }}
    >
      <div
        role="status"
        aria-live="polite"
        className={`max-w-[290px] rounded-2xl border px-4 py-3 text-sm leading-5 shadow-xl backdrop-blur transition-all duration-500
          border-brand-200 bg-white/95 text-aulia-navy shadow-brand-900/10
          dark:border-brand-800 dark:bg-[#0a1d3a]/95 dark:text-brand-50 dark:shadow-black/40
          ${bubble ? "pointer-events-auto translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
      >
        {bubble && (
          <>
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[.18em] text-brand-600 dark:text-brand-300">ANIMA · Agent Care</span>
            {MESSAGE}
          </>
        )}
      </div>
      <button
        type="button"
        onClick={onClick}
        aria-label={talking ? "Arrêter ANIMA" : "ANIMA — agent Care (bientôt)"}
        title="ANIMA — agent Care (bientôt)"
        className="pointer-events-auto rounded-full transition-transform duration-500 hover:scale-[1.07] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-500"
        style={{ background: "none", border: 0, padding: 0, cursor: "pointer", width: SIZE * 1.5, height: SIZE * 1.5, marginRight: -SIZE * 0.25, marginBottom: -SIZE * 0.25, WebkitTapHighlightColor: "transparent" }}
      >
        <canvas ref={canvas} style={{ width: SIZE * 1.5, height: SIZE * 1.5, display: "block" }} />
      </button>
    </div>
  );
}
