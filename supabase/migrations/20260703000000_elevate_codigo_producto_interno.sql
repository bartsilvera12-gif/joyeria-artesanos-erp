-- =============================================================================
-- Elevate · Generación de código interno de producto
--
-- Objetivo:
--   - Tabla auxiliar elevate.productos_codigo_secuencia para secuencia atómica
--     por empresa.
--   - RPC elevate.generar_codigo_producto_interno(p_empresa_id uuid) RETURNS text
--     que devuelve el siguiente código disponible en formato:
--         ELE-PER-{SEQ6}
--     (p. ej. ELE-PER-000001). Evita colisiones contra elevate.productos.codigo_barras.
--
-- Reglas:
--   - 100% idempotente (IF NOT EXISTS / CREATE OR REPLACE).
--   - Solo schema `elevate`. No toca otros schemas, ni datos existentes.
--   - SECURITY DEFINER para que el rol authenticated/anon (vía PostgREST)
--     pueda invocarlo sin permisos directos sobre la tabla de secuencia.
-- =============================================================================

BEGIN;

-- 1) Tabla de secuencia por empresa (last_value bigint, PK empresa_id)
CREATE TABLE IF NOT EXISTS elevate.productos_codigo_secuencia (
  empresa_id uuid PRIMARY KEY,
  last_value bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON elevate.productos_codigo_secuencia TO postgres, service_role;

-- 2) RPC: incrementa secuencia + arma código + valida unicidad contra productos
CREATE OR REPLACE FUNCTION elevate.generar_codigo_producto_interno(p_empresa_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = elevate, public
AS $$
DECLARE
  v_next     bigint;
  v_codigo   text;
  v_intentos int := 0;
BEGIN
  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'empresa_id es obligatorio';
  END IF;

  LOOP
    -- UPSERT atómico: INSERT(1) o UPDATE(last_value + 1).
    INSERT INTO elevate.productos_codigo_secuencia (empresa_id, last_value)
    VALUES (p_empresa_id, 1)
    ON CONFLICT (empresa_id) DO UPDATE
      SET last_value = elevate.productos_codigo_secuencia.last_value + 1,
          updated_at = now()
    RETURNING last_value INTO v_next;

    v_codigo := 'ELE-PER-' || lpad(v_next::text, 6, '0');

    -- Si por importación manual ya existe un producto con ese código, saltar.
    IF NOT EXISTS (
      SELECT 1
        FROM elevate.productos
       WHERE empresa_id   = p_empresa_id
         AND codigo_barras = v_codigo
    ) THEN
      RETURN v_codigo;
    END IF;

    v_intentos := v_intentos + 1;
    IF v_intentos > 50 THEN
      RAISE EXCEPTION 'No se pudo generar un código interno único tras 50 intentos';
    END IF;
  END LOOP;
END;
$$;

-- PostgREST necesita poder ejecutar la función desde anon/authenticated.
-- SECURITY DEFINER cubre los privilegios reales sobre la tabla.
GRANT EXECUTE ON FUNCTION elevate.generar_codigo_producto_interno(uuid)
  TO anon, authenticated, service_role;

COMMIT;
