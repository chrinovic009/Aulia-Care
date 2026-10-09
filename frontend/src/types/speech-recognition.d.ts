interface AuliaSpeechRecognitionEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal?: boolean; 0: { transcript: string } }>;
}

interface AuliaSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: AuliaSpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

interface Window {
  SpeechRecognition?: new () => AuliaSpeechRecognition;
  webkitSpeechRecognition?: new () => AuliaSpeechRecognition;
}
