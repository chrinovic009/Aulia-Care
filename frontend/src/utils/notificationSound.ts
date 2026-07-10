const NOTIFICATION_SOUND_SRC = "/iphone_notification_tone(256k).mp3";
let notificationAudio: HTMLAudioElement | null = null;

export const playNotificationSound = () => {
  try {
    if (typeof window === "undefined" || typeof Audio === "undefined") return;

    if (!notificationAudio) {
      notificationAudio = new Audio(NOTIFICATION_SOUND_SRC);
      notificationAudio.preload = "auto";
      notificationAudio.volume = 0.8;
    }

    notificationAudio.currentTime = 0;
    void notificationAudio.play().catch(() => undefined);
  } catch {
    // Browsers may block audio until the user interacts with the page.
  }
};
