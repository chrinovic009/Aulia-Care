import type { MessageKind } from "../../api/messages";

export const formatVoiceDuration = (durationMs?: number | null) => {
  const totalSeconds = Math.max(0, Math.round((durationMs || 0) / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
};

export const messagePreview = (kind: MessageKind, text: string) => {
  if (text.trim()) return text;
  if (kind === "PHOTO") return "Photo";
  if (kind === "VOICE") return "Message vocal";
  if (kind === "IMAGING") return "Imagerie médicale";
  return "Message";
};

export const canShareImaging = (role?: string) => ["PHYSICIAN", "RADIOLOGIST", "SURGEON"].includes(role || "");
