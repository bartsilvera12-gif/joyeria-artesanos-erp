-- =============================================================================
-- Elevate · Fase 1 catálogo web: categorías administrables
--
-- Cambios sobre elevate.categorias_productos:
--   - Columnas web: slug_web, visible_web, orden_web, descripcion_web
--   - Índice para query del catálogo público
--   - Seed idempotente de 4 categorías base para la empresa Elevate
--     (Nicho, Ultranicho, Diseñador, Árabe Premium).
--
-- Idempotente: IF NOT EXISTS / ON CONFLICT DO NOTHING.
-- NO se toca: productos, marcas, ventas, stock, pedidos, otros schemas.
-- =============================================================================

BEGIN;

ALTER TABLE elevate.categorias_productos
  ADD COLUMN IF NOT EXISTS slug_web text,
  ADD COLUMN IF NOT EXISTS visible_web boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS orden_web integer,
  ADD COLUMN IF NOT EXISTS descripcion_web text;

-- Slug único cuando se define
CREATE UNIQUE INDEX IF NOT EXISTS uq_categorias_productos_empresa_slug_web
  ON elevate.categorias_productos (empresa_id, slug_web)
  WHERE slug_web IS NOT NULL;

-- Lookup del catálogo público
CREATE INDEX IF NOT EXISTS idx_categorias_visible_web
  ON elevate.categorias_productos (empresa_id, visible_web, activo, orden_web NULLS LAST);

-- ─── Seed inicial idempotente ────────────────────────────────────────────
DO $$
DECLARE
  v_empresa_id uuid := '00000000-0000-0000-0000-00000000e1e7';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM elevate.empresas WHERE id = v_empresa_id) THEN
    RAISE NOTICE 'Empresa Elevate no encontrada; salto el seed';
    RETURN;
  END IF;

  INSERT INTO elevate.categorias_productos
    (empresa_id, nombre, slug_web, visible_web, orden_web, activo, descripcion_web)
  VALUES
    (v_empresa_id, 'Nicho',          'nicho',          true, 10, true,
       'Perfumería de autor con carácter editorial.'),
    (v_empresa_id, 'Ultranicho',     'ultranicho',     true, 20, true,
       'Composiciones excepcionales en tiradas limitadas.'),
    (v_empresa_id, 'Diseñador',      'disenador',      true, 30, true,
       'Clásicos contemporáneos, elegancia accesible.'),
    (v_empresa_id, 'Árabe Premium',  'arabe-premium',  true, 40, true,
       'Tradición oriental, lujo atemporal.')
  ON CONFLICT (empresa_id, lower(trim(nombre))) DO UPDATE
    SET slug_web        = COALESCE(elevate.categorias_productos.slug_web, EXCLUDED.slug_web),
        orden_web       = COALESCE(elevate.categorias_productos.orden_web, EXCLUDED.orden_web),
        descripcion_web = COALESCE(elevate.categorias_productos.descripcion_web, EXCLUDED.descripcion_web),
        updated_at      = now();
END $$;

COMMIT;
