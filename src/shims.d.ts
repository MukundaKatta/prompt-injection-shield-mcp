// Ambient types for @mukundakatta/prompt-injection-shield, which ships as
// pure JS. Mirrors the API documented in the upstream README.
declare module '@mukundakatta/prompt-injection-shield' {
  export interface PromptInjectionFinding {
    type: string;
    severity: 'low' | 'medium' | 'high';
    score: number;
    match: string;
  }

  export interface PromptInjectionScanResult {
    safe: boolean;
    score: number;
    findings: PromptInjectionFinding[];
  }

  export function scanPromptInjection(
    text: string,
    options?: { threshold?: number },
  ): PromptInjectionScanResult;

  export function stripDangerousLines(text: string): string;
}
