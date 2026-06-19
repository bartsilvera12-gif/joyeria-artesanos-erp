-- =============================================================================
-- ELEVATE — Fase 1 integración web pública: campos web en elevate.productos
-- =============================================================================
-- Solo agrega columnas opt-in para publicar productos en la web pública.
-- No mueve datos. No afecta a otros schemas. Idempotente.
--
-- Columnas agregadas:
--   slug_web         URL amigable para /p/<slug>
--   visible_web      flag opt-in para mostrar en web (default false)
--   destacado_web    destacado en home (default false)
--   descripcion_corta texto corto para card
--   descripcion_web  descripción larga para detalle
--   marca            string libre (Fase 1; normalizar a tabla en fase futura)
--   precio_web       override opcional del precio_venta para web
-- =============================================================================

BEGIN;

DO $check_schema$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'elevate') THEN
    RAISE EXCEPTION 'ELEVATE: schema elevate no existe';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'elevate' AND c.relname = 'productos'
  ) THEN
    RAISE EXCEPTION 'ELEVATE: tabla elevate.productos no existe';
  END IF;
END;
$check_schema$;

ALTER TABLE elevate.productos
  ADD COLUMN IF NOT EXISTS slug_web         text,
  ADD COLUMN IF NOT EXISTS visible_web      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS destacado_web    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS descripcion_corta text,
  ADD COLUMN IF NOT EXISTS descripcion_web  text,
  ADD COLUMN IF NOT EXISTS marca            text,
  ADD COLUMN IF NOT EXISTS precio_web       numeric;

-- CHECK precio_web >= 0 (nullable OK)
DO $check_precio$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'productos_precio_web_nonneg_check'
      AND conrelid = 'elevate.productos'::regclass
  ) THEN
    ALTER TABLE elevate.productos
      ADD CONSTRAINT productos_precio_web_nonneg_check
      CHECK (precio_web IS NULL OR precio_web >= 0);
  END IF;
END;
$check_precio$;

-- Unique partial per (empresa_id, slug_web) cuando slug_web no es null
CREATE UNIQUE INDEX IF NOT EXISTS productos_empresa_slug_web_uq
  ON elevate.productos (empresa_id, slug_web)
  WHERE slug_web IS NOT NULL;

-- Índice de listado web (visible + activo, ordenando destacados primero)
CREATE INDEX IF NOT EXISTS productos_web_listado_ix
  ON elevate.productos (visible_web, activo, destacado_web)
  WHERE visible_web = true AND activo = true;

-- Comentarios documentales
COMMENT ON COLUMN elevate.productos.slug_web IS
  'URL amigable única por empresa para /p/<slug>. NULL = no publicado.';
COMMENT ON COLUMN elevate.productos.visible_web IS
  'Opt-in para mostrar en API pública (/api/public/elevate/productos).';
COMMENT ON COLUMN elevate.productos.destacado_web IS
  'Aparece en sección destacados de la home.';
COMMENT ON COLUMN elevate.productos.descripcion_corta IS
  'Texto corto (1-2 líneas) para tarjeta en listado.';
COMMENT ON COLUMN elevate.productos.descripcion_web IS
  'Descripción larga (HTML/markdown plano) para página de detalle.';
COMMENT ON COLUMN elevate.productos.marca IS
  'Marca del producto (string libre; fase 1).';
COMMENT ON COLUMN elevate.productos.precio_web IS
  'Override opcional del precio_venta para web. NULL = usar precio_venta.';

NOTIFY pgrst, 'reload schema';

COMMIT;
