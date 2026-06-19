-- =============================================================================
-- Elevate · Precio mayorista informativo
--
-- Agrega tres columnas opcionales a elevate.productos para mostrar en la web
-- pública un precio mayorista referencial:
--   - precio_mayorista          numeric(14,2) NULL  (>= 0 si presente)
--   - cantidad_minima_mayorista int           NULL  (> 0 si presente)
--   - visible_mayorista_web     boolean       NOT NULL DEFAULT false
--
-- Es solo informativo: NO aplica descuentos en carrito ni checkout. La app
-- valida en cliente y server que si visible_mayorista_web=true, los otros
-- dos campos sean válidos.
--
-- No-impacto: ALTER ADD COLUMN IF NOT EXISTS con defaults seguros, sin
-- UPDATE a filas existentes. Anon recibe GRANT SELECT sobre las 3 columnas
-- para que el endpoint público pueda exponerlas.
-- =============================================================================

BEGIN;

ALTER TABLE elevate.productos
  ADD COLUMN IF NOT EXISTS precio_mayorista          numeric(14,2),
  ADD COLUMN IF NOT EXISTS cantidad_minima_mayorista int,
  ADD COLUMN IF NOT EXISTS visible_mayorista_web     boolean NOT NULL DEFAULT false;

-- CHECKs idempotentes. Si ya existen del mismo nombre, no se agregan dos veces.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'productos_precio_mayorista_nonneg'
  ) THEN
    ALTER TABLE elevate.productos
      ADD CONSTRAINT productos_precio_mayorista_nonneg
      CHECK (precio_mayorista IS NULL OR precio_mayorista >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'productos_cantidad_minima_mayorista_pos'
  ) THEN
    ALTER TABLE elevate.productos
      ADD CONSTRAINT productos_cantidad_minima_mayorista_pos
      CHECK (cantidad_minima_mayorista IS NULL OR cantidad_minima_mayorista > 0);
  END IF;
END $$;

COMMENT ON COLUMN elevate.productos.precio_mayorista IS
  'Precio mayorista informativo (Gs.). NO aplica descuento en carrito/checkout.';
COMMENT ON COLUMN elevate.productos.cantidad_minima_mayorista IS
  'Cantidad mínima de unidades para que el precio mayorista aplique (referencia).';
COMMENT ON COLUMN elevate.productos.visible_mayorista_web IS
  'Si true, la web pública muestra "Mayorista desde N unidades: Gs. X".';

-- ── Grants ──────────────────────────────────────────────────────────────────
-- Anon necesita las 3 columnas en el catálogo público.
GRANT SELECT (precio_mayorista, cantidad_minima_mayorista, visible_mayorista_web)
  ON elevate.productos
  TO anon;

COMMIT;
