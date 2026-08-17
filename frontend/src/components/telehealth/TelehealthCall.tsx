import { useEffect, useRef, useState } from 'react';
import { Camera, Mic, MicOff, Phone, PhoneOff, Video } from 'lucide-react';
import { useRealtime } from '../../context/RealtimeContext';
import { saveTelehealthTranscript } from '../../api/doctor';

type TranscriptEntry = { id: string; speaker: 'MEDECIN' | 'PATIENT'; text: string; at: string };
type Signal = { type: 'offer' | 'answer' | 'candidate'; sdp?: string; candidate?: RTCIceCandidateInit };

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
};
type SpeechRecognitionEventLike = { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> };

const iceServers: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

const preferredVideoConstraints: MediaStreamConstraints = {
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 720 } },
};

const isDoctorQuestion = (text: string) => /^(ou|où|comment|depuis|quel|quelle|combien|avez|as-tu|est-ce|pourquoi|qu['’]est-ce)/i.test(text.trim());

/** Best-effort ringtone. Browsers may require an earlier user gesture to play it. */
const startIncomingRingtone = () => {
  const AudioContextConstructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return () => undefined;
  const context = new AudioContextConstructor();
  let oscillators: OscillatorNode[] = [];
  const ring = () => {
    oscillators.forEach((oscillator) => oscillator.stop());
    oscillators = [660, 880].map((frequency) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.035, context.currentTime);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.35);
      return oscillator;
    });
  };
  void context.resume().then(() => ring()).catch(() => undefined);
  const intervalId = window.setInterval(() => { void context.resume().then(() => ring()).catch(() => undefined); }, 1_500);
  return () => {
    window.clearInterval(intervalId);
    oscillators.forEach((oscillator) => { try { oscillator.stop(); } catch { /* already stopped */ } });
    void context.close();
  };
};

function VideoSurface({ stream, muted, title }: { stream: MediaStream | null; muted?: boolean; title: string }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <div className="relative min-h-48 overflow-hidden rounded-xl bg-slate-950 shadow-inner"><video ref={ref} autoPlay playsInline muted={muted} className="h-full min-h-48 w-full object-cover" />{!stream && <div className="absolute inset-0 grid place-items-center text-sm text-slate-300"><Camera size={20} className="mr-2" /> {title}</div>}<span className="absolute bottom-3 left-3 rounded-md bg-slate-950/75 px-2 py-1 text-xs font-medium text-white">{title}</span></div>;
}

function useWebRtcCall(role: 'PHYSICIAN' | 'PATIENT', onTranscript?: (entries: TranscriptEntry[]) => void) {
  const { socket } = useRealtime();
  const [callId, setCallId] = useState<string | null>(null);
  const [status, setStatus] = useState<'IDLE' | 'RINGING' | 'CONNECTING' | 'ACTIVE' | 'MEDIA_ERROR' | 'ENDED'>('IDLE');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const activeCallRef = useRef<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  const cleanUp = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
  };

  const appendTranscript = (text: string) => {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (!clean) return;
    setTranscript((current) => {
      const next = [...current, { id: crypto.randomUUID(), speaker: isDoctorQuestion(clean) ? 'MEDECIN' : 'PATIENT', text: clean, at: new Date().toISOString() }];
      onTranscript?.(next);
      return next;
    });
  };

  const startRecognition = () => {
    if (role !== 'PHYSICIAN') return;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setMessage("La transcription automatique n'est pas disponible dans ce navigateur. Aucun texte clinique n'a été créé.");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = 'fr-FR';
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        if (event.results[index]?.isFinal) appendTranscript(event.results[index][0]?.transcript || '');
      }
    };
    recognition.onerror = () => setMessage("La transcription a été interrompue. Vous pouvez poursuivre la vidéo et compléter le brouillon manuellement.");
    recognition.start();
    recognitionRef.current = recognition;
  };

  const preparePeer = (stream: MediaStream) => {
    const peer = new RTCPeerConnection(iceServers);
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    peer.ontrack = (event) => setRemoteStream(event.streams[0] || new MediaStream([event.track]));
    peer.onicecandidate = (event) => {
      if (event.candidate && activeCallRef.current) socket?.emit('telehealth.signal', { callId: activeCallRef.current, signal: { type: 'candidate', candidate: event.candidate.toJSON() } satisfies Signal });
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'failed') {
        setMessage('La connexion vidéo a échoué. L’appel reste ouvert : vérifiez le réseau puis réessayez la caméra/microphone.');
        setStatus('MEDIA_ERROR');
      }
    };
    peerRef.current = peer;
    return peer;
  };

  const connectDoctorMedia = async (acceptedCallId: string) => {
    if (!socket) return;
    setStatus('CONNECTING');
    setMessage(null);
    try {
      const stream = await requestMedia();
      const peer = preparePeer(stream);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      socket.emit('telehealth.signal', { callId: acceptedCallId, signal: { type: 'offer', sdp: offer.sdp } satisfies Signal });
      setStatus('ACTIVE');
      startRecognition();
    } catch (error) {
      // Keep the signalling session alive. The physician can correct a camera
      // permission issue and retry without disconnecting the patient.
      setStatus('MEDIA_ERROR');
      setMessage(error instanceof Error ? error.message : "Impossible d'activer la caméra du médecin.");
    }
  };

  const requestMedia = async () => {
    if (!window.isSecureContext) {
      throw new Error("La caméra exige HTTPS sur un téléphone. Ouvrez Aulia Care avec une adresse https:// sécurisée, pas http:// sur l’adresse réseau.");
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Ce navigateur ne donne pas accès à la caméra. Utilisez Safari récent sur iPhone ou Chrome/Firefox récent sur Android, hors navigation privée.");
    }
    try {
      // Most current Android and iPhone browsers accept these quality and
      // noise-reduction preferences. They remain preferences, not hard locks.
      const stream = await navigator.mediaDevices.getUserMedia(preferredVideoConstraints);
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (preferredError) {
      try {
        // Older WebKit and some medical tablets reject advanced constraints;
        // retry with the broadest standards-compliant request.
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        localStreamRef.current = stream;
        setLocalStream(stream);
        return stream;
      } catch (fallbackError) {
        const error = fallbackError instanceof DOMException ? fallbackError : preferredError;
        if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
          throw new Error('Autorisation caméra ou microphone refusée. Autorisez les deux dans les réglages du navigateur puis relancez l’appel.');
        }
        if (error?.name === 'NotFoundError' || error?.name === 'DevicesNotFoundError') {
          throw new Error('Aucune caméra ou aucun microphone détecté par le navigateur. Vérifiez les autorisations système et qu’aucune autre application ne les utilise.');
        }
        if (error?.name === 'NotReadableError') {
          throw new Error('La caméra ou le microphone est déjà utilisé par une autre application. Fermez-la puis réessayez.');
        }
        throw new Error("Impossible d’activer la caméra et le microphone. Vérifiez HTTPS, les permissions du navigateur et les réglages système.");
      }
    }
  };

  useEffect(() => {
    if (!socket) return;
    const onAccepted = async ({ callId: acceptedCallId }: { callId: string }) => {
      if (role !== 'PHYSICIAN' || acceptedCallId !== activeCallRef.current) return;
      await connectDoctorMedia(acceptedCallId);
    };
    const onSignal = async ({ callId: signalCallId, signal }: { callId: string; signal: Signal }) => {
      if (signalCallId !== activeCallRef.current || !signal) return;
      try {
        let peer = peerRef.current;
        if (!peer && role === 'PATIENT') {
          const stream = localStreamRef.current || await requestMedia();
          peer = preparePeer(stream);
        }
        if (!peer) return;
        if (signal.type === 'offer' && signal.sdp) {
          await peer.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
          for (const candidate of pendingIceCandidatesRef.current.splice(0)) await peer.addIceCandidate(candidate);
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          socket.emit('telehealth.signal', { callId: signalCallId, signal: { type: 'answer', sdp: answer.sdp } satisfies Signal });
          setStatus('ACTIVE');
        } else if (signal.type === 'answer' && signal.sdp) {
          await peer.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
          for (const candidate of pendingIceCandidatesRef.current.splice(0)) await peer.addIceCandidate(candidate);
        } else if (signal.type === 'candidate' && signal.candidate) {
          if (peer.remoteDescription) await peer.addIceCandidate(signal.candidate);
          else pendingIceCandidatesRef.current.push(signal.candidate);
        }
      } catch {
        setMessage("La connexion vidéo a échoué. Vérifiez les autorisations caméra/microphone et le réseau.");
      }
    };
    const onEnded = ({ callId: endedCallId, status: endStatus }: { callId: string; status: string }) => {
      if (endedCallId !== activeCallRef.current) return;
      cleanUp();
      setStatus('ENDED');
      setMessage(endStatus === 'declined' ? "Le patient a refusé l'appel vidéo." : endStatus === 'expired' ? "L'appel a expiré sans réponse." : "Téléconsultation terminée. La transcription reste dans le brouillon à vérifier.");
      activeCallRef.current = null;
      setCallId(null);
    };
    socket.on('telehealth.accepted', onAccepted);
    socket.on('telehealth.signal', onSignal);
    socket.on('telehealth.ended', onEnded);
    return () => {
      socket.off('telehealth.accepted', onAccepted);
      socket.off('telehealth.signal', onSignal);
      socket.off('telehealth.ended', onEnded);
    };
  }, [socket, role]);

  useEffect(() => () => cleanUp(), []);

  const begin = async (consultationId: string) => {
    if (!socket) return setMessage('Connexion temps réel indisponible. Réessayez après reconnexion.');
    setMessage(null);
    socket.timeout(10_000).emit('telehealth.start', { consultationId }, (error: Error | null, response?: { callId?: string }) => {
      if (error || !response?.callId) return setMessage("Impossible de joindre le patient. Vérifiez que son compte patient est actif.");
      activeCallRef.current = response.callId;
      pendingIceCandidatesRef.current = [];
      setCallId(response.callId);
      setTranscript([]);
      setStatus('RINGING');
    });
  };

  const accept = async (incomingCallId: string) => {
    if (!socket) return setMessage('Connexion temps réel indisponible.');
    try {
      setStatus('CONNECTING');
      // The call identity must exist before adding tracks: mobile browsers can
      // emit an ICE candidate immediately after `addTrack`.
      activeCallRef.current = incomingCallId;
      pendingIceCandidatesRef.current = [];
      setCallId(incomingCallId);
      const stream = await requestMedia();
      preparePeer(stream);
      socket.timeout(10_000).emit('telehealth.accept', { callId: incomingCallId }, (error: Error | null) => {
        if (error) {
          cleanUp();
          activeCallRef.current = null;
          setStatus('IDLE');
          setMessage("L'appel n'est plus disponible.");
        }
      });
    } catch (error) {
      activeCallRef.current = null;
      setStatus('MEDIA_ERROR');
      setMessage(error instanceof Error ? error.message : 'Autorisation caméra/microphone refusée.');
    }
  };

  const decline = (incomingCallId: string) => socket?.emit('telehealth.decline', { callId: incomingCallId, reason: 'PATIENT_DECLINED' });
  const end = () => { if (activeCallRef.current) socket?.emit('telehealth.end', { callId: activeCallRef.current }); cleanUp(); setStatus('ENDED'); };
  const retryMedia = () => {
    if (role === 'PHYSICIAN' && activeCallRef.current) void connectDoctorMedia(activeCallRef.current);
  };
  return { callId, status, localStream, remoteStream, message, transcript, begin, accept, decline, end, retryMedia, setMessage };
}

export function DoctorTelehealthCall({ consultationId, patientName, onTranscript, autoStart }: { consultationId: string; patientName: string; onTranscript: (entries: TranscriptEntry[]) => void; autoStart?: boolean }) {
  const call = useWebRtcCall('PHYSICIAN', onTranscript);
  const active = call.status === 'RINGING' || call.status === 'CONNECTING' || call.status === 'ACTIVE' || call.status === 'MEDIA_ERROR';
  const persistedTranscriptRef = useRef<string | null>(null);
  useEffect(() => {
    if (autoStart && consultationId && call.status === 'IDLE') void call.begin(consultationId);
  }, [autoStart, consultationId, call.status]);
  useEffect(() => {
    if (call.status !== 'ENDED' || !consultationId || !call.transcript.length) return;
    const signature = JSON.stringify(call.transcript);
    if (persistedTranscriptRef.current === signature) return;
    persistedTranscriptRef.current = signature;
    void saveTelehealthTranscript(consultationId, call.transcript)
      .catch(() => call.setMessage("La transcription reste dans ce brouillon local. Enregistrez la consultation dès que la connexion est rétablie."));
  }, [call.status, call.transcript, consultationId]);
  return <section className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-900/70 dark:bg-violet-950/20"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold text-violet-950 dark:text-violet-100">Téléconsultation sécurisée</p><p className="text-xs text-violet-800 dark:text-violet-200">WebRTC direct entre vous et {patientName}. La vidéo n’est pas enregistrée par Aulia Care.</p></div>{!active ? <button type="button" disabled={!consultationId} onClick={() => call.begin(consultationId)} className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Video size={16} /> Lancer l’appel vidéo</button> : <button type="button" onClick={call.end} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white"><PhoneOff size={16} /> Terminer</button>}</div>{call.message && <div className="mt-3 flex flex-wrap items-center gap-3"><p className="text-xs font-medium text-violet-800 dark:text-violet-100">{call.message}</p>{call.status === 'MEDIA_ERROR' && <button type="button" onClick={call.retryMedia} className="rounded-md border border-violet-300 bg-white px-2 py-1 text-xs font-semibold text-violet-800">Réessayer caméra / micro</button>}</div>}{active && <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]"><div className="grid gap-3 md:grid-cols-2"><VideoSurface stream={call.localStream} muted title="Vous — médecin" /><VideoSurface stream={call.remoteStream} title={patientName} /></div><div className="rounded-xl border border-violet-100 bg-white p-3 dark:border-violet-900/70 dark:bg-slate-950"><p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><Mic size={16} /> Transcription à vérifier</p><p className="mt-1 text-xs text-slate-500">Chaque extrait reste un brouillon clinique : le médecin doit le relire avant validation.</p><div className="mt-3 max-h-72 space-y-2 overflow-y-auto">{call.transcript.length ? call.transcript.map((entry) => <div key={entry.id} className={entry.speaker === 'MEDECIN' ? 'mr-7 rounded-lg bg-violet-100 p-2 text-xs text-violet-950 dark:bg-violet-950/70 dark:text-violet-100' : 'ml-7 rounded-lg bg-slate-100 p-2 text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-100'}><b>{entry.speaker === 'MEDECIN' ? 'Médecin' : 'Patient'}</b><p className="mt-1">{entry.text}</p></div>) : <p className="text-xs text-slate-500">En attente de parole…</p>}</div></div></div>}</section>;
}

export function PatientTelehealthOverlay() {
  const { socket } = useRealtime();
  const [incoming, setIncoming] = useState<{ callId: string; doctorName: string } | null>(null);
  const call = useWebRtcCall('PATIENT');
  useEffect(() => {
    if (!socket) return;
    const onIncoming = (payload: { callId: string; doctorName: string }) => { setIncoming(payload); call.setMessage(null); };
    const onEnded = ({ callId }: { callId: string }) => { if (incoming?.callId === callId) setIncoming(null); };
    socket.on('telehealth.incoming', onIncoming);
    socket.on('telehealth.ended', onEnded);
    return () => { socket.off('telehealth.incoming', onIncoming); socket.off('telehealth.ended', onEnded); };
  }, [socket, incoming?.callId]);
  useEffect(() => {
    if (!incoming || call.status !== 'IDLE') return;
    return startIncomingRingtone();
  }, [incoming, call.status]);
  if (!incoming && call.status !== 'ACTIVE' && call.status !== 'CONNECTING') return null;
  return <div className="aulia-telehealth-overlay fixed inset-0 z-[1000000] grid place-items-center overflow-y-auto bg-slate-950/80 p-4"><section className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900"><div className="flex items-start justify-between gap-3"><div><p className="text-lg font-bold text-slate-900 dark:text-white">Consultation vidéo</p><p className="mt-1 text-sm text-slate-500">{incoming ? `${incoming.doctorName} souhaite démarrer une téléconsultation.` : 'Téléconsultation en cours.'}</p>{incoming && call.status === 'IDLE' && <p className="mt-2 animate-pulse text-xs font-semibold text-violet-700">● Appel entrant — sonnerie en cours</p>}</div><Video className="text-violet-700" /></div>{call.message && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{call.message}</p>}{call.status === 'ACTIVE' || call.status === 'CONNECTING' ? <div className="mt-5"><VideoSurface stream={call.remoteStream} title="Médecin" /><button type="button" onClick={() => { call.end(); setIncoming(null); }} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-3 font-semibold text-white"><PhoneOff size={18} /> Terminer l’appel</button></div> : <div className="mt-5 flex flex-col gap-3 sm:flex-row"><button type="button" onClick={() => incoming && call.accept(incoming.callId)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white"><Phone size={18} /> Accepter et activer caméra/micro</button><button type="button" onClick={() => { if (incoming) call.decline(incoming.callId); setIncoming(null); }} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-3 font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"><PhoneOff size={18} /> Refuser</button></div>}</section></div>;
}
