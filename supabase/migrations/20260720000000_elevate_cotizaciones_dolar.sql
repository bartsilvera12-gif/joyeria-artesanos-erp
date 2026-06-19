-- =============================================================================
-- Elevate · Cotización del dólar (USD/PYG) manual
--
-- Tabla append-only por empresa para guardar cotizaciones cargadas a mano
-- desde el ERP. La web pública muestra debajo del precio en guaraníes el
-- equivalente aproximado en USD usando el valor más reciente.
--
-- Diseño:
--   - Append-only: cada guardado inserta una fila nueva. Conserva historial.
--   - `cotizacion` = guaraníes por 1 USD (numeric(14,4) para tolerar decimales
--     finos sin perder precisión).
--   - View `cotizacion_dolar_actual`: DISTINCT ON (empresa_id) la fila más
--     reciente por empresa. Sin filas → view vacía → la web no muestra USD
--     (degradación silenciosa).
--
-- Privilegios:
--   - SELECT (id, cotizacion, vigente_desde) en la view → anon (la web pública
--     la consume vía PostgREST). NO expone empresa_id, creado_por ni notas.
--   - INSERT/SELECT en la tabla → authenticated (cargado desde el ERP).
--   - service_role full access (jobs/admin).
--
-- Idempotente: IF NOT EXISTS + CREATE OR REPLACE. No toca otras tablas.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS elevate.cotizaciones_dolar (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid         NOT NULL,
  cotizacion      numeric(14,4) NOT NULL CHECK (cotizacion > 0),
  vigente_desde   timestamptz  NOT NULL DEFAULT now(),
  creado_por      uuid,
  notas           text,
  created_at      timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cotizaciones_dolar_empresa_vigente
  ON elevate.cotizaciones_dolar (empresa_id, vigente_desde DESC);

COMMENT ON TABLE  elevate.cotizaciones_dolar IS
  'Cotización USD/PYG cargada manualmente desde el ERP. Append-only.';
COMMENT ON COLUMN elevate.cotizaciones_dolar.cotizacion IS
  'Guaraníes (PYG) por 1 USD. Ej: 7500.0000 = Gs. 7.500 por USD 1.';
COMMENT ON COLUMN elevate.cotizaciones_dolar.vigente_desde IS
  'Momento desde el cual rige esta cotización. Por defecto now().';

-- Vista de la cotización vigente (la más reciente por empresa).
CREATE OR REPLACE VIEW elevate.cotizacion_dolar_actual AS
  SELECT DISTINCT ON (empresa_id)
    id,
    empresa_id,
    cotizacion,
    vigente_desde
  FROM elevate.cotizaciones_dolar
  ORDER BY empresa_id, vigente_desde DESC, created_at DESC;

COMMENT ON VIEW elevate.cotizacion_dolar_actual IS
  'Cotización USD/PYG vigente por empresa (la más reciente).';

-- ── Grants ──────────────────────────────────────────────────────────────────
-- anon: solo lectura de la view, columnas seguras (sin empresa_id, sin notas).
-- authenticated: CRUD via PostgREST se filtra con RLS (abajo).
GRANT USAGE ON SCHEMA elevate TO anon, authenticated;

GRANT SELECT (id, cotizacion, vigente_desde)
  ON elevate.cotizacion_dolar_actual
  TO anon;

GRANT SELECT, INSERT ON elevate.cotizaciones_dolar TO authenticated;
GRANT SELECT          ON elevate.cotizacion_dolar_actual TO authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE elevate.cotizaciones_dolar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cotizaciones_dolar_select_authenticated ON elevate.cotizaciones_dolar;
CREATE POLICY cotizaciones_dolar_select_authenticated
  ON elevate.cotizaciones_dolar
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS cotizaciones_dolar_insert_authenticated ON elevate.cotizaciones_dolar;
CREATE POLICY cotizaciones_dolar_insert_authenticated
  ON elevate.cotizaciones_dolar
  FOR INSERT
  TO authenticated
  WITH CHECK (cotizacion > 0);

COMMIT;
