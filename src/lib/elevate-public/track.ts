/**
 * Helper client-side para registrar eventos de comportamiento web.
 *
 * POST /api/public/elevate/product-events. Fire-and-forget con `keepalive`
 * para no bloquear navegaciones (especialmente útil en product_click cuando
 * el usuario está saltando de catálogo a detalle).
 *
 * IMPORTANTE: NUNCA debe romper la UX. Si la red falla, el endpoint cae,
 * o llega 429 (rate-limit), simplemente se ignora silenciosamente. Las
 * funciones devuelven void.
 */

export type WebProductEventType =
  | "product_view"
  | "product_click"
  | "add_to_cart"
  | "whatsapp_click";

export interface TrackProductEventInput {
  product_id: string;
  event_type: WebProductEventType;
  source?: string | null;
  path?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Envía un evento al endpoint público. Silent fail.
 *
 * Usa `keepalive: true` para sobrevivir a navigations cliente-side. Body
 * < 64KB es OK. Si la lib runtime no soporta keepalive (SSR), igual cae
 * en el catch y devuelve.
 */
export function trackProductEvent(input: TrackProductEventInput): void {
  if (typeof window === "undefined") return; // no tiene sentido en SSR
  if (!input.product_id || !input.event_type) return;
  try {
    const path = input.path ?? window.location.pathname;
    const body = JSON.stringify({
      product_id: input.product_id,
      event_type: input.event_type,
      source: input.source ?? null,
      path,
      metadata: input.metadata ?? null,
    });
    // No await: fire-and-forget.
    void fetch("/api/public/elevate/product-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      // No usamos credentials: este endpoint es público stateless.
    }).catch(() => {
      /* silent fail — el tracking nunca debe afectar UX */
    });
  } catch {
    /* silent fail */
  }
}
