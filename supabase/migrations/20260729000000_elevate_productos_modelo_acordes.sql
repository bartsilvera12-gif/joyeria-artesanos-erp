-- =============================================================================
-- Elevate · Modelo de perfume + cantidad_minima_minorista + acordes olfativos
--
-- Agrega tres bloques al catálogo de productos para alinearlo con la planilla
-- de carga del cliente:
--
--   1. productos.modelo                       text   NULL
--      (mapea a la columna "SKU PRODUCT" del Excel: nombre/modelo del perfume,
--       ej. "Sauvage", "1 Million").
--
--   2. productos.cantidad_minima_minorista    int    NULL  (> 0 si presente)
--      (mapea a la columna "CANTIDAD MINIMA_V" minorista del Excel.)
--
--   3. Acordes olfativos (catálogo global + asociación N:M con productos):
--        - tabla elevate.acordes_olfativos
--        - tabla elevate.producto_acordes
--      Cada acorde tiene nombre + imagen opcional (servida desde el bucket
--      productos-imagenes con path `{empresa_id}/acordes/{id}/principal.{ext}`).
--
-- Todo es idempotente (IF NOT EXISTS, DROP IF EXISTS, ON CONFLICT DO NOTHING)
-- y no toca datos existentes — solo ADD/CREATE.
-- =============================================================================

BEGIN;

-- ── 1. productos.modelo ─────────────────────────────────────────────────────
ALTER TABLE elevate.productos
  ADD COLUMN IF NOT EXISTS modelo text;

COMMENT ON COLUMN elevate.productos.modelo IS
  'Modelo / nombre del perfume (ej. Sauvage, 1 Million). Mapea a "SKU PRODUCT" del Excel.';

-- ── 2. productos.cantidad_minima_minorista ──────────────────────────────────
ALTER TABLE elevate.productos
  ADD COLUMN IF NOT EXISTS cantidad_minima_minorista int;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'productos_cantidad_minima_minorista_pos'
  ) THEN
    ALTER TABLE elevate.productos
      ADD CONSTRAINT productos_cantidad_minima_minorista_pos
      CHECK (cantidad_minima_minorista IS NULL OR cantidad_minima_minorista > 0);
  END IF;
END $$;

COMMENT ON COLUMN elevate.productos.cantidad_minima_minorista IS
  'Cantidad mínima sugerida para venta minorista (referencia informativa).';

-- Grants anon para que el catálogo público pueda leer los nuevos campos.
GRANT SELECT (modelo, cantidad_minima_minorista) ON elevate.productos TO anon;

-- ── 3. Tabla acordes_olfativos ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS elevate.acordes_olfativos (
  id              uuid         PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  empresa_id      uuid         NOT NULL REFERENCES elevate.empresas(id),
  nombre          text         NOT NULL,
  slug_web        text         NOT NULL,
  imagen_path     text,
  imagen_url      text,
  visible_web     boolean      NOT NULL DEFAULT true,
  orden_web       int          NOT NULL DEFAULT 0,
  activo          boolean      NOT NULL DEFAULT true,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT acordes_slug_web_unico_por_empresa UNIQUE (empresa_id, slug_web),
  CONSTRAINT acordes_nombre_no_vacio CHECK (length(btrim(nombre)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_acordes_empresa_nombre_ci
  ON elevate.acordes_olfativos (empresa_id, lower(btrim(nombre)));

CREATE INDEX IF NOT EXISTS idx_acordes_empresa_orden
  ON elevate.acordes_olfativos (empresa_id, orden_web ASC, nombre ASC) WHERE activo;

COMMENT ON TABLE elevate.acordes_olfativos IS
  'Catálogo de acordes olfativos por empresa (ej. cítrico, amaderado, fresco). Cada acorde puede tener imagen.';

-- Grants anon (catálogo público) + authenticated CRUD via RLS.
GRANT USAGE ON SCHEMA elevate TO anon, authenticated;
GRANT SELECT (id, nombre, slug_web, imagen_path, imagen_url, visible_web, orden_web, activo)
  ON elevate.acordes_olfativos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON elevate.acordes_olfativos TO authenticated;

ALTER TABLE elevate.acordes_olfativos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS acordes_select_anon ON elevate.acordes_olfativos;
CREATE POLICY acordes_select_anon
  ON elevate.acordes_olfativos
  FOR SELECT
  TO anon
  USING (visible_web = true AND activo = true);

DROP POLICY IF EXISTS acordes_select_authenticated ON elevate.acordes_olfativos;
CREATE POLICY acordes_select_authenticated
  ON elevate.acordes_olfativos
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS acordes_insert_authenticated ON elevate.acordes_olfativos;
CREATE POLICY acordes_insert_authenticated
  ON elevate.acordes_olfativos
  FOR INSERT
  TO authenticated
  WITH CHECK (length(btrim(nombre)) > 0);

DROP POLICY IF EXISTS acordes_update_authenticated ON elevate.acordes_olfativos;
CREATE POLICY acordes_update_authenticated
  ON elevate.acordes_olfativos
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (length(btrim(nombre)) > 0);

DROP POLICY IF EXISTS acordes_delete_authenticated ON elevate.acordes_olfativos;
CREATE POLICY acordes_delete_authenticated
  ON elevate.acordes_olfativos
  FOR DELETE
  TO authenticated
  USING (true);

-- Trigger para updated_at.
CREATE OR REPLACE FUNCTION elevate._acordes_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_acordes_updated_at ON elevate.acordes_olfativos;
CREATE TRIGGER trg_acordes_updated_at
  BEFORE UPDATE ON elevate.acordes_olfativos
  FOR EACH ROW
  EXECUTE FUNCTION elevate._acordes_set_updated_at();

-- ── 4. Tabla puente producto_acordes ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS elevate.producto_acordes (
  empresa_id   uuid        NOT NULL REFERENCES elevate.empresas(id),
  producto_id  uuid        NOT NULL REFERENCES elevate.productos(id) ON DELETE CASCADE,
  acorde_id    uuid        NOT NULL REFERENCES elevate.acordes_olfativos(id) ON DELETE CASCADE,
  orden        int         NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (producto_id, acorde_id)
);

CREATE INDEX IF NOT EXISTS idx_producto_acordes_producto
  ON elevate.producto_acordes (producto_id, orden ASC);

CREATE INDEX IF NOT EXISTS idx_producto_acordes_acorde
  ON elevate.producto_acordes (acorde_id);

COMMENT ON TABLE elevate.producto_acordes IS
  'Asociación N:M entre productos y acordes olfativos. orden = posición en la pirámide de acordes principales.';

GRANT SELECT ON elevate.producto_acordes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON elevate.producto_acordes TO authenticated;

ALTER TABLE elevate.producto_acordes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS producto_acordes_select_anon ON elevate.producto_acordes;
CREATE POLICY producto_acordes_select_anon
  ON elevate.producto_acordes
  FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS producto_acordes_select_authenticated ON elevate.producto_acordes;
CREATE POLICY producto_acordes_select_authenticated
  ON elevate.producto_acordes
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS producto_acordes_insert_authenticated ON elevate.producto_acordes;
CREATE POLICY producto_acordes_insert_authenticated
  ON elevate.producto_acordes
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS producto_acordes_update_authenticated ON elevate.producto_acordes;
CREATE POLICY producto_acordes_update_authenticated
  ON elevate.producto_acordes
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS producto_acordes_delete_authenticated ON elevate.producto_acordes;
CREATE POLICY producto_acordes_delete_authenticated
  ON elevate.producto_acordes
  FOR DELETE
  TO authenticated
  USING (true);

COMMIT;
