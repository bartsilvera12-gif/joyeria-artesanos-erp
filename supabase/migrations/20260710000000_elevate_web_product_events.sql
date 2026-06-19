-- ============================================================================
-- Migración: tabla tenant-only elevate.web_product_events
--
-- Objetivo: registrar eventos de comportamiento web de la tienda pública
-- (perfumeriaelevate.com) para alimentar el ranking "Top productos más
-- buscados" en el dashboard de inventario.
--
-- Diseño:
--   * Append-only log. No DELETE/UPDATE en flujo normal.
--   * 4 tipos de evento: product_view | product_click | add_to_cart |
--     whatsapp_click. Whitelist en CHECK constraint.
--   * Sin datos personales: no IP, no user-agent crudo, no email/teléfono.
--     Rate-limit vive en memoria del Node, no en DB.
--   * `metadata jsonb` queda para extensiones futuras (tracking de campañas,
--     etc.) sin migración adicional.
--   * Sin FK a productos: las analytics deben sobrevivir a un soft-delete del
--     producto. La integridad se valida a nivel app antes de insertar.
--
-- Privilegios:
--   * INSERT/SELECT al rol `postgres` (usado por pg.Pool del runtime Next).
--   * Sin acceso para `anon` / `authenticated` PostgREST: la web pública NUNCA
--     toca esta tabla via PostgREST; siempre va por POST server-side.
--
-- Idempotente: usa IF NOT EXISTS en todo. Seguro de re-correr.
-- ============================================================================

CREATE TABLE IF NOT EXISTS elevate.web_product_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid        NOT NULL,
  event_type  text        NOT NULL
              CHECK (event_type IN (
                'product_view',
                'product_click',
                'add_to_cart',
                'whatsapp_click'
              )),
  source      text,                 -- ej: 'catalogo', 'detalle', 'home', etc.
  path        text,                 -- ej: '/catalogo', '/producto/oud-royale'
  metadata    jsonb,                -- payload libre para extensión futura
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Índice principal para el ranking top-N por evento + rango fechas + producto
CREATE INDEX IF NOT EXISTS idx_wpe_product_event_date
  ON elevate.web_product_events (product_id, event_type, created_at DESC);

-- Índice para queries por tipo de evento + rango fechas (ej: total vistas)
CREATE INDEX IF NOT EXISTS idx_wpe_event_date
  ON elevate.web_product_events (event_type, created_at DESC);

-- Índice para purga futura por fecha (housekeeping)
CREATE INDEX IF NOT EXISTS idx_wpe_date
  ON elevate.web_product_events (created_at DESC);

-- Comentarios para documentación interna (\d+ en psql)
COMMENT ON TABLE  elevate.web_product_events IS
  'Eventos de comportamiento web (vistas, clicks, carrito, WhatsApp). Append-only. Sin PII.';
COMMENT ON COLUMN elevate.web_product_events.event_type IS
  'Tipo de evento. Whitelist: product_view, product_click, add_to_cart, whatsapp_click.';
COMMENT ON COLUMN elevate.web_product_events.source IS
  'Origen libre (catalogo, detalle, home, bestsellers, etc.). Nunca PII.';
COMMENT ON COLUMN elevate.web_product_events.path IS
  'Path de la URL donde ocurrió el evento. Sin query strings sensibles.';
COMMENT ON COLUMN elevate.web_product_events.metadata IS
  'JSON libre para extensión. Nunca PII (no email, no teléfono, no IP).';
