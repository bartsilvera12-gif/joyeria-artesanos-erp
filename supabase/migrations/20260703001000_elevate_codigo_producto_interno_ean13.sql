-- =============================================================================
-- Elevate · Código de barras interno EAN-13 numérico
--
-- Cambio: la RPC elevate.generar_codigo_producto_interno pasa de devolver
-- "ELE-PER-{SEQ6}" (alfanumérico) a un EAN-13 numérico escaneable:
--   - Base: "20" + secuencia LPAD a 10 dígitos = 12 dígitos.
--   - 13er dígito: checksum EAN-13 estándar (pesos 1/3 alternados,
--     d13 = (10 - (sumaPonderada mod 10)) mod 10).
--   - Resultado: 13 dígitos numéricos.
--
-- Reutiliza elevate.productos_codigo_secuencia (no se resetea).
-- Valida unicidad contra elevate.productos.codigo_barras; ante colisión
-- avanza la secuencia (hasta 50 reintentos).
--
-- Idempotente: CREATE OR REPLACE FUNCTION. No toca otros schemas. No toca
-- productos existentes ni la tabla de secuencia.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION elevate.generar_codigo_producto_interno(p_empresa_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = elevate, public
AS $$
DECLARE
  v_next     bigint;
  v_base12   text;
  v_codigo   text;
  v_suma     int;
  v_check    int;
  v_d        int;
  i          int;
  v_intentos int := 0;
BEGIN
  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'empresa_id es obligatorio';
  END IF;

  LOOP
    -- UPSERT atómico de la secuencia.
    INSERT INTO elevate.productos_codigo_secuencia (empresa_id, last_value)
    VALUES (p_empresa_id, 1)
    ON CONFLICT (empresa_id) DO UPDATE
      SET last_value = elevate.productos_codigo_secuencia.last_value + 1,
          updated_at = now()
    RETURNING last_value INTO v_next;

    -- Base 12 dígitos: prefijo interno "20" + secuencia LPAD(10).
    -- "20…" es el rango reservado por GS1 para uso interno/in-store, no
    -- colisiona con códigos asignados a fabricantes reales.
    v_base12 := '20' || lpad(v_next::text, 10, '0');

    -- Checksum EAN-13: posiciones 1..12 de izquierda a derecha; pesos
    -- 1,3,1,3,1,3,1,3,1,3,1,3 (impar=1, par=3). Dígito 13 = (10 - sum%10) % 10.
    v_suma := 0;
    FOR i IN 1..12 LOOP
      v_d := (substr(v_base12, i, 1))::int;
      IF (i % 2) = 1 THEN
        v_suma := v_suma + v_d;          -- posiciones impares, peso 1
      ELSE
        v_suma := v_suma + (v_d * 3);    -- posiciones pares, peso 3
      END IF;
    END LOOP;
    v_check := (10 - (v_suma % 10)) % 10;

    v_codigo := v_base12 || v_check::text;

    -- Defensa contra colisión con códigos ya cargados manualmente.
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

-- Grants ya existen de la migración previa; los reafirmamos por idempotencia.
GRANT EXECUTE ON FUNCTION elevate.generar_codigo_producto_interno(uuid)
  TO anon, authenticated, service_role;

COMMIT;
