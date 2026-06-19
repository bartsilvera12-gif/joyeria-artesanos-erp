-- Elevate · Fase Pedidos Web MVP
-- Idempotente. Solo schema elevate. Sin tocar otros schemas, ventas,
-- ventas_items, movimientos_inventario ni stock.
--
-- Cambios:
--   1. Tablas pedidos_web, pedidos_web_items, pedidos_web_secuencia.
--   2. RLS por empresa para admin; anon NO accede a las tablas directo
--      (solo vía RPCs SECURITY DEFINER).
--   3. RPC crear_pedido_web(payload jsonb) — atómica, recalcula precios
--      server-side, valida visibilidad / stock / próximamente, snapshots,
--      genera número y public_token. NO toca stock_actual ni movimientos.
--   4. RPC consultar_pedido_web(numero, token) — devuelve datos sanitizados
--      del pedido si el token coincide.

BEGIN;

-- 1. Tablas
CREATE TABLE IF NOT EXISTS elevate.pedidos_web_secuencia (
  empresa_id uuid NOT NULL,
  fecha date NOT NULL,
  ultimo int NOT NULL DEFAULT 0,
  PRIMARY KEY (empresa_id, fecha)
);

CREATE TABLE IF NOT EXISTS elevate.pedidos_web (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  numero text NOT NULL,
  empresa_id uuid NOT NULL,
  cliente_id uuid,
  cliente_snapshot jsonb NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente_pago',
  subtotal numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  payment_method text,
  notas text,
  ip_origen text,
  user_agent text,
  public_token text,
  venta_id uuid,  -- nullable. No se llena en MVP.
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE elevate.pedidos_web
    ADD CONSTRAINT pedidos_web_numero_unique UNIQUE (numero);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE elevate.pedidos_web
    ADD CONSTRAINT pedidos_web_token_unique UNIQUE (public_token);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE elevate.pedidos_web
    ADD CONSTRAINT pedidos_web_estado_chk CHECK (estado IN (
      'pendiente_pago','en_revision','confirmado_manual','preparando',
      'enviado','entregado','cancelado'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS elevate.pedidos_web_items (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  pedido_id uuid NOT NULL,
  producto_id uuid NOT NULL,
  producto_snapshot jsonb NOT NULL,
  cantidad int NOT NULL,
  precio_unitario numeric NOT NULL,
  subtotal numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE elevate.pedidos_web_items
    ADD CONSTRAINT pedidos_web_items_pedido_fk
    FOREIGN KEY (pedido_id) REFERENCES elevate.pedidos_web(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE elevate.pedidos_web_items
    ADD CONSTRAINT pedidos_web_items_producto_fk
    FOREIGN KEY (producto_id) REFERENCES elevate.productos(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE elevate.pedidos_web_items
    ADD CONSTRAINT pedidos_web_items_cantidad_positive CHECK (cantidad > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_pedidos_web_empresa_created ON elevate.pedidos_web (empresa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_web_empresa_estado ON elevate.pedidos_web (empresa_id, estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_web_items_pedido ON elevate.pedidos_web_items (pedido_id);

-- 2. RLS — admin por empresa; anon no accede a tablas (solo RPCs)
ALTER TABLE elevate.pedidos_web ENABLE ROW LEVEL SECURITY;
ALTER TABLE elevate.pedidos_web_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE elevate.pedidos_web_secuencia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pedidos_web_admin ON elevate.pedidos_web;
CREATE POLICY pedidos_web_admin ON elevate.pedidos_web FOR ALL TO authenticated
  USING (elevate.puede_acceder_empresa(empresa_id))
  WITH CHECK (elevate.puede_acceder_empresa(empresa_id));

DROP POLICY IF EXISTS pedidos_web_items_admin ON elevate.pedidos_web_items;
CREATE POLICY pedidos_web_items_admin ON elevate.pedidos_web_items FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM elevate.pedidos_web p
    WHERE p.id = pedido_id AND elevate.puede_acceder_empresa(p.empresa_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM elevate.pedidos_web p
    WHERE p.id = pedido_id AND elevate.puede_acceder_empresa(p.empresa_id)
  ));

-- secuencia: sin policy → solo postgres/service_role bypassa RLS

GRANT SELECT, INSERT, UPDATE ON elevate.pedidos_web TO authenticated;
GRANT SELECT, INSERT ON elevate.pedidos_web_items TO authenticated;

-- 3. RPC crear_pedido_web
CREATE OR REPLACE FUNCTION elevate.crear_pedido_web(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = elevate, public
AS $$
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

  -- Daily sequence per empresa
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
      v_prod_id uuid := NULLIF(v_item->>'producto_id','')::uuid;
      v_cantidad int := NULLIF(v_item->>'cantidad','')::int;
      v_producto record;
      v_precio numeric;
      v_sub numeric;
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
             p.slug_web, p.imagen_url
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
      IF v_producto.stock_actual <= 0 THEN
        RAISE EXCEPTION 'producto % sin stock', v_prod_id USING ERRCODE = '22023';
      END IF;

      -- Precio server-side (NO confiar en cliente):
      --   precio_oferta vigente → precio_web → precio_venta
      IF v_producto.precio_oferta IS NOT NULL
         AND (v_producto.oferta_hasta IS NULL OR v_producto.oferta_hasta > now()) THEN
        v_precio := v_producto.precio_oferta;
      ELSIF v_producto.precio_web IS NOT NULL THEN
        v_precio := v_producto.precio_web;
      ELSE
        v_precio := v_producto.precio_venta;
      END IF;

      v_sub := v_precio * v_cantidad;
      v_subtotal := v_subtotal + v_sub;

      INSERT INTO elevate.pedidos_web_items (
        pedido_id, producto_id, producto_snapshot, cantidad, precio_unitario, subtotal
      ) VALUES (
        v_pedido_id, v_prod_id,
        jsonb_build_object(
          'nombre', v_producto.nombre,
          'marca', v_producto.marca,
          'slug', v_producto.slug_web,
          'imagen_url', v_producto.imagen_url
        ),
        v_cantidad, v_precio, v_sub
      );
    END;
  END LOOP;

  UPDATE elevate.pedidos_web
  SET subtotal = v_subtotal, total = v_subtotal, updated_at = now()
  WHERE id = v_pedido_id;

  RETURN jsonb_build_object(
    'pedido_id', v_pedido_id,
    'numero', v_numero,
    'estado', 'pendiente_pago',
    'total', v_subtotal,
    'public_token', v_token
  );
END;
$$;

REVOKE ALL ON FUNCTION elevate.crear_pedido_web(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION elevate.crear_pedido_web(jsonb) TO anon, authenticated;

-- 4. RPC consultar_pedido_web — solo si token coincide
CREATE OR REPLACE FUNCTION elevate.consultar_pedido_web(p_numero text, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = elevate, public
AS $$
DECLARE
  v_pedido record;
  v_items jsonb;
BEGIN
  IF p_numero IS NULL OR p_token IS NULL OR length(p_token) < 16 THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_pedido FROM elevate.pedidos_web WHERE numero = p_numero LIMIT 1;
  IF NOT FOUND OR v_pedido.public_token IS NULL OR v_pedido.public_token <> p_token THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'nombre', i.producto_snapshot->>'nombre',
    'marca', i.producto_snapshot->>'marca',
    'imagen_url', i.producto_snapshot->>'imagen_url',
    'cantidad', i.cantidad,
    'precio_unitario', i.precio_unitario,
    'subtotal', i.subtotal
  ) ORDER BY i.created_at)
  INTO v_items
  FROM elevate.pedidos_web_items i
  WHERE i.pedido_id = v_pedido.id;

  RETURN jsonb_build_object(
    'numero', v_pedido.numero,
    'estado', v_pedido.estado,
    'total', v_pedido.total,
    'subtotal', v_pedido.subtotal,
    'created_at', v_pedido.created_at,
    'cliente', jsonb_build_object(
      'nombre', v_pedido.cliente_snapshot->>'nombre',
      'ciudad', v_pedido.cliente_snapshot->>'ciudad'
    ),
    'items', COALESCE(v_items, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION elevate.consultar_pedido_web(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION elevate.consultar_pedido_web(text, text) TO anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
