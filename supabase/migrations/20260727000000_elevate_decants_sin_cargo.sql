-- =============================================================================
-- Elevate · Decants y obsequios sin cargo en ventas
--
-- Permite marcar productos como "decants" (muestras pequeñas) y entregarlos
-- como obsequio dentro de una venta. El obsequio descuenta stock pero no
-- cobra al cliente, dejando trazabilidad de costo promocional.
--
-- Cambios:
--   1. elevate.productos + es_decant boolean default false
--   2. elevate.ventas_items + es_sin_cargo, motivo_sin_cargo,
--      costo_unitario_snapshot, costo_promocional_total + CHECK
--      consistente (si es_sin_cargo=true, precios=0 y motivo no null)
--   3. elevate.movimientos_inventario.origen expandido para aceptar
--      'venta_regalo' (mantiene los 4 valores históricos)
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + DO $$ guards.
-- Sin backfill — defaults seguros sobre datos históricos.
-- Cero updates a productos / ventas / movimientos existentes.
-- =============================================================================

BEGIN;

-- ── Flag de decant en producto ──────────────────────────────────────────────
ALTER TABLE elevate.productos
  ADD COLUMN IF NOT EXISTS es_decant boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN elevate.productos.es_decant IS
  'Si true, este producto puede entregarse como obsequio sin cargo en una venta.';

CREATE INDEX IF NOT EXISTS idx_productos_es_decant
  ON elevate.productos (empresa_id) WHERE es_decant = true;

-- ── Soporte "sin cargo" en líneas de venta ─────────────────────────────────
ALTER TABLE elevate.ventas_items
  ADD COLUMN IF NOT EXISTS es_sin_cargo             boolean       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_sin_cargo         text,
  ADD COLUMN IF NOT EXISTS costo_unitario_snapshot  numeric(14,2),
  ADD COLUMN IF NOT EXISTS costo_promocional_total  numeric(14,2);

COMMENT ON COLUMN elevate.ventas_items.es_sin_cargo IS
  'true = entregado como obsequio. precio_venta/subtotal/total_linea deben ser 0.';
COMMENT ON COLUMN elevate.ventas_items.motivo_sin_cargo IS
  'Motivo del obsequio: decant_obsequio, regalo, promocion, etc.';
COMMENT ON COLUMN elevate.ventas_items.costo_unitario_snapshot IS
  'Costo promedio del producto congelado al momento de la venta.';
COMMENT ON COLUMN elevate.ventas_items.costo_promocional_total IS
  'cantidad × costo_unitario_snapshot. Trazabilidad del costo asumido por el negocio.';

-- CHECK consistencia: si es_sin_cargo=true, los 3 montos = 0 y motivo no null
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ventas_items_sin_cargo_consistente'
  ) THEN
    ALTER TABLE elevate.ventas_items
      ADD CONSTRAINT ventas_items_sin_cargo_consistente
      CHECK (
        es_sin_cargo = false
        OR (precio_venta = 0
            AND subtotal = 0
            AND total_linea = 0
            AND motivo_sin_cargo IS NOT NULL
            AND length(btrim(motivo_sin_cargo)) > 0)
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ventas_items_costo_snapshot_nonneg'
  ) THEN
    ALTER TABLE elevate.ventas_items
      ADD CONSTRAINT ventas_items_costo_snapshot_nonneg
      CHECK (costo_unitario_snapshot IS NULL OR costo_unitario_snapshot >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ventas_items_costo_promocional_nonneg'
  ) THEN
    ALTER TABLE elevate.ventas_items
      ADD CONSTRAINT ventas_items_costo_promocional_nonneg
      CHECK (costo_promocional_total IS NULL OR costo_promocional_total >= 0);
  END IF;
END $$;

-- ── Expandir CHECK de origen en movimientos_inventario ─────────────────────
-- Estado previo (migración 20250312000003_erp_schema.sql):
--   CHECK origen IN ('compra','venta','ajuste_manual','inventario_inicial')
-- Sumamos 'venta_regalo' sin remover los valores históricos.
DO $$
DECLARE
  v_cname text;
BEGIN
  -- Localizar el constraint actual del CHECK sobre origen.
  SELECT conname INTO v_cname
    FROM pg_constraint
   WHERE conrelid = 'elevate.movimientos_inventario'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%origen%IN%';
  IF v_cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE elevate.movimientos_inventario DROP CONSTRAINT %I', v_cname);
  END IF;
END $$;

ALTER TABLE elevate.movimientos_inventario
  ADD CONSTRAINT movimientos_inventario_origen_check
  CHECK (origen IN ('compra','venta','ajuste_manual','inventario_inicial','venta_regalo'));

COMMIT;
