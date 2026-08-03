// Client-safe name masking (no server-only imports).

export const PRIVACY_COOKIE = 'wos_privacy';

// Keep the first 2 letters of each word, dot out the rest.
// "Rakesh Singh" → "Ra•••• Si•••".
export function maskName(name: string): string {
  return (name || '')
    .split(/\s+/)
    .map((w) => (w.length <= 2 ? w : w.slice(0, 2) + '•'.repeat(Math.min(w.length - 2, 8))))
    .join(' ');
}

export const maskIf = (name: string, on: boolean) => (on ? maskName(name) : name);
