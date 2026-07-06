import { env } from "./environment";

export const FEATURE_FLAGS = {
  AI_ASSISTANT: true,
  FORM_ANALYZER: true,    // Enabled in both dev & prod
  DOCUMENT_LOCKER: true,  // Enabled in both dev & prod
  SCHEMES_ENGINE: true,   // Enabled in both dev & prod
  NOTIFICATIONS: true,
  CIVIC_MAP: true,       // Interactive Leaflet civic map
} as const;

export type FeatureFlagName = keyof typeof FEATURE_FLAGS;

export function isFeatureEnabled(name: FeatureFlagName): boolean {
  return FEATURE_FLAGS[name];
}
