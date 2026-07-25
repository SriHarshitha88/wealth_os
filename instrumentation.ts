// Runs once when the Next.js server starts.
// Node < 22 has no global WebSocket; the Supabase client needs one on the server.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && !(globalThis as any).WebSocket) {
    const ws = (await import('ws')).default;
    (globalThis as any).WebSocket = ws as unknown as typeof WebSocket;
  }
}
