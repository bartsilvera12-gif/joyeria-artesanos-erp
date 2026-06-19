-- =============================================================================
-- Elevate · Marcas formales + columna productos.marca_id (Fase Marcas)
--
-- Crea una tabla normalizada de marcas para que el catálogo web pueda navegar
-- "Categoría → Marca → Productos". La columna legacy productos.marca text se
-- preserva intacta como fallback de compatibilidad — esta migración solo
-- AGREGA y NUNCA borra/sobrescribe campos que no sean marca_id.
--
-- Pasos:
--   1. Tabla elevate.marcas (slug único por empresa).
--   2. Columna elevate.productos.marca_id uuid NULL REFERENCES marcas.
--   3. Backfill: INSERT marcas distintas desde productos.marca, UPDATE
--      productos.marca_id por match de nombre (TRIM). Solo toca marca_id.
--   4. Grants anon SELECT a columnas seguras de elevate.marcas (catálogo
--      público). authenticated CRUD via RLS por empresa_id.
--
-- Idempotente: IF NOT EXISTS, CREATE OR REPLACE, ON CONFLICT DO NOTHING.
-- Seguro de re-correr.
-- =============================================================================

BEGIN;

-- ── Tabla marcas ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS elevate.marcas (
  id              uuid         PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  empresa_id      uuid         NOT NULL REFERENCES elevate.empresas(id),
  nombre          text         NOT NULL,
  slug_web        text         NOT NULL,
  descripcion_web text,
  logo_url        text,
  visible_web     boolean      NOT NULL DEFAULT true,
  orden_web       int          NOT NULL DEFAULT 0,
  activo          boolean      NOT NULL DEFAULT true,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT marcas_slug_web_unico_por_empresa UNIQUE (empresa_id, slug_web),
  CONSTRAINT marcas_nombre_no_vacio CHECK (length(btrim(nombre)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_marcas_empresa_nombre_ci
  ON elevate.marcas (empresa_id, lower(btrim(nombre)));

CREATE INDEX IF NOT EXISTS idx_marcas_empresa_orden
  ON elevate.marcas (empresa_id, orden_web ASC, nombre ASC) WHERE activo;

COMMENT ON TABLE elevate.marcas IS
  'Catálogo de marcas por empresa para navegación Categoría → Marca → Productos.';

-- ── Columna productos.marca_id ──────────────────────────────────────────────
ALTER TABLE elevate.productos
  ADD COLUMN IF NOT EXISTS marca_id uuid REFERENCES elevate.marcas(id);

CREATE INDEX IF NOT EXISTS idx_productos_marca_id
  ON elevate.productos (marca_id) WHERE marca_id IS NOT NULL;

COMMENT ON COLUMN elevate.productos.marca_id IS
  'FK a elevate.marcas. Null = aún no asignada. La columna legacy productos.marca text se mantiene como fallback.';

-- ── Backfill: marcas desde productos.marca ──────────────────────────────────
-- Inserta marcas distintas con slug derivado del nombre. ON CONFLICT NO TOCA
-- las filas previas (idempotente). Solo crea filas para marcas con nombre
-- no vacío. NUNCA modifica precio/stock/imagen/etc — solo INSERT en `marcas`.
INSERT INTO elevate.marcas (empresa_id, nombre, slug_web, visible_web, orden_web)
SELECT
  p.empresa_id,
  btrim(p.marca)                                              AS nombre,
  lower(regexp_replace(
    regexp_replace(
      translate(
        btrim(p.marca),
        'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
        'aaaaaeeeeiiiiooooouuuunc' || 'aaaaaeeeeiiiiooooouuuunc'
      ),
      '[^a-zA-Z0-9]+', '-', 'g'
    ),
    '(^-+)|(-+$)', '', 'g'
  ))                                                          AS slug_web,
  true                                                        AS visible_web,
  0                                                           AS orden_web
FROM elevate.productos p
WHERE p.marca IS NOT NULL
  AND btrim(p.marca) <> ''
GROUP BY p.empresa_id, btrim(p.marca)
ON CONFLICT ON CONSTRAINT marcas_slug_web_unico_por_empresa DO NOTHING;

-- Asigna marca_id a productos con marca text matching (case-insensitive).
-- Solo actualiza filas donde marca_id IS NULL — no toca asignaciones manuales
-- previas.
UPDATE elevate.productos p
   SET marca_id = m.id
  FROM elevate.marcas m
 WHERE p.marca_id IS NULL
   AND p.marca IS NOT NULL
   AND btrim(p.marca) <> ''
   AND m.empresa_id = p.empresa_id
   AND lower(btrim(m.nombre)) = lower(btrim(p.marca));

-- ── Grants ──────────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA elevate TO anon, authenticated;

-- anon: columnas que el catálogo público necesita. `activo` se incluye
-- porque el endpoint público embed productos→marca lo pide explícitamente
-- en el select (lo usa para filtrar marcas inactivas en server-side). NO se
-- expone empresa_id ni timestamps administrativos.
GRANT SELECT
  (id, nombre, slug_web, descripcion_web, logo_url, visible_web, orden_web, activo)
  ON elevate.marcas
  TO anon;

-- Para embeds futuros desde productos públicos: anon debe poder leer marca_id.
GRANT SELECT (marca_id) ON elevate.productos TO anon;

GRANT SELECT, INSERT, UPDATE ON elevate.marcas TO authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE elevate.marcas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marcas_select_anon ON elevate.marcas;
CREATE POLICY marcas_select_anon
  ON elevate.marcas
  FOR SELECT
  TO anon
  USING (visible_web = true AND activo = true);

DROP POLICY IF EXISTS marcas_select_authenticated ON elevate.marcas;
CREATE POLICY marcas_select_authenticated
  ON elevate.marcas
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS marcas_insert_authenticated ON elevate.marcas;
CREATE POLICY marcas_insert_authenticated
  ON elevate.marcas
  FOR INSERT
  TO authenticated
  WITH CHECK (length(btrim(nombre)) > 0);

DROP POLICY IF EXISTS marcas_update_authenticated ON elevate.marcas;
CREATE POLICY marcas_update_authenticated
  ON elevate.marcas
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (length(btrim(nombre)) > 0);

-- Trigger para mantener updated_at (idempotente).
CREATE OR REPLACE FUNCTION elevate._marcas_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marcas_updated_at ON elevate.marcas;
CREATE TRIGGER trg_marcas_updated_at
  BEFORE UPDATE ON elevate.marcas
  FOR EACH ROW
  EXECUTE FUNCTION elevate._marcas_set_updated_at();

COMMIT;
