-- Elevate · Fase 1 · Catálogo enriquecido
-- Idempotente. Solo schema elevate. Sin tocar otros schemas.
--
-- Cambios:
--   1. ADD COLUMN no destructivo a elevate.productos:
--      precio_oferta, oferta_hasta, nuevo_hasta, concentracion, volumen_ml,
--      genero, proximamente, orden_web, familia_olfativa_id.
--   2. Crea elevate.familias_olfativas, elevate.notas_olfativas,
--      elevate.producto_notas (con ENUM nota_posicion: top/heart/base).
--   3. FK opcional productos.familia_olfativa_id → familias_olfativas.id.
--   4. Indexes para orden_web y joins.
--   5. RLS por empresa para escritura, lectura pública (anon) para
--      lectura web. Mantiene patrón existente con puede_acceder_empresa.
--   6. GRANT column-level a anon para las nuevas columnas públicas
--      de productos y SELECT full a las nuevas tablas read-mostly.
--   7. NOTIFY pgrst reload schema.

BEGIN;

-- 1. ADD COLUMNs a productos
ALTER TABLE elevate.productos
  ADD COLUMN IF NOT EXISTS precio_oferta numeric,
  ADD COLUMN IF NOT EXISTS oferta_hasta timestamptz,
  ADD COLUMN IF NOT EXISTS nuevo_hasta date,
  ADD COLUMN IF NOT EXISTS concentracion text,
  ADD COLUMN IF NOT EXISTS volumen_ml int,
  ADD COLUMN IF NOT EXISTS genero text,
  ADD COLUMN IF NOT EXISTS proximamente boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS orden_web int,
  ADD COLUMN IF NOT EXISTS familia_olfativa_id uuid;

-- Checks de integridad (idempotentes)
DO $$ BEGIN
  ALTER TABLE elevate.productos
    ADD CONSTRAINT productos_precio_oferta_nonneg CHECK (precio_oferta IS NULL OR precio_oferta >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE elevate.productos
    ADD CONSTRAINT productos_volumen_ml_positive CHECK (volumen_ml IS NULL OR volumen_ml > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE elevate.productos
    ADD CONSTRAINT productos_genero_chk CHECK (genero IS NULL OR genero IN ('masculino','femenino','unisex'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Tipo ENUM para posición de nota
DO $$ BEGIN
  CREATE TYPE elevate.nota_posicion AS ENUM ('top','heart','base');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Tabla familias_olfativas
CREATE TABLE IF NOT EXISTS elevate.familias_olfativas (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  empresa_id uuid NOT NULL,
  nombre text NOT NULL,
  descripcion text,
  orden int,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
  ALTER TABLE elevate.familias_olfativas
    ADD CONSTRAINT uq_familias_olfativas_empresa_nombre UNIQUE (empresa_id, nombre);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_familias_olfativas_empresa ON elevate.familias_olfativas (empresa_id);

-- 4. Tabla notas_olfativas
CREATE TABLE IF NOT EXISTS elevate.notas_olfativas (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  empresa_id uuid NOT NULL,
  nombre text NOT NULL,
  familia_id uuid,
  descripcion text,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN
  ALTER TABLE elevate.notas_olfativas
    ADD CONSTRAINT uq_notas_olfativas_empresa_nombre UNIQUE (empresa_id, nombre);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE elevate.notas_olfativas
    ADD CONSTRAINT notas_olfativas_familia_fk
    FOREIGN KEY (familia_id) REFERENCES elevate.familias_olfativas(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_notas_olfativas_empresa ON elevate.notas_olfativas (empresa_id);
CREATE INDEX IF NOT EXISTS idx_notas_olfativas_familia ON elevate.notas_olfativas (familia_id);

-- 5. Junction producto_notas
CREATE TABLE IF NOT EXISTS elevate.producto_notas (
  producto_id uuid NOT NULL,
  nota_id uuid NOT NULL,
  posicion elevate.nota_posicion NOT NULL,
  orden int,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (producto_id, nota_id, posicion)
);
DO $$ BEGIN
  ALTER TABLE elevate.producto_notas
    ADD CONSTRAINT producto_notas_producto_fk
    FOREIGN KEY (producto_id) REFERENCES elevate.productos(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE elevate.producto_notas
    ADD CONSTRAINT producto_notas_nota_fk
    FOREIGN KEY (nota_id) REFERENCES elevate.notas_olfativas(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_producto_notas_producto ON elevate.producto_notas (producto_id);
CREATE INDEX IF NOT EXISTS idx_producto_notas_nota ON elevate.producto_notas (nota_id);

-- 6. FK opcional productos.familia_olfativa_id → familias_olfativas.id
DO $$ BEGIN
  ALTER TABLE elevate.productos
    ADD CONSTRAINT productos_familia_olfativa_fk
    FOREIGN KEY (familia_olfativa_id) REFERENCES elevate.familias_olfativas(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_productos_familia_olfativa ON elevate.productos (familia_olfativa_id);
CREATE INDEX IF NOT EXISTS idx_productos_orden_web ON elevate.productos (orden_web NULLS LAST, nombre);

-- 7. RLS para tablas nuevas
ALTER TABLE elevate.familias_olfativas ENABLE ROW LEVEL SECURITY;
ALTER TABLE elevate.notas_olfativas ENABLE ROW LEVEL SECURITY;
ALTER TABLE elevate.producto_notas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS familias_olfativas_select_public ON elevate.familias_olfativas;
CREATE POLICY familias_olfativas_select_public ON elevate.familias_olfativas
  FOR SELECT TO anon USING (activo = true);

DROP POLICY IF EXISTS familias_olfativas_admin ON elevate.familias_olfativas;
CREATE POLICY familias_olfativas_admin ON elevate.familias_olfativas
  FOR ALL TO authenticated
  USING (elevate.puede_acceder_empresa(empresa_id))
  WITH CHECK (elevate.puede_acceder_empresa(empresa_id));

DROP POLICY IF EXISTS notas_olfativas_select_public ON elevate.notas_olfativas;
CREATE POLICY notas_olfativas_select_public ON elevate.notas_olfativas
  FOR SELECT TO anon USING (activo = true);

DROP POLICY IF EXISTS notas_olfativas_admin ON elevate.notas_olfativas;
CREATE POLICY notas_olfativas_admin ON elevate.notas_olfativas
  FOR ALL TO authenticated
  USING (elevate.puede_acceder_empresa(empresa_id))
  WITH CHECK (elevate.puede_acceder_empresa(empresa_id));

DROP POLICY IF EXISTS producto_notas_select_public ON elevate.producto_notas;
CREATE POLICY producto_notas_select_public ON elevate.producto_notas
  FOR SELECT TO anon USING (
    EXISTS (
      SELECT 1 FROM elevate.productos p
      WHERE p.id = producto_id AND p.activo = true AND p.visible_web = true
    )
  );

DROP POLICY IF EXISTS producto_notas_admin ON elevate.producto_notas;
CREATE POLICY producto_notas_admin ON elevate.producto_notas
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM elevate.productos p
      WHERE p.id = producto_id AND elevate.puede_acceder_empresa(p.empresa_id)
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM elevate.productos p
      WHERE p.id = producto_id AND elevate.puede_acceder_empresa(p.empresa_id)
    )
  );

-- 8. GRANTs column-level a anon en productos (nuevas columnas seguras)
GRANT SELECT (
  precio_oferta, oferta_hasta, nuevo_hasta, concentracion, volumen_ml,
  genero, proximamente, orden_web, familia_olfativa_id, stock_minimo
) ON elevate.productos TO anon;

-- 9. GRANTs table-level a anon para familias/notas/producto_notas
GRANT SELECT ON elevate.familias_olfativas TO anon;
GRANT SELECT ON elevate.notas_olfativas TO anon;
GRANT SELECT ON elevate.producto_notas TO anon;

-- 10. GRANTs completos a authenticated (ya estaba en bootstrap pero defensivo)
GRANT SELECT, INSERT, UPDATE, DELETE ON elevate.familias_olfativas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON elevate.notas_olfativas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON elevate.producto_notas TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
