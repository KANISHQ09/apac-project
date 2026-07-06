const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous\s+)?instructions/i,
  /you\s+are\s+now\s+in\s+developer\s+mode/i,
  /dan\s+mode/i,
  /do\s+anything\s+now/i,
  /system\s+prompt/i,
  /reveal\s+system/i,
  /what\s+is\s+your\s+system/i,
  /jailbreak/i,
  /bypass\s+rules/i,
  /chain-of-thought/i,
  /show\s+your\s+thought/i,
  /internal\s+thought/i,
  /new\s+rule:/i,
  /override\s+prompt/i,
  /role\s+override/i,
  /hidden\s+instruction/i,
];

export interface GuardrailResult {
  passed: boolean;
  reason: string | null;
}

/**
 * Scans user inputs for known prompt injection, jailbreak, or system-bypass attempts.
 */
export function scanForPromptInjection(content: string): GuardrailResult {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(content)) {
      return {
        passed: false,
        reason: `Potential prompt injection / jailbreak pattern detected: ${pattern.toString()}`,
      };
    }
  }
  return { passed: true, reason: null };
}

/**
 * Sanitizes user input to remove script injection tags and javascript protocol urls.
 */
export function sanitizeInput(content: string): string {
  return content
    .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, "")
    .replace(/javascript:/gi, "")
    .trim();
}
