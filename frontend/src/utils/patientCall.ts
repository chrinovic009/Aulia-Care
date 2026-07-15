type PatientCallOptions = {
  patientName: string;
  destination: string;
  staffName?: string;
};

export function callPatientToWaitingRoom({ patientName, destination, staffName }: PatientCallOptions) {
  const cleanPatientName = patientName.trim() || "Patient";
  const cleanDestination = destination.trim() || "le service indique";
  const cleanStaffName = staffName?.trim();
  const message = cleanStaffName
    ? `${cleanPatientName}, veuillez vous rendre a ${cleanDestination}, aupres de ${cleanStaffName}.`
    : `${cleanPatientName}, veuillez vous rendre a ${cleanDestination}.`;

  if (!("speechSynthesis" in window)) {
    window.alert(message);
    return message;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.lang = "fr-FR";
  utterance.rate = 0.92;
  utterance.pitch = 1;
  utterance.volume = 1;
  window.speechSynthesis.speak(utterance);
  return message;
}
