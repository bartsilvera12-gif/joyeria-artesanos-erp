-- Elevate · Ajuste RPC crear_pedido_web: alinear regla de precio_base con web pública.
-- Antes:  precio_oferta vigente → precio_web → precio_venta
-- Ahora:  precio_oferta vigente → precio_venta → precio_web (legacy fallback)
--
-- Idempotente (CREATE OR REPLACE). No toca tablas ni datos.

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

      -- Regla Elevate (alineada con web pública):
      --   1. precio_oferta vigente (precio_oferta > 0 AND oferta_hasta null o futura)
      --   2. precio_venta
      --   3. precio_web (fallback legacy si precio_venta es null o 0)
      IF v_producto.precio_oferta IS NOT NULL
         AND v_producto.precio_oferta > 0
         AND (v_producto.oferta_hasta IS NULL OR v_producto.oferta_hasta > now()) THEN
        v_precio := v_producto.precio_oferta;
      ELSIF v_producto.precio_venta IS NOT NULL AND v_producto.precio_venta > 0 THEN
        v_precio := v_producto.precio_venta;
      ELSE
        v_precio := COALESCE(v_producto.precio_web, 0);
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
