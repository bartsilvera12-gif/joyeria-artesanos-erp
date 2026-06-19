-- =============================================================================
-- Elevate · Generador automático de SKU
--
-- Tabla de secuencia por (empresa, prefijo) y RPC que entrega el próximo SKU
-- libre con formato `PREFIJO_####`. Independiente del generador de código de
-- barras interno (`elevate.generar_codigo_producto_interno`) — esta migración
-- NO toca ese flujo.
--
-- Inicialización para Elevate + prefijo `ELE_PER` toma el máximo actual en
-- `elevate.productos.sku` (21 al momento de redactar esta migración). La
-- primera llamada a la RPC devolverá `ELE_PER_0022`.
--
-- Idempotente:
--   - CREATE TABLE / CREATE OR REPLACE FUNCTION / INSERT ... ON CONFLICT.
--   - Re-correr no resetea la secuencia ni genera duplicados.
--
-- No-impacto:
--   - No modifica `elevate.productos` (ni precio, stock, sku existente, etc).
--   - No toca `productos_codigo_secuencia` ni `codigo_barras`.
-- =============================================================================

BEGIN;

-- ── Tabla de secuencia ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS elevate.productos_sku_secuencia (
  empresa_id  uuid        NOT NULL REFERENCES elevate.empresas(id),
  prefijo     text        NOT NULL,
  last_value  bigint      NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, prefijo),
  CONSTRAINT productos_sku_prefijo_format
    CHECK (prefijo ~ '^[A-Z0-9_]{1,16}$')
);

COMMENT ON TABLE elevate.productos_sku_secuencia IS
  'Contador atómico de SKU por (empresa, prefijo). Cada incremento entrega un SKU PREFIJO_#### único.';

-- ── Función generadora ──────────────────────────────────────────────────────
-- Valida prefijo, incrementa atómicamente, defiende contra colisión con SKUs
-- manuales preexistentes. SECURITY DEFINER + search_path fijo para que el rol
-- authenticated pueda invocarla sin necesidad de privilegios sobre la tabla.
CREATE OR REPLACE FUNCTION elevate.generar_sku_producto(
  p_empresa_id uuid,
  p_prefijo text DEFAULT 'ELE_PER'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = elevate, public
AS $$
DECLARE
  v_prefijo text;
  v_next bigint;
  v_sku text;
  v_intentos int := 0;
BEGIN
  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'empresa_id es obligatorio';
  END IF;

  v_prefijo := upper(btrim(coalesce(p_prefijo, '')));
  IF v_prefijo = '' THEN
    v_prefijo := 'ELE_PER';
  END IF;
  IF v_prefijo !~ '^[A-Z0-9_]{1,16}$' THEN
    RAISE EXCEPTION 'Prefijo inválido. Solo A-Z, 0-9 y guion bajo (máx 16 chars).';
  END IF;

  LOOP
    -- UPSERT atómico. Si la fila aún no existe, la inicializa tomando el
    -- MAX(secuencia) actual en productos.sku para ese prefijo (defensa: si
    -- el backfill no corrió o se reseteó, igual arrancamos en max+1).
    INSERT INTO elevate.productos_sku_secuencia (empresa_id, prefijo, last_value)
    VALUES (
      p_empresa_id,
      v_prefijo,
      COALESCE((
        SELECT MAX(
          (regexp_replace(p.sku, '^' || v_prefijo || '_', ''))::int
        )
          FROM elevate.productos p
         WHERE p.empresa_id = p_empresa_id
           AND p.sku ~ ('^' || v_prefijo || '_[0-9]+$')
      ), 0) + 1
    )
    ON CONFLICT (empresa_id, prefijo) DO UPDATE
      SET last_value = elevate.productos_sku_secuencia.last_value + 1,
          updated_at = now()
    RETURNING last_value INTO v_next;

    v_sku := v_prefijo || '_' || lpad(v_next::text, 4, '0');

    -- Defensa final: si por alguna razón el SKU calculado ya está en
    -- productos (carga manual con prefijo + número), seguimos avanzando.
    IF NOT EXISTS (
      SELECT 1 FROM elevate.productos
       WHERE empresa_id = p_empresa_id
         AND sku = v_sku
    ) THEN
      RETURN v_sku;
    END IF;

    v_intentos := v_intentos + 1;
    IF v_intentos > 50 THEN
      RAISE EXCEPTION 'No se pudo generar SKU único tras 50 intentos';
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION elevate.generar_sku_producto(uuid, text) IS
  'Devuelve el próximo SKU disponible PREFIJO_#### para la empresa indicada. Atómico, valida unicidad.';

GRANT EXECUTE ON FUNCTION elevate.generar_sku_producto(uuid, text)
  TO authenticated, service_role;

-- ── Inicialización ELE_PER ──────────────────────────────────────────────────
-- Toma el máximo numérico actual de productos.sku para cada empresa con
-- algún SKU ELE_PER_####. La primera llamada a la RPC incrementa a max+1.
-- ON CONFLICT DO NOTHING para no pisar una secuencia ya en uso.
INSERT INTO elevate.productos_sku_secuencia (empresa_id, prefijo, last_value)
SELECT
  p.empresa_id,
  'ELE_PER',
  MAX((regexp_replace(p.sku, '^ELE_PER_', ''))::int)
FROM elevate.productos p
WHERE p.sku ~ '^ELE_PER_[0-9]+$'
GROUP BY p.empresa_id
ON CONFLICT (empresa_id, prefijo) DO NOTHING;

COMMIT;
