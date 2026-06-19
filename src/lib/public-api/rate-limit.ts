/**
 * Rate-limit en memoria por hash de cliente.
 *
 * Diseño:
 *   - Map global por runtime Node (sobrevive hot-reload via globalThis).
 *   - Ventana deslizante simple por contador con reset al expirar.
 *   - Hash SHA-256 de IP + User-Agent (primeros 16 chars en hex). NO se
 *     persiste el IP crudo en ningún lado: ni en memoria ni en DB.
 *   - Single-node only. Si se escala a multi-instancia, migrar a Redis.
 *
 * Uso típico para endpoints públicos POST:
 *   const allowed = checkRateLimit({ ip, ua, max: 60, windowMs: 60_000 });
 *   if (!allowed) return new Response(null, { status: 429 });
 */
import { createHash } from "node:crypto";

interface Bucket {
  count: number;
  resetAt: number; // epoch ms
}

const GLOBAL_KEY = "__neura_RATE_LIMIT_BUCKETS__" as const;

function getStore(): Map<string, Bucket> {
  const g = globalThis as unknown as Record<string, Map<string, Bucket> | undefined>;
  let m = g[GLOBAL_KEY];
  if (!m) {
    m = new Map<string, Bucket>();
    g[GLOBAL_KEY] = m;
  }
  return m;
}

export function clientHash(ip: string | null, ua: string | null): string {
  // Salt con un valor estable por proceso para que el hash no sea trivialmente
  // reproducible si alguna vez se loguea. Sin embargo, el hash NO se persiste.
  return createHash("sha256")
    .update(`${ip ?? "unknown"}|${ua ?? "unknown"}`)
    .digest("hex")
    .slice(0, 16);
}

export interface RateLimitInput {
  /** Hash opaco que identifica al cliente. NUNCA la IP cruda. */
  key: string;
  /** Máximo de eventos permitidos por ventana. */
  max: number;
  /** Tamaño de ventana en ms. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number; // ms hasta reset
}

export function checkRateLimit(input: RateLimitInput): RateLimitResult {
  const store = getStore();
  const now = Date.now();
  const bucket = store.get(input.key);
  if (!bucket || bucket.resetAt <= now) {
    const fresh: Bucket = { count: 1, resetAt: now + input.windowMs };
    store.set(input.key, fresh);
    // Housekeeping ocasional: si el store crece mucho, purgar viejos.
    if (store.size > 5000) {
      for (const [k, b] of store) {
        if (b.resetAt <= now) store.delete(k);
      }
    }
    return { allowed: true, remaining: input.max - 1, resetMs: input.windowMs };
  }
  if (bucket.count >= input.max) {
    return { allowed: false, remaining: 0, resetMs: bucket.resetAt - now };
  }
  bucket.count += 1;
  return {
    allowed: true,
    remaining: input.max - bucket.count,
    resetMs: bucket.resetAt - now,
  };
}

/** Extrae IP del request (best-effort) sin almacenarla. */
export function extractClientIp(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    // primera IP de la cadena = cliente original
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  return null;
}
