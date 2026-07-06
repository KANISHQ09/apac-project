export const LANGUAGES = {
  EN: "en",
  HI: "hi",
} as const;

export type LanguageType = typeof LANGUAGES[keyof typeof LANGUAGES];
