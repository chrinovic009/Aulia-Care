import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

type Props = { onDetected: (code: string) => void; onClose: () => void };

/** Camera-only scanner for Aulia asset QR/barcodes. The server remains the authority. */
export default function AuliaCodeScanner({ onDetected, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [message, setMessage] = useState("Activation de la caméra…");

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let stopped = false;
    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
          setMessage("La caméra exige une connexion HTTPS sécurisée sur cet appareil.");
          return;
        }
        if (!videoRef.current) return;
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } },
          videoRef.current,
          (result) => {
            if (!result || stopped) return;
            const code = result.getText().trim().toUpperCase();
            if (!code.startsWith("AULIA-")) {
              setMessage("Code détecté, mais ce n’est pas un code Aulia Care valide.");
              return;
            }
            stopped = true;
            controls.stop();
            onDetected(code);
          },
        );
        controlsRef.current = controls;
        setMessage("Cadrez le QR code Aulia dans la zone vidéo.");
      } catch (error) {
        setMessage(error instanceof Error && error.name === "NotAllowedError" ? "Autorisez la caméra pour scanner une montre Aulia." : "Impossible d’ouvrir la caméra. Vérifiez HTTPS et l’accès caméra.");
      }
    };
    void start();
    return () => { stopped = true; controlsRef.current?.stop(); };
  }, [onDetected]);

  return <div className="rounded-2xl border border-aulia-teal/30 bg-aulia-mist/50 p-3 dark:bg-aulia-teal/10"><video ref={videoRef} muted playsInline className="aspect-video w-full rounded-xl bg-aulia-navy object-cover" /><p className="mt-3 text-center text-sm text-slate-600 dark:text-slate-200">{message}</p><button type="button" onClick={onClose} className="mt-3 w-full rounded-xl border border-aulia-teal/30 px-3 py-2 text-sm font-semibold text-aulia-teal dark:text-aulia-mist">Annuler le scan</button></div>;
}
