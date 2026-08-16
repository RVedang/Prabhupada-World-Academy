/**
 * Global SSE client registry — uses globalThis so it survives across
 * Next.js module boundaries (hot-reload, multiple worker instances, etc.)
 *
 * DO NOT import this into client-side code — it runs on the server only.
 */

// Extend globalThis so TypeScript is happy
declare global {
  // eslint-disable-next-line no-var
  var __sseClients: Map<string, ReadableStreamDefaultController> | undefined;
  // eslint-disable-next-line no-var
  var __sseClientCounter: number | undefined;
}

function getSseClients(): Map<string, ReadableStreamDefaultController> {
  if (!globalThis.__sseClients) {
    globalThis.__sseClients = new Map();
  }
  return globalThis.__sseClients;
}

function nextClientId(): string {
  if (!globalThis.__sseClientCounter) globalThis.__sseClientCounter = 0;
  return String(++globalThis.__sseClientCounter);
}

export function registerSseClient(controller: ReadableStreamDefaultController): string {
  const id = nextClientId();
  getSseClients().set(id, controller);
  console.log(`[SSE] Client registered id=${id}, total=${getSseClients().size}`);
  return id;
}

export function removeSseClient(id: string): void {
  getSseClients().delete(id);
  console.log(`[SSE] Client removed id=${id}, total=${getSseClients().size}`);
}

export function broadcastToSseClients(message: Record<string, unknown>): void {
  const clients = getSseClients();
  console.log(`[SSE] Broadcasting to ${clients.size} clients:`, JSON.stringify(message));
  const payload = `data: ${JSON.stringify(message)}\n\n`;
  const encoder = new TextEncoder();
  for (const [id, controller] of clients.entries()) {
    try {
      controller.enqueue(encoder.encode(payload));
      console.log(`[SSE] Sent to client id=${id}`);
    } catch (e) {
      // Client disconnected — remove stale entry
      console.log(`[SSE] Client id=${id} failed (disconnected), removing`);
      clients.delete(id);
    }
  }
}
