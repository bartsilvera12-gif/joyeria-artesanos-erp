-- =============================================================================
-- Elevate · Presentaciones por ml
--
-- Soporta productos con múltiples presentaciones (30/50/100 ml, etc.). Cada
-- presentación tiene SKU, precio, stock e imagen propios. Convive con los
-- productos simples actuales (los 29 quedan con tiene_presentaciones=false).
--
-- Cambios:
--   1. elevate.producto_presentaciones (tabla nueva).
--   2. elevate.productos.tiene_presentaciones boolean default false.
--   3. elevate.pedidos_web_items.presentacion_id uuid NULL.
--   4. elevate.crear_pedido_web RPC reemplazado: acepta presentacion_id
--      opcional en cada item y recalcula precio/stock desde la fila correcta.
--
-- Idempotente: IF NOT EXISTS + DO $$ guards + CREATE OR REPLACE.
-- Cero updates a filas existentes (solo defaults).
-- =============================================================================

BEGIN;

-- ── Tabla producto_presentaciones ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS elevate.producto_presentaciones (
  id                         uuid          PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  empresa_id                 uuid          NOT NULL REFERENCES elevate.empresas(id),
  producto_id                uuid          NOT NULL REFERENCES elevate.productos(id) ON DELETE CASCADE,
  sku                        text          NOT NULL,
  codigo_barras              text,
  codigo_barras_interno      boolean       NOT NULL DEFAULT false,
  volumen_ml                 numeric(8,2)  NOT NULL,
  costo_promedio             numeric(14,2) NOT NULL DEFAULT 0,
  precio_venta               numeric(14,2) NOT NULL DEFAULT 0,
  precio_web                 numeric(14,2),
  precio_oferta              numeric(14,2),
  oferta_hasta               timestamptz,
  precio_mayorista           numeric(14,2),
  cantidad_minima_mayorista  int,
  visible_mayorista_web      boolean       NOT NULL DEFAULT false,
  stock_actual               numeric(14,3) NOT NULL DEFAULT 0,
  stock_minimo               numeric(14,3) NOT NULL DEFAULT 0,
  imagen_path                text,
  imagen_url                 text,
  visible_web                boolean       NOT NULL DEFAULT true,
  activo                     boolean       NOT NULL DEFAULT true,
  orden                      int           NOT NULL DEFAULT 0,
  created_at                 timestamptz   NOT NULL DEFAULT now(),
  updated_at                 timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT producto_presentaciones_sku_unico_por_empresa UNIQUE (empresa_id, sku),
  CONSTRAINT producto_presentaciones_volumen_unico_por_producto UNIQUE (producto_id, volumen_ml),
  CONSTRAINT producto_presentaciones_volumen_pos                  CHECK (volumen_ml > 0),
  CONSTRAINT producto_presentaciones_costo_nonneg                 CHECK (costo_promedio >= 0),
  CONSTRAINT producto_presentaciones_precio_venta_nonneg          CHECK (precio_venta >= 0),
  CONSTRAINT producto_presentaciones_precio_web_nonneg            CHECK (precio_web IS NULL OR precio_web >= 0),
  CONSTRAINT producto_presentaciones_precio_oferta_nonneg         CHECK (precio_oferta IS NULL OR precio_oferta >= 0),
  CONSTRAINT producto_presentaciones_precio_mayorista_nonneg      CHECK (precio_mayorista IS NULL OR precio_mayorista >= 0),
  CONSTRAINT producto_presentaciones_cant_min_mayorista_pos       CHECK (cantidad_minima_mayorista IS NULL OR cantidad_minima_mayorista > 0),
  CONSTRAINT producto_presentaciones_stock_actual_nonneg          CHECK (stock_actual >= 0),
  CONSTRAINT producto_presentaciones_stock_minimo_nonneg          CHECK (stock_minimo >= 0)
);

CREATE INDEX IF NOT EXISTS idx_producto_presentaciones_producto
  ON elevate.producto_presentaciones (producto_id, orden ASC, volumen_ml ASC) WHERE activo;

CREATE INDEX IF NOT EXISTS idx_producto_presentaciones_empresa
  ON elevate.producto_presentaciones (empresa_id);

COMMENT ON TABLE elevate.producto_presentaciones IS
  'Presentaciones por ml de un producto. Cada fila = SKU/precio/stock independientes.';

-- updated_at trigger
CREATE OR REPLACE FUNCTION elevate._pp_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_pp_updated_at ON elevate.producto_presentaciones;
CREATE TRIGGER trg_pp_updated_at
  BEFORE UPDATE ON elevate.producto_presentaciones
  FOR EACH ROW EXECUTE FUNCTION elevate._pp_set_updated_at();

-- ── Columna productos.tiene_presentaciones ─────────────────────────────────
ALTER TABLE elevate.productos
  ADD COLUMN IF NOT EXISTS tiene_presentaciones boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN elevate.productos.tiene_presentaciones IS
  'Si true, la web obliga a elegir una presentación. Si false, el producto se vende simple (compat).';

-- ── Columna pedidos_web_items.presentacion_id ──────────────────────────────
ALTER TABLE elevate.pedidos_web_items
  ADD COLUMN IF NOT EXISTS presentacion_id uuid REFERENCES elevate.producto_presentaciones(id);

CREATE INDEX IF NOT EXISTS idx_pedidos_web_items_presentacion
  ON elevate.pedidos_web_items (presentacion_id) WHERE presentacion_id IS NOT NULL;

COMMENT ON COLUMN elevate.pedidos_web_items.presentacion_id IS
  'FK opcional. Null = producto simple (compat con pedidos históricos).';

-- ── Grants ──────────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA elevate TO anon, authenticated;

-- anon: columnas seguras para el catálogo público.
GRANT SELECT
  (id, producto_id, sku, volumen_ml, precio_venta, precio_web, precio_oferta,
   oferta_hasta, precio_mayorista, cantidad_minima_mayorista, visible_mayorista_web,
   stock_actual, stock_minimo, imagen_path, imagen_url, visible_web, activo, orden)
  ON elevate.producto_presentaciones
  TO anon;

-- anon también necesita poder leer tiene_presentaciones desde productos
-- (ya tiene SELECT sobre la mayoría de cols, pero el grant explícito es defensivo).
GRANT SELECT (tiene_presentaciones) ON elevate.productos TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON elevate.producto_presentaciones TO authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE elevate.producto_presentaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pp_select_anon ON elevate.producto_presentaciones;
CREATE POLICY pp_select_anon
  ON elevate.producto_presentaciones
  FOR SELECT
  TO anon
  USING (
    activo = true AND visible_web = true
    AND EXISTS (
      SELECT 1 FROM elevate.productos p
       WHERE p.id = producto_id AND p.activo = true AND p.visible_web = true
    )
  );

DROP POLICY IF EXISTS pp_select_authenticated ON elevate.producto_presentaciones;
CREATE POLICY pp_select_authenticated
  ON elevate.producto_presentaciones
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS pp_write_authenticated ON elevate.producto_presentaciones;
CREATE POLICY pp_write_authenticated
  ON elevate.producto_presentaciones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── RPC crear_pedido_web v2 (soporta presentaciones) ───────────────────────
-- Reemplaza la versión que solo manejaba productos simples. Comportamiento:
--   - Productos simples siguen funcionando exactamente igual.
--   - Si producto.tiene_presentaciones=true y NO viene presentacion_id en el
--     item → error claro "Debe seleccionar una presentación".
--   - Si viene presentacion_id → valida pertenencia (mismo producto, misma
--     empresa, activo, visible_web), toma precio/stock de la presentación,
--     guarda presentacion_id + snapshot con volumen y sku.
--   - El cliente NUNCA fija el precio: siempre se recalcula server-side.
CREATE OR REPLACE FUNCTION elevate.crear_pedido_web(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = elevate, public
AS $function$
DECLARE
  v_empresa_id uuid;
  v_cliente   jsonb;
  v_items     jsonb;
  v_pedido_id uuid;
  v_numero    text;
  v_today     date := current_date;
  v_seq       int;
  v_token     text;
  v_subtotal  numeric := 0;
  v_item      jsonb;
  v_count     int;
  v_payment   text;
  v_notas     text;
  v_ip        text;
  v_ua        text;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
    RAISE EXCEPTION 'payload inválido' USING ERRCODE = '22023';
  END IF;

  v_empresa_id := NULLIF(payload->>'empresa_id','')::uuid;
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'empresa_id requerido' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM elevate.empresas WHERE id = v_empresa_id) THEN
    RAISE EXCEPTION 'empresa no existe' USING ERRCODE = '22023';
  END IF;

  v_cliente := payload->'cliente';
  IF v_cliente IS NULL OR jsonb_typeof(v_cliente) <> 'object' THEN
    RAISE EXCEPTION 'cliente requerido' USING ERRCODE = '22023';
  END IF;
  IF coalesce(v_cliente->>'nombre','') = '' THEN
    RAISE EXCEPTION 'nombre del cliente requerido' USING ERRCODE = '22023';
  END IF;

  v_items := payload->'items';
  IF v_items IS NULL OR jsonb_typeof(v_items) <> 'array' THEN
    RAISE EXCEPTION 'items requeridos' USING ERRCODE = '22023';
  END IF;
  v_count := jsonb_array_length(v_items);
  IF v_count = 0 THEN
    RAISE EXCEPTION 'sin items' USING ERRCODE = '22023';
  END IF;
  IF v_count > 30 THEN
    RAISE EXCEPTION 'máximo 30 items por pedido' USING ERRCODE = '22023';
  END IF;

  v_payment := payload->>'payment_method';
  v_notas   := payload->>'notas';
  v_ip      := payload->>'ip_origen';
  v_ua      := payload->>'user_agent';

  v_token := encode(extensions.gen_random_bytes(16), 'hex');

  INSERT INTO elevate.pedidos_web_secuencia (empresa_id, fecha, ultimo)
  VALUES (v_empresa_id, v_today, 1)
  ON CONFLICT (empresa_id, fecha) DO UPDATE
    SET ultimo = elevate.pedidos_web_secuencia.ultimo + 1
  RETURNING ultimo INTO v_seq;

  v_numero := 'EL-' || to_char(v_today, 'YYMMDD') || '-' || lpad(v_seq::text, 4, '0');

  INSERT INTO elevate.pedidos_web (
    numero, empresa_id, cliente_id, cliente_snapshot, estado,
    subtotal, total, payment_method, notas, ip_origen, user_agent, public_token
  ) VALUES (
    v_numero, v_empresa_id, NULL, v_cliente, 'pendiente_pago',
    0, 0,
    NULLIF(v_payment, ''), NULLIF(v_notas, ''),
    NULLIF(v_ip, ''), NULLIF(v_ua, ''), v_token
  )
  RETURNING id INTO v_pedido_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
  LOOP
    DECLARE
      v_prod_id   uuid := NULLIF(v_item->>'producto_id','')::uuid;
      v_pres_id   uuid := NULLIF(v_item->>'presentacion_id','')::uuid;
      v_cantidad  int  := NULLIF(v_item->>'cantidad','')::int;
      v_producto  record;
      v_pres      record;
      v_precio    numeric;
      v_sub       numeric;
      v_snapshot  jsonb;
    BEGIN
      IF v_prod_id IS NULL THEN
        RAISE EXCEPTION 'producto_id inválido en item' USING ERRCODE = '22023';
      END IF;
      IF v_cantidad IS NULL OR v_cantidad <= 0 THEN
        RAISE EXCEPTION 'cantidad inválida en item' USING ERRCODE = '22023';
      END IF;
      IF v_cantidad > 20 THEN
        RAISE EXCEPTION 'cantidad máxima 20 por item' USING ERRCODE = '22023';
      END IF;

      SELECT p.id, p.nombre, p.marca, p.precio_venta, p.precio_web, p.precio_oferta,
             p.oferta_hasta, p.stock_actual, p.proximamente, p.activo, p.visible_web,
             p.slug_web, p.imagen_url, p.tiene_presentaciones
      INTO v_producto
      FROM elevate.productos p
      WHERE p.id = v_prod_id AND p.empresa_id = v_empresa_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'producto % no encontrado', v_prod_id USING ERRCODE = '22023';
      END IF;
      IF NOT v_producto.activo OR NOT v_producto.visible_web THEN
        RAISE EXCEPTION 'producto % no disponible para venta web', v_prod_id USING ERRCODE = '22023';
      END IF;
      IF v_producto.proximamente THEN
        RAISE EXCEPTION 'producto % está como próximamente', v_prod_id USING ERRCODE = '22023';
      END IF;

      IF v_producto.tiene_presentaciones AND v_pres_id IS NULL THEN
        RAISE EXCEPTION 'producto % requiere elegir una presentación', v_prod_id USING ERRCODE = '22023';
      END IF;

      IF v_pres_id IS NOT NULL THEN
        SELECT pp.id, pp.producto_id, pp.empresa_id, pp.sku, pp.volumen_ml,
               pp.precio_venta, pp.precio_web, pp.precio_oferta, pp.oferta_hasta,
               pp.stock_actual, pp.activo, pp.visible_web, pp.imagen_url
        INTO v_pres
        FROM elevate.producto_presentaciones pp
        WHERE pp.id = v_pres_id;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'presentación % no encontrada', v_pres_id USING ERRCODE = '22023';
        END IF;
        IF v_pres.empresa_id <> v_empresa_id THEN
          RAISE EXCEPTION 'presentación % de otra empresa', v_pres_id USING ERRCODE = '22023';
        END IF;
        IF v_pres.producto_id <> v_prod_id THEN
          RAISE EXCEPTION 'presentación % no pertenece al producto %', v_pres_id, v_prod_id USING ERRCODE = '22023';
        END IF;
        IF NOT v_pres.activo OR NOT v_pres.visible_web THEN
          RAISE EXCEPTION 'presentación % no disponible', v_pres_id USING ERRCODE = '22023';
        END IF;
        IF v_pres.stock_actual <= 0 THEN
          RAISE EXCEPTION 'presentación % sin stock', v_pres_id USING ERRCODE = '22023';
        END IF;

        -- Precio: oferta vigente → precio_venta → precio_web (fallback).
        IF v_pres.precio_oferta IS NOT NULL
           AND v_pres.precio_oferta > 0
           AND (v_pres.oferta_hasta IS NULL OR v_pres.oferta_hasta > now()) THEN
          v_precio := v_pres.precio_oferta;
        ELSIF v_pres.precio_venta IS NOT NULL AND v_pres.precio_venta > 0 THEN
          v_precio := v_pres.precio_venta;
        ELSE
          v_precio := COALESCE(v_pres.precio_web, 0);
        END IF;

        v_snapshot := jsonb_build_object(
          'nombre',           v_producto.nombre,
          'marca',            v_producto.marca,
          'slug',             v_producto.slug_web,
          'imagen_url',       COALESCE(v_pres.imagen_url, v_producto.imagen_url),
          'volumen_ml',       v_pres.volumen_ml,
          'sku_presentacion', v_pres.sku
        );
      ELSE
        -- Producto simple: lógica histórica intacta.
        IF v_producto.stock_actual <= 0 THEN
          RAISE EXCEPTION 'producto % sin stock', v_prod_id USING ERRCODE = '22023';
        END IF;

        IF v_producto.precio_oferta IS NOT NULL
           AND v_producto.precio_oferta > 0
           AND (v_producto.oferta_hasta IS NULL OR v_producto.oferta_hasta > now()) THEN
          v_precio := v_producto.precio_oferta;
        ELSIF v_producto.precio_venta IS NOT NULL AND v_producto.precio_venta > 0 THEN
          v_precio := v_producto.precio_venta;
        ELSE
          v_precio := COALESCE(v_producto.precio_web, 0);
        END IF;

        v_snapshot := jsonb_build_object(
          'nombre',     v_producto.nombre,
          'marca',      v_producto.marca,
          'slug',       v_producto.slug_web,
          'imagen_url', v_producto.imagen_url
        );
      END IF;

      v_sub := v_precio * v_cantidad;
      v_subtotal := v_subtotal + v_sub;

      INSERT INTO elevate.pedidos_web_items (
        pedido_id, producto_id, presentacion_id, producto_snapshot,
        cantidad, precio_unitario, subtotal
      ) VALUES (
        v_pedido_id, v_prod_id, v_pres_id, v_snapshot,
        v_cantidad, v_precio, v_sub
      );
    END;
  END LOOP;

  UPDATE elevate.pedidos_web
  SET subtotal = v_subtotal, total = v_subtotal, updated_at = now()
  WHERE id = v_pedido_id;

  RETURN jsonb_build_object(
    'pedido_id',    v_pedido_id,
    'numero',       v_numero,
    'estado',       'pendiente_pago',
    'total',        v_subtotal,
    'public_token', v_token
  );
END;
$function$;

-- Grants (preserva los actuales).
GRANT EXECUTE ON FUNCTION elevate.crear_pedido_web(jsonb) TO anon, authenticated, service_role;

COMMIT;
