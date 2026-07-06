/**
 * voiceService.ts
 * ----------------
 * A robust wrapper around the browser's native Web Speech API.
 * Supports multilingual recognition (en-US and hi-IN) with
 * clear error fallbacks for unsupported browsers.
 *
 * Task 1.1 — Multimodal Intake & Speech Integration (ImplementationPlan.md)
 */

// --------------------------------------------------------------------------
// Web Speech API type declarations (not in standard DOM lib)
// --------------------------------------------------------------------------

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type VoiceLanguage = "en" | "hi";

export interface VoiceServiceOptions {
  /** BCP-47 language code for recognition */
  language: VoiceLanguage;
  /** Called with interim/final transcript text */
  onTranscript: (text: string, isFinal: boolean) => void;
  /** Called on any recognition error */
  onError?: (error: string) => void;
  /** Called when recognition session ends */
  onEnd?: () => void;
}

// --------------------------------------------------------------------------
// Internal helpers
// --------------------------------------------------------------------------

type SpeechRecognitionConstructor = new () => SpeechRecognition;

/** Maps our language enum to BCP-47 locale codes */
const LANGUAGE_MAP: Record<VoiceLanguage, string> = {
  en: "en-IN", // English (India) — better accent match than en-US for Bharat
  hi: "hi-IN", // Hindi (India)
};

/** Resolve the SpeechRecognition constructor across browser vendors */
function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  return (
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition ||
    null
  );
}

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

export const voiceService = {
  /**
   * Returns true if the current browser supports the Web Speech API.
   */
  isSupported(): boolean {
    return getSpeechRecognitionConstructor() !== null;
  },

  /**
   * Starts a speech recognition session.
   * Returns a stop function that terminates the session.
   *
   * @returns cleanup function — call it to stop listening early.
   */
  startListening(options: VoiceServiceOptions): () => void {
    const SpeechRecognition = getSpeechRecognitionConstructor();

    if (!SpeechRecognition) {
      options.onError?.(
        "Speech recognition is not supported in this browser. Please use Chrome or Edge."
      );
      return () => {};
    }

    const recognition = new SpeechRecognition();

    // Configuration
    recognition.lang = LANGUAGE_MAP[options.language];
    recognition.continuous = true;       // Keep recording until manually stopped
    recognition.interimResults = true;   // Provide live interim results
    recognition.maxAlternatives = 1;

    // Event handlers
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;

        if (result.isFinal) {
          finalTranscript += text;
        } else {
          interimTranscript += text;
        }
      }

      if (finalTranscript) {
        options.onTranscript(finalTranscript, true);
      } else if (interimTranscript) {
        options.onTranscript(interimTranscript, false);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      let errorMessage: string;

      switch (event.error) {
        case "no-speech":
          errorMessage = "No speech detected. Please try again.";
          break;
        case "audio-capture":
          errorMessage = "Microphone not found. Please check your microphone.";
          break;
        case "not-allowed":
          errorMessage =
            "Microphone access was denied. Please allow access in your browser settings.";
          break;
        case "network":
          errorMessage = "Network error during speech recognition.";
          break;
        case "aborted":
          // User-initiated stop; not a real error
          return;
        default:
          errorMessage = `Speech recognition error: ${event.error}`;
      }

      options.onError?.(errorMessage);
    };

    recognition.onend = () => {
      options.onEnd?.();
    };

    recognition.start();

    // Return a cleanup function
    return () => {
      try {
        recognition.stop();
      } catch {
        // Already stopped — safe to ignore
      }
    };
  },

  /**
   * Speaks text aloud using the browser's Text-to-Speech engine.
   * Respects the active language for voice selection.
   */
  speak(text: string, language: VoiceLanguage = "en"): void {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = LANGUAGE_MAP[language];
    utterance.rate = 0.95;
    utterance.pitch = 1;

    window.speechSynthesis.speak(utterance);
  },

  /**
   * Cancels any ongoing text-to-speech output.
   */
  stopSpeaking(): void {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
  },
};
