import { useEffect } from 'react';

function speak(text: string) {
  if (!('speechSynthesis' in window) || !text.trim()) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'fr-FR';
  utterance.rate = 0.95;
  window.speechSynthesis.speak(utterance);
}

/** Reads only high-priority events already authorized for the connected user. */
export function useSpeechNotifications(userId?: string) {
  useEffect(() => {
    const onNotification = (event: Event) => {
      const payload = (event as CustomEvent).detail;
      if (payload?.recipientId && payload.recipientId !== userId) return;
      if (['HIGH', 'CRITICAL'].includes(String(payload?.priority || '').toUpperCase())) speak(`${payload?.title || 'Alerte médicale'}. ${payload?.message || ''}`);
    };
    const onClinicalAlert = (event: Event) => {
      const payload = (event as CustomEvent).detail;
      if (payload?.recipientId && payload.recipientId !== userId) return;
      speak(`${payload?.title || 'Alerte clinique critique'}. ${payload?.message || 'Évaluation humaine immédiate requise.'}`);
    };
    window.addEventListener('d7:notification.created', onNotification);
    window.addEventListener('d7:clinical.alert', onClinicalAlert);
    return () => { window.removeEventListener('d7:notification.created', onNotification); window.removeEventListener('d7:clinical.alert', onClinicalAlert); };
  }, [userId]);
}
