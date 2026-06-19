-- =============================================================================
-- Elevate · Tabla puente marca_categorias
--
-- Permite asociar marcas a categorías de forma N:N. Reemplaza la lógica
-- implícita "deduce marca por categoría a partir de productos" del endpoint
-- público `/api/public/elevate/marcas?categoria=…` por una relación formal
-- administrable desde el ERP.
--
-- Diseño:
--   - N:N: una marca puede estar en varias categorías y viceversa.
--   - ON DELETE CASCADE en ambos lados — borrar la marca o la categoría
--     limpia automáticamente las asociaciones.
--   - UNIQUE (empresa_id, marca_id, categoria_id) → no duplica.
--
-- Backfill idempotente: por cada producto con marca_id+categoria_principal_id
-- distinct, inserta la relación. ON CONFLICT DO NOTHING.
--
-- Cero updates a `marcas`, `categorias_productos` o `productos`.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS elevate.marca_categorias (
  id           uuid        PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  empresa_id   uuid        NOT NULL REFERENCES elevate.empresas(id),
  marca_id     uuid        NOT NULL REFERENCES elevate.marcas(id) ON DELETE CASCADE,
  categoria_id uuid        NOT NULL REFERENCES elevate.categorias_productos(id) ON DELETE CASCADE,
  orden        int         NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marca_categorias_unica UNIQUE (empresa_id, marca_id, categoria_id)
);

CREATE INDEX IF NOT EXISTS idx_marca_categorias_categoria
  ON elevate.marca_categorias (categoria_id, orden ASC);
CREATE INDEX IF NOT EXISTS idx_marca_categorias_marca
  ON elevate.marca_categorias (marca_id);
CREATE INDEX IF NOT EXISTS idx_marca_categorias_empresa
  ON elevate.marca_categorias (empresa_id);

COMMENT ON TABLE elevate.marca_categorias IS
  'Relación N:N marca↔categoría. Permite curaduría manual desde el ERP de qué marcas pertenecen a cada categoría.';

-- ── Grants ──────────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA elevate TO anon, authenticated;

-- anon: el endpoint público `/api/public/elevate/marcas?categoria=…` ahora
-- consulta esta tabla. Solo columnas necesarias (sin empresa_id).
GRANT SELECT (id, marca_id, categoria_id, orden)
  ON elevate.marca_categorias
  TO anon;

GRANT SELECT, INSERT, DELETE, UPDATE ON elevate.marca_categorias TO authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE elevate.marca_categorias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mc_select_anon ON elevate.marca_categorias;
CREATE POLICY mc_select_anon
  ON elevate.marca_categorias
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS mc_select_authenticated ON elevate.marca_categorias;
CREATE POLICY mc_select_authenticated
  ON elevate.marca_categorias
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS mc_write_authenticated ON elevate.marca_categorias;
CREATE POLICY mc_write_authenticated
  ON elevate.marca_categorias
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Una relación por (empresa_id, marca_id, categoria_principal_id) distinto en
-- productos. Solo productos activos para no traer ruido de productos
-- archivados/borrados lógicamente.
INSERT INTO elevate.marca_categorias (empresa_id, marca_id, categoria_id)
SELECT DISTINCT p.empresa_id, p.marca_id, p.categoria_principal_id
  FROM elevate.productos p
 WHERE p.marca_id IS NOT NULL
   AND p.categoria_principal_id IS NOT NULL
   AND p.activo = true
ON CONFLICT ON CONSTRAINT marca_categorias_unica DO NOTHING;

COMMIT;
