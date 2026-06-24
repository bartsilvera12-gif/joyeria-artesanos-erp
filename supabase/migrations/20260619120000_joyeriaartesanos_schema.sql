-- =============================================================================
-- Schema `joyeriaartesanos` — réplica del schema `elevate` de producción.
-- Generado por scripts/build-joyeriaartesanos-from-dump.cjs a partir de
-- supabase/migrations/_elevate.dump.sql (pg_dump --schema=elevate).
-- Exposición a PostgREST (GRANT/REVOKE/NOTIFY pgrst) NO incluida.
--
-- IMPORTANTE: este SQL hace DROP SCHEMA CASCADE primero. Si ya hay datos
-- en `joyeriaartesanos` los vas a perder. Pensado para arrancar/recrear desde cero.
-- =============================================================================

DROP SCHEMA IF EXISTS joyeriaartesanos CASCADE;

-- Garantiza que pg_trgm esté en el schema `extensions` (estándar Supabase).
-- Si ya está ahí, no-op. Si está en otro schema (por ej. `elevate`), lo
-- mueve — Postgres actualiza automáticamente los índices que dependen del
-- operator class, así que esquemas existentes (incluido elevate) siguen
-- funcionando referenciando `extensions.gin_trgm_ops`.
DO $neura$
DECLARE
  v_schema text;
BEGIN
  SELECT n.nspname INTO v_schema
  FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pg_trgm';

  IF v_schema IS NULL THEN
    CREATE EXTENSION pg_trgm WITH SCHEMA extensions;
  ELSIF v_schema <> 'extensions' THEN
    EXECUTE 'ALTER EXTENSION pg_trgm SET SCHEMA extensions';
  END IF;
END
$neura$;

--
-- PostgreSQL database dump
--

-- Dumped from database version 15.8
-- Dumped by pg_dump version 15.8

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: elevate; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS joyeriaartesanos;


--
-- Name: nota_posicion; Type: TYPE; Schema: elevate; Owner: -
--

CREATE TYPE joyeriaartesanos.nota_posicion AS ENUM (
    'top',
    'heart',
    'base'
);


--
-- Name: _acordes_set_updated_at(); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos._acordes_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: _marcas_set_updated_at(); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos._marcas_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: _pi_limite_5(); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos._pi_limite_5() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF (SELECT COUNT(*) FROM joyeriaartesanos.producto_imagenes WHERE producto_id = NEW.producto_id) >= 5 THEN
    RAISE EXCEPTION 'Un producto no puede tener más de 5 imágenes';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: _pi_set_updated_at(); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos._pi_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: _pi_unica_principal(); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos._pi_unica_principal() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.es_principal = true THEN
    UPDATE joyeriaartesanos.producto_imagenes
       SET es_principal = false
     WHERE producto_id = NEW.producto_id
       AND id <> NEW.id
       AND es_principal = true;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: _pp_set_updated_at(); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos._pp_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;


--
-- Name: _rv_limite_4(); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos._rv_limite_4() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_count int;
BEGIN
  -- Solo se cuenta cuando la nueva fila queda visible+activa.
  IF NEW.activo = true AND NEW.visible_web = true THEN
    SELECT COUNT(*) INTO v_count
      FROM joyeriaartesanos.resenas_videos
     WHERE empresa_id = NEW.empresa_id
       AND activo = true
       AND visible_web = true
       AND (TG_OP = 'INSERT' OR id <> NEW.id);
    IF v_count >= 4 THEN
      RAISE EXCEPTION 'No se pueden tener más de 4 videos de reseñas visibles por empresa';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: _rv_set_updated_at(); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos._rv_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: consultar_pedido_web(text, text); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos.consultar_pedido_web(p_numero text, p_token text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'joyeriaartesanos', 'public'
    AS $$
DECLARE
  v_pedido record;
  v_items jsonb;
BEGIN
  IF p_numero IS NULL OR p_token IS NULL OR length(p_token) < 16 THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_pedido FROM joyeriaartesanos.pedidos_web WHERE numero = p_numero LIMIT 1;
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
  FROM joyeriaartesanos.pedidos_web_items i
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


--
-- Name: crear_pedido_web(jsonb); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos.crear_pedido_web(payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'joyeriaartesanos', 'public'
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
  IF NOT EXISTS (SELECT 1 FROM joyeriaartesanos.empresas WHERE id = v_empresa_id) THEN
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

  INSERT INTO joyeriaartesanos.pedidos_web_secuencia (empresa_id, fecha, ultimo)
  VALUES (v_empresa_id, v_today, 1)
  ON CONFLICT (empresa_id, fecha) DO UPDATE
    SET ultimo = joyeriaartesanos.pedidos_web_secuencia.ultimo + 1
  RETURNING ultimo INTO v_seq;

  v_numero := 'EL-' || to_char(v_today, 'YYMMDD') || '-' || lpad(v_seq::text, 4, '0');

  INSERT INTO joyeriaartesanos.pedidos_web (
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
      FROM joyeriaartesanos.productos p
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
        FROM joyeriaartesanos.producto_presentaciones pp
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

      INSERT INTO joyeriaartesanos.pedidos_web_items (
        pedido_id, producto_id, presentacion_id, producto_snapshot,
        cantidad, precio_unitario, subtotal
      ) VALUES (
        v_pedido_id, v_prod_id, v_pres_id, v_snapshot,
        v_cantidad, v_precio, v_sub
      );
    END;
  END LOOP;

  UPDATE joyeriaartesanos.pedidos_web
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
$$;


--
-- Name: empresa_id_actual(); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos.empresa_id_actual() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'joyeriaartesanos'
    AS $$
  SELECT empresa_id
  FROM joyeriaartesanos.usuarios
  WHERE lower(trim(COALESCE(email, ''))) = joyeriaartesanos.jwt_email_normalized()
  LIMIT 1;
$$;


--
-- Name: es_super_admin(); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos.es_super_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'joyeriaartesanos'
    AS $$
  SELECT rol = 'super_admin'
  FROM joyeriaartesanos.usuarios
  WHERE lower(trim(COALESCE(email, ''))) = joyeriaartesanos.jwt_email_normalized()
  LIMIT 1;
$$;


--
-- Name: generar_codigo_producto_interno(uuid); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos.generar_codigo_producto_interno(p_empresa_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'joyeriaartesanos', 'public'
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
    INSERT INTO joyeriaartesanos.productos_codigo_secuencia (empresa_id, last_value)
    VALUES (p_empresa_id, 1)
    ON CONFLICT (empresa_id) DO UPDATE
      SET last_value = joyeriaartesanos.productos_codigo_secuencia.last_value + 1,
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
        FROM joyeriaartesanos.productos
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


--
-- Name: generar_sku_producto(uuid, text); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos.generar_sku_producto(p_empresa_id uuid, p_prefijo text DEFAULT 'ELE_PER'::text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'joyeriaartesanos', 'public'
    AS $_$
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
    INSERT INTO joyeriaartesanos.productos_sku_secuencia (empresa_id, prefijo, last_value)
    VALUES (
      p_empresa_id,
      v_prefijo,
      COALESCE((
        SELECT MAX(
          (regexp_replace(p.sku, '^' || v_prefijo || '_', ''))::int
        )
          FROM joyeriaartesanos.productos p
         WHERE p.empresa_id = p_empresa_id
           AND p.sku ~ ('^' || v_prefijo || '_[0-9]+$')
      ), 0) + 1
    )
    ON CONFLICT (empresa_id, prefijo) DO UPDATE
      SET last_value = joyeriaartesanos.productos_sku_secuencia.last_value + 1,
          updated_at = now()
    RETURNING last_value INTO v_next;

    v_sku := v_prefijo || '_' || lpad(v_next::text, 4, '0');

    -- Defensa final: si por alguna razón el SKU calculado ya está en
    -- productos (carga manual con prefijo + número), seguimos avanzando.
    IF NOT EXISTS (
      SELECT 1 FROM joyeriaartesanos.productos
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
$_$;


--
-- Name: incrementar_secuencia_producto(uuid); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos.incrementar_secuencia_producto(p_empresa_id uuid) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
      DECLARE v bigint;
      BEGIN
        INSERT INTO joyeriaartesanos.productos_codigo_secuencia (empresa_id, last_value)
        VALUES (p_empresa_id, 1)
        ON CONFLICT (empresa_id) DO UPDATE
          SET last_value = joyeriaartesanos.productos_codigo_secuencia.last_value + 1,
              updated_at = now()
        RETURNING last_value INTO v;
        RETURN v;
      END;
      $$;


--
-- Name: jwt_email_normalized(); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos.jwt_email_normalized() RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO 'joyeriaartesanos'
    AS $$
  SELECT lower(trim(COALESCE(auth.jwt() ->> 'email', '')));
$$;


--
-- Name: neura_clone_omnicanal_schema(text); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos.neura_clone_omnicanal_schema(p_target_schema text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'joyeriaartesanos', 'pg_catalog'
    AS $_$
DECLARE
  v_tables text[] := ARRAY[
    'chat_flows',
    'chat_queues',
    'chat_channels',
    'chat_agents',
    'chat_contacts',
    'chat_conversations',
    'chat_flow_nodes',
    'chat_flow_options',
    'chat_messages',
    'chat_flow_sessions',
    'chat_flow_data',
    'chat_flow_events',
    'chat_flow_node_blocks',
    'chat_comprobante_validaciones',
    'chat_empresa_operator_roles',
    'chat_queue_supervisors',
    'chat_supervisor_agents'
  ];
  r RECORD;
  def text;
  idef text;
  tdef text;
  qual text;
  chk text;
  roles_clause text;
  tbl text;
BEGIN
  IF p_target_schema !~ '^er_[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'schema inválido (se espera er_ + uuid sin guiones): %', p_target_schema;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = p_target_schema) THEN
    RAISE EXCEPTION 'el esquema % ya existe', p_target_schema;
  END IF;

  EXECUTE format('CREATE SCHEMA %I', p_target_schema);

  EXECUTE format(
    'GRANT USAGE ON SCHEMA %I TO postgres, anon, authenticated, service_role',
    p_target_schema
  );

  FOREACH tbl IN ARRAY v_tables
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'joyeriaartesanos' AND c.relname = tbl AND c.relkind = 'r'
    ) THEN
      RAISE NOTICE 'neura_clone: tabla joyeriaartesanos.% ausente, se omite', tbl;
      CONTINUE;
    END IF;
    EXECUTE format(
      'CREATE TABLE %I.%I (LIKE joyeriaartesanos.%I INCLUDING DEFAULTS INCLUDING GENERATED INCLUDING IDENTITY INCLUDING STATISTICS INCLUDING STORAGE INCLUDING COMMENTS EXCLUDING CONSTRAINTS EXCLUDING INDEXES)',
      p_target_schema,
      tbl,
      tbl
    );
  END LOOP;

  FOR r IN
    SELECT c.oid, c.conname::text AS conname, cf.relname::text AS relname, c.contype::text AS ctype
    FROM pg_constraint c
    JOIN pg_class cf ON cf.oid = c.conrelid
    JOIN pg_namespace nf ON nf.oid = cf.relnamespace
    WHERE nf.nspname = 'joyeriaartesanos'
      AND c.contype IN ('p', 'u', 'c')
      AND cf.relname = ANY (v_tables)
    ORDER BY
      CASE c.contype WHEN 'p' THEN 1 WHEN 'u' THEN 2 WHEN 'c' THEN 3 ELSE 4 END,
      c.conname
  LOOP
    def := pg_get_constraintdef(r.oid);
    def := joyeriaartesanos._neura_rewrite_schema_in_expr(def, quote_ident(p_target_schema), v_tables);
    BEGIN
      EXECUTE format(
        'ALTER TABLE %I.%I ADD CONSTRAINT %I %s',
        p_target_schema,
        r.relname,
        r.conname,
        def
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'neura_clone: constraint %.% omitido: %', r.relname, r.conname, SQLERRM;
    END;
  END LOOP;

  FOR r IN
    SELECT pg_get_indexdef(i.oid) AS idef
    FROM pg_class i
    JOIN pg_namespace n ON n.oid = i.relnamespace
    JOIN pg_index ix ON ix.indexrelid = i.oid
    JOIN pg_class tbl ON tbl.oid = ix.indrelid
    WHERE n.nspname = 'joyeriaartesanos'
      AND i.relkind = 'i'
      AND ix.indisprimary IS FALSE
      AND NOT EXISTS (SELECT 1 FROM pg_constraint co WHERE co.conindid = i.oid)
      AND tbl.relname = ANY (v_tables)
  LOOP
    idef := joyeriaartesanos._neura_rewrite_schema_in_expr(r.idef, quote_ident(p_target_schema), v_tables);
    BEGIN
      EXECUTE idef;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'neura_clone: índice omitido: %', SQLERRM;
    END;
  END LOOP;

  FOR r IN
    SELECT c.oid, c.conname::text AS conname, cf.relname::text AS from_table
    FROM pg_constraint c
    JOIN pg_class cf ON cf.oid = c.conrelid
    JOIN pg_namespace nf ON nf.oid = cf.relnamespace
    WHERE nf.nspname = 'joyeriaartesanos'
      AND c.contype = 'f'
      AND cf.relname = ANY (v_tables)
    ORDER BY c.conname
  LOOP
    def := pg_get_constraintdef(r.oid);
    def := joyeriaartesanos._neura_rewrite_schema_in_expr(def, quote_ident(p_target_schema), v_tables);
    BEGIN
      EXECUTE format(
        'ALTER TABLE %I.%I ADD CONSTRAINT %I %s',
        p_target_schema,
        r.from_table,
        r.conname,
        def
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'neura_clone: FK %.% omitido: %', r.from_table, r.conname, SQLERRM;
    END;
  END LOOP;

  FOR r IN
    SELECT
      tg.tgname::text AS tgname,
      c.relname::text AS tablename,
      pg_get_triggerdef(tg.oid, true) AS tdef
    FROM pg_trigger tg
    JOIN pg_class c ON c.oid = tg.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'joyeriaartesanos'
      AND NOT tg.tgisinternal
      AND c.relname = ANY (v_tables)
  LOOP
    tdef := r.tdef;
    tdef := replace(tdef, ' ON joyeriaartesanos.' || r.tablename || ' ', ' ON ' || quote_ident(p_target_schema) || '.' || r.tablename || ' ');
    tdef := replace(tdef, ' ON joyeriaartesanos."' || r.tablename || '" ', ' ON ' || quote_ident(p_target_schema) || '."' || r.tablename || '" ');
    BEGIN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I.%I', r.tgname, p_target_schema, r.tablename);
      EXECUTE tdef;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'neura_clone: trigger % en % omitido: %', r.tgname, r.tablename, SQLERRM;
    END;
  END LOOP;

  FOREACH tbl IN ARRAY v_tables
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = p_target_schema AND c.relname = tbl AND c.relkind = 'r'
    ) THEN
      EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', p_target_schema, tbl);
    END IF;
  END LOOP;

  FOR r IN
    SELECT
      pol.polname::text AS polname,
      c.relname::text AS tablename,
      pol.polcmd::text AS cmd,
      pol.polpermissive AS permissive,
      pg_get_expr(pol.polqual, pol.polrelid) AS polqual,
      pg_get_expr(pol.polwithcheck, pol.polrelid) AS polwithcheck,
      ARRAY(SELECT rolname FROM pg_roles WHERE oid = ANY (pol.polroles)) AS roles
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'joyeriaartesanos'
      AND c.relname = ANY (v_tables)
  LOOP
    BEGIN
      qual := joyeriaartesanos._neura_rewrite_schema_in_expr(r.polqual, quote_ident(p_target_schema), v_tables);
      chk := joyeriaartesanos._neura_rewrite_schema_in_expr(r.polwithcheck, quote_ident(p_target_schema), v_tables);

      IF r.roles IS NULL OR coalesce(cardinality(r.roles), 0) = 0 THEN
        roles_clause := '';
      ELSE
        roles_clause := ' TO ' || (SELECT string_agg(quote_ident(x), ', ') FROM unnest(r.roles) AS x);
      END IF;

      EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.polname, p_target_schema, r.tablename);

      IF r.cmd = 'r' THEN
        EXECUTE format(
          'CREATE POLICY %I ON %I.%I AS %s FOR SELECT%s USING (%s)',
          r.polname,
          p_target_schema,
          r.tablename,
          CASE WHEN r.permissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
          roles_clause,
          coalesce(qual, 'true')
        );
      ELSIF r.cmd = 'a' THEN
        EXECUTE format(
          'CREATE POLICY %I ON %I.%I AS %s FOR INSERT%s WITH CHECK (%s)',
          r.polname,
          p_target_schema,
          r.tablename,
          CASE WHEN r.permissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
          roles_clause,
          coalesce(chk, qual, 'true')
        );
      ELSIF r.cmd = 'w' THEN
        EXECUTE format(
          'CREATE POLICY %I ON %I.%I AS %s FOR UPDATE%s USING (%s) WITH CHECK (%s)',
          r.polname,
          p_target_schema,
          r.tablename,
          CASE WHEN r.permissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
          roles_clause,
          coalesce(qual, 'true'),
          coalesce(chk, qual, 'true')
        );
      ELSIF r.cmd = 'd' THEN
        EXECUTE format(
          'CREATE POLICY %I ON %I.%I AS %s FOR DELETE%s USING (%s)',
          r.polname,
          p_target_schema,
          r.tablename,
          CASE WHEN r.permissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
          roles_clause,
          coalesce(qual, 'true')
        );
      ELSIF r.cmd = '*' THEN
        EXECUTE format(
          'CREATE POLICY %I ON %I.%I AS %s FOR ALL%s USING (%s) WITH CHECK (%s)',
          r.polname,
          p_target_schema,
          r.tablename,
          CASE WHEN r.permissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
          roles_clause,
          coalesce(qual, 'true'),
          coalesce(chk, qual, 'true')
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'neura_clone: policy % en % omitido: %', r.polname, r.tablename, SQLERRM;
    END;
  END LOOP;

  EXECUTE format(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO authenticated',
    p_target_schema
  );
  EXECUTE format(
    'GRANT ALL ON ALL TABLES IN SCHEMA %I TO postgres, service_role',
    p_target_schema
  );
  EXECUTE format(
    'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO authenticated',
    p_target_schema
  );
  EXECUTE format(
    'GRANT ALL ON ALL SEQUENCES IN SCHEMA %I TO postgres, service_role',
    p_target_schema
  );

  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated',
    p_target_schema
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA %I GRANT ALL ON TABLES TO postgres, service_role',
    p_target_schema
  );

  BEGIN
    EXECUTE format(
      'ALTER PUBLICATION supabase_realtime ADD TABLE %I.chat_messages',
      p_target_schema
    );
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
  BEGIN
    EXECUTE format(
      'ALTER PUBLICATION supabase_realtime ADD TABLE %I.chat_conversations',
      p_target_schema
    );
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  PERFORM pg_notify('pgrst', 'reload schema');
END;
$_$;


--
-- Name: neura_clone_zentra_erp_to_tenant(text); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos.neura_clone_zentra_erp_to_tenant(p_target_schema text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'joyeriaartesanos', 'pg_catalog'
    AS $$
BEGIN
  RAISE EXCEPTION
    'JOYERIAARTESANOS: clonado de schema tenant deshabilitado (instancia monocliente)';
END;
$$;


--
-- Name: neura_elevate_block_other_empresas(); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos.neura_elevate_block_other_empresas() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_elevate_id uuid := '00000000-0000-0000-0000-0000000a17e5'::uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.id IS DISTINCT FROM v_elevate_id THEN
      RAISE EXCEPTION
        'JOYERIAARTESANOS: instancia monocliente, solo se permite la empresa JoyeriaArtesanos (id=%)',
        v_elevate_id
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.data_schema IS DISTINCT FROM 'joyeriaartesanos' THEN
      RAISE EXCEPTION
        'JOYERIAARTESANOS: data_schema de la empresa debe permanecer ''joyeriaartesanos'' (intento: %)',
        NEW.data_schema
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: neura_fix_foreign_keys_retarget_from_public(text); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos.neura_fix_foreign_keys_retarget_from_public(p_schema text) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  r          record;
  v_new_ns   text;
  v_del      text;
  v_upd      text;
  v_extra    text;
  v_sql      text;
  v_cnt      integer := 0;
BEGIN
  IF p_schema IS NULL OR btrim(p_schema) = '' THEN
    RAISE EXCEPTION 'p_schema vacío';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = p_schema) THEN
    RAISE NOTICE 'neura_fix_fk: schema % no existe', p_schema;
    RETURN 0;
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _neura_fk_fix_queue (
    conname     text NOT NULL,
    src_table   text NOT NULL,
    ref_table   text NOT NULL,
    src_cols    text NOT NULL,
    ref_cols    text NOT NULL,
    confdeltype "char",
    confupdtype "char",
    condeferrable boolean,
    condeferred   boolean,
    convalidated  boolean
  ) ON COMMIT DROP;

  TRUNCATE _neura_fk_fix_queue;

  INSERT INTO _neura_fk_fix_queue (
    conname, src_table, ref_table, src_cols, ref_cols,
    confdeltype, confupdtype, condeferrable, condeferred, convalidated
  )
  SELECT
    c.conname::text,
    cl.relname::text,
    cr.relname::text,
    (
      SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY u.ord)
      FROM unnest(c.conkey) WITH ORDINALITY AS u(attnum, ord)
      JOIN pg_attribute a
        ON a.attrelid = c.conrelid AND a.attnum = u.attnum AND NOT a.attisdropped
    ),
    (
      SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY u.ord)
      FROM unnest(c.confkey) WITH ORDINALITY AS u(attnum, ord)
      JOIN pg_attribute a
        ON a.attrelid = c.confrelid AND a.attnum = u.attnum AND NOT a.attisdropped
    ),
    c.confdeltype,
    c.confupdtype,
    c.condeferrable,
    c.condeferred,
    c.convalidated
  FROM pg_constraint c
  JOIN pg_class cl ON cl.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = cl.relnamespace
  JOIN pg_class cr ON cr.oid = c.confrelid
  JOIN pg_namespace nr ON nr.oid = cr.relnamespace
  WHERE c.contype = 'f'
    AND n.nspname = p_schema
    AND nr.nspname = 'joyeriaartesanos';

  FOR r IN SELECT * FROM _neura_fk_fix_queue
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I DROP CONSTRAINT IF EXISTS %I',
      p_schema,
      r.src_table,
      r.conname
    );
  END LOOP;

  FOR r IN SELECT * FROM _neura_fk_fix_queue
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = p_schema AND tablename = r.ref_table
    ) THEN
      v_new_ns := p_schema;
    ELSIF EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'joyeriaartesanos' AND tablename = r.ref_table
    ) THEN
      v_new_ns := 'joyeriaartesanos';
    ELSE
      RAISE NOTICE 'neura_fix_fk: sin destino para %.% -> public.% (omitido ADD)',
        p_schema, r.src_table, r.ref_table;
      CONTINUE;
    END IF;

    v_del := CASE r.confdeltype
      WHEN 'a' THEN ''
      WHEN 'r' THEN ' ON DELETE RESTRICT'
      WHEN 'c' THEN ' ON DELETE CASCADE'
      WHEN 'n' THEN ' ON DELETE SET NULL'
      WHEN 'd' THEN ' ON DELETE SET DEFAULT'
      ELSE ''
    END;

    v_upd := CASE r.confupdtype
      WHEN 'a' THEN ''
      WHEN 'r' THEN ' ON UPDATE RESTRICT'
      WHEN 'c' THEN ' ON UPDATE CASCADE'
      WHEN 'n' THEN ' ON UPDATE SET NULL'
      WHEN 'd' THEN ' ON UPDATE SET DEFAULT'
      ELSE ''
    END;

    v_extra := v_del || v_upd;

    IF r.condeferrable THEN
      v_extra := v_extra || CASE WHEN r.condeferred
        THEN ' DEFERRABLE INITIALLY DEFERRED'
        ELSE ' DEFERRABLE INITIALLY IMMEDIATE'
      END;
    END IF;

    IF NOT r.convalidated THEN
      v_extra := v_extra || ' NOT VALID';
    END IF;

    v_sql := format(
      'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%s) REFERENCES %I.%I (%s)%s',
      p_schema,
      r.src_table,
      r.conname,
      r.src_cols,
      v_new_ns,
      r.ref_table,
      r.ref_cols,
      v_extra
    );

    BEGIN
      EXECUTE v_sql;
      v_cnt := v_cnt + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'neura_fix_fk: ADD falló %: %', r.conname, SQLERRM;
    END;
  END LOOP;

  RETURN v_cnt;
END;
$$;


--
-- Name: neura_inbox_awaiting_reply_since_batch(text, uuid, uuid[]); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos.neura_inbox_awaiting_reply_since_batch(p_schema text, p_empresa_id uuid, p_conversation_ids uuid[]) RETURNS TABLE(conversation_id uuid, awaiting_since timestamp with time zone, client_turn_since timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
DECLARE
  sch text := trim(both from coalesce(p_schema, ''));
BEGIN
  IF sch IS NULL OR sch = '' OR sch !~ '^(zentra_erp|public|er_[0-9a-f]{32}|erp_[a-z0-9_]+)$' THEN
    RAISE EXCEPTION 'schema no permitido: %', p_schema;
  END IF;

  RETURN QUERY EXECUTE format(
    $q$
    WITH conv AS (SELECT unnest($1::uuid[]) AS id),
    last_contact AS (
      SELECT DISTINCT ON (m.conversation_id)
        m.conversation_id,
        m.created_at AS at
      FROM %I.chat_messages m
      INNER JOIN conv c ON c.id = m.conversation_id
      WHERE m.empresa_id = $2::uuid
        AND m.from_me = false
        AND lower(coalesce(m.sender_type, 'contact')) IN ('contact')
      ORDER BY m.conversation_id, m.created_at DESC
    ),
    last_human AS (
      SELECT m.conversation_id, max(m.created_at) AS at
      FROM %I.chat_messages m
      INNER JOIN conv c ON c.id = m.conversation_id
      WHERE m.empresa_id = $2::uuid
        AND m.from_me = true
        AND lower(coalesce(m.sender_type, '')) = 'human'
      GROUP BY m.conversation_id
    ),
    last_global AS (
      SELECT DISTINCT ON (m.conversation_id)
        m.conversation_id,
        m.from_me,
        m.created_at AS at
      FROM %I.chat_messages m
      INNER JOIN conv c ON c.id = m.conversation_id
      WHERE m.empresa_id = $2::uuid
      ORDER BY m.conversation_id, m.created_at DESC
    )
    SELECT
      conv.id AS conversation_id,
      CASE
        WHEN lc.at IS NOT NULL AND lc.at > coalesce(lh.at, '-infinity'::timestamptz) THEN lc.at
        ELSE NULL::timestamptz
      END AS awaiting_since,
      CASE
        WHEN lc.at IS NOT NULL AND lc.at > coalesce(lh.at, '-infinity'::timestamptz) THEN NULL::timestamptz
        WHEN lg.from_me IS TRUE THEN lg.at
        ELSE NULL::timestamptz
      END AS client_turn_since
    FROM conv
    LEFT JOIN last_contact lc ON lc.conversation_id = conv.id
    LEFT JOIN last_human lh ON lh.conversation_id = conv.id
    LEFT JOIN last_global lg ON lg.conversation_id = conv.id
    $q$,
    sch
  )
  USING p_conversation_ids, p_empresa_id;
END;
$_$;


--
-- Name: neura_install_nota_credito_tables(text); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos.neura_install_nota_credito_tables(p_schema text) RETURNS void
    LANGUAGE plpgsql
    AS $_$
DECLARE
  s text := btrim(p_schema);
  fq text;
  cq text;
BEGIN
  IF s IS NULL OR s = '' THEN
    RAISE EXCEPTION 'neura_install_nota_credito_tables: schema vacío';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = s) THEN
    RAISE NOTICE 'neura_install_nota_credito_tables: schema % no existe (omitido)', s;
    RETURN;
  END IF;

  IF s = 'joyeriaartesanos' THEN
    fq := 'joyeriaartesanos';
  ELSE
    fq := quote_ident(s);
  END IF;

  -- nota_credito
  EXECUTE format($ddl$
    CREATE TABLE IF NOT EXISTS %1$s.nota_credito (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id uuid NOT NULL REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE,
      cliente_id uuid NOT NULL REFERENCES %2$s.clientes(id) ON DELETE RESTRICT,
      factura_id uuid NOT NULL REFERENCES %2$s.facturas(id) ON DELETE RESTRICT,
      monto numeric NOT NULL CHECK (monto > 0),
      motivo text NOT NULL,
      observacion_interna text,
      estado_erp text NOT NULL DEFAULT 'borrador',
      created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
      created_by_email_snapshot text,
      created_by_nombre_snapshot text,
      saldo_previo_snapshot numeric NOT NULL,
      monto_factura_snapshot numeric NOT NULL,
      suma_pagos_snapshot numeric NOT NULL,
      moneda_snapshot text NOT NULL,
      factura_electronica_origen_id uuid REFERENCES %2$s.factura_electronica(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT nota_credito_estado_erp_check CHECK (estado_erp IN (
        'borrador',
        'pendiente_envio_sifen',
        'aprobada',
        'rechazada',
        'error',
        'anulada_borrador'
      )),
      CONSTRAINT nota_credito_moneda_snapshot_check CHECK (moneda_snapshot IN ('GS', 'USD')),
      CONSTRAINT nota_credito_motivo_len_check CHECK (length(trim(motivo)) >= 5 AND length(motivo) <= 2000)
    )
  $ddl$, quote_ident(s), fq);

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_nota_credito_empresa ON %I.nota_credito (empresa_id)',
    s
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_nota_credito_factura ON %I.nota_credito (factura_id)',
    s
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_nota_credito_empresa_created ON %I.nota_credito (empresa_id, created_at DESC)',
    s
  );

  -- Una sola NC "activa" por factura (borrador, pendiente envío o aprobada)
  EXECUTE format('DROP INDEX IF EXISTS %I.%I', s, 'uq_nota_credito_factura_estado_activo');
  EXECUTE format(
    'CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I.nota_credito (factura_id) WHERE (estado_erp IN (''borrador'', ''pendiente_envio_sifen'', ''aprobada''))',
    'uq_nota_credito_factura_estado_activo',
    s
  );

  -- nota_credito_electronica (ciclo SIFEN; fase 1 deja fila en sin_envio)
  EXECUTE format($ddl$
    CREATE TABLE IF NOT EXISTS %1$s.nota_credito_electronica (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id uuid NOT NULL REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE,
      nota_credito_id uuid NOT NULL UNIQUE REFERENCES %1$s.nota_credito(id) ON DELETE CASCADE,
      estado_sifen text NOT NULL DEFAULT 'sin_envio',
      cdc text,
      cdc_factura_origen text,
      xml_path text,
      xml_firmado_path text,
      kude_url text,
      response_json jsonb,
      error text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT nota_credito_electronica_estado_sifen_check CHECK (estado_sifen IN (
        'sin_envio',
        'borrador',
        'generado',
        'firmado',
        'enviado',
        'aprobado',
        'rechazado',
        'error_envio',
        'cancelado'
      ))
    )
  $ddl$, quote_ident(s));

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_nota_credito_electronica_empresa ON %I.nota_credito_electronica (empresa_id)',
    s
  );

  -- Auditoría / eventos de negocio (no confundir con eventos SOAP de SIFEN)
  EXECUTE format($ddl$
    CREATE TABLE IF NOT EXISTS %1$s.nota_credito_evento (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      empresa_id uuid NOT NULL REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE,
      nota_credito_id uuid NOT NULL REFERENCES %1$s.nota_credito(id) ON DELETE CASCADE,
      actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
      tipo_evento text NOT NULL,
      detalle_json jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT nota_credito_evento_tipo_check CHECK (tipo_evento IN (
        'creacion',
        'validacion',
        'rechazo_negocio',
        'cambio_estado_erp',
        'preparacion_sifen',
        'error',
        'observacion_operativa',
        'anulacion_borrador'
      ))
    )
  $ddl$, quote_ident(s));

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_nota_credito_evento_nc ON %I.nota_credito_evento (nota_credito_id, created_at DESC)',
    s
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_nota_credito_evento_empresa ON %I.nota_credito_evento (empresa_id)',
    s
  );

  EXECUTE format(
    'DROP TRIGGER IF EXISTS nota_credito_updated_at ON %I.nota_credito',
    s
  );
  EXECUTE format(
    'CREATE TRIGGER nota_credito_updated_at BEFORE UPDATE ON %I.nota_credito FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at()',
    s
  );
  EXECUTE format(
    'DROP TRIGGER IF EXISTS nota_credito_electronica_updated_at ON %I.nota_credito_electronica',
    s
  );
  EXECUTE format(
    'CREATE TRIGGER nota_credito_electronica_updated_at BEFORE UPDATE ON %I.nota_credito_electronica FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at()',
    s
  );

  -- RLS
  EXECUTE format('ALTER TABLE %I.nota_credito ENABLE ROW LEVEL SECURITY', s);
  EXECUTE format('ALTER TABLE %I.nota_credito_electronica ENABLE ROW LEVEL SECURITY', s);
  EXECUTE format('ALTER TABLE %I.nota_credito_evento ENABLE ROW LEVEL SECURITY', s);

  EXECUTE format('DROP POLICY IF EXISTS nota_credito_select ON %I.nota_credito', s);
  EXECUTE format('DROP POLICY IF EXISTS nota_credito_insert ON %I.nota_credito', s);
  EXECUTE format('DROP POLICY IF EXISTS nota_credito_update ON %I.nota_credito', s);
  EXECUTE format('DROP POLICY IF EXISTS nota_credito_delete ON %I.nota_credito', s);
  EXECUTE format(
    'CREATE POLICY nota_credito_select ON %I.nota_credito FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id))',
    s
  );
  EXECUTE format(
    'CREATE POLICY nota_credito_insert ON %I.nota_credito FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id))',
    s
  );
  EXECUTE format(
    'CREATE POLICY nota_credito_update ON %I.nota_credito FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id))',
    s
  );
  EXECUTE format(
    'CREATE POLICY nota_credito_delete ON %I.nota_credito FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id))',
    s
  );

  EXECUTE format('DROP POLICY IF EXISTS nota_credito_electronica_select ON %I.nota_credito_electronica', s);
  EXECUTE format('DROP POLICY IF EXISTS nota_credito_electronica_insert ON %I.nota_credito_electronica', s);
  EXECUTE format('DROP POLICY IF EXISTS nota_credito_electronica_update ON %I.nota_credito_electronica', s);
  EXECUTE format('DROP POLICY IF EXISTS nota_credito_electronica_delete ON %I.nota_credito_electronica', s);
  EXECUTE format(
    'CREATE POLICY nota_credito_electronica_select ON %I.nota_credito_electronica FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id))',
    s
  );
  EXECUTE format(
    'CREATE POLICY nota_credito_electronica_insert ON %I.nota_credito_electronica FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id))',
    s
  );
  EXECUTE format(
    'CREATE POLICY nota_credito_electronica_update ON %I.nota_credito_electronica FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id))',
    s
  );
  EXECUTE format(
    'CREATE POLICY nota_credito_electronica_delete ON %I.nota_credito_electronica FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id))',
    s
  );

  EXECUTE format('DROP POLICY IF EXISTS nota_credito_evento_select ON %I.nota_credito_evento', s);
  EXECUTE format('DROP POLICY IF EXISTS nota_credito_evento_insert ON %I.nota_credito_evento', s);
  EXECUTE format('DROP POLICY IF EXISTS nota_credito_evento_update ON %I.nota_credito_evento', s);
  EXECUTE format('DROP POLICY IF EXISTS nota_credito_evento_delete ON %I.nota_credito_evento', s);
  EXECUTE format(
    'CREATE POLICY nota_credito_evento_select ON %I.nota_credito_evento FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id))',
    s
  );
  EXECUTE format(
    'CREATE POLICY nota_credito_evento_insert ON %I.nota_credito_evento FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id))',
    s
  );
  EXECUTE format(
    'CREATE POLICY nota_credito_evento_update ON %I.nota_credito_evento FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id))',
    s
  );
  EXECUTE format(
    'CREATE POLICY nota_credito_evento_delete ON %I.nota_credito_evento FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id))',
    s
  );
END;
$_$;


--
-- Name: neura_provision_empresa_data_schema(uuid, text); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos.neura_provision_empresa_data_schema(p_empresa_id uuid, p_schema_slug text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'joyeriaartesanos', 'pg_catalog'
    AS $$
BEGIN
  RAISE EXCEPTION
    'JOYERIAARTESANOS: provisioning multiempresa deshabilitado en esta instancia monocliente';
END;
$$;


--
-- Name: neura_teardown_provision_failed(uuid); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos.neura_teardown_provision_failed(p_empresa_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'joyeriaartesanos', 'pg_catalog'
    AS $$
BEGIN
  -- No-op: en monocliente no hay cleanup de schemas tenant.
  RETURN;
END;
$$;


--
-- Name: neura_upgrade_factura_correlativo(text); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos.neura_upgrade_factura_correlativo(p_schema text) RETURNS void
    LANGUAGE plpgsql
    AS $_$
DECLARE
  s text := btrim(p_schema);
BEGIN
  IF s IS NULL OR s = '' THEN
    RAISE EXCEPTION 'neura_upgrade_factura_correlativo: schema vacío';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = s) THEN
    RAISE NOTICE 'neura_upgrade_factura_correlativo: schema % no existe (omitido)', s;
    RETURN;
  END IF;

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I.factura_correlativos (
      empresa_id uuid PRIMARY KEY,
      prefijo text NOT NULL DEFAULT ''FAC-'',
      ultimo_numero bigint NOT NULL DEFAULT 0 CHECK (ultimo_numero >= 0),
      updated_at timestamptz NOT NULL DEFAULT now()
    )',
    s
  );

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION %I.next_numero_factura_empresa(
      p_empresa_id uuid,
      p_prefijo_default text DEFAULT ''FAC-''
    )
    RETURNS text
    LANGUAGE plpgsql
    AS $f$
    DECLARE
      v_prefijo text;
      v_num bigint;
      v_ancho int := 6;
    BEGIN
      IF p_empresa_id IS NULL THEN
        RAISE EXCEPTION ''next_numero_factura_empresa: empresa_id es obligatorio'';
      END IF;

      -- Inicializa contador si no existe (toma max numérico real de facturas de la empresa).
      IF NOT EXISTS (
        SELECT 1 FROM %1$I.factura_correlativos c WHERE c.empresa_id = p_empresa_id
      ) THEN
        SELECT
          COALESCE(
            (
              SELECT NULLIF(regexp_replace(f.numero_factura, ''([0-9]+)$'', ''''), '''')
              FROM %1$I.facturas f
              WHERE f.empresa_id = p_empresa_id
                AND f.numero_factura ~ ''[0-9]+$''
              ORDER BY COALESCE(f.created_at, f.updated_at) DESC NULLS LAST, f.id DESC
              LIMIT 1
            ),
            NULLIF(btrim(p_prefijo_default), ''''),
            ''FAC-''
          ),
          COALESCE(
            (
              SELECT max((regexp_match(f.numero_factura, ''([0-9]+)$''))[1]::bigint)
              FROM %1$I.facturas f
              WHERE f.empresa_id = p_empresa_id
                AND f.numero_factura ~ ''[0-9]+$''
            ),
            0
          )
        INTO v_prefijo, v_num;

        INSERT INTO %1$I.factura_correlativos(empresa_id, prefijo, ultimo_numero)
        VALUES (p_empresa_id, v_prefijo, v_num)
        ON CONFLICT (empresa_id) DO NOTHING;
      END IF;

      UPDATE %1$I.factura_correlativos c
      SET
        prefijo = COALESCE(NULLIF(btrim(p_prefijo_default), ''''), c.prefijo, ''FAC-''),
        ultimo_numero = c.ultimo_numero + 1,
        updated_at = now()
      WHERE c.empresa_id = p_empresa_id
      RETURNING c.prefijo, c.ultimo_numero
      INTO v_prefijo, v_num;

      IF v_num IS NULL THEN
        RAISE EXCEPTION ''No se pudo reservar correlativo de factura'';
      END IF;

      RETURN COALESCE(v_prefijo, ''FAC-'') || lpad(v_num::text, v_ancho, ''0'');
    END;
    $f$',
    s
  );

  EXECUTE format('GRANT EXECUTE ON FUNCTION %I.next_numero_factura_empresa(uuid, text) TO service_role', s);
END;
$_$;


--
-- Name: neura_upgrade_factura_estado_corregida_nc(text); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos.neura_upgrade_factura_estado_corregida_nc(p_schema text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  s text := btrim(p_schema);
BEGIN
  IF s IS NULL OR s = '' THEN
    RAISE EXCEPTION 'neura_upgrade_factura_estado_corregida_nc: schema vacío';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = s) THEN
    RAISE NOTICE 'neura_upgrade_factura_estado_corregida_nc: schema % no existe (omitido)', s;
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = s AND table_name = 'facturas'
  ) THEN
    RAISE NOTICE 'neura_upgrade_factura_estado_corregida_nc: sin tabla facturas en % (omitido)', s;
    RETURN;
  END IF;

  EXECUTE format(
    'ALTER TABLE %I.facturas DROP CONSTRAINT IF EXISTS facturas_estado_check',
    s
  );
  EXECUTE format(
    'ALTER TABLE %I.facturas ADD CONSTRAINT facturas_estado_check CHECK (estado IN (
      ''Pagado'',
      ''Pendiente'',
      ''Vencido'',
      ''Anulado'',
      ''Corregida NC''
    ))',
    s
  );

  -- Datos ya consistentes en saldo pero estado ERP desactualizado (pre-migración).
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = s AND table_name = 'nota_credito'
  ) THEN
    EXECUTE format(
      'UPDATE %I.facturas f SET estado = ''Corregida NC'', updated_at = now()
       WHERE f.saldo <= 0.0001
         AND f.estado IN (''Pendiente'', ''Vencido'')
         AND EXISTS (
           SELECT 1 FROM %I.nota_credito nc
           WHERE nc.factura_id = f.id AND nc.empresa_id = f.empresa_id
             AND nc.estado_erp = ''aprobada''
         )',
      s,
      s
    );
  ELSE
    RAISE NOTICE 'neura_upgrade_factura_estado_corregida_nc: sin tabla nota_credito en % (solo CHECK)', s;
  END IF;
END;
$$;


--
-- Name: neura_upgrade_nota_credito_fase2(text); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos.neura_upgrade_nota_credito_fase2(p_schema text) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  s text := btrim(p_schema);
BEGIN
  IF s IS NULL OR s = '' THEN
    RAISE EXCEPTION 'neura_upgrade_nota_credito_fase2: schema vacío';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = s) THEN
    RAISE NOTICE 'neura_upgrade_nota_credito_fase2: schema % no existe (omitido)', s;
    RETURN;
  END IF;

  EXECUTE format(
    'ALTER TABLE %I.nota_credito_electronica ADD COLUMN IF NOT EXISTS sifen_d_prot_cons_lote text',
    s
  );
  EXECUTE format(
    'ALTER TABLE %I.nota_credito_electronica ADD COLUMN IF NOT EXISTS sifen_ultima_respuesta_recibe_lote jsonb',
    s
  );
  EXECUTE format(
    'ALTER TABLE %I.nota_credito_electronica ADD COLUMN IF NOT EXISTS sifen_ultima_respuesta_consulta_lote jsonb',
    s
  );
  EXECUTE format(
    'ALTER TABLE %I.nota_credito_electronica ADD COLUMN IF NOT EXISTS sifen_aprobado_at timestamptz',
    s
  );
  EXECUTE format(
    'ALTER TABLE %I.nota_credito_electronica ADD COLUMN IF NOT EXISTS last_response_json jsonb',
    s
  );
  EXECUTE format(
    'ALTER TABLE %I.nota_credito_electronica ADD COLUMN IF NOT EXISTS last_error text',
    s
  );

  EXECUTE format(
    'UPDATE %I.nota_credito_electronica SET estado_sifen = ''sin_envio'' WHERE estado_sifen = ''borrador''',
    s
  );

  EXECUTE format(
    'ALTER TABLE %I.nota_credito_electronica DROP CONSTRAINT IF EXISTS nota_credito_electronica_estado_sifen_check',
    s
  );
  EXECUTE format(
    'ALTER TABLE %I.nota_credito_electronica ADD CONSTRAINT nota_credito_electronica_estado_sifen_check CHECK (estado_sifen IN (
      ''sin_envio'',
      ''generado'',
      ''firmado'',
      ''enviado'',
      ''en_proceso'',
      ''aprobado'',
      ''rechazado'',
      ''error_envio'',
      ''cancelado''
    ))',
    s
  );

  EXECUTE format(
    'ALTER TABLE %I.nota_credito_evento DROP CONSTRAINT IF EXISTS nota_credito_evento_tipo_check',
    s
  );
  EXECUTE format(
    'ALTER TABLE %I.nota_credito_evento ADD CONSTRAINT nota_credito_evento_tipo_check CHECK (tipo_evento IN (
      ''creacion'',
      ''validacion'',
      ''rechazo_negocio'',
      ''cambio_estado_erp'',
      ''preparacion_sifen'',
      ''error'',
      ''observacion_operativa'',
      ''anulacion_borrador'',
      ''xml_generado'',
      ''xml_firmado'',
      ''enviado_set'',
      ''respuesta_set'',
      ''aprobado'',
      ''rechazado'',
      ''impacto_saldo_aplicado'',
      ''error_envio''
    ))',
    s
  );
END;
$$;


--
-- Name: next_numero_factura_empresa(uuid, text); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos.next_numero_factura_empresa(p_empresa_id uuid, p_prefijo_default text DEFAULT 'FAC-'::text) RETURNS text
    LANGUAGE plpgsql
    AS $_$
    DECLARE
      v_prefijo text;
      v_num bigint;
      v_ancho int := 6;
    BEGIN
      IF p_empresa_id IS NULL THEN
        RAISE EXCEPTION 'next_numero_factura_empresa: empresa_id es obligatorio';
      END IF;

      -- Inicializa contador si no existe (toma max numérico real de facturas de la empresa).
      IF NOT EXISTS (
        SELECT 1 FROM joyeriaartesanos.factura_correlativos c WHERE c.empresa_id = p_empresa_id
      ) THEN
        SELECT
          COALESCE(
            (
              SELECT NULLIF(regexp_replace(f.numero_factura, '([0-9]+)$', ''), '')
              FROM joyeriaartesanos.facturas f
              WHERE f.empresa_id = p_empresa_id
                AND f.numero_factura ~ '[0-9]+$'
              ORDER BY COALESCE(f.created_at, f.updated_at) DESC NULLS LAST, f.id DESC
              LIMIT 1
            ),
            NULLIF(btrim(p_prefijo_default), ''),
            'FAC-'
          ),
          COALESCE(
            (
              SELECT max((regexp_match(f.numero_factura, '([0-9]+)$'))[1]::bigint)
              FROM joyeriaartesanos.facturas f
              WHERE f.empresa_id = p_empresa_id
                AND f.numero_factura ~ '[0-9]+$'
            ),
            0
          )
        INTO v_prefijo, v_num;

        INSERT INTO joyeriaartesanos.factura_correlativos(empresa_id, prefijo, ultimo_numero)
        VALUES (p_empresa_id, v_prefijo, v_num)
        ON CONFLICT (empresa_id) DO NOTHING;
      END IF;

      UPDATE joyeriaartesanos.factura_correlativos c
      SET
        prefijo = COALESCE(NULLIF(btrim(p_prefijo_default), ''), c.prefijo, 'FAC-'),
        ultimo_numero = c.ultimo_numero + 1,
        updated_at = now()
      WHERE c.empresa_id = p_empresa_id
      RETURNING c.prefijo, c.ultimo_numero
      INTO v_prefijo, v_num;

      IF v_num IS NULL THEN
        RAISE EXCEPTION 'No se pudo reservar correlativo de factura';
      END IF;

      RETURN COALESCE(v_prefijo, 'FAC-') || lpad(v_num::text, v_ancho, '0');
    END;
    $_$;


--
-- Name: nota_credito_aplicar_aprobacion_set(text, uuid, uuid, uuid, numeric); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos.nota_credito_aplicar_aprobacion_set(p_data_schema text, p_nota_credito_id uuid, p_factura_id uuid, p_empresa_id uuid, p_monto numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_temp'
    AS $_$
DECLARE
  s text := btrim(p_data_schema);
  fq text := quote_ident(btrim(p_data_schema));
  saldo_act numeric;
  otra uuid;
BEGIN
  IF s IS NULL OR s = '' THEN
    RAISE EXCEPTION 'nota_credito_aplicar_aprobacion_set: schema vacío';
  END IF;

  EXECUTE format(
    'SELECT id FROM %s.nota_credito
     WHERE factura_id = $1 AND empresa_id = $2 AND estado_erp = ''aprobada'' AND id <> $3
     LIMIT 1',
    fq
  ) INTO otra USING p_factura_id, p_empresa_id, p_nota_credito_id;
  IF otra IS NOT NULL THEN
    RAISE EXCEPTION 'Ya existe otra nota de crédito aprobada para esta factura';
  END IF;

  EXECUTE format(
    'SELECT saldo FROM %s.facturas WHERE id = $1 AND empresa_id = $2 FOR UPDATE',
    fq
  ) INTO saldo_act USING p_factura_id, p_empresa_id;

  IF saldo_act IS NULL THEN
    RAISE EXCEPTION 'Factura no encontrada';
  END IF;
  IF p_monto > saldo_act + 0.02 THEN
    RAISE EXCEPTION 'El monto de la NC (%) supera el saldo pendiente (%)', p_monto, saldo_act;
  END IF;

  EXECUTE format(
    'UPDATE %s.facturas SET
       saldo = GREATEST(0::numeric, saldo - $1),
       estado = CASE
         WHEN estado = ''Anulado'' THEN ''Anulado''
         WHEN GREATEST(0::numeric, saldo - $1) <= 0.0001 THEN ''Corregida NC''
         ELSE estado
       END,
       updated_at = now()
     WHERE id = $2 AND empresa_id = $3',
    fq
  ) USING p_monto, p_factura_id, p_empresa_id;

  EXECUTE format(
    'UPDATE %s.nota_credito SET estado_erp = ''aprobada'', updated_at = now()
     WHERE id = $1 AND empresa_id = $2 AND estado_erp <> ''anulada_borrador''',
    fq
  ) USING p_nota_credito_id, p_empresa_id;
END;
$_$;


--
-- Name: nota_credito_tras_aprobacion_set_transaccional(text, uuid, uuid, uuid, uuid, numeric, jsonb, timestamp with time zone); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos.nota_credito_tras_aprobacion_set_transaccional(p_data_schema text, p_ne_id uuid, p_nc_id uuid, p_factura_id uuid, p_empresa_id uuid, p_monto numeric, p_ultima_consulta jsonb, p_sifen_aprobado_at timestamp with time zone) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_temp'
    AS $_$
DECLARE
  sch text := btrim(p_data_schema);
  prev_ne text;
BEGIN
  IF sch IS NULL OR sch = '' THEN
    RAISE EXCEPTION 'nota_credito_tras_aprobacion_set_transaccional: schema vacío';
  END IF;

  EXECUTE format(
    'SELECT estado_sifen::text FROM %I.nota_credito_electronica WHERE id = $1 AND empresa_id = $2 FOR UPDATE',
    sch
  ) INTO prev_ne USING p_ne_id, p_empresa_id;

  IF prev_ne IS NULL THEN
    RAISE EXCEPTION 'nota_credito_electronica no encontrada';
  END IF;
  IF prev_ne = 'aprobado' THEN
    RETURN;
  END IF;

  EXECUTE format(
    'UPDATE %I.nota_credito_electronica SET
       estado_sifen = ''aprobado'',
       sifen_aprobado_at = $1,
       sifen_ultima_respuesta_consulta_lote = $2,
       last_response_json = $2,
       last_error = NULL,
       error = NULL,
       updated_at = now()
     WHERE id = $3 AND empresa_id = $4 AND estado_sifen <> ''aprobado''',
    sch
  ) USING p_sifen_aprobado_at, p_ultima_consulta, p_ne_id, p_empresa_id;

  PERFORM joyeriaartesanos.nota_credito_aplicar_aprobacion_set(
    sch,
    p_nc_id,
    p_factura_id,
    p_empresa_id,
    p_monto
  );
END;
$_$;


--
-- Name: puede_acceder_empresa(uuid); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos.puede_acceder_empresa(empresa_uuid uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT joyeriaartesanos.es_super_admin()
     OR empresa_uuid = joyeriaartesanos.empresa_id_actual();
$$;


--
-- Name: set_chat_contact_phone_normalized(); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos.set_chat_contact_phone_normalized() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.phone_normalized := NULLIF(regexp_replace(COALESCE(NEW.phone_number, ''), '\D', '', 'g'), '');
  IF NEW.phone_normalized IS NOT NULL THEN
    NEW.phone_number := NEW.phone_normalized;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: set_crm_prospectos_updated(); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos.set_crm_prospectos_updated() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  NEW.fecha_actualizacion = now();
  RETURN NEW;
END;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: sorteos_ensure_order_from_chat(jsonb); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos.sorteos_ensure_order_from_chat(p jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_empresa_id          uuid := (p->>'empresa_id')::uuid;
  v_sorteo_id           uuid := (p->>'sorteo_id')::uuid;
  v_conv_id             uuid := (p->>'chat_conversation_id')::uuid;
  v_flow_code           text := nullif(trim(p->>'flow_code'), '');
  v_idem                text := nullif(trim(p->>'idempotency_key'), '');
  v_wa                  text := trim(p->>'whatsapp_numero');
  v_nombre              text := trim(p->>'nombre_completo');
  v_cedula              text := nullif(trim(p->>'cedula'), '');
  v_ciudad              text := nullif(trim(p->>'ciudad'), '');
  v_qty                 int := coalesce((p->>'cantidad_boletos')::int, 0);
  v_comp_url            text := nullif(trim(p->>'comprobante_url'), '');
  v_validado_por        text := coalesce(nullif(trim(p->>'validado_por'), ''), 'chat_flow');

  v_monto_explicit      numeric := NULL;
  v_promo_nombre        text := nullif(trim(p->>'promo_nombre'), '');
  v_precio_regular_ref  numeric := NULL;

  v_revendedor_id       uuid := NULL;
  v_codigo_ref_snap     text := NULL;

  s                     record;
  v_entrada_id          uuid;
  v_numero_orden        int;
  v_cliente_id          uuid;
  v_monto_total         numeric;
  v_precio_fuente_ins   text;
  v_lista_calc          numeric;
  i                     int;
  v_num                 int;
  v_num_str             text;
  v_existing            record;
  v_cant_existente      int;
  v_mt_existente        numeric;
  v_promo_existente     text;
  v_pf_existente        text;
BEGIN
  IF v_empresa_id IS NULL OR v_sorteo_id IS NULL OR v_conv_id IS NULL OR v_idem IS NULL OR v_idem = '' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Faltan empresa_id, sorteo_id, chat_conversation_id o idempotency_key');
  END IF;
  IF v_wa = '' OR v_nombre = '' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Faltan whatsapp_numero o nombre_completo');
  END IF;
  IF v_qty < 1 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'cantidad_boletos debe ser mayor a 0');
  END IF;

  IF p ? 'monto_compra' THEN
    BEGIN
      v_monto_explicit := NULLIF(trim(p->>'monto_compra'), '')::numeric;
    EXCEPTION WHEN OTHERS THEN
      v_monto_explicit := NULL;
    END;
  END IF;
  IF v_monto_explicit IS NOT NULL AND v_monto_explicit <= 0 THEN
    v_monto_explicit := NULL;
  END IF;

  IF p ? 'precio_regular_referencia' THEN
    BEGIN
      v_precio_regular_ref := NULLIF(trim(p->>'precio_regular_referencia'), '')::numeric;
    EXCEPTION WHEN OTHERS THEN
      v_precio_regular_ref := NULL;
    END;
  END IF;
  IF v_precio_regular_ref IS NOT NULL AND v_precio_regular_ref <= 0 THEN
    v_precio_regular_ref := NULL;
  END IF;

  v_codigo_ref_snap := nullif(trim(p->>'codigo_referido'), '');
  IF p ? 'revendedor_id' AND nullif(trim(p->>'revendedor_id'), '') IS NOT NULL THEN
    BEGIN
      v_revendedor_id := (p->>'revendedor_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_revendedor_id := NULL;
    END;
  END IF;

  SELECT e.id, e.numero_orden, e.estado_pago
  INTO v_existing
  FROM joyeriaartesanos.sorteo_entradas e
  WHERE e.idempotency_key = v_idem
  LIMIT 1;

  IF FOUND THEN
    SELECT
      e.cantidad_boletos,
      e.monto_total,
      e.promo_nombre,
      e.precio_fuente
    INTO v_cant_existente, v_mt_existente, v_promo_existente, v_pf_existente
    FROM joyeriaartesanos.sorteo_entradas e
    WHERE e.id = (v_existing).id;

    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'message', 'Orden ya existía (idempotencia)',
      'entrada', jsonb_build_object(
        'id', (v_existing).id,
        'numero_orden', (v_existing).numero_orden,
        'cantidad_boletos', coalesce(v_cant_existente, v_qty),
        'monto_total', v_mt_existente,
        'promo_nombre', coalesce(v_promo_existente, ''),
        'precio_fuente', coalesce(v_pf_existente, 'lista'),
        'estado_pago', (v_existing).estado_pago
      ),
      'cupones', (
        SELECT coalesce(jsonb_agg(
          jsonb_build_object('id', c.id, 'numero_cupon', c.numero_cupon)
          ORDER BY c.numero_cupon
        ), '[]'::jsonb)
        FROM joyeriaartesanos.sorteo_cupones c
        WHERE c.entrada_id = (v_existing).id
      )
    );
  END IF;

  SELECT * INTO s FROM joyeriaartesanos.sorteos WHERE id = v_sorteo_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Sorteo no encontrado');
  END IF;
  IF s.empresa_id IS DISTINCT FROM v_empresa_id THEN
    RETURN jsonb_build_object('ok', false, 'message', 'El sorteo no pertenece a la empresa indicada');
  END IF;
  IF s.estado IS DISTINCT FROM 'activo' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'El sorteo no está activo');
  END IF;
  IF s.total_boletos_vendidos + v_qty > s.max_boletos THEN
    RETURN jsonb_build_object('ok', false, 'message', 'No hay boletos disponibles para esta cantidad');
  END IF;

  v_lista_calc := s.precio_por_boleto * v_qty;

  IF v_monto_explicit IS NOT NULL THEN
    v_monto_total := v_monto_explicit;
    v_precio_fuente_ins := 'promo';
    IF v_precio_regular_ref IS NULL THEN
      v_precio_regular_ref := v_lista_calc;
    END IF;
  ELSE
    v_monto_total := v_lista_calc;
    v_precio_fuente_ins := 'lista';
    v_precio_regular_ref := NULL;
  END IF;

  SELECT id INTO v_cliente_id
  FROM joyeriaartesanos.clientes
  WHERE empresa_id = v_empresa_id
    AND deleted_at IS NULL
    AND (
      (v_cedula IS NOT NULL AND documento IS NOT NULL AND trim(documento) = v_cedula)
      OR (trim(telefono) = v_wa)
    )
  LIMIT 1;

  IF v_cliente_id IS NULL THEN
    INSERT INTO joyeriaartesanos.clientes (
      empresa_id, tipo_cliente, nombre_contacto, nombre, documento, telefono, ciudad, origen
    ) VALUES (
      v_empresa_id, 'persona', v_nombre, v_nombre, v_cedula, v_wa, v_ciudad, 'SORTEO_CHAT'
    )
    RETURNING id INTO v_cliente_id;
  END IF;

  v_numero_orden := s.ultimo_numero_orden + 1;

  IF v_revendedor_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM joyeriaartesanos.sorteo_revendedores r
      WHERE r.id = v_revendedor_id
        AND r.empresa_id = v_empresa_id
        AND r.sorteo_id = v_sorteo_id
        AND r.activo = true
    ) THEN
      v_revendedor_id := NULL;
      v_codigo_ref_snap := NULL;
    END IF;
  ELSE
    v_codigo_ref_snap := NULL;
  END IF;

  INSERT INTO joyeriaartesanos.sorteo_entradas (
    empresa_id,
    sorteo_id,
    conversacion_id,
    cliente_id,
    whatsapp_numero,
    nombre_participante,
    documento,
    cantidad_boletos,
    monto_total,
    moneda,
    estado_pago,
    comprobante_url,
    validado_por,
    numero_orden,
    chat_conversation_id,
    flow_code,
    idempotency_key,
    promo_nombre,
    precio_fuente,
    precio_regular_referencia,
    revendedor_id,
    codigo_referido_snapshot
  ) VALUES (
    v_empresa_id,
    v_sorteo_id,
    NULL,
    v_cliente_id,
    v_wa,
    v_nombre,
    v_cedula,
    v_qty,
    v_monto_total,
    'PYG',
    'pendiente_revision',
    v_comp_url,
    v_validado_por,
    v_numero_orden,
    v_conv_id,
    v_flow_code,
    v_idem,
    v_promo_nombre,
    v_precio_fuente_ins,
    v_precio_regular_ref,
    v_revendedor_id,
    v_codigo_ref_snap
  )
  RETURNING id INTO v_entrada_id;

  FOR i IN 1..v_qty LOOP
    v_num := s.ultimo_numero_cupon + i;
    v_num_str := lpad(v_num::text, 4, '0');
    INSERT INTO joyeriaartesanos.sorteo_cupones (empresa_id, sorteo_id, entrada_id, numero_cupon)
    VALUES (v_empresa_id, v_sorteo_id, v_entrada_id, v_num_str);
  END LOOP;

  UPDATE joyeriaartesanos.sorteos SET
    total_boletos_vendidos = total_boletos_vendidos + v_qty,
    ultimo_numero_cupon = s.ultimo_numero_cupon + v_qty,
    ultimo_numero_orden = v_numero_orden,
    updated_at = now()
  WHERE id = v_sorteo_id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'message', 'Orden y cupones creados',
    'entrada', jsonb_build_object(
      'id', v_entrada_id,
      'numero_orden', v_numero_orden,
      'cantidad_boletos', v_qty,
      'monto_total', v_monto_total,
      'promo_nombre', coalesce(v_promo_nombre, ''),
      'precio_fuente', v_precio_fuente_ins,
      'estado_pago', 'pendiente_revision'
    ),
    'cupones', (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object('id', c.id, 'numero_cupon', c.numero_cupon)
        ORDER BY c.numero_cupon
      ), '[]'::jsonb)
      FROM joyeriaartesanos.sorteo_cupones c
      WHERE c.entrada_id = v_entrada_id
    )
  );

EXCEPTION
  WHEN unique_violation THEN
    SELECT e.id, e.numero_orden, e.estado_pago
    INTO v_existing
    FROM joyeriaartesanos.sorteo_entradas e
    WHERE e.idempotency_key = v_idem
    LIMIT 1;
    IF FOUND THEN
      SELECT
        e.cantidad_boletos,
        e.monto_total,
        e.promo_nombre,
        e.precio_fuente
      INTO v_cant_existente, v_mt_existente, v_promo_existente, v_pf_existente
      FROM joyeriaartesanos.sorteo_entradas e
      WHERE e.id = (v_existing).id;
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'message', 'Orden ya existía (carrera concurrente)',
        'entrada', jsonb_build_object(
          'id', (v_existing).id,
          'numero_orden', (v_existing).numero_orden,
          'cantidad_boletos', coalesce(v_cant_existente, v_qty),
          'monto_total', v_mt_existente,
          'promo_nombre', coalesce(v_promo_existente, ''),
          'precio_fuente', coalesce(v_pf_existente, 'lista'),
          'estado_pago', (v_existing).estado_pago
        ),
        'cupones', (
          SELECT coalesce(jsonb_agg(
            jsonb_build_object('id', c.id, 'numero_cupon', c.numero_cupon)
            ORDER BY c.numero_cupon
          ), '[]'::jsonb)
          FROM joyeriaartesanos.sorteo_cupones c
          WHERE c.entrada_id = (v_existing).id
        )
      );
    END IF;
    RETURN jsonb_build_object('ok', false, 'message', 'Error de unicidad al crear orden');
END;
$$;


--
-- Name: sorteos_registrar_compra_n8n(jsonb); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos.sorteos_registrar_compra_n8n(p jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_empresa_id       uuid := (p->>'empresa_id')::uuid;
  v_sorteo_id        uuid := (p->>'sorteo_id')::uuid;
  v_wa               text := trim(p->>'whatsapp_numero');
  v_nombre           text := trim(p->>'nombre_completo');
  v_cedula           text := nullif(trim(p->>'cedula'), '');
  v_celular          text := nullif(trim(p->>'celular'), '');
  v_ciudad           text := nullif(trim(p->>'ciudad'), '');
  v_qty              int := coalesce((p->>'cantidad_boletos')::int, 0);
  v_fecha_pago       timestamptz := nullif(p->>'fecha_pago', '')::timestamptz;
  v_monto_pago       numeric := coalesce((p->>'monto_pago')::numeric, 0);
  v_banco            text := nullif(trim(p->>'banco_origen'), '');
  v_comp_url         text := p->>'comprobante_url';
  v_ultimo_msg       text := p->>'ultimo_mensaje';

  s                  record;
  v_cliente_id       uuid;
  v_conv_id          uuid;
  v_entrada_id       uuid;
  v_monto_total      numeric;
  i                  int;
  v_num              int;
  v_num_str          text;
BEGIN
  IF v_empresa_id IS NULL OR v_sorteo_id IS NULL OR v_wa = '' OR v_nombre = '' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Faltan datos obligatorios (empresa_id, sorteo_id, whatsapp_numero, nombre_completo)');
  END IF;
  IF v_qty < 1 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'cantidad_boletos debe ser mayor a 0');
  END IF;

  SELECT * INTO s FROM joyeriaartesanos.sorteos WHERE id = v_sorteo_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Sorteo no encontrado');
  END IF;
  IF s.empresa_id IS DISTINCT FROM v_empresa_id THEN
    RETURN jsonb_build_object('ok', false, 'message', 'El sorteo no pertenece a la empresa indicada');
  END IF;
  IF s.estado IS DISTINCT FROM 'activo' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'El sorteo no está activo');
  END IF;
  IF s.total_boletos_vendidos + v_qty > s.max_boletos THEN
    RETURN jsonb_build_object('ok', false, 'message', 'No hay boletos disponibles para esta cantidad');
  END IF;

  v_monto_total := s.precio_por_boleto * v_qty;

  -- Cliente: por documento o teléfono en la empresa
  SELECT id INTO v_cliente_id
  FROM joyeriaartesanos.clientes
  WHERE empresa_id = v_empresa_id
    AND deleted_at IS NULL
    AND (
      (v_cedula IS NOT NULL AND documento IS NOT NULL AND trim(documento) = v_cedula)
      OR (v_celular IS NOT NULL AND telefono IS NOT NULL AND trim(telefono) = v_celular)
    )
  LIMIT 1;

  IF v_cliente_id IS NULL THEN
    INSERT INTO joyeriaartesanos.clientes (
      empresa_id, tipo_cliente, nombre_contacto, nombre, documento, telefono, ciudad, origen
    ) VALUES (
      v_empresa_id, 'persona', v_nombre, v_nombre, v_cedula, coalesce(v_celular, v_wa), v_ciudad, 'SORTEO'
    )
    RETURNING id INTO v_cliente_id;
  END IF;

  SELECT id INTO v_conv_id
  FROM joyeriaartesanos.sorteo_conversaciones
  WHERE sorteo_id = v_sorteo_id AND whatsapp_numero = v_wa AND activa = true
  LIMIT 1;

  IF v_conv_id IS NULL THEN
    INSERT INTO joyeriaartesanos.sorteo_conversaciones (
      empresa_id, sorteo_id, whatsapp_numero, cliente_id, estado, ultimo_mensaje, cantidad_boletos, datos_cliente
    ) VALUES (
      v_empresa_id, v_sorteo_id, v_wa, v_cliente_id, 'paid_confirmed', v_ultimo_msg, v_qty,
      jsonb_build_object('nombre_completo', v_nombre, 'cedula', v_cedula, 'celular', v_celular, 'ciudad', v_ciudad)
    )
    RETURNING id INTO v_conv_id;
  ELSE
    UPDATE joyeriaartesanos.sorteo_conversaciones SET
      cliente_id = coalesce(v_cliente_id, cliente_id),
      estado = 'paid_confirmed',
      ultimo_mensaje = coalesce(v_ultimo_msg, ultimo_mensaje),
      cantidad_boletos = v_qty,
      datos_cliente = coalesce(datos_cliente, '{}'::jsonb) || jsonb_build_object(
        'nombre_completo', v_nombre, 'cedula', v_cedula, 'celular', v_celular, 'ciudad', v_ciudad
      ),
      updated_at = now()
    WHERE id = v_conv_id;
  END IF;

  INSERT INTO joyeriaartesanos.sorteo_entradas (
    empresa_id, sorteo_id, conversacion_id, cliente_id, whatsapp_numero, nombre_participante, documento,
    cantidad_boletos, monto_total, moneda, estado_pago, fecha_pago, monto_pagado, banco_origen, comprobante_url, validado_por
  ) VALUES (
    v_empresa_id, v_sorteo_id, v_conv_id, v_cliente_id, v_wa, v_nombre, v_cedula,
    v_qty, v_monto_total, 'PYG', 'confirmado', v_fecha_pago, v_monto_pago, v_banco, v_comp_url, 'n8n'
  )
  RETURNING id INTO v_entrada_id;

  FOR i IN 1..v_qty LOOP
    v_num := s.ultimo_numero_cupon + i;
    v_num_str := lpad(v_num::text, 4, '0');
    INSERT INTO joyeriaartesanos.sorteo_cupones (empresa_id, sorteo_id, entrada_id, numero_cupon)
    VALUES (v_empresa_id, v_sorteo_id, v_entrada_id, v_num_str);
  END LOOP;

  UPDATE joyeriaartesanos.sorteos SET
    total_boletos_vendidos = total_boletos_vendidos + v_qty,
    ultimo_numero_cupon = s.ultimo_numero_cupon + v_qty,
    updated_at = now()
  WHERE id = v_sorteo_id;

  RETURN jsonb_build_object(
    'ok', true,
    'message', 'Compra registrada correctamente',
    'cliente', jsonb_build_object('id', v_cliente_id, 'nombre', v_nombre),
    'conversacion', jsonb_build_object('id', v_conv_id, 'estado', 'paid_confirmed'),
    'entrada', jsonb_build_object(
      'id', v_entrada_id,
      'cantidad_boletos', v_qty,
      'monto_total', v_monto_total,
      'estado_pago', 'confirmado'
    ),
    'cupones', (
      SELECT coalesce(jsonb_agg(
        jsonb_build_object('id', c.id, 'numero_cupon', c.numero_cupon)
        ORDER BY c.numero_cupon
      ), '[]'::jsonb)
      FROM joyeriaartesanos.sorteo_cupones c
      WHERE c.entrada_id = v_entrada_id
    )
  );
END;
$$;


--
-- Name: trg_clientes_tipo_servicio_requiere_catalogo(); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos.trg_clientes_tipo_servicio_requiere_catalogo() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $_$
DECLARE
  sch   text := TG_TABLE_SCHEMA;
  tslug text;
  ok    boolean;
BEGIN
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.empresa_id IS NOT NULL THEN
    tslug := NEW.tipo_servicio_cliente;
    IF tslug IS NULL OR btrim(tslug) = '' THEN
      NEW.tipo_servicio_cliente := NULL;
    ELSE
      NEW.tipo_servicio_cliente := lower(btrim(tslug));
      tslug := NEW.tipo_servicio_cliente;
      EXECUTE format(
        $f$
        SELECT EXISTS(
          SELECT 1
          FROM %I.cliente_tipos_servicio_catalogo t
          WHERE t.empresa_id = $1
            AND t.slug = $2
        )
        $f$,
        sch
      ) INTO ok USING NEW.empresa_id, tslug;
      IF NOT coalesce(ok, false) THEN
        RAISE EXCEPTION 'tipo_servicio_cliente inexistente en el catálogo: % (empresa %, schema %)', tslug, NEW.empresa_id, sch
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$_$;


--
-- Name: trg_usuario_modulos_validar_modulo_empresa(); Type: FUNCTION; Schema: elevate; Owner: -
--

CREATE FUNCTION joyeriaartesanos.trg_usuario_modulos_validar_modulo_empresa() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_empresa_id uuid;
BEGIN
  SELECT u.empresa_id INTO v_empresa_id
  FROM joyeriaartesanos.usuarios u
  WHERE u.id = NEW.usuario_id;

  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'usuario_modulos: el usuario % no tiene empresa asignada', NEW.usuario_id
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM joyeriaartesanos.empresa_modulos em
    WHERE em.empresa_id = v_empresa_id
      AND em.modulo_id = NEW.modulo_id
      AND em.activo IS TRUE
  ) THEN
    RAISE EXCEPTION 'usuario_modulos: el módulo % no está habilitado para la empresa del usuario', NEW.modulo_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: acordes_olfativos; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.acordes_olfativos (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    nombre text NOT NULL,
    slug_web text NOT NULL,
    imagen_path text,
    imagen_url text,
    visible_web boolean DEFAULT true NOT NULL,
    orden_web integer DEFAULT 0 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT acordes_nombre_no_vacio CHECK ((length(btrim(nombre)) > 0))
);


--
-- Name: categorias_productos; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.categorias_productos (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    nombre text NOT NULL,
    codigo text,
    descripcion text,
    parent_id uuid,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    slug_web text,
    visible_web boolean DEFAULT true NOT NULL,
    orden_web integer,
    descripcion_web text
);


--
-- Name: chat_agents; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.chat_agents (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    usuario_id uuid NOT NULL,
    queue_id uuid NOT NULL,
    is_online boolean DEFAULT false NOT NULL,
    max_conversations integer DEFAULT 5 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    receives_new_chats boolean DEFAULT true NOT NULL,
    priority_in_queue integer DEFAULT 0 NOT NULL,
    operational_status_changed_at timestamp with time zone DEFAULT now() NOT NULL,
    last_heartbeat_at timestamp with time zone,
    operational_status text DEFAULT 'ready'::text NOT NULL,
    CONSTRAINT chat_agents_max_conversations_check CHECK ((max_conversations >= 1)),
    CONSTRAINT chat_agents_operational_status_check CHECK ((operational_status = ANY (ARRAY['ready'::text, 'offline'::text])))
);


--
-- Name: chat_campaign_events; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.chat_campaign_events (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    campaign_id uuid NOT NULL,
    recipient_id uuid,
    event_type text NOT NULL,
    event_payload_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_campaign_jobs; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.chat_campaign_jobs (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    campaign_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    batch_size integer DEFAULT 25 NOT NULL,
    locked_at timestamp with time zone,
    locked_by text,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chat_campaign_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'done'::text, 'failed'::text])))
);


--
-- Name: chat_campaign_recipients; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.chat_campaign_recipients (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    campaign_id uuid NOT NULL,
    row_number integer NOT NULL,
    phone_raw text,
    phone_e164 text NOT NULL,
    contact_id uuid,
    conversation_id uuid,
    row_payload_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    mapped_variables_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    validation_error text,
    provider_message_id text,
    provider_payload_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_status_raw_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    error_code text,
    error_message text,
    queued_at timestamp with time zone,
    sent_at timestamp with time zone,
    failed_at timestamp with time zone,
    first_reply_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chat_campaign_recipients_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'invalid'::text, 'queued'::text, 'sending'::text, 'sent'::text, 'failed'::text, 'replied'::text, 'skipped'::text])))
);


--
-- Name: chat_campaign_templates; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.chat_campaign_templates (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    provider text NOT NULL,
    provider_template_id text,
    name text NOT NULL,
    language text DEFAULT 'es'::text NOT NULL,
    category text,
    status text DEFAULT 'unknown'::text NOT NULL,
    components_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    variable_schema_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    provider_payload_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_synced_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chat_campaign_templates_name_trim CHECK ((length(TRIM(BOTH FROM name)) > 0)),
    CONSTRAINT chat_campaign_templates_provider_check CHECK ((provider = ANY (ARRAY['meta'::text, 'ycloud'::text])))
);


--
-- Name: chat_campaigns; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.chat_campaigns (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    name text NOT NULL,
    channel_id uuid NOT NULL,
    queue_id uuid,
    provider text NOT NULL,
    template_id uuid,
    template_name text NOT NULL,
    template_language text DEFAULT 'es'::text NOT NULL,
    template_category text,
    template_components_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    variable_mapping_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    import_original_filename text,
    import_storage_bucket text,
    import_storage_path text,
    status text DEFAULT 'draft'::text NOT NULL,
    total_count integer DEFAULT 0 NOT NULL,
    valid_count integer DEFAULT 0 NOT NULL,
    invalid_count integer DEFAULT 0 NOT NULL,
    pending_count integer DEFAULT 0 NOT NULL,
    queued_count integer DEFAULT 0 NOT NULL,
    sent_count integer DEFAULT 0 NOT NULL,
    failed_count integer DEFAULT 0 NOT NULL,
    replied_count integer DEFAULT 0 NOT NULL,
    send_config_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chat_campaigns_name_trim CHECK ((length(TRIM(BOTH FROM name)) > 0)),
    CONSTRAINT chat_campaigns_provider_check CHECK ((provider = ANY (ARRAY['meta'::text, 'ycloud'::text]))),
    CONSTRAINT chat_campaigns_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'ready'::text, 'sending'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])))
);


--
-- Name: chat_channel_quick_replies; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.chat_channel_quick_replies (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chat_channel_quick_replies_body_trim CHECK ((length(TRIM(BOTH FROM body)) > 0)),
    CONSTRAINT chat_channel_quick_replies_title_trim CHECK ((length(TRIM(BOTH FROM title)) > 0))
);


--
-- Name: chat_channels; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.chat_channels (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    type text DEFAULT 'whatsapp'::text NOT NULL,
    meta_phone_number_id text,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    nombre text,
    provider text DEFAULT 'meta'::text NOT NULL,
    provider_channel_id text,
    activo boolean DEFAULT true NOT NULL,
    whatsapp_access_token text,
    connection_mode text,
    config_status text DEFAULT 'incomplete'::text NOT NULL,
    CONSTRAINT chat_channels_config_status_check CHECK ((config_status = ANY (ARRAY['inactive'::text, 'incomplete'::text, 'active'::text]))),
    CONSTRAINT chat_channels_type_check CHECK ((type = ANY (ARRAY['whatsapp'::text, 'instagram'::text, 'facebook'::text, 'email'::text, 'linkedin'::text])))
);


--
-- Name: chat_comprobante_validaciones; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.chat_comprobante_validaciones (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    flow_session_id uuid NOT NULL,
    channel_id uuid,
    flow_code text DEFAULT ''::text NOT NULL,
    comprobante_url text,
    comprobante_media_id text,
    comprobante_hash text NOT NULL,
    estado_validacion text DEFAULT 'pendiente'::text NOT NULL,
    motivo_validacion text,
    ocr_text_raw text,
    ocr_monto text,
    ocr_referencia text,
    ocr_fecha text,
    ocr_hora text,
    ocr_banco text,
    ocr_fingerprint text,
    sorteo_entrada_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    monto_validacion_esperado_gs bigint,
    monto_validacion_ocr_gs bigint,
    monto_validacion_diferencia_gs bigint,
    monto_validacion_status text,
    bank_val_titular_esperado text,
    bank_val_cuenta_esperada text,
    bank_val_alias_esperado text,
    bank_val_titular_ocr text,
    bank_val_cuenta_ocr text,
    bank_val_alias_ocr text,
    bank_val_coincidencias integer,
    bank_val_min_requeridas integer,
    bank_val_status text,
    manual_approval_usuario_id uuid,
    manual_approval_at timestamp with time zone,
    manual_approval_source text,
    manual_approval_note text,
    previous_estado_validacion text,
    previous_motivo_validacion text,
    CONSTRAINT chat_comprobante_validaciones_estado_validacion_check CHECK ((estado_validacion = ANY (ARRAY['pendiente'::text, 'valido'::text, 'duplicado_hash'::text, 'duplicado_ocr'::text, 'revision_manual'::text, 'ocr_error'::text, 'monto_incoherente'::text, 'datos_bancarios_incoherentes'::text, 'aprobado_manual'::text, 'rechazado_manual'::text])))
);


--
-- Name: chat_contacts; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.chat_contacts (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    phone_number text NOT NULL,
    name text,
    cliente_id uuid,
    crm_prospecto_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    phone_normalized text,
    last_routed_chat_agent_id uuid,
    last_routed_at timestamp with time zone,
    last_routed_channel_id uuid
);


--
-- Name: chat_conversation_closures; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.chat_conversation_closures (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    queue_id uuid,
    closure_state_id uuid,
    closure_substate_id uuid,
    closure_state_label text NOT NULL,
    closure_substate_label text NOT NULL,
    comment text NOT NULL,
    closed_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_by_usuario_id uuid NOT NULL
);


--
-- Name: chat_conversations; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.chat_conversations (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    last_message_at timestamp with time zone,
    last_message_preview text,
    unread_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    flow_code text,
    flow_current_node text,
    flow_status text DEFAULT 'bot'::text NOT NULL,
    human_taken_over boolean DEFAULT false NOT NULL,
    active_flow_session_id uuid,
    first_revendedor_id uuid,
    first_referral_captured_at timestamp with time zone,
    assigned_agent_id uuid,
    queue_id uuid,
    priority text DEFAULT 'medium'::text NOT NULL,
    closed_at timestamp with time zone,
    closed_by_usuario_id uuid,
    initial_assignment_at timestamp with time zone,
    first_human_response_at timestamp with time zone,
    initial_reassign_count integer DEFAULT 0 NOT NULL,
    assignment_wait_code text,
    CONSTRAINT chat_conversations_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))),
    CONSTRAINT chat_conversations_status_check CHECK ((status = ANY (ARRAY['open'::text, 'pending'::text, 'closed'::text])))
);


--
-- Name: chat_empresa_operator_roles; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.chat_empresa_operator_roles (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    usuario_id uuid NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chat_empresa_operator_roles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'supervisor'::text, 'agente'::text])))
);


--
-- Name: chat_flow_data; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.chat_flow_data (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    flow_code text NOT NULL,
    field_name text NOT NULL,
    field_value text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    flow_session_id uuid NOT NULL
);


--
-- Name: chat_flow_events; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.chat_flow_events (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    flow_code text,
    node_code text,
    event_type text NOT NULL,
    selected_option_id uuid,
    meta_button_id text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    flow_session_id uuid
);


--
-- Name: chat_flow_node_blocks; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.chat_flow_node_blocks (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    node_id uuid NOT NULL,
    block_type text NOT NULL,
    content_text text,
    media_url text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chat_flow_node_blocks_block_type_check CHECK ((block_type = ANY (ARRAY['text'::text, 'image'::text, 'buttons'::text])))
);


--
-- Name: chat_flow_nodes; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.chat_flow_nodes (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    flow_code text NOT NULL,
    node_code text NOT NULL,
    message_text text,
    node_type text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    save_as_field text,
    next_node_code text,
    crm_action_type text,
    crm_action_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    sort_order integer NOT NULL,
    CONSTRAINT chat_flow_nodes_node_type_check CHECK ((node_type = ANY (ARRAY['buttons'::text, 'list'::text, 'text'::text, 'media'::text, 'image_input'::text, 'human'::text, 'end'::text])))
);


--
-- Name: chat_flow_options; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.chat_flow_options (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    node_id uuid NOT NULL,
    label text NOT NULL,
    option_value text NOT NULL,
    meta_button_id text NOT NULL,
    next_node_code text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    option_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    group_title text,
    group_order integer DEFAULT 0 NOT NULL
);


--
-- Name: chat_flow_recontact_rules; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.chat_flow_recontact_rules (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    flow_code text NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    activo boolean DEFAULT false NOT NULL,
    prioridad integer DEFAULT 100 NOT NULL,
    included_node_codes jsonb DEFAULT '[]'::jsonb NOT NULL,
    excluded_node_codes jsonb DEFAULT '[]'::jsonb NOT NULL,
    idle_after_seconds integer DEFAULT 3600 NOT NULL,
    max_attempts integer DEFAULT 1 NOT NULL,
    cooldown_seconds integer DEFAULT 86400 NOT NULL,
    schedule_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    guard_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    message_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cfr_rules_cooldown_min CHECK ((cooldown_seconds >= 60)),
    CONSTRAINT cfr_rules_idle_min CHECK ((idle_after_seconds >= 60)),
    CONSTRAINT cfr_rules_max_attempts CHECK ((max_attempts >= 1))
);


--
-- Name: chat_flow_recontact_runs; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.chat_flow_recontact_runs (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    rule_id uuid NOT NULL,
    flow_code text NOT NULL,
    conversation_id uuid,
    flow_session_id uuid,
    decision text NOT NULL,
    skip_reason text,
    attempt_no integer,
    correlation_id text,
    payload_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_flow_sessions; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.chat_flow_sessions (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    flow_code text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    end_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revendedor_id uuid,
    codigo_referido_snapshot text,
    referral_source text,
    CONSTRAINT chat_flow_sessions_referral_source_check CHECK (((referral_source IS NULL) OR (referral_source = ANY (ARRAY['click_token'::text, 'inbound_text'::text])))),
    CONSTRAINT chat_flow_sessions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'abandoned'::text, 'restarted'::text])))
);


--
-- Name: chat_flows; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.chat_flows (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    flow_code text NOT NULL,
    label text,
    channel text DEFAULT 'whatsapp'::text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sorteo_id uuid,
    sorteo_datos_incompletos_message text,
    flow_config jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: chat_messages; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.chat_messages (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    wa_message_id text,
    from_me boolean DEFAULT false NOT NULL,
    message_type text DEFAULT 'text'::text NOT NULL,
    content text,
    raw_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sender_type text DEFAULT 'system'::text,
    sent_by_user_id uuid,
    sent_by_user_name text,
    automation_source text,
    whatsapp_delivery_status text,
    whatsapp_delivered_at timestamp with time zone,
    whatsapp_read_at timestamp with time zone,
    CONSTRAINT chat_messages_sender_type_check CHECK ((sender_type = ANY (ARRAY['contact'::text, 'ai'::text, 'human'::text, 'system'::text])))
);


--
-- Name: chat_omnicanal_work_schedules; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.chat_omnicanal_work_schedules (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    nombre text NOT NULL,
    time_start time without time zone NOT NULL,
    time_end time without time zone NOT NULL,
    days_of_week smallint[] DEFAULT '{}'::smallint[] NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chat_omnicanal_work_schedules_days_check CHECK ((days_of_week <@ ARRAY[(1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint, (7)::smallint]))
);


--
-- Name: chat_queue_channels; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.chat_queue_channels (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    queue_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_queue_closure_states; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.chat_queue_closure_states (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    queue_id uuid NOT NULL,
    label text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_queue_closure_substates; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.chat_queue_closure_substates (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    closure_state_id uuid NOT NULL,
    label text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_queue_supervisors; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.chat_queue_supervisors (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    queue_id uuid NOT NULL,
    usuario_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_queues; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.chat_queues (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    nombre text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    channel_type text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    descripcion text,
    distribution_strategy text DEFAULT 'least_load'::text NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    routing_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    assignment_state jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT chat_queues_channel_type_check CHECK (((channel_type IS NULL) OR (channel_type = ANY (ARRAY['whatsapp'::text, 'instagram'::text, 'facebook'::text, 'email'::text, 'linkedin'::text])))),
    CONSTRAINT chat_queues_distribution_strategy_check CHECK ((distribution_strategy = ANY (ARRAY['round_robin'::text, 'least_load'::text, 'manual_pull'::text])))
);


--
-- Name: chat_routing_events; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.chat_routing_events (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    queue_id uuid,
    event_type text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_supervisor_agents; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.chat_supervisor_agents (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    supervisor_usuario_id uuid NOT NULL,
    agent_usuario_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chat_supervisor_agents_no_self CHECK ((supervisor_usuario_id <> agent_usuario_id))
);


--
-- Name: chat_usuario_omnicanal; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.chat_usuario_omnicanal (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    usuario_id uuid NOT NULL,
    omnicanal_agent_enabled boolean DEFAULT false NOT NULL,
    work_schedule_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cliente_historial; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.cliente_historial (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    cliente_id uuid NOT NULL,
    suscripcion_id uuid,
    tipo text NOT NULL,
    accion text NOT NULL,
    plan_anterior_id uuid,
    plan_nuevo_id uuid,
    plan_anterior_nombre text,
    plan_nuevo_nombre text,
    modo text,
    factura_id uuid,
    plan_pendiente_vigente_desde date,
    creado_por_auth_user_id uuid,
    creado_por_email text,
    detalle jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cliente_historial_modo_check CHECK (((modo IS NULL) OR (modo = ANY (ARRAY['inmediato'::text, 'proximo_mes'::text, 'actualizar_factura_pendiente'::text]))))
);


--
-- Name: cliente_obligaciones_tributarias; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.cliente_obligaciones_tributarias (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    cliente_perfil_id uuid NOT NULL,
    obligacion_catalogo_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cliente_perfil_tributario; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.cliente_perfil_tributario (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    cliente_id uuid NOT NULL,
    perfil_activo boolean DEFAULT false NOT NULL,
    dv text,
    razon_social_fiscal text,
    clave_tributaria_encrypted text,
    honorario_mensual numeric,
    honorario_anual numeric,
    notas_tributarias text,
    obligacion_otro_detalle text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    dia_vencimiento_tributario smallint,
    CONSTRAINT cliente_perfil_tributario_dia_vencimiento_range CHECK (((dia_vencimiento_tributario IS NULL) OR ((dia_vencimiento_tributario >= 1) AND (dia_vencimiento_tributario <= 31))))
);


--
-- Name: cliente_tipos_servicio_catalogo; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.cliente_tipos_servicio_catalogo (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    slug text NOT NULL,
    nombre text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    orden smallint DEFAULT 0 NOT NULL,
    es_sistema boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT c_cliente_tipo_cat_slug_format CHECK (((char_length(btrim(slug)) > 0) AND (slug = lower(btrim(slug))) AND (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text)))
);


--
-- Name: clientes; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.clientes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    empresa_id uuid,
    nombre text,
    telefono text,
    email text,
    direccion text,
    created_at timestamp without time zone DEFAULT now(),
    tipo_cliente text DEFAULT 'empresa'::text,
    empresa text,
    ruc text,
    documento text,
    telefono_secundario text,
    email_secundario text,
    ciudad text,
    pais text,
    sitio_web text,
    instagram text,
    linkedin text,
    categoria_cliente text,
    industria text,
    valor_cliente numeric,
    condicion_pago text,
    moneda_preferida text DEFAULT 'GS'::text,
    vendedor_asignado text,
    origen text DEFAULT 'MANUAL'::text,
    prospecto_id integer,
    estado text DEFAULT 'activo'::text,
    notas jsonb DEFAULT '[]'::jsonb,
    updated_at timestamp with time zone DEFAULT now(),
    nombre_contacto text,
    created_by_user_id uuid,
    created_by_nombre text,
    tipo_servicio_cliente text,
    deleted_at timestamp with time zone,
    deleted_by_user_id uuid,
    deletion_reason text,
    baja_operativa_at timestamp with time zone,
    baja_operativa_by_user_id uuid,
    baja_operativa_motivo text,
    baja_operativa_anulo_factura boolean,
    baja_operativa_by_nombre text,
    vendedor_usuario_id uuid,
    sifen_receptor_extranjero boolean DEFAULT false NOT NULL,
    sifen_codigo_pais text,
    sifen_tipo_doc_receptor smallint,
    sifen_receptor_manual boolean DEFAULT false NOT NULL,
    sifen_receptor_naturaleza text,
    sifen_ti_ope smallint,
    sifen_num_id_de text,
    sifen_direccion_de text,
    sifen_num_casa_de integer,
    sifen_descripcion_tipo_doc text,
    plan_comercial_id uuid,
    CONSTRAINT clientes_sifen_receptor_naturaleza_check CHECK (((sifen_receptor_naturaleza IS NULL) OR (sifen_receptor_naturaleza = ANY (ARRAY['contribuyente_paraguayo'::text, 'no_contribuyente'::text, 'extranjero'::text])))),
    CONSTRAINT clientes_sifen_ti_ope_check CHECK (((sifen_ti_ope IS NULL) OR ((sifen_ti_ope >= 1) AND (sifen_ti_ope <= 4))))
);


--
-- Name: comision_ajustes; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.comision_ajustes (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    periodo_id uuid,
    linea_id uuid,
    monto numeric(18,2) NOT NULL,
    motivo text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    CONSTRAINT chk_comision_ajustes_motivo CHECK ((length(TRIM(BOTH FROM motivo)) > 0))
);


--
-- Name: comision_equipo_miembros; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.comision_equipo_miembros (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    equipo_id uuid NOT NULL,
    usuario_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: comision_equipos; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.comision_equipos (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    nombre text NOT NULL,
    supervisor_usuario_id uuid NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_comision_equipos_nombre CHECK ((length(TRIM(BOTH FROM nombre)) > 0))
);


--
-- Name: comision_escalas; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.comision_escalas (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    politica_id uuid NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    desde_monto numeric(18,2) NOT NULL,
    hasta_monto numeric(18,2),
    porcentaje_comision numeric(9,4) NOT NULL,
    premio_fijo numeric(18,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: comision_lineas; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.comision_lineas (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    periodo_id uuid NOT NULL,
    usuario_vendedor_id uuid NOT NULL,
    fuente_tipo text,
    fuente_id uuid,
    monto_base numeric(18,2) DEFAULT 0 NOT NULL,
    monto_comision numeric(18,2) DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: comision_periodos; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.comision_periodos (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    politica_id uuid NOT NULL,
    estado text DEFAULT 'borrador'::text NOT NULL,
    fecha_inicio timestamp with time zone NOT NULL,
    fecha_fin timestamp with time zone NOT NULL,
    label text,
    congelado_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT comision_periodos_estado_check CHECK ((estado = ANY (ARRAY['borrador'::text, 'cerrado'::text, 'congelado'::text, 'aprobado'::text, 'pagado'::text])))
);


--
-- Name: comision_politica_versiones; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.comision_politica_versiones (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    politica_id uuid NOT NULL,
    version_no integer NOT NULL,
    nombre text NOT NULL,
    activo boolean NOT NULL,
    base_calculo text NOT NULL,
    timezone text NOT NULL,
    modo_periodo text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);


--
-- Name: comision_politicas; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.comision_politicas (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    nombre text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    base_calculo text NOT NULL,
    timezone text DEFAULT 'America/Asuncion'::text NOT NULL,
    modo_periodo text DEFAULT 'mensual_penultimo_dia_habil'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT chk_comision_politicas_nombre CHECK ((length(TRIM(BOTH FROM nombre)) > 0)),
    CONSTRAINT comision_politicas_base_calculo_check CHECK ((base_calculo = ANY (ARRAY['pago_registrado'::text, 'factura_emitida'::text, 'factura_pagada'::text])))
);


--
-- Name: compras; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.compras (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    proveedor_id uuid NOT NULL,
    proveedor_nombre text NOT NULL,
    producto_id uuid NOT NULL,
    producto_nombre text NOT NULL,
    cantidad numeric NOT NULL,
    moneda text DEFAULT 'PYG'::text NOT NULL,
    tipo_cambio numeric DEFAULT 1 NOT NULL,
    costo_unitario_original numeric NOT NULL,
    costo_unitario numeric NOT NULL,
    iva_tipo text DEFAULT '10'::text NOT NULL,
    subtotal numeric NOT NULL,
    monto_iva numeric NOT NULL,
    total numeric NOT NULL,
    precio_venta numeric NOT NULL,
    margen_venta numeric,
    tipo_pago text DEFAULT 'contado'::text NOT NULL,
    plazo_dias integer,
    nro_timbrado text NOT NULL,
    numero_control text NOT NULL,
    estado text DEFAULT 'registrada'::text NOT NULL,
    fecha timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    usuario_nombre text,
    CONSTRAINT compras_estado_check CHECK ((estado = ANY (ARRAY['registrada'::text, 'pendiente'::text, 'pagada'::text, 'anulada'::text]))),
    CONSTRAINT compras_iva_tipo_check CHECK ((iva_tipo = ANY (ARRAY['exenta'::text, '5'::text, '10'::text]))),
    CONSTRAINT compras_moneda_check CHECK ((moneda = ANY (ARRAY['PYG'::text, 'USD'::text]))),
    CONSTRAINT compras_tipo_pago_check CHECK ((tipo_pago = ANY (ARRAY['contado'::text, 'credito'::text])))
);


--
-- Name: cotizaciones_dolar; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.cotizaciones_dolar (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    cotizacion numeric(14,4) NOT NULL,
    vigente_desde timestamp with time zone DEFAULT now() NOT NULL,
    creado_por uuid,
    notas text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT cotizaciones_dolar_cotizacion_check CHECK ((cotizacion > (0)::numeric))
);


--
-- Name: cotizacion_dolar_actual; Type: VIEW; Schema: elevate; Owner: -
--

CREATE VIEW joyeriaartesanos.cotizacion_dolar_actual AS
 SELECT DISTINCT ON (cotizaciones_dolar.empresa_id) cotizaciones_dolar.id,
    cotizaciones_dolar.empresa_id,
    cotizaciones_dolar.cotizacion,
    cotizaciones_dolar.vigente_desde
   FROM joyeriaartesanos.cotizaciones_dolar
  ORDER BY cotizaciones_dolar.empresa_id, cotizaciones_dolar.vigente_desde DESC, cotizaciones_dolar.created_at DESC;


--
-- Name: crm_etapas; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.crm_etapas (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    codigo text NOT NULL,
    nombre text NOT NULL,
    color text DEFAULT 'gray'::text NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_notas; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.crm_notas (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    prospecto_id uuid NOT NULL,
    texto text NOT NULL,
    fecha timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: crm_prospectos; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.crm_prospectos (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    numero_control text NOT NULL,
    empresa text NOT NULL,
    contacto text NOT NULL,
    email text,
    telefono text,
    servicio text NOT NULL,
    valor_estimado numeric DEFAULT 0,
    etapa text DEFAULT 'LEAD'::text NOT NULL,
    proxima_accion text,
    fecha_proxima_accion date,
    creado_por text,
    responsable text,
    cliente_creado boolean DEFAULT false,
    fecha_creacion timestamp with time zone DEFAULT now() NOT NULL,
    fecha_actualizacion timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    origen_creacion text DEFAULT 'manual'::text NOT NULL,
    origen_detalle text,
    observaciones text
);


--
-- Name: dashboard_views; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.dashboard_views (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    nombre text NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: empresa_autoimpresor_config; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.empresa_autoimpresor_config (
    empresa_id uuid NOT NULL,
    activo boolean DEFAULT false NOT NULL,
    ruc_emisor text,
    razon_social_emisor text,
    nombre_fantasia text,
    direccion_matriz text,
    telefono text,
    timbrado_numero text,
    timbrado_inicio_vigencia date,
    timbrado_fin_vigencia date,
    establecimiento_codigo text,
    punto_expedicion_codigo text,
    numero_actual integer,
    numero_inicial integer,
    numero_final integer,
    tipo_documento_default text DEFAULT 'factura'::text NOT NULL,
    formato_impresion_default text DEFAULT 'pdf_a4'::text NOT NULL,
    leyenda_papel_termico text,
    observaciones text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT empresa_autoimpresor_config_formato_impresion_default_check CHECK ((formato_impresion_default = ANY (ARRAY['pdf_a4'::text, 'pdf_media_hoja'::text, 'ticket_80mm'::text, 'ticket_58mm'::text]))),
    CONSTRAINT empresa_autoimpresor_config_tipo_documento_default_check CHECK ((tipo_documento_default = ANY (ARRAY['factura'::text, 'ticket'::text, 'nota_venta'::text, 'otro'::text])))
);


--
-- Name: empresa_dashboard_views; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.empresa_dashboard_views (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    dashboard_view_id uuid NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: empresa_facturacion_modo; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.empresa_facturacion_modo (
    empresa_id uuid NOT NULL,
    modo text DEFAULT 'sin_factura_fiscal'::text NOT NULL,
    impresion_tipo_default text DEFAULT 'pdf_a4'::text NOT NULL,
    imprimir_al_confirmar boolean DEFAULT false NOT NULL,
    preguntar_datos_al_confirmar boolean DEFAULT false NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT empresa_facturacion_modo_impresion_tipo_default_check CHECK ((impresion_tipo_default = ANY (ARRAY['pdf_a4'::text, 'pdf_media_hoja'::text, 'ticket_80mm'::text, 'ticket_58mm'::text]))),
    CONSTRAINT empresa_facturacion_modo_modo_check CHECK ((modo = ANY (ARRAY['sin_factura_fiscal'::text, 'sifen'::text, 'autoimpresor'::text])))
);


--
-- Name: empresa_modulos; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.empresa_modulos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    empresa_id uuid NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    modulo_id uuid
);


--
-- Name: empresa_sifen_config; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.empresa_sifen_config (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    ambiente text DEFAULT 'test'::text NOT NULL,
    ruc text NOT NULL,
    razon_social text NOT NULL,
    timbrado_numero text NOT NULL,
    establecimiento text NOT NULL,
    punto_expedicion text NOT NULL,
    csc text,
    certificado_path text,
    certificado_vencimiento timestamp with time zone,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    certificado_password_encrypted text,
    direccion_fiscal text,
    timbrado_fecha_inicio_vigencia date,
    actividad_economica_codigo text,
    actividad_economica_descripcion text,
    sifen_plazo_cancelacion_horas integer DEFAULT 48 NOT NULL,
    kude_logo_path text,
    kude_color_primario text,
    kude_color_primario_fill text,
    CONSTRAINT empresa_sifen_config_ambiente_check CHECK ((ambiente = ANY (ARRAY['test'::text, 'produccion'::text]))),
    CONSTRAINT empresa_sifen_config_kude_color_primario_fill_fmt_chk CHECK (((kude_color_primario_fill IS NULL) OR (kude_color_primario_fill ~ '^#[0-9A-Fa-f]{6}$'::text))),
    CONSTRAINT empresa_sifen_config_kude_color_primario_fmt_chk CHECK (((kude_color_primario IS NULL) OR (kude_color_primario ~ '^#[0-9A-Fa-f]{6}$'::text))),
    CONSTRAINT empresa_sifen_config_sifen_plazo_cancelacion_horas_check CHECK (((sifen_plazo_cancelacion_horas >= 1) AND (sifen_plazo_cancelacion_horas <= 8760)))
);


--
-- Name: empresas; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.empresas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre_empresa text NOT NULL,
    ruc text,
    telefono text,
    email text,
    direccion text,
    pais text DEFAULT 'PARAGUAY'::text,
    plan text,
    estado text DEFAULT 'ACTIVA'::text,
    created_at timestamp without time zone DEFAULT now(),
    data_schema text,
    gestion_tributaria_clientes boolean DEFAULT false NOT NULL
);


--
-- Name: factura_correlativos; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.factura_correlativos (
    empresa_id uuid NOT NULL,
    prefijo text DEFAULT 'FAC-'::text NOT NULL,
    ultimo_numero bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT factura_correlativos_ultimo_numero_check CHECK ((ultimo_numero >= 0))
);


--
-- Name: factura_electronica; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.factura_electronica (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    factura_id uuid NOT NULL,
    estado_sifen text DEFAULT 'borrador'::text NOT NULL,
    cdc text,
    xml_path text,
    kude_url text,
    qr_data text,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    xml_firmado_path text,
    sifen_d_prot_cons_lote text,
    sifen_ultima_respuesta_recibe_lote jsonb,
    sifen_ultima_respuesta_consulta_lote jsonb,
    sifen_aprobado_at timestamp with time zone,
    sifen_cancelado_at timestamp with time zone,
    sifen_cancelacion_motivo text,
    sifen_regeneracion_seq integer DEFAULT 0 NOT NULL,
    CONSTRAINT factura_electronica_estado_sifen_check CHECK ((estado_sifen = ANY (ARRAY['borrador'::text, 'generado'::text, 'firmado'::text, 'enviado'::text, 'aprobado'::text, 'rechazado'::text, 'error_envio'::text, 'cancelado'::text])))
);


--
-- Name: factura_electronica_evento; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.factura_electronica_evento (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    factura_electronica_id uuid NOT NULL,
    tipo text NOT NULL,
    detalle jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT factura_electronica_evento_tipo_check CHECK ((tipo = ANY (ARRAY['generacion'::text, 'envio'::text, 'respuesta'::text, 'error'::text, 'firma'::text, 'cancelacion'::text])))
);


--
-- Name: factura_items; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.factura_items (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    factura_id uuid NOT NULL,
    empresa_id uuid NOT NULL,
    descripcion text NOT NULL,
    cantidad numeric DEFAULT 1 NOT NULL,
    precio_unitario numeric DEFAULT 0 NOT NULL,
    subtotal numeric DEFAULT 0 NOT NULL,
    iva numeric DEFAULT 0 NOT NULL,
    total numeric DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: facturas; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.facturas (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    cliente_id uuid NOT NULL,
    numero_factura text NOT NULL,
    fecha date NOT NULL,
    fecha_vencimiento date NOT NULL,
    monto numeric NOT NULL,
    saldo numeric DEFAULT 0 NOT NULL,
    estado text DEFAULT 'Pendiente'::text NOT NULL,
    tipo text NOT NULL,
    moneda text DEFAULT 'GS'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    suscripcion_id uuid,
    CONSTRAINT facturas_estado_check CHECK ((estado = ANY (ARRAY['Pagado'::text, 'Pendiente'::text, 'Vencido'::text, 'Anulado'::text, 'Corregida NC'::text]))),
    CONSTRAINT facturas_moneda_check CHECK ((moneda = ANY (ARRAY['GS'::text, 'USD'::text]))),
    CONSTRAINT facturas_tipo_check CHECK ((tipo = ANY (ARRAY['contado'::text, 'credito'::text, 'suscripcion'::text])))
);


--
-- Name: familias_olfativas; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.familias_olfativas (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    orden integer,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: gastos; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.gastos (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    categoria text,
    descripcion text,
    monto numeric(12,2) NOT NULL,
    tipo text DEFAULT 'variable'::text NOT NULL,
    recurrente boolean DEFAULT false NOT NULL,
    frecuencia text,
    fecha date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT gastos_tipo_check CHECK ((tipo = ANY (ARRAY['fijo'::text, 'variable'::text])))
);


--
-- Name: imports_audit; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.imports_audit (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    entidad text NOT NULL,
    filename text,
    total_rows integer DEFAULT 0 NOT NULL,
    inserted_count integer DEFAULT 0 NOT NULL,
    updated_count integer DEFAULT 0 NOT NULL,
    skipped_count integer DEFAULT 0 NOT NULL,
    error_count integer DEFAULT 0 NOT NULL,
    warning_count integer DEFAULT 0 NOT NULL,
    errors_json jsonb,
    warnings_json jsonb,
    created_by text,
    usuario_nombre text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: inventario_stock_ubicacion; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.inventario_stock_ubicacion (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    producto_id uuid NOT NULL,
    ubicacion_id uuid NOT NULL,
    stock_actual numeric DEFAULT 0 NOT NULL,
    stock_minimo numeric,
    stock_maximo numeric,
    es_principal boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: inventario_ubicaciones; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.inventario_ubicaciones (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    nombre text NOT NULL,
    codigo text,
    tipo text DEFAULT 'deposito'::text NOT NULL,
    parent_id uuid,
    descripcion text,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventario_ubicaciones_tipo_check CHECK ((tipo = ANY (ARRAY['deposito'::text, 'salon'::text, 'pasillo'::text, 'gondola'::text, 'estante'::text, 'zona'::text, 'otro'::text])))
);


--
-- Name: marca_categorias; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.marca_categorias (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    marca_id uuid NOT NULL,
    categoria_id uuid NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: marcas; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.marcas (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    nombre text NOT NULL,
    slug_web text NOT NULL,
    descripcion_web text,
    logo_url text,
    visible_web boolean DEFAULT true NOT NULL,
    orden_web integer DEFAULT 0 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT marcas_nombre_no_vacio CHECK ((length(btrim(nombre)) > 0))
);


--
-- Name: marketing_calendarios; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.marketing_calendarios (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    cliente_id uuid,
    mes text,
    semana integer,
    fecha_inicio date,
    fecha_fin date,
    estado_calendario text DEFAULT 'pendiente'::text NOT NULL,
    enviado_estado text DEFAULT 'no_enviado'::text NOT NULL,
    aprobado_estado text DEFAULT 'pendiente'::text NOT NULL,
    observaciones text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: marketing_comentarios; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.marketing_comentarios (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    pieza_id uuid NOT NULL,
    usuario_id uuid,
    comentario text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_marketing_comentarios_texto_non_empty CHECK ((length(TRIM(BOTH FROM comentario)) > 0))
);


--
-- Name: marketing_historial_estados; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.marketing_historial_estados (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    pieza_id uuid NOT NULL,
    campo text NOT NULL,
    estado_anterior text,
    estado_nuevo text,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_marketing_historial_campo_non_empty CHECK ((length(TRIM(BOTH FROM campo)) > 0))
);


--
-- Name: marketing_piezas; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.marketing_piezas (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    calendario_id uuid,
    cliente_id uuid,
    titulo text NOT NULL,
    tipo_pieza text,
    canal text,
    responsable_id uuid,
    fecha_limite date,
    fecha_publicacion date,
    prioridad text DEFAULT 'media'::text NOT NULL,
    estado_produccion text DEFAULT 'por_hacer'::text NOT NULL,
    estado_cliente text DEFAULT 'no_enviado'::text NOT NULL,
    estado_publicacion text DEFAULT 'pendiente'::text NOT NULL,
    link_archivo text,
    observaciones text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_marketing_piezas_titulo_non_empty CHECK ((length(TRIM(BOTH FROM titulo)) > 0)),
    CONSTRAINT marketing_piezas_estado_cliente_check CHECK ((estado_cliente = ANY (ARRAY['no_enviado'::text, 'enviado'::text, 'aprobado'::text, 'con_correcciones'::text, 'sin_respuesta'::text]))),
    CONSTRAINT marketing_piezas_estado_produccion_check CHECK ((estado_produccion = ANY (ARRAY['por_hacer'::text, 'en_produccion'::text, 'revision_interna'::text, 'correccion_interna'::text, 'listo_para_enviar'::text]))),
    CONSTRAINT marketing_piezas_estado_publicacion_check CHECK ((estado_publicacion = ANY (ARRAY['pendiente'::text, 'programado'::text, 'publicado'::text, 'cancelado'::text]))),
    CONSTRAINT marketing_piezas_prioridad_check CHECK ((prioridad = ANY (ARRAY['baja'::text, 'media'::text, 'alta'::text, 'urgente'::text])))
);


--
-- Name: marketing_tasks; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.marketing_tasks (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    cliente_id uuid NOT NULL,
    titulo text NOT NULL,
    descripcion text,
    tipo_contenido text NOT NULL,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    fecha_entrega date NOT NULL,
    responsable_user_id uuid,
    prioridad text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    suscripcion_id uuid,
    plan_id uuid,
    generada_automaticamente boolean DEFAULT false NOT NULL,
    CONSTRAINT marketing_tasks_estado_check CHECK ((estado = ANY (ARRAY['pendiente'::text, 'en_proceso'::text, 'en_revision'::text, 'aprobado'::text, 'publicado'::text]))),
    CONSTRAINT marketing_tasks_prioridad_check CHECK (((prioridad IS NULL) OR (prioridad = ANY (ARRAY['baja'::text, 'media'::text, 'alta'::text, 'urgente'::text])))),
    CONSTRAINT marketing_tasks_tipo_contenido_check CHECK ((tipo_contenido = ANY (ARRAY['post'::text, 'reel'::text, 'historia'::text, 'anuncio'::text, 'otro'::text])))
);


--
-- Name: modulos; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.modulos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    nombre text,
    descripcion text,
    slug text
);


--
-- Name: movimientos_inventario; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.movimientos_inventario (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    producto_id uuid NOT NULL,
    producto_nombre text NOT NULL,
    producto_sku text NOT NULL,
    tipo text NOT NULL,
    cantidad numeric NOT NULL,
    costo_unitario numeric DEFAULT 0 NOT NULL,
    origen text NOT NULL,
    referencia text,
    fecha timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    venta_id uuid,
    created_by uuid,
    usuario_nombre text,
    CONSTRAINT movimientos_inventario_origen_check CHECK ((origen = ANY (ARRAY['compra'::text, 'venta'::text, 'ajuste_manual'::text, 'inventario_inicial'::text, 'venta_regalo'::text]))),
    CONSTRAINT movimientos_inventario_tipo_check CHECK ((tipo = ANY (ARRAY['ENTRADA'::text, 'SALIDA'::text, 'AJUSTE'::text])))
);


--
-- Name: nota_credito; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.nota_credito (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    cliente_id uuid NOT NULL,
    factura_id uuid NOT NULL,
    monto numeric NOT NULL,
    motivo text NOT NULL,
    observacion_interna text,
    estado_erp text DEFAULT 'borrador'::text NOT NULL,
    created_by_user_id uuid,
    created_by_email_snapshot text,
    created_by_nombre_snapshot text,
    saldo_previo_snapshot numeric NOT NULL,
    monto_factura_snapshot numeric NOT NULL,
    suma_pagos_snapshot numeric NOT NULL,
    moneda_snapshot text NOT NULL,
    factura_electronica_origen_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT nota_credito_estado_erp_check CHECK ((estado_erp = ANY (ARRAY['borrador'::text, 'pendiente_envio_sifen'::text, 'aprobada'::text, 'rechazada'::text, 'error'::text, 'anulada_borrador'::text]))),
    CONSTRAINT nota_credito_moneda_snapshot_check CHECK ((moneda_snapshot = ANY (ARRAY['GS'::text, 'USD'::text]))),
    CONSTRAINT nota_credito_monto_check CHECK ((monto > (0)::numeric)),
    CONSTRAINT nota_credito_motivo_len_check CHECK (((length(TRIM(BOTH FROM motivo)) >= 5) AND (length(motivo) <= 2000)))
);


--
-- Name: nota_credito_electronica; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.nota_credito_electronica (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    nota_credito_id uuid NOT NULL,
    estado_sifen text DEFAULT 'sin_envio'::text NOT NULL,
    cdc text,
    cdc_factura_origen text,
    xml_path text,
    xml_firmado_path text,
    kude_url text,
    response_json jsonb,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    sifen_d_prot_cons_lote text,
    sifen_ultima_respuesta_recibe_lote jsonb,
    sifen_ultima_respuesta_consulta_lote jsonb,
    sifen_aprobado_at timestamp with time zone,
    last_response_json jsonb,
    last_error text,
    CONSTRAINT nota_credito_electronica_estado_sifen_check CHECK ((estado_sifen = ANY (ARRAY['sin_envio'::text, 'generado'::text, 'firmado'::text, 'enviado'::text, 'en_proceso'::text, 'aprobado'::text, 'rechazado'::text, 'error_envio'::text, 'cancelado'::text])))
);


--
-- Name: nota_credito_evento; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.nota_credito_evento (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    nota_credito_id uuid NOT NULL,
    actor_user_id uuid,
    tipo_evento text NOT NULL,
    detalle_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT nota_credito_evento_tipo_check CHECK ((tipo_evento = ANY (ARRAY['creacion'::text, 'validacion'::text, 'rechazo_negocio'::text, 'cambio_estado_erp'::text, 'preparacion_sifen'::text, 'error'::text, 'observacion_operativa'::text, 'anulacion_borrador'::text, 'xml_generado'::text, 'xml_firmado'::text, 'enviado_set'::text, 'respuesta_set'::text, 'aprobado'::text, 'rechazado'::text, 'impacto_saldo_aplicado'::text, 'error_envio'::text])))
);


--
-- Name: notas_olfativas; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.notas_olfativas (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    nombre text NOT NULL,
    familia_id uuid,
    descripcion text,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: obligaciones_tributarias_catalogo; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.obligaciones_tributarias_catalogo (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    nombre text NOT NULL,
    requiere_detalle_otro boolean DEFAULT false NOT NULL,
    orden smallint DEFAULT 0 NOT NULL
);


--
-- Name: omnichannel_routes; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.omnichannel_routes (
    meta_phone_number_id text NOT NULL,
    empresa_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    data_schema text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pagos; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.pagos (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    factura_id uuid NOT NULL,
    monto numeric NOT NULL,
    fecha_pago date NOT NULL,
    metodo_pago text DEFAULT 'efectivo'::text NOT NULL,
    referencia text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    cliente_id uuid,
    usuario_id uuid,
    CONSTRAINT pagos_metodo_pago_check CHECK ((metodo_pago = ANY (ARRAY['efectivo'::text, 'transferencia'::text, 'cheque'::text, 'tarjeta'::text, 'otro'::text])))
);


--
-- Name: pedidos_web; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.pedidos_web (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    numero text NOT NULL,
    empresa_id uuid NOT NULL,
    cliente_id uuid,
    cliente_snapshot jsonb NOT NULL,
    estado text DEFAULT 'pendiente_pago'::text NOT NULL,
    subtotal numeric DEFAULT 0 NOT NULL,
    total numeric DEFAULT 0 NOT NULL,
    payment_method text,
    notas text,
    ip_origen text,
    user_agent text,
    public_token text,
    venta_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pedidos_web_estado_chk CHECK ((estado = ANY (ARRAY['pendiente_pago'::text, 'en_revision'::text, 'confirmado_manual'::text, 'preparando'::text, 'enviado'::text, 'entregado'::text, 'cancelado'::text])))
);


--
-- Name: pedidos_web_items; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.pedidos_web_items (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    pedido_id uuid NOT NULL,
    producto_id uuid NOT NULL,
    producto_snapshot jsonb NOT NULL,
    cantidad integer NOT NULL,
    precio_unitario numeric NOT NULL,
    subtotal numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    presentacion_id uuid,
    CONSTRAINT pedidos_web_items_cantidad_positive CHECK ((cantidad > 0))
);


--
-- Name: pedidos_web_secuencia; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.pedidos_web_secuencia (
    empresa_id uuid NOT NULL,
    fecha date NOT NULL,
    ultimo integer DEFAULT 0 NOT NULL
);


--
-- Name: planes; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.planes (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    codigo_plan text NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    precio numeric NOT NULL,
    moneda text DEFAULT 'GS'::text NOT NULL,
    periodicidad text DEFAULT 'mensual'::text NOT NULL,
    limite_usuarios integer,
    limite_clientes integer,
    limite_facturas integer,
    estado text DEFAULT 'activo'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    es_plan_marketing boolean DEFAULT false NOT NULL,
    plantilla_operativa jsonb,
    CONSTRAINT planes_estado_check CHECK ((estado = ANY (ARRAY['activo'::text, 'inactivo'::text]))),
    CONSTRAINT planes_moneda_check CHECK ((moneda = ANY (ARRAY['GS'::text, 'USD'::text]))),
    CONSTRAINT planes_periodicidad_check CHECK ((periodicidad = ANY (ARRAY['mensual'::text, 'anual'::text, 'unico'::text])))
);


--
-- Name: producto_acordes; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.producto_acordes (
    empresa_id uuid NOT NULL,
    producto_id uuid NOT NULL,
    acorde_id uuid NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: producto_categorias; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.producto_categorias (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    producto_id uuid NOT NULL,
    categoria_id uuid NOT NULL,
    es_principal boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: producto_imagenes; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.producto_imagenes (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    producto_id uuid NOT NULL,
    imagen_path text NOT NULL,
    imagen_url text NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    es_principal boolean DEFAULT false NOT NULL,
    alt_text text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT producto_imagenes_orden_range CHECK (((orden >= 0) AND (orden <= 4)))
);


--
-- Name: producto_notas; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.producto_notas (
    producto_id uuid NOT NULL,
    nota_id uuid NOT NULL,
    posicion joyeriaartesanos.nota_posicion NOT NULL,
    orden integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: producto_presentaciones; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.producto_presentaciones (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    producto_id uuid NOT NULL,
    sku text NOT NULL,
    codigo_barras text,
    codigo_barras_interno boolean DEFAULT false NOT NULL,
    volumen_ml numeric(8,2) NOT NULL,
    costo_promedio numeric(14,2) DEFAULT 0 NOT NULL,
    precio_venta numeric(14,2) DEFAULT 0 NOT NULL,
    precio_web numeric(14,2),
    precio_oferta numeric(14,2),
    oferta_hasta timestamp with time zone,
    precio_mayorista numeric(14,2),
    cantidad_minima_mayorista integer,
    visible_mayorista_web boolean DEFAULT false NOT NULL,
    stock_actual numeric(14,3) DEFAULT 0 NOT NULL,
    stock_minimo numeric(14,3) DEFAULT 0 NOT NULL,
    imagen_path text,
    imagen_url text,
    visible_web boolean DEFAULT true NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT producto_presentaciones_cant_min_mayorista_pos CHECK (((cantidad_minima_mayorista IS NULL) OR (cantidad_minima_mayorista > 0))),
    CONSTRAINT producto_presentaciones_costo_nonneg CHECK ((costo_promedio >= (0)::numeric)),
    CONSTRAINT producto_presentaciones_precio_mayorista_nonneg CHECK (((precio_mayorista IS NULL) OR (precio_mayorista >= (0)::numeric))),
    CONSTRAINT producto_presentaciones_precio_oferta_nonneg CHECK (((precio_oferta IS NULL) OR (precio_oferta >= (0)::numeric))),
    CONSTRAINT producto_presentaciones_precio_venta_nonneg CHECK ((precio_venta >= (0)::numeric)),
    CONSTRAINT producto_presentaciones_precio_web_nonneg CHECK (((precio_web IS NULL) OR (precio_web >= (0)::numeric))),
    CONSTRAINT producto_presentaciones_stock_actual_nonneg CHECK ((stock_actual >= (0)::numeric)),
    CONSTRAINT producto_presentaciones_stock_minimo_nonneg CHECK ((stock_minimo >= (0)::numeric)),
    CONSTRAINT producto_presentaciones_volumen_pos CHECK ((volumen_ml > (0)::numeric))
);


--
-- Name: productos; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.productos (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    nombre text NOT NULL,
    sku text NOT NULL,
    costo_promedio numeric DEFAULT 0 NOT NULL,
    precio_venta numeric DEFAULT 0 NOT NULL,
    stock_actual numeric DEFAULT 0 NOT NULL,
    stock_minimo numeric DEFAULT 0 NOT NULL,
    unidad_medida text DEFAULT 'Unidad'::text NOT NULL,
    metodo_valuacion text DEFAULT 'CPP'::text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    imagen_url text,
    imagen_path text,
    codigo_barras text,
    codigo_barras_interno boolean DEFAULT false NOT NULL,
    proveedor_principal_id uuid,
    categoria_principal_id uuid,
    ubicacion_principal_id uuid,
    slug_web text,
    visible_web boolean DEFAULT false NOT NULL,
    destacado_web boolean DEFAULT false NOT NULL,
    descripcion_corta text,
    descripcion_web text,
    marca text,
    precio_web numeric,
    precio_oferta numeric,
    oferta_hasta timestamp with time zone,
    nuevo_hasta date,
    concentracion text,
    volumen_ml integer,
    genero text,
    proximamente boolean DEFAULT false NOT NULL,
    orden_web integer,
    familia_olfativa_id uuid,
    marca_id uuid,
    precio_mayorista numeric(14,2),
    cantidad_minima_mayorista integer,
    visible_mayorista_web boolean DEFAULT false NOT NULL,
    tiene_presentaciones boolean DEFAULT false NOT NULL,
    es_decant boolean DEFAULT false NOT NULL,
    modelo text,
    cantidad_minima_minorista integer,
    CONSTRAINT productos_cantidad_minima_mayorista_pos CHECK (((cantidad_minima_mayorista IS NULL) OR (cantidad_minima_mayorista > 0))),
    CONSTRAINT productos_cantidad_minima_minorista_pos CHECK (((cantidad_minima_minorista IS NULL) OR (cantidad_minima_minorista > 0))),
    CONSTRAINT productos_genero_chk CHECK (((genero IS NULL) OR (genero = ANY (ARRAY['masculino'::text, 'femenino'::text, 'unisex'::text])))),
    CONSTRAINT productos_metodo_valuacion_check CHECK ((metodo_valuacion = ANY (ARRAY['CPP'::text, 'FIFO'::text, 'LIFO'::text]))),
    CONSTRAINT productos_precio_mayorista_nonneg CHECK (((precio_mayorista IS NULL) OR (precio_mayorista >= (0)::numeric))),
    CONSTRAINT productos_precio_oferta_nonneg CHECK (((precio_oferta IS NULL) OR (precio_oferta >= (0)::numeric))),
    CONSTRAINT productos_precio_web_nonneg_check CHECK (((precio_web IS NULL) OR (precio_web >= (0)::numeric))),
    CONSTRAINT productos_volumen_ml_positive CHECK (((volumen_ml IS NULL) OR (volumen_ml > 0)))
);


--
-- Name: productos_codigo_secuencia; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.productos_codigo_secuencia (
    empresa_id uuid NOT NULL,
    last_value bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: productos_sku_secuencia; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.productos_sku_secuencia (
    empresa_id uuid NOT NULL,
    prefijo text NOT NULL,
    last_value bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT productos_sku_prefijo_format CHECK ((prefijo ~ '^[A-Z0-9_]{1,16}$'::text))
);


--
-- Name: proveedor_categoria_rel; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.proveedor_categoria_rel (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    proveedor_id uuid NOT NULL,
    categoria_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: proveedor_categorias; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.proveedor_categorias (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: proveedor_productos; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.proveedor_productos (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    producto_id uuid NOT NULL,
    proveedor_id uuid NOT NULL,
    es_principal boolean DEFAULT false NOT NULL,
    codigo_proveedor text,
    costo_habitual numeric,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: proveedores; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.proveedores (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    nombre text NOT NULL,
    ruc text,
    telefono text,
    email text,
    direccion text,
    contacto text,
    estado text DEFAULT 'activo'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    nombre_comercial text,
    razon_social text,
    condicion_pago text,
    plazo_pago_dias integer,
    moneda_preferida text,
    observaciones text,
    CONSTRAINT proveedores_condicion_pago_check CHECK (((condicion_pago IS NULL) OR (condicion_pago = ANY (ARRAY['contado'::text, 'credito'::text, 'mixto'::text])))),
    CONSTRAINT proveedores_estado_check CHECK ((estado = ANY (ARRAY['activo'::text, 'inactivo'::text]))),
    CONSTRAINT proveedores_moneda_preferida_check CHECK (((moneda_preferida IS NULL) OR (moneda_preferida = ANY (ARRAY['GS'::text, 'USD'::text]))))
);


--
-- Name: proyecto_archivos; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.proyecto_archivos (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    proyecto_id uuid NOT NULL,
    nombre text NOT NULL,
    storage_bucket text DEFAULT 'proyectos'::text NOT NULL,
    storage_path text NOT NULL,
    mime_type text,
    size_bytes bigint,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_proyecto_archivos_nombre_non_empty CHECK ((length(TRIM(BOTH FROM nombre)) > 0))
);


--
-- Name: proyecto_comentarios; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.proyecto_comentarios (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    proyecto_id uuid NOT NULL,
    usuario_id uuid NOT NULL,
    comentario text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_proyecto_comentarios_texto_non_empty CHECK ((length(TRIM(BOTH FROM comentario)) > 0))
);


--
-- Name: proyecto_estado_historial; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.proyecto_estado_historial (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    proyecto_id uuid NOT NULL,
    estado_anterior_id uuid,
    estado_nuevo_id uuid NOT NULL,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    entered_at timestamp with time zone DEFAULT now() NOT NULL,
    exited_at timestamp with time zone,
    duration_seconds bigint,
    tipo_sla_snapshot text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: proyecto_estados; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.proyecto_estados (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    nombre text NOT NULL,
    codigo text NOT NULL,
    descripcion text,
    color text DEFAULT '#64748b'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    cuenta_sla boolean DEFAULT true NOT NULL,
    tipo_sla text NOT NULL,
    sla_horas_objetivo integer,
    es_estado_inicial boolean DEFAULT false NOT NULL,
    es_estado_final boolean DEFAULT false NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_proyecto_estados_codigo_non_empty CHECK ((length(TRIM(BOTH FROM codigo)) > 0)),
    CONSTRAINT proyecto_estados_tipo_sla_check CHECK ((tipo_sla = ANY (ARRAY['interno'::text, 'cliente'::text, 'pausado'::text, 'final'::text])))
);


--
-- Name: proyecto_prioridades_config; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.proyecto_prioridades_config (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    codigo text NOT NULL,
    nombre text NOT NULL,
    color text,
    bg_color text,
    text_color text,
    border_color text,
    sort_order integer DEFAULT 0 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_proyecto_prioridades_bg_color CHECK (((bg_color IS NULL) OR (bg_color ~ '^#[0-9A-Fa-f]{6}$'::text))),
    CONSTRAINT chk_proyecto_prioridades_border_color CHECK (((border_color IS NULL) OR (border_color ~ '^#[0-9A-Fa-f]{6}$'::text))),
    CONSTRAINT chk_proyecto_prioridades_codigo CHECK ((codigo = ANY (ARRAY['baja'::text, 'normal'::text, 'alta'::text, 'urgente'::text]))),
    CONSTRAINT chk_proyecto_prioridades_color CHECK (((color IS NULL) OR (color ~ '^#[0-9A-Fa-f]{6}$'::text))),
    CONSTRAINT chk_proyecto_prioridades_nombre_non_empty CHECK ((length(TRIM(BOTH FROM nombre)) > 0)),
    CONSTRAINT chk_proyecto_prioridades_text_color CHECK (((text_color IS NULL) OR (text_color ~ '^#[0-9A-Fa-f]{6}$'::text)))
);


--
-- Name: proyecto_tareas; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.proyecto_tareas (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    proyecto_id uuid NOT NULL,
    titulo text NOT NULL,
    descripcion text,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    responsable_id uuid,
    fecha_limite timestamp with time zone,
    sort_order integer DEFAULT 0 NOT NULL,
    completed_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_proyecto_tareas_titulo_non_empty CHECK ((length(TRIM(BOTH FROM titulo)) > 0)),
    CONSTRAINT proyecto_tareas_estado_check CHECK ((estado = ANY (ARRAY['pendiente'::text, 'en_proceso'::text, 'completada'::text, 'bloqueada'::text])))
);


--
-- Name: proyecto_tipos; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.proyecto_tipos (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    nombre text NOT NULL,
    codigo text NOT NULL,
    descripcion text,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_proyecto_tipos_codigo_non_empty CHECK ((length(TRIM(BOTH FROM codigo)) > 0))
);


--
-- Name: proyectos; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.proyectos (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    cliente_id uuid,
    tipo_id uuid NOT NULL,
    estado_id uuid NOT NULL,
    titulo text NOT NULL,
    descripcion text,
    prioridad text DEFAULT 'normal'::text NOT NULL,
    responsable_comercial_id uuid,
    responsable_tecnico_id uuid,
    fecha_ingreso timestamp with time zone DEFAULT now() NOT NULL,
    fecha_prometida timestamp with time zone,
    fecha_entrega timestamp with time zone,
    monto_vendido numeric(14,2),
    observaciones_comerciales text,
    brief_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    bloqueado boolean DEFAULT false NOT NULL,
    bloqueo_motivo text,
    archivado boolean DEFAULT false NOT NULL,
    ultimo_movimiento_at timestamp with time zone DEFAULT now() NOT NULL,
    last_activity_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_proyectos_titulo_non_empty CHECK ((length(TRIM(BOTH FROM titulo)) > 0)),
    CONSTRAINT proyectos_prioridad_check CHECK ((prioridad = ANY (ARRAY['baja'::text, 'normal'::text, 'alta'::text, 'urgente'::text])))
);


--
-- Name: resenas_videos; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.resenas_videos (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    titulo text,
    descripcion text,
    video_path text NOT NULL,
    video_url text NOT NULL,
    poster_path text,
    poster_url text,
    orden integer DEFAULT 0 NOT NULL,
    visible_web boolean DEFAULT true NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT resenas_videos_orden_range CHECK (((orden >= 0) AND (orden <= 3)))
);


--
-- Name: sorteo_conversaciones; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.sorteo_conversaciones (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    sorteo_id uuid NOT NULL,
    whatsapp_numero text NOT NULL,
    cliente_id uuid,
    estado text DEFAULT 'new_lead'::text NOT NULL,
    ultimo_mensaje text,
    cantidad_boletos integer,
    datos_cliente jsonb DEFAULT '{}'::jsonb,
    recordatorio_24h boolean DEFAULT false,
    recordatorio_48h boolean DEFAULT false,
    recordatorio_72h boolean DEFAULT false,
    ultimo_recordatorio_at timestamp with time zone,
    human_handoff_at timestamp with time zone,
    activa boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sorteo_conversaciones_estado_check CHECK ((estado = ANY (ARRAY['new_lead'::text, 'awaiting_ticket_selection'::text, 'awaiting_customer_data'::text, 'awaiting_payment'::text, 'awaiting_receipt'::text, 'receipt_under_review'::text, 'paid_confirmed'::text, 'human_handoff'::text, 'cancelled'::text, 'closed_no_response'::text])))
);


--
-- Name: sorteo_cupones; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.sorteo_cupones (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    sorteo_id uuid NOT NULL,
    entrada_id uuid NOT NULL,
    numero_cupon text NOT NULL,
    ganador boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    coupon_number_value integer
);


--
-- Name: sorteo_entradas; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.sorteo_entradas (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    sorteo_id uuid NOT NULL,
    conversacion_id uuid,
    cliente_id uuid,
    whatsapp_numero text NOT NULL,
    nombre_participante text NOT NULL,
    documento text,
    cantidad_boletos integer NOT NULL,
    monto_total numeric NOT NULL,
    moneda text DEFAULT 'PYG'::text NOT NULL,
    estado_pago text DEFAULT 'pendiente'::text NOT NULL,
    fecha_pago timestamp with time zone,
    monto_pagado numeric,
    banco_origen text,
    comprobante_url text,
    comprobante_ia_resultado jsonb DEFAULT '{}'::jsonb,
    comprobante_ia_confianza numeric,
    validado_por text DEFAULT 'IA'::text,
    validado_por_user_id uuid,
    validado_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    numero_orden integer NOT NULL,
    chat_conversation_id uuid,
    flow_code text,
    idempotency_key text,
    promo_nombre text,
    precio_fuente text,
    precio_regular_referencia numeric,
    comprobante_validacion_id uuid,
    revendedor_id uuid,
    codigo_referido_snapshot text,
    observacion_interna text,
    venta_origen text,
    venta_canal text,
    pago_metodo text,
    cupones_impresos_at timestamp with time zone,
    cupones_impresos_by uuid,
    cupones_impresion_count integer,
    CONSTRAINT sorteo_entradas_estado_pago_check CHECK ((estado_pago = ANY (ARRAY['pendiente'::text, 'pendiente_revision'::text, 'confirmado'::text, 'rechazado'::text]))),
    CONSTRAINT sorteo_entradas_moneda_check CHECK ((moneda = 'PYG'::text)),
    CONSTRAINT sorteo_entradas_pago_metodo_check CHECK (((pago_metodo IS NULL) OR (pago_metodo = ANY (ARRAY['efectivo'::text, 'transferencia'::text, 'tarjeta'::text, 'otro'::text])))),
    CONSTRAINT sorteo_entradas_precio_fuente_check CHECK (((precio_fuente IS NULL) OR (precio_fuente = ANY (ARRAY['lista'::text, 'promo'::text])))),
    CONSTRAINT sorteo_entradas_venta_canal_check CHECK (((venta_canal IS NULL) OR (venta_canal = ANY (ARRAY['remote'::text, 'local'::text])))),
    CONSTRAINT sorteo_entradas_venta_origen_check CHECK (((venta_origen IS NULL) OR (venta_origen = ANY (ARRAY['whatsapp_flow'::text, 'erp_manual'::text]))))
);


--
-- Name: sorteo_revendedor_clicks; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.sorteo_revendedor_clicks (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    sorteo_id uuid NOT NULL,
    revendedor_id uuid NOT NULL,
    attribution_token text NOT NULL,
    user_agent text,
    ip_hash text,
    conversation_id uuid,
    flow_session_id uuid,
    contact_phone_norm text,
    redeemed_at timestamp with time zone,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sorteo_revendedores; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.sorteo_revendedores (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    sorteo_id uuid NOT NULL,
    nombre text NOT NULL,
    telefono text,
    codigo_referido text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sorteo_ticket_deliveries; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.sorteo_ticket_deliveries (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    sorteo_id uuid NOT NULL,
    entrada_id uuid NOT NULL,
    conversation_id uuid,
    flow_session_id uuid,
    delivery_mode text NOT NULL,
    status text NOT NULL,
    cliente_nombre text,
    cliente_documento text,
    telefono text,
    numero_orden text,
    cupones jsonb DEFAULT '[]'::jsonb NOT NULL,
    storage_bucket text,
    storage_path text,
    whatsapp_message_id text,
    provider text,
    channel_id uuid,
    error_message text,
    payload_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    config_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    template_revision integer DEFAULT 1 NOT NULL,
    is_current boolean DEFAULT true NOT NULL,
    png_bytes_hash text,
    generated_at timestamp with time zone,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sorteo_ticket_deliveries_delivery_mode_check CHECK ((delivery_mode = ANY (ARRAY['text_only'::text, 'text_and_image'::text, 'image_only'::text]))),
    CONSTRAINT sorteo_ticket_deliveries_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'generated'::text, 'sent'::text, 'error'::text])))
);


--
-- Name: sorteos; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.sorteos (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    precio_por_boleto numeric DEFAULT 0 NOT NULL,
    max_boletos integer DEFAULT 100 NOT NULL,
    total_boletos_vendidos integer DEFAULT 0 NOT NULL,
    ultimo_numero_cupon integer DEFAULT 0 NOT NULL,
    fecha_sorteo timestamp with time zone,
    estado text DEFAULT 'activo'::text NOT NULL,
    datos_bancarios jsonb DEFAULT '{}'::jsonb NOT NULL,
    imagen_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ultimo_numero_orden integer DEFAULT 0 NOT NULL,
    ticket_delivery_mode text DEFAULT 'text_only'::text NOT NULL,
    ticket_image_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    coupon_numbering_enabled boolean DEFAULT false NOT NULL,
    coupon_number_start integer,
    coupon_number_mode text,
    coupon_number_limit integer,
    CONSTRAINT sorteos_coupon_number_mode_check CHECK (((coupon_number_mode IS NULL) OR (coupon_number_mode = ANY (ARRAY['correlative'::text, 'random'::text])))),
    CONSTRAINT sorteos_estado_check CHECK ((estado = ANY (ARRAY['activo'::text, 'pausado'::text, 'cerrado'::text, 'finalizado'::text]))),
    CONSTRAINT sorteos_ticket_delivery_mode_check CHECK ((ticket_delivery_mode = ANY (ARRAY['text_only'::text, 'text_and_image'::text, 'image_only'::text])))
);


--
-- Name: suscripciones; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.suscripciones (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    cliente_id uuid NOT NULL,
    plan_id uuid,
    precio numeric DEFAULT 0 NOT NULL,
    moneda text DEFAULT 'GS'::text NOT NULL,
    fecha_inicio date NOT NULL,
    duracion_meses integer DEFAULT 12 NOT NULL,
    dia_facturacion integer DEFAULT 1 NOT NULL,
    dia_vencimiento integer DEFAULT 10 NOT NULL,
    estado text DEFAULT 'activa'::text NOT NULL,
    generar_factura_este_mes boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    plan_pendiente_id uuid,
    precio_pendiente numeric,
    moneda_pendiente text,
    plan_pendiente_vigente_desde date,
    CONSTRAINT suscripciones_dia_facturacion_check CHECK (((dia_facturacion >= 1) AND (dia_facturacion <= 28))),
    CONSTRAINT suscripciones_dia_vencimiento_check CHECK (((dia_vencimiento >= 1) AND (dia_vencimiento <= 31))),
    CONSTRAINT suscripciones_estado_check CHECK ((estado = ANY (ARRAY['activa'::text, 'pausada'::text, 'cancelada'::text]))),
    CONSTRAINT suscripciones_moneda_check CHECK ((moneda = ANY (ARRAY['GS'::text, 'USD'::text])))
);


--
-- Name: tipificaciones; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.tipificaciones (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    cliente_id uuid NOT NULL,
    usuario text NOT NULL,
    tipo_gestion text NOT NULL,
    resultado text NOT NULL,
    observacion text NOT NULL,
    fecha timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tipificaciones_resultado_check CHECK ((resultado = ANY (ARRAY['Pendiente'::text, 'Resuelto'::text, 'Escalar'::text]))),
    CONSTRAINT tipificaciones_tipo_gestion_check CHECK ((tipo_gestion = ANY (ARRAY['Consulta'::text, 'Reclamo'::text, 'Seguimiento'::text, 'Promesa de pago'::text, 'Soporte técnico'::text, 'Cambio plan'::text])))
);


--
-- Name: usuario_dashboard_views; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.usuario_dashboard_views (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    usuario_id uuid NOT NULL,
    dashboard_view_id uuid NOT NULL,
    es_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: usuario_modulos; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.usuario_modulos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    usuario_id uuid NOT NULL,
    modulo_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: usuarios; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.usuarios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text,
    nombre text,
    rol text,
    empresa_id uuid,
    auth_user_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    activo boolean DEFAULT true,
    porcentaje_comision numeric,
    estado text DEFAULT 'activo'::text NOT NULL,
    telefono text,
    fecha_nacimiento date,
    fecha_ingreso date,
    tipo_contrato text,
    salario_base numeric,
    ips boolean DEFAULT false NOT NULL,
    area text,
    CONSTRAINT usuarios_area_check CHECK (((area IS NULL) OR (area = ANY (ARRAY['ventas'::text, 'soporte'::text, 'finanzas'::text, 'operaciones'::text, 'administracion'::text])))),
    CONSTRAINT usuarios_estado_check CHECK ((estado = ANY (ARRAY['activo'::text, 'inactivo'::text]))),
    CONSTRAINT usuarios_porcentaje_comision_check CHECK (((porcentaje_comision IS NULL) OR ((porcentaje_comision >= (0)::numeric) AND (porcentaje_comision <= (100)::numeric)))),
    CONSTRAINT usuarios_tipo_contrato_check CHECK (((tipo_contrato IS NULL) OR (tipo_contrato = ANY (ARRAY['salario'::text, 'comision'::text, 'mixto'::text, 'prestador_servicio'::text]))))
);


--
-- Name: ventas; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.ventas (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    cliente_id uuid,
    numero_control text NOT NULL,
    moneda text DEFAULT 'GS'::text NOT NULL,
    tipo_cambio numeric DEFAULT 1 NOT NULL,
    subtotal numeric DEFAULT 0 NOT NULL,
    monto_iva numeric DEFAULT 0 NOT NULL,
    total numeric DEFAULT 0 NOT NULL,
    estado text DEFAULT 'completada'::text NOT NULL,
    tipo_venta text DEFAULT 'CONTADO'::text NOT NULL,
    plazo_dias integer,
    fecha timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    observaciones text,
    CONSTRAINT ventas_estado_check CHECK ((estado = ANY (ARRAY['pendiente'::text, 'completada'::text, 'anulada'::text]))),
    CONSTRAINT ventas_moneda_check CHECK ((moneda = ANY (ARRAY['GS'::text, 'USD'::text]))),
    CONSTRAINT ventas_tipo_venta_check CHECK ((tipo_venta = ANY (ARRAY['CONTADO'::text, 'CREDITO'::text])))
);


--
-- Name: ventas_items; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.ventas_items (
    id uuid DEFAULT extensions.gen_random_uuid() NOT NULL,
    empresa_id uuid NOT NULL,
    venta_id uuid NOT NULL,
    producto_id uuid NOT NULL,
    producto_nombre text NOT NULL,
    sku text NOT NULL,
    cantidad numeric NOT NULL,
    precio_venta_original numeric NOT NULL,
    precio_venta numeric NOT NULL,
    tipo_iva text DEFAULT '10%'::text NOT NULL,
    subtotal numeric NOT NULL,
    monto_iva numeric NOT NULL,
    total_linea numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    es_sin_cargo boolean DEFAULT false NOT NULL,
    motivo_sin_cargo text,
    costo_unitario_snapshot numeric(14,2),
    costo_promocional_total numeric(14,2),
    CONSTRAINT ventas_items_costo_promocional_nonneg CHECK (((costo_promocional_total IS NULL) OR (costo_promocional_total >= (0)::numeric))),
    CONSTRAINT ventas_items_costo_snapshot_nonneg CHECK (((costo_unitario_snapshot IS NULL) OR (costo_unitario_snapshot >= (0)::numeric))),
    CONSTRAINT ventas_items_sin_cargo_consistente CHECK (((es_sin_cargo = false) OR ((precio_venta = (0)::numeric) AND (subtotal = (0)::numeric) AND (total_linea = (0)::numeric) AND (motivo_sin_cargo IS NOT NULL) AND (length(btrim(motivo_sin_cargo)) > 0)))),
    CONSTRAINT ventas_items_tipo_iva_check CHECK ((tipo_iva = ANY (ARRAY['EXENTA'::text, '5%'::text, '10%'::text])))
);


--
-- Name: web_product_events; Type: TABLE; Schema: elevate; Owner: -
--

CREATE TABLE joyeriaartesanos.web_product_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    event_type text NOT NULL,
    source text,
    path text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT web_product_events_event_type_check CHECK ((event_type = ANY (ARRAY['product_view'::text, 'product_click'::text, 'add_to_cart'::text, 'whatsapp_click'::text])))
);


--
-- Name: acordes_olfativos acordes_olfativos_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.acordes_olfativos
    ADD CONSTRAINT acordes_olfativos_pkey PRIMARY KEY (id);


--
-- Name: acordes_olfativos acordes_slug_web_unico_por_empresa; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.acordes_olfativos
    ADD CONSTRAINT acordes_slug_web_unico_por_empresa UNIQUE (empresa_id, slug_web);


--
-- Name: categorias_productos categorias_productos_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.categorias_productos
    ADD CONSTRAINT categorias_productos_pkey PRIMARY KEY (id);


--
-- Name: chat_agents chat_agents_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_agents
    ADD CONSTRAINT chat_agents_pkey PRIMARY KEY (id);


--
-- Name: chat_agents chat_agents_usuario_id_queue_id_key; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_agents
    ADD CONSTRAINT chat_agents_usuario_id_queue_id_key UNIQUE (usuario_id, queue_id);


--
-- Name: chat_campaign_events chat_campaign_events_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_campaign_events
    ADD CONSTRAINT chat_campaign_events_pkey PRIMARY KEY (id);


--
-- Name: chat_campaign_jobs chat_campaign_jobs_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_campaign_jobs
    ADD CONSTRAINT chat_campaign_jobs_pkey PRIMARY KEY (id);


--
-- Name: chat_campaign_recipients chat_campaign_recipients_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_campaign_recipients
    ADD CONSTRAINT chat_campaign_recipients_pkey PRIMARY KEY (id);


--
-- Name: chat_campaign_templates chat_campaign_templates_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_campaign_templates
    ADD CONSTRAINT chat_campaign_templates_pkey PRIMARY KEY (id);


--
-- Name: chat_campaigns chat_campaigns_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_campaigns
    ADD CONSTRAINT chat_campaigns_pkey PRIMARY KEY (id);


--
-- Name: chat_channel_quick_replies chat_channel_quick_replies_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_channel_quick_replies
    ADD CONSTRAINT chat_channel_quick_replies_pkey PRIMARY KEY (id);


--
-- Name: chat_channels chat_channels_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_channels
    ADD CONSTRAINT chat_channels_pkey PRIMARY KEY (id);


--
-- Name: chat_comprobante_validaciones chat_comprobante_validaciones_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_comprobante_validaciones
    ADD CONSTRAINT chat_comprobante_validaciones_pkey PRIMARY KEY (id);


--
-- Name: chat_contacts chat_contacts_empresa_id_phone_number_key; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_contacts
    ADD CONSTRAINT chat_contacts_empresa_id_phone_number_key UNIQUE (empresa_id, phone_number);


--
-- Name: chat_contacts chat_contacts_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_contacts
    ADD CONSTRAINT chat_contacts_pkey PRIMARY KEY (id);


--
-- Name: chat_conversation_closures chat_conversation_closures_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_conversation_closures
    ADD CONSTRAINT chat_conversation_closures_pkey PRIMARY KEY (id);


--
-- Name: chat_conversations chat_conversations_contact_id_channel_id_key; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_conversations
    ADD CONSTRAINT chat_conversations_contact_id_channel_id_key UNIQUE (contact_id, channel_id);


--
-- Name: chat_conversations chat_conversations_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_conversations
    ADD CONSTRAINT chat_conversations_pkey PRIMARY KEY (id);


--
-- Name: chat_empresa_operator_roles chat_empresa_operator_roles_empresa_usuario_key; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_empresa_operator_roles
    ADD CONSTRAINT chat_empresa_operator_roles_empresa_usuario_key UNIQUE (empresa_id, usuario_id);


--
-- Name: chat_empresa_operator_roles chat_empresa_operator_roles_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_empresa_operator_roles
    ADD CONSTRAINT chat_empresa_operator_roles_pkey PRIMARY KEY (id);


--
-- Name: chat_flow_data chat_flow_data_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_flow_data
    ADD CONSTRAINT chat_flow_data_pkey PRIMARY KEY (id);


--
-- Name: chat_flow_events chat_flow_events_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_flow_events
    ADD CONSTRAINT chat_flow_events_pkey PRIMARY KEY (id);


--
-- Name: chat_flow_node_blocks chat_flow_node_blocks_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_flow_node_blocks
    ADD CONSTRAINT chat_flow_node_blocks_pkey PRIMARY KEY (id);


--
-- Name: chat_flow_nodes chat_flow_nodes_empresa_id_flow_code_node_code_key; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_flow_nodes
    ADD CONSTRAINT chat_flow_nodes_empresa_id_flow_code_node_code_key UNIQUE (empresa_id, flow_code, node_code);


--
-- Name: chat_flow_nodes chat_flow_nodes_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_flow_nodes
    ADD CONSTRAINT chat_flow_nodes_pkey PRIMARY KEY (id);


--
-- Name: chat_flow_options chat_flow_options_node_id_meta_button_id_key; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_flow_options
    ADD CONSTRAINT chat_flow_options_node_id_meta_button_id_key UNIQUE (node_id, meta_button_id);


--
-- Name: chat_flow_options chat_flow_options_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_flow_options
    ADD CONSTRAINT chat_flow_options_pkey PRIMARY KEY (id);


--
-- Name: chat_flow_recontact_rules chat_flow_recontact_rules_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_flow_recontact_rules
    ADD CONSTRAINT chat_flow_recontact_rules_pkey PRIMARY KEY (id);


--
-- Name: chat_flow_recontact_runs chat_flow_recontact_runs_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_flow_recontact_runs
    ADD CONSTRAINT chat_flow_recontact_runs_pkey PRIMARY KEY (id);


--
-- Name: chat_flow_sessions chat_flow_sessions_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_flow_sessions
    ADD CONSTRAINT chat_flow_sessions_pkey PRIMARY KEY (id);


--
-- Name: chat_flows chat_flows_empresa_id_flow_code_key; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_flows
    ADD CONSTRAINT chat_flows_empresa_id_flow_code_key UNIQUE (empresa_id, flow_code);


--
-- Name: chat_flows chat_flows_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_flows
    ADD CONSTRAINT chat_flows_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: chat_omnicanal_work_schedules chat_omnicanal_work_schedules_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_omnicanal_work_schedules
    ADD CONSTRAINT chat_omnicanal_work_schedules_pkey PRIMARY KEY (id);


--
-- Name: chat_queue_channels chat_queue_channels_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_queue_channels
    ADD CONSTRAINT chat_queue_channels_pkey PRIMARY KEY (id);


--
-- Name: chat_queue_channels chat_queue_channels_queue_id_channel_id_key; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_queue_channels
    ADD CONSTRAINT chat_queue_channels_queue_id_channel_id_key UNIQUE (queue_id, channel_id);


--
-- Name: chat_queue_closure_states chat_queue_closure_states_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_queue_closure_states
    ADD CONSTRAINT chat_queue_closure_states_pkey PRIMARY KEY (id);


--
-- Name: chat_queue_closure_substates chat_queue_closure_substates_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_queue_closure_substates
    ADD CONSTRAINT chat_queue_closure_substates_pkey PRIMARY KEY (id);


--
-- Name: chat_queue_supervisors chat_queue_supervisors_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_queue_supervisors
    ADD CONSTRAINT chat_queue_supervisors_pkey PRIMARY KEY (id);


--
-- Name: chat_queue_supervisors chat_queue_supervisors_queue_usuario_key; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_queue_supervisors
    ADD CONSTRAINT chat_queue_supervisors_queue_usuario_key UNIQUE (queue_id, usuario_id);


--
-- Name: chat_queues chat_queues_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_queues
    ADD CONSTRAINT chat_queues_pkey PRIMARY KEY (id);


--
-- Name: chat_routing_events chat_routing_events_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_routing_events
    ADD CONSTRAINT chat_routing_events_pkey PRIMARY KEY (id);


--
-- Name: chat_supervisor_agents chat_supervisor_agents_empresa_sup_agent_key; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_supervisor_agents
    ADD CONSTRAINT chat_supervisor_agents_empresa_sup_agent_key UNIQUE (empresa_id, supervisor_usuario_id, agent_usuario_id);


--
-- Name: chat_supervisor_agents chat_supervisor_agents_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_supervisor_agents
    ADD CONSTRAINT chat_supervisor_agents_pkey PRIMARY KEY (id);


--
-- Name: chat_usuario_omnicanal chat_usuario_omnicanal_empresa_usuario_key; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_usuario_omnicanal
    ADD CONSTRAINT chat_usuario_omnicanal_empresa_usuario_key UNIQUE (empresa_id, usuario_id);


--
-- Name: chat_usuario_omnicanal chat_usuario_omnicanal_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_usuario_omnicanal
    ADD CONSTRAINT chat_usuario_omnicanal_pkey PRIMARY KEY (id);


--
-- Name: cliente_historial cliente_historial_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.cliente_historial
    ADD CONSTRAINT cliente_historial_pkey PRIMARY KEY (id);


--
-- Name: cliente_obligaciones_tributarias cliente_obligaciones_tributarias_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.cliente_obligaciones_tributarias
    ADD CONSTRAINT cliente_obligaciones_tributarias_pkey PRIMARY KEY (id);


--
-- Name: cliente_obligaciones_tributarias cliente_obligaciones_tributarias_uniq; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.cliente_obligaciones_tributarias
    ADD CONSTRAINT cliente_obligaciones_tributarias_uniq UNIQUE (cliente_perfil_id, obligacion_catalogo_id);


--
-- Name: cliente_perfil_tributario cliente_perfil_tributario_empresa_cliente_unique; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.cliente_perfil_tributario
    ADD CONSTRAINT cliente_perfil_tributario_empresa_cliente_unique UNIQUE (empresa_id, cliente_id);


--
-- Name: cliente_perfil_tributario cliente_perfil_tributario_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.cliente_perfil_tributario
    ADD CONSTRAINT cliente_perfil_tributario_pkey PRIMARY KEY (id);


--
-- Name: cliente_tipos_servicio_catalogo cliente_tipos_servicio_catalogo_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.cliente_tipos_servicio_catalogo
    ADD CONSTRAINT cliente_tipos_servicio_catalogo_pkey PRIMARY KEY (id);


--
-- Name: clientes clientes_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.clientes
    ADD CONSTRAINT clientes_pkey PRIMARY KEY (id);


--
-- Name: comision_ajustes comision_ajustes_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.comision_ajustes
    ADD CONSTRAINT comision_ajustes_pkey PRIMARY KEY (id);


--
-- Name: comision_equipo_miembros comision_equipo_miembros_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.comision_equipo_miembros
    ADD CONSTRAINT comision_equipo_miembros_pkey PRIMARY KEY (id);


--
-- Name: comision_equipos comision_equipos_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.comision_equipos
    ADD CONSTRAINT comision_equipos_pkey PRIMARY KEY (id);


--
-- Name: comision_escalas comision_escalas_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.comision_escalas
    ADD CONSTRAINT comision_escalas_pkey PRIMARY KEY (id);


--
-- Name: comision_lineas comision_lineas_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.comision_lineas
    ADD CONSTRAINT comision_lineas_pkey PRIMARY KEY (id);


--
-- Name: comision_periodos comision_periodos_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.comision_periodos
    ADD CONSTRAINT comision_periodos_pkey PRIMARY KEY (id);


--
-- Name: comision_politica_versiones comision_politica_versiones_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.comision_politica_versiones
    ADD CONSTRAINT comision_politica_versiones_pkey PRIMARY KEY (id);


--
-- Name: comision_politicas comision_politicas_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.comision_politicas
    ADD CONSTRAINT comision_politicas_pkey PRIMARY KEY (id);


--
-- Name: compras compras_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.compras
    ADD CONSTRAINT compras_pkey PRIMARY KEY (id);


--
-- Name: cotizaciones_dolar cotizaciones_dolar_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.cotizaciones_dolar
    ADD CONSTRAINT cotizaciones_dolar_pkey PRIMARY KEY (id);


--
-- Name: crm_etapas crm_etapas_empresa_id_codigo_key; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.crm_etapas
    ADD CONSTRAINT crm_etapas_empresa_id_codigo_key UNIQUE (empresa_id, codigo);


--
-- Name: crm_etapas crm_etapas_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.crm_etapas
    ADD CONSTRAINT crm_etapas_pkey PRIMARY KEY (id);


--
-- Name: crm_notas crm_notas_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.crm_notas
    ADD CONSTRAINT crm_notas_pkey PRIMARY KEY (id);


--
-- Name: crm_prospectos crm_prospectos_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.crm_prospectos
    ADD CONSTRAINT crm_prospectos_pkey PRIMARY KEY (id);


--
-- Name: dashboard_views dashboard_views_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.dashboard_views
    ADD CONSTRAINT dashboard_views_pkey PRIMARY KEY (id);


--
-- Name: dashboard_views dashboard_views_slug_key; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.dashboard_views
    ADD CONSTRAINT dashboard_views_slug_key UNIQUE (slug);


--
-- Name: empresa_autoimpresor_config empresa_autoimpresor_config_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.empresa_autoimpresor_config
    ADD CONSTRAINT empresa_autoimpresor_config_pkey PRIMARY KEY (empresa_id);


--
-- Name: empresa_dashboard_views empresa_dashboard_views_empresa_id_dashboard_view_id_key; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.empresa_dashboard_views
    ADD CONSTRAINT empresa_dashboard_views_empresa_id_dashboard_view_id_key UNIQUE (empresa_id, dashboard_view_id);


--
-- Name: empresa_dashboard_views empresa_dashboard_views_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.empresa_dashboard_views
    ADD CONSTRAINT empresa_dashboard_views_pkey PRIMARY KEY (id);


--
-- Name: empresa_facturacion_modo empresa_facturacion_modo_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.empresa_facturacion_modo
    ADD CONSTRAINT empresa_facturacion_modo_pkey PRIMARY KEY (empresa_id);


--
-- Name: empresa_modulos empresa_modulos_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.empresa_modulos
    ADD CONSTRAINT empresa_modulos_pkey PRIMARY KEY (id);


--
-- Name: empresa_sifen_config empresa_sifen_config_empresa_id_key; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.empresa_sifen_config
    ADD CONSTRAINT empresa_sifen_config_empresa_id_key UNIQUE (empresa_id);


--
-- Name: empresa_sifen_config empresa_sifen_config_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.empresa_sifen_config
    ADD CONSTRAINT empresa_sifen_config_pkey PRIMARY KEY (id);


--
-- Name: empresas empresas_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.empresas
    ADD CONSTRAINT empresas_pkey PRIMARY KEY (id);


--
-- Name: factura_correlativos factura_correlativos_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.factura_correlativos
    ADD CONSTRAINT factura_correlativos_pkey PRIMARY KEY (empresa_id);


--
-- Name: factura_electronica_evento factura_electronica_evento_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.factura_electronica_evento
    ADD CONSTRAINT factura_electronica_evento_pkey PRIMARY KEY (id);


--
-- Name: factura_electronica factura_electronica_factura_id_key; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.factura_electronica
    ADD CONSTRAINT factura_electronica_factura_id_key UNIQUE (factura_id);


--
-- Name: factura_electronica factura_electronica_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.factura_electronica
    ADD CONSTRAINT factura_electronica_pkey PRIMARY KEY (id);


--
-- Name: factura_items factura_items_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.factura_items
    ADD CONSTRAINT factura_items_pkey PRIMARY KEY (id);


--
-- Name: facturas facturas_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.facturas
    ADD CONSTRAINT facturas_pkey PRIMARY KEY (id);


--
-- Name: familias_olfativas familias_olfativas_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.familias_olfativas
    ADD CONSTRAINT familias_olfativas_pkey PRIMARY KEY (id);


--
-- Name: gastos gastos_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.gastos
    ADD CONSTRAINT gastos_pkey PRIMARY KEY (id);


--
-- Name: imports_audit imports_audit_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.imports_audit
    ADD CONSTRAINT imports_audit_pkey PRIMARY KEY (id);


--
-- Name: inventario_stock_ubicacion inventario_stock_ubicacion_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.inventario_stock_ubicacion
    ADD CONSTRAINT inventario_stock_ubicacion_pkey PRIMARY KEY (id);


--
-- Name: inventario_ubicaciones inventario_ubicaciones_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.inventario_ubicaciones
    ADD CONSTRAINT inventario_ubicaciones_pkey PRIMARY KEY (id);


--
-- Name: marca_categorias marca_categorias_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.marca_categorias
    ADD CONSTRAINT marca_categorias_pkey PRIMARY KEY (id);


--
-- Name: marca_categorias marca_categorias_unica; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.marca_categorias
    ADD CONSTRAINT marca_categorias_unica UNIQUE (empresa_id, marca_id, categoria_id);


--
-- Name: marcas marcas_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.marcas
    ADD CONSTRAINT marcas_pkey PRIMARY KEY (id);


--
-- Name: marcas marcas_slug_web_unico_por_empresa; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.marcas
    ADD CONSTRAINT marcas_slug_web_unico_por_empresa UNIQUE (empresa_id, slug_web);


--
-- Name: marketing_calendarios marketing_calendarios_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.marketing_calendarios
    ADD CONSTRAINT marketing_calendarios_pkey PRIMARY KEY (id);


--
-- Name: marketing_comentarios marketing_comentarios_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.marketing_comentarios
    ADD CONSTRAINT marketing_comentarios_pkey PRIMARY KEY (id);


--
-- Name: marketing_historial_estados marketing_historial_estados_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.marketing_historial_estados
    ADD CONSTRAINT marketing_historial_estados_pkey PRIMARY KEY (id);


--
-- Name: marketing_piezas marketing_piezas_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.marketing_piezas
    ADD CONSTRAINT marketing_piezas_pkey PRIMARY KEY (id);


--
-- Name: marketing_tasks marketing_tasks_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.marketing_tasks
    ADD CONSTRAINT marketing_tasks_pkey PRIMARY KEY (id);


--
-- Name: modulos modulos_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.modulos
    ADD CONSTRAINT modulos_pkey PRIMARY KEY (id);


--
-- Name: movimientos_inventario movimientos_inventario_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.movimientos_inventario
    ADD CONSTRAINT movimientos_inventario_pkey PRIMARY KEY (id);


--
-- Name: nota_credito_electronica nota_credito_electronica_nota_credito_id_key; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.nota_credito_electronica
    ADD CONSTRAINT nota_credito_electronica_nota_credito_id_key UNIQUE (nota_credito_id);


--
-- Name: nota_credito_electronica nota_credito_electronica_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.nota_credito_electronica
    ADD CONSTRAINT nota_credito_electronica_pkey PRIMARY KEY (id);


--
-- Name: nota_credito_evento nota_credito_evento_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.nota_credito_evento
    ADD CONSTRAINT nota_credito_evento_pkey PRIMARY KEY (id);


--
-- Name: nota_credito nota_credito_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.nota_credito
    ADD CONSTRAINT nota_credito_pkey PRIMARY KEY (id);


--
-- Name: notas_olfativas notas_olfativas_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.notas_olfativas
    ADD CONSTRAINT notas_olfativas_pkey PRIMARY KEY (id);


--
-- Name: obligaciones_tributarias_catalogo obligaciones_tributarias_catalogo_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.obligaciones_tributarias_catalogo
    ADD CONSTRAINT obligaciones_tributarias_catalogo_pkey PRIMARY KEY (id);


--
-- Name: obligaciones_tributarias_catalogo obligaciones_tributarias_catalogo_slug_key; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.obligaciones_tributarias_catalogo
    ADD CONSTRAINT obligaciones_tributarias_catalogo_slug_key UNIQUE (slug);


--
-- Name: omnichannel_routes omnichannel_routes_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.omnichannel_routes
    ADD CONSTRAINT omnichannel_routes_pkey PRIMARY KEY (meta_phone_number_id);


--
-- Name: pagos pagos_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.pagos
    ADD CONSTRAINT pagos_pkey PRIMARY KEY (id);


--
-- Name: pedidos_web_items pedidos_web_items_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.pedidos_web_items
    ADD CONSTRAINT pedidos_web_items_pkey PRIMARY KEY (id);


--
-- Name: pedidos_web pedidos_web_numero_unique; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.pedidos_web
    ADD CONSTRAINT pedidos_web_numero_unique UNIQUE (numero);


--
-- Name: pedidos_web pedidos_web_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.pedidos_web
    ADD CONSTRAINT pedidos_web_pkey PRIMARY KEY (id);


--
-- Name: pedidos_web_secuencia pedidos_web_secuencia_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.pedidos_web_secuencia
    ADD CONSTRAINT pedidos_web_secuencia_pkey PRIMARY KEY (empresa_id, fecha);


--
-- Name: pedidos_web pedidos_web_token_unique; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.pedidos_web
    ADD CONSTRAINT pedidos_web_token_unique UNIQUE (public_token);


--
-- Name: planes planes_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.planes
    ADD CONSTRAINT planes_pkey PRIMARY KEY (id);


--
-- Name: producto_acordes producto_acordes_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.producto_acordes
    ADD CONSTRAINT producto_acordes_pkey PRIMARY KEY (producto_id, acorde_id);


--
-- Name: producto_categorias producto_categorias_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.producto_categorias
    ADD CONSTRAINT producto_categorias_pkey PRIMARY KEY (id);


--
-- Name: producto_imagenes producto_imagenes_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.producto_imagenes
    ADD CONSTRAINT producto_imagenes_pkey PRIMARY KEY (id);


--
-- Name: producto_notas producto_notas_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.producto_notas
    ADD CONSTRAINT producto_notas_pkey PRIMARY KEY (producto_id, nota_id, posicion);


--
-- Name: producto_presentaciones producto_presentaciones_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.producto_presentaciones
    ADD CONSTRAINT producto_presentaciones_pkey PRIMARY KEY (id);


--
-- Name: producto_presentaciones producto_presentaciones_sku_unico_por_empresa; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.producto_presentaciones
    ADD CONSTRAINT producto_presentaciones_sku_unico_por_empresa UNIQUE (empresa_id, sku);


--
-- Name: producto_presentaciones producto_presentaciones_volumen_unico_por_producto; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.producto_presentaciones
    ADD CONSTRAINT producto_presentaciones_volumen_unico_por_producto UNIQUE (producto_id, volumen_ml);


--
-- Name: productos_codigo_secuencia productos_codigo_secuencia_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.productos_codigo_secuencia
    ADD CONSTRAINT productos_codigo_secuencia_pkey PRIMARY KEY (empresa_id);


--
-- Name: productos productos_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.productos
    ADD CONSTRAINT productos_pkey PRIMARY KEY (id);


--
-- Name: productos_sku_secuencia productos_sku_secuencia_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.productos_sku_secuencia
    ADD CONSTRAINT productos_sku_secuencia_pkey PRIMARY KEY (empresa_id, prefijo);


--
-- Name: proveedor_categoria_rel proveedor_categoria_rel_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proveedor_categoria_rel
    ADD CONSTRAINT proveedor_categoria_rel_pkey PRIMARY KEY (id);


--
-- Name: proveedor_categoria_rel proveedor_categoria_rel_uniq; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proveedor_categoria_rel
    ADD CONSTRAINT proveedor_categoria_rel_uniq UNIQUE (proveedor_id, categoria_id);


--
-- Name: proveedor_categorias proveedor_categorias_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proveedor_categorias
    ADD CONSTRAINT proveedor_categorias_pkey PRIMARY KEY (id);


--
-- Name: proveedor_productos proveedor_productos_empresa_producto_proveedor_uniq; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proveedor_productos
    ADD CONSTRAINT proveedor_productos_empresa_producto_proveedor_uniq UNIQUE (empresa_id, producto_id, proveedor_id);


--
-- Name: proveedor_productos proveedor_productos_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proveedor_productos
    ADD CONSTRAINT proveedor_productos_pkey PRIMARY KEY (id);


--
-- Name: proveedores proveedores_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proveedores
    ADD CONSTRAINT proveedores_pkey PRIMARY KEY (id);


--
-- Name: proyecto_archivos proyecto_archivos_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyecto_archivos
    ADD CONSTRAINT proyecto_archivos_pkey PRIMARY KEY (id);


--
-- Name: proyecto_comentarios proyecto_comentarios_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyecto_comentarios
    ADD CONSTRAINT proyecto_comentarios_pkey PRIMARY KEY (id);


--
-- Name: proyecto_estado_historial proyecto_estado_historial_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyecto_estado_historial
    ADD CONSTRAINT proyecto_estado_historial_pkey PRIMARY KEY (id);


--
-- Name: proyecto_estados proyecto_estados_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyecto_estados
    ADD CONSTRAINT proyecto_estados_pkey PRIMARY KEY (id);


--
-- Name: proyecto_prioridades_config proyecto_prioridades_config_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyecto_prioridades_config
    ADD CONSTRAINT proyecto_prioridades_config_pkey PRIMARY KEY (id);


--
-- Name: proyecto_tareas proyecto_tareas_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyecto_tareas
    ADD CONSTRAINT proyecto_tareas_pkey PRIMARY KEY (id);


--
-- Name: proyecto_tipos proyecto_tipos_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyecto_tipos
    ADD CONSTRAINT proyecto_tipos_pkey PRIMARY KEY (id);


--
-- Name: proyectos proyectos_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyectos
    ADD CONSTRAINT proyectos_pkey PRIMARY KEY (id);


--
-- Name: resenas_videos resenas_videos_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.resenas_videos
    ADD CONSTRAINT resenas_videos_pkey PRIMARY KEY (id);


--
-- Name: sorteo_conversaciones sorteo_conversaciones_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.sorteo_conversaciones
    ADD CONSTRAINT sorteo_conversaciones_pkey PRIMARY KEY (id);


--
-- Name: sorteo_cupones sorteo_cupones_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.sorteo_cupones
    ADD CONSTRAINT sorteo_cupones_pkey PRIMARY KEY (id);


--
-- Name: sorteo_cupones sorteo_cupones_sorteo_id_numero_cupon_key; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.sorteo_cupones
    ADD CONSTRAINT sorteo_cupones_sorteo_id_numero_cupon_key UNIQUE (sorteo_id, numero_cupon);


--
-- Name: sorteo_entradas sorteo_entradas_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.sorteo_entradas
    ADD CONSTRAINT sorteo_entradas_pkey PRIMARY KEY (id);


--
-- Name: sorteo_revendedor_clicks sorteo_revendedor_clicks_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.sorteo_revendedor_clicks
    ADD CONSTRAINT sorteo_revendedor_clicks_pkey PRIMARY KEY (id);


--
-- Name: sorteo_revendedores sorteo_revendedores_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.sorteo_revendedores
    ADD CONSTRAINT sorteo_revendedores_pkey PRIMARY KEY (id);


--
-- Name: sorteo_ticket_deliveries sorteo_ticket_deliveries_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.sorteo_ticket_deliveries
    ADD CONSTRAINT sorteo_ticket_deliveries_pkey PRIMARY KEY (id);


--
-- Name: sorteos sorteos_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.sorteos
    ADD CONSTRAINT sorteos_pkey PRIMARY KEY (id);


--
-- Name: suscripciones suscripciones_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.suscripciones
    ADD CONSTRAINT suscripciones_pkey PRIMARY KEY (id);


--
-- Name: tipificaciones tipificaciones_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.tipificaciones
    ADD CONSTRAINT tipificaciones_pkey PRIMARY KEY (id);


--
-- Name: comision_equipo_miembros uq_comision_equipo_miembro; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.comision_equipo_miembros
    ADD CONSTRAINT uq_comision_equipo_miembro UNIQUE (equipo_id, usuario_id);


--
-- Name: comision_politica_versiones uq_comision_politica_version; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.comision_politica_versiones
    ADD CONSTRAINT uq_comision_politica_version UNIQUE (politica_id, version_no);


--
-- Name: comision_politicas uq_comision_politicas_empresa; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.comision_politicas
    ADD CONSTRAINT uq_comision_politicas_empresa UNIQUE (empresa_id);


--
-- Name: cliente_tipos_servicio_catalogo uq_cxtcat_empresa_slug; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.cliente_tipos_servicio_catalogo
    ADD CONSTRAINT uq_cxtcat_empresa_slug UNIQUE (empresa_id, slug);


--
-- Name: familias_olfativas uq_familias_olfativas_empresa_nombre; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.familias_olfativas
    ADD CONSTRAINT uq_familias_olfativas_empresa_nombre UNIQUE (empresa_id, nombre);


--
-- Name: notas_olfativas uq_notas_olfativas_empresa_nombre; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.notas_olfativas
    ADD CONSTRAINT uq_notas_olfativas_empresa_nombre UNIQUE (empresa_id, nombre);


--
-- Name: proyecto_archivos uq_proyecto_archivos_storage_natural; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyecto_archivos
    ADD CONSTRAINT uq_proyecto_archivos_storage_natural UNIQUE (empresa_id, storage_bucket, storage_path);


--
-- Name: proyecto_estados uq_proyecto_estados_empresa_codigo; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyecto_estados
    ADD CONSTRAINT uq_proyecto_estados_empresa_codigo UNIQUE (empresa_id, codigo);


--
-- Name: proyecto_prioridades_config uq_proyecto_prioridades_empresa_codigo; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyecto_prioridades_config
    ADD CONSTRAINT uq_proyecto_prioridades_empresa_codigo UNIQUE (empresa_id, codigo);


--
-- Name: proyecto_tipos uq_proyecto_tipos_empresa_codigo; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyecto_tipos
    ADD CONSTRAINT uq_proyecto_tipos_empresa_codigo UNIQUE (empresa_id, codigo);


--
-- Name: usuario_dashboard_views usuario_dashboard_views_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.usuario_dashboard_views
    ADD CONSTRAINT usuario_dashboard_views_pkey PRIMARY KEY (id);


--
-- Name: usuario_dashboard_views usuario_dashboard_views_usuario_id_dashboard_view_id_key; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.usuario_dashboard_views
    ADD CONSTRAINT usuario_dashboard_views_usuario_id_dashboard_view_id_key UNIQUE (usuario_id, dashboard_view_id);


--
-- Name: usuario_modulos usuario_modulos_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.usuario_modulos
    ADD CONSTRAINT usuario_modulos_pkey PRIMARY KEY (id);


--
-- Name: usuario_modulos usuario_modulos_usuario_id_modulo_id_key; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.usuario_modulos
    ADD CONSTRAINT usuario_modulos_usuario_id_modulo_id_key UNIQUE (usuario_id, modulo_id);


--
-- Name: usuarios usuarios_email_key; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.usuarios
    ADD CONSTRAINT usuarios_email_key UNIQUE (email);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: ventas_items ventas_items_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.ventas_items
    ADD CONSTRAINT ventas_items_pkey PRIMARY KEY (id);


--
-- Name: ventas ventas_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.ventas
    ADD CONSTRAINT ventas_pkey PRIMARY KEY (id);


--
-- Name: web_product_events web_product_events_pkey; Type: CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.web_product_events
    ADD CONSTRAINT web_product_events_pkey PRIMARY KEY (id);


--
-- Name: chat_channels_meta_phone_number_id_uidx; Type: INDEX; Schema: elevate; Owner: -
--

CREATE UNIQUE INDEX chat_channels_meta_phone_number_id_uidx ON joyeriaartesanos.chat_channels USING btree (meta_phone_number_id) WHERE ((meta_phone_number_id IS NOT NULL) AND (btrim(meta_phone_number_id) <> ''::text));


--
-- Name: empresas_data_schema_unique; Type: INDEX; Schema: elevate; Owner: -
--

CREATE UNIQUE INDEX empresas_data_schema_unique ON joyeriaartesanos.empresas USING btree (data_schema) WHERE (data_schema IS NOT NULL);


--
-- Name: gastos_empresa_fecha_idx; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX gastos_empresa_fecha_idx ON joyeriaartesanos.gastos USING btree (empresa_id, fecha);


--
-- Name: idx_acordes_empresa_orden; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_acordes_empresa_orden ON joyeriaartesanos.acordes_olfativos USING btree (empresa_id, orden_web, nombre) WHERE activo;


--
-- Name: idx_categorias_productos_activo; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_categorias_productos_activo ON joyeriaartesanos.categorias_productos USING btree (activo);


--
-- Name: idx_categorias_productos_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_categorias_productos_empresa ON joyeriaartesanos.categorias_productos USING btree (empresa_id);


--
-- Name: idx_categorias_productos_nombre; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_categorias_productos_nombre ON joyeriaartesanos.categorias_productos USING btree (nombre);


--
-- Name: idx_categorias_productos_parent; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_categorias_productos_parent ON joyeriaartesanos.categorias_productos USING btree (parent_id);


--
-- Name: idx_categorias_visible_web; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_categorias_visible_web ON joyeriaartesanos.categorias_productos USING btree (empresa_id, visible_web, activo, orden_web);


--
-- Name: idx_cfr_rules_empresa_flow; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_cfr_rules_empresa_flow ON joyeriaartesanos.chat_flow_recontact_rules USING btree (empresa_id, flow_code);


--
-- Name: idx_cfr_rules_flow_prio; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_cfr_rules_flow_prio ON joyeriaartesanos.chat_flow_recontact_rules USING btree (flow_code, prioridad);


--
-- Name: idx_cfr_runs_empresa_created; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_cfr_runs_empresa_created ON joyeriaartesanos.chat_flow_recontact_runs USING btree (empresa_id, created_at DESC);


--
-- Name: idx_cfr_runs_rule_created; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_cfr_runs_rule_created ON joyeriaartesanos.chat_flow_recontact_runs USING btree (rule_id, created_at DESC);


--
-- Name: idx_chat_agents_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_agents_empresa ON joyeriaartesanos.chat_agents USING btree (empresa_id);


--
-- Name: idx_chat_agents_online; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_agents_online ON joyeriaartesanos.chat_agents USING btree (queue_id, is_online) WHERE (is_online = true);


--
-- Name: idx_chat_agents_queue; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_agents_queue ON joyeriaartesanos.chat_agents USING btree (queue_id);


--
-- Name: idx_chat_campaign_events_e_c_cr; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_campaign_events_e_c_cr ON joyeriaartesanos.chat_campaign_events USING btree (empresa_id, campaign_id, created_at DESC);


--
-- Name: idx_chat_campaign_events_rec; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_campaign_events_rec ON joyeriaartesanos.chat_campaign_events USING btree (recipient_id);


--
-- Name: idx_chat_campaign_jobs_c; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_campaign_jobs_c ON joyeriaartesanos.chat_campaign_jobs USING btree (campaign_id);


--
-- Name: idx_chat_campaign_jobs_e_st; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_campaign_jobs_e_st ON joyeriaartesanos.chat_campaign_jobs USING btree (empresa_id, status, created_at);


--
-- Name: idx_chat_campaign_recipients_conv; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_campaign_recipients_conv ON joyeriaartesanos.chat_campaign_recipients USING btree (conversation_id);


--
-- Name: idx_chat_campaign_recipients_e_c_st; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_campaign_recipients_e_c_st ON joyeriaartesanos.chat_campaign_recipients USING btree (empresa_id, campaign_id, status);


--
-- Name: idx_chat_campaign_recipients_wamid; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_campaign_recipients_wamid ON joyeriaartesanos.chat_campaign_recipients USING btree (provider_message_id);


--
-- Name: idx_chat_campaign_templates_ch_st; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_campaign_templates_ch_st ON joyeriaartesanos.chat_campaign_templates USING btree (empresa_id, channel_id, status);


--
-- Name: idx_chat_campaigns_e_ch; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_campaigns_e_ch ON joyeriaartesanos.chat_campaigns USING btree (empresa_id, channel_id);


--
-- Name: idx_chat_campaigns_e_q; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_campaigns_e_q ON joyeriaartesanos.chat_campaigns USING btree (empresa_id, queue_id);


--
-- Name: idx_chat_campaigns_e_st_cr; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_campaigns_e_st_cr ON joyeriaartesanos.chat_campaigns USING btree (empresa_id, status, created_at DESC);


--
-- Name: idx_chat_channel_quick_replies_ch; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_channel_quick_replies_ch ON joyeriaartesanos.chat_channel_quick_replies USING btree (channel_id, sort_order);


--
-- Name: idx_chat_channel_quick_replies_e; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_channel_quick_replies_e ON joyeriaartesanos.chat_channel_quick_replies USING btree (empresa_id);


--
-- Name: idx_chat_channels_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_channels_empresa ON joyeriaartesanos.chat_channels USING btree (empresa_id);


--
-- Name: idx_chat_channels_empresa_activo; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_channels_empresa_activo ON joyeriaartesanos.chat_channels USING btree (empresa_id, activo) WHERE (activo = true);


--
-- Name: idx_chat_closure_states_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_closure_states_empresa ON joyeriaartesanos.chat_queue_closure_states USING btree (empresa_id);


--
-- Name: idx_chat_closure_states_queue; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_closure_states_queue ON joyeriaartesanos.chat_queue_closure_states USING btree (queue_id, sort_order);


--
-- Name: idx_chat_closure_substates_state; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_closure_substates_state ON joyeriaartesanos.chat_queue_closure_substates USING btree (closure_state_id, sort_order);


--
-- Name: idx_chat_comp_val_conversation; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_comp_val_conversation ON joyeriaartesanos.chat_comprobante_validaciones USING btree (conversation_id, created_at DESC);


--
-- Name: idx_chat_comp_val_empresa_hash; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_comp_val_empresa_hash ON joyeriaartesanos.chat_comprobante_validaciones USING btree (empresa_id, comprobante_hash);


--
-- Name: idx_chat_comp_val_empresa_ocr_fp; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_comp_val_empresa_ocr_fp ON joyeriaartesanos.chat_comprobante_validaciones USING btree (empresa_id, ocr_fingerprint) WHERE ((ocr_fingerprint IS NOT NULL) AND (length(TRIM(BOTH FROM ocr_fingerprint)) > 0));


--
-- Name: idx_chat_comp_val_entrada; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_comp_val_entrada ON joyeriaartesanos.chat_comprobante_validaciones USING btree (sorteo_entrada_id) WHERE (sorteo_entrada_id IS NOT NULL);


--
-- Name: idx_chat_comp_val_flow_session; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_comp_val_flow_session ON joyeriaartesanos.chat_comprobante_validaciones USING btree (flow_session_id);


--
-- Name: idx_chat_contacts_cliente; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_contacts_cliente ON joyeriaartesanos.chat_contacts USING btree (cliente_id);


--
-- Name: idx_chat_contacts_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_contacts_empresa ON joyeriaartesanos.chat_contacts USING btree (empresa_id);


--
-- Name: idx_chat_contacts_empresa_name_lower; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_contacts_empresa_name_lower ON joyeriaartesanos.chat_contacts USING btree (empresa_id, lower(name));


--
-- Name: idx_chat_contacts_empresa_phone_normalized; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_contacts_empresa_phone_normalized ON joyeriaartesanos.chat_contacts USING btree (empresa_id, phone_normalized);


--
-- Name: idx_chat_contacts_prospecto; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_contacts_prospecto ON joyeriaartesanos.chat_contacts USING btree (crm_prospecto_id);


--
-- Name: idx_chat_conv_emp_unassigned_recent; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_conv_emp_unassigned_recent ON joyeriaartesanos.chat_conversations USING btree (empresa_id, last_message_at DESC NULLS LAST) WHERE ((assigned_agent_id IS NULL) AND (status = ANY (ARRAY['open'::text, 'pending'::text])));


--
-- Name: idx_chat_conv_empresa_last; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_conv_empresa_last ON joyeriaartesanos.chat_conversations USING btree (empresa_id, last_message_at DESC NULLS LAST);


--
-- Name: idx_chat_conversation_closures_agent; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_conversation_closures_agent ON joyeriaartesanos.chat_conversation_closures USING btree (empresa_id, closed_by_usuario_id, closed_at DESC);


--
-- Name: idx_chat_conversation_closures_conv; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_conversation_closures_conv ON joyeriaartesanos.chat_conversation_closures USING btree (conversation_id);


--
-- Name: idx_chat_conversation_closures_empresa_closed; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_conversation_closures_empresa_closed ON joyeriaartesanos.chat_conversation_closures USING btree (empresa_id, closed_at DESC);


--
-- Name: idx_chat_conversation_closures_labels; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_conversation_closures_labels ON joyeriaartesanos.chat_conversation_closures USING btree (empresa_id, closure_state_label, closure_substate_label);


--
-- Name: idx_chat_conversation_closures_queue; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_conversation_closures_queue ON joyeriaartesanos.chat_conversation_closures USING btree (empresa_id, queue_id, closed_at DESC);


--
-- Name: idx_chat_conversations_active_flow_session; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_conversations_active_flow_session ON joyeriaartesanos.chat_conversations USING btree (active_flow_session_id);


--
-- Name: idx_chat_conversations_assigned_agent; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_conversations_assigned_agent ON joyeriaartesanos.chat_conversations USING btree (assigned_agent_id) WHERE (assigned_agent_id IS NOT NULL);


--
-- Name: idx_chat_conversations_first_revendedor; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_conversations_first_revendedor ON joyeriaartesanos.chat_conversations USING btree (first_revendedor_id) WHERE (first_revendedor_id IS NOT NULL);


--
-- Name: idx_chat_conversations_queue; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_conversations_queue ON joyeriaartesanos.chat_conversations USING btree (queue_id) WHERE (queue_id IS NOT NULL);


--
-- Name: idx_chat_empresa_operator_roles_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_empresa_operator_roles_empresa ON joyeriaartesanos.chat_empresa_operator_roles USING btree (empresa_id);


--
-- Name: idx_chat_flow_data_empresa_conversation; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_flow_data_empresa_conversation ON joyeriaartesanos.chat_flow_data USING btree (empresa_id, conversation_id);


--
-- Name: idx_chat_flow_data_flow_session; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_flow_data_flow_session ON joyeriaartesanos.chat_flow_data USING btree (flow_session_id);


--
-- Name: idx_chat_flow_events_conv_created_desc; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_flow_events_conv_created_desc ON joyeriaartesanos.chat_flow_events USING btree (conversation_id, created_at DESC);


--
-- Name: idx_chat_flow_events_session_created; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_flow_events_session_created ON joyeriaartesanos.chat_flow_events USING btree (flow_session_id, created_at);


--
-- Name: idx_chat_flow_node_blocks_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_flow_node_blocks_empresa ON joyeriaartesanos.chat_flow_node_blocks USING btree (empresa_id, created_at DESC);


--
-- Name: idx_chat_flow_node_blocks_node_order; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_flow_node_blocks_node_order ON joyeriaartesanos.chat_flow_node_blocks USING btree (node_id, sort_order, created_at);


--
-- Name: idx_chat_flow_nodes_empresa_flow; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_flow_nodes_empresa_flow ON joyeriaartesanos.chat_flow_nodes USING btree (empresa_id, flow_code);


--
-- Name: idx_chat_flow_nodes_empresa_flow_sort; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_flow_nodes_empresa_flow_sort ON joyeriaartesanos.chat_flow_nodes USING btree (empresa_id, flow_code, sort_order);


--
-- Name: idx_chat_flow_options_node_sort; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_flow_options_node_sort ON joyeriaartesanos.chat_flow_options USING btree (node_id, sort_order);


--
-- Name: idx_chat_flow_sessions_conversation; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_flow_sessions_conversation ON joyeriaartesanos.chat_flow_sessions USING btree (conversation_id, flow_code, status);


--
-- Name: idx_chat_flow_sessions_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_flow_sessions_empresa ON joyeriaartesanos.chat_flow_sessions USING btree (empresa_id);


--
-- Name: idx_chat_flow_sessions_revendedor; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_flow_sessions_revendedor ON joyeriaartesanos.chat_flow_sessions USING btree (revendedor_id) WHERE (revendedor_id IS NOT NULL);


--
-- Name: idx_chat_flows_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_flows_empresa ON joyeriaartesanos.chat_flows USING btree (empresa_id);


--
-- Name: idx_chat_flows_sorteo; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_flows_sorteo ON joyeriaartesanos.chat_flows USING btree (sorteo_id) WHERE (sorteo_id IS NOT NULL);


--
-- Name: idx_chat_messages_empresa_created_at; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_messages_empresa_created_at ON joyeriaartesanos.chat_messages USING btree (empresa_id, created_at DESC);


--
-- Name: idx_chat_messages_sender_type; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_messages_sender_type ON joyeriaartesanos.chat_messages USING btree (sender_type);


--
-- Name: idx_chat_msg_conv; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_msg_conv ON joyeriaartesanos.chat_messages USING btree (conversation_id, created_at);


--
-- Name: idx_chat_msg_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_msg_empresa ON joyeriaartesanos.chat_messages USING btree (empresa_id);


--
-- Name: idx_chat_omn_sched_activo; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_omn_sched_activo ON joyeriaartesanos.chat_omnicanal_work_schedules USING btree (empresa_id, is_active);


--
-- Name: idx_chat_omn_sched_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_omn_sched_empresa ON joyeriaartesanos.chat_omnicanal_work_schedules USING btree (empresa_id);


--
-- Name: idx_chat_queue_channels_channel; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_queue_channels_channel ON joyeriaartesanos.chat_queue_channels USING btree (channel_id);


--
-- Name: idx_chat_queue_channels_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_queue_channels_empresa ON joyeriaartesanos.chat_queue_channels USING btree (empresa_id);


--
-- Name: idx_chat_queue_channels_queue; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_queue_channels_queue ON joyeriaartesanos.chat_queue_channels USING btree (queue_id);


--
-- Name: idx_chat_queue_supervisors_empresa_usuario; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_queue_supervisors_empresa_usuario ON joyeriaartesanos.chat_queue_supervisors USING btree (empresa_id, usuario_id);


--
-- Name: idx_chat_queues_empresa_active; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_queues_empresa_active ON joyeriaartesanos.chat_queues USING btree (empresa_id, is_active) WHERE (is_active = true);


--
-- Name: idx_chat_supervisor_agents_supervisor; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_supervisor_agents_supervisor ON joyeriaartesanos.chat_supervisor_agents USING btree (empresa_id, supervisor_usuario_id);


--
-- Name: idx_chat_usuario_omnicanal_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_usuario_omnicanal_empresa ON joyeriaartesanos.chat_usuario_omnicanal USING btree (empresa_id);


--
-- Name: idx_chat_usuario_omnicanal_usuario; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_chat_usuario_omnicanal_usuario ON joyeriaartesanos.chat_usuario_omnicanal USING btree (usuario_id);


--
-- Name: idx_cliente_historial_cliente_at; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_cliente_historial_cliente_at ON joyeriaartesanos.cliente_historial USING btree (cliente_id, created_at DESC);


--
-- Name: idx_cliente_historial_empresa_at; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_cliente_historial_empresa_at ON joyeriaartesanos.cliente_historial USING btree (empresa_id, created_at DESC);


--
-- Name: idx_cliente_obligaciones_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_cliente_obligaciones_empresa ON joyeriaartesanos.cliente_obligaciones_tributarias USING btree (empresa_id);


--
-- Name: idx_cliente_obligaciones_perfil; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_cliente_obligaciones_perfil ON joyeriaartesanos.cliente_obligaciones_tributarias USING btree (cliente_perfil_id);


--
-- Name: idx_cliente_perfil_tributario_cliente; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_cliente_perfil_tributario_cliente ON joyeriaartesanos.cliente_perfil_tributario USING btree (cliente_id);


--
-- Name: idx_cliente_perfil_tributario_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_cliente_perfil_tributario_empresa ON joyeriaartesanos.cliente_perfil_tributario USING btree (empresa_id);


--
-- Name: idx_clientes_baja_operativa_at; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_clientes_baja_operativa_at ON joyeriaartesanos.clientes USING btree (baja_operativa_at) WHERE (baja_operativa_at IS NOT NULL);


--
-- Name: idx_clientes_created_by; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_clientes_created_by ON joyeriaartesanos.clientes USING btree (created_by_user_id);


--
-- Name: idx_clientes_deleted_at; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_clientes_deleted_at ON joyeriaartesanos.clientes USING btree (deleted_at) WHERE (deleted_at IS NOT NULL);


--
-- Name: idx_clientes_tipo_servicio; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_clientes_tipo_servicio ON joyeriaartesanos.clientes USING btree (tipo_servicio_cliente) WHERE (tipo_servicio_cliente IS NOT NULL);


--
-- Name: idx_compras_created_by; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_compras_created_by ON joyeriaartesanos.compras USING btree (created_by);


--
-- Name: idx_compras_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_compras_empresa ON joyeriaartesanos.compras USING btree (empresa_id);


--
-- Name: idx_compras_empresa_fecha; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_compras_empresa_fecha ON joyeriaartesanos.compras USING btree (empresa_id, fecha DESC);


--
-- Name: idx_compras_fecha; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_compras_fecha ON joyeriaartesanos.compras USING btree (fecha);


--
-- Name: idx_compras_producto; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_compras_producto ON joyeriaartesanos.compras USING btree (producto_id);


--
-- Name: idx_compras_proveedor; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_compras_proveedor ON joyeriaartesanos.compras USING btree (proveedor_id);


--
-- Name: idx_cotizaciones_dolar_empresa_vigente; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_cotizaciones_dolar_empresa_vigente ON joyeriaartesanos.cotizaciones_dolar USING btree (empresa_id, vigente_desde DESC);


--
-- Name: idx_cre_conv; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_cre_conv ON joyeriaartesanos.chat_routing_events USING btree (conversation_id, created_at DESC);


--
-- Name: idx_cre_emp; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_cre_emp ON joyeriaartesanos.chat_routing_events USING btree (empresa_id, created_at DESC);


--
-- Name: idx_crm_etapas_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_crm_etapas_empresa ON joyeriaartesanos.crm_etapas USING btree (empresa_id);


--
-- Name: idx_crm_etapas_empresa_orden; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_crm_etapas_empresa_orden ON joyeriaartesanos.crm_etapas USING btree (empresa_id, orden);


--
-- Name: idx_crm_notas_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_crm_notas_empresa ON joyeriaartesanos.crm_notas USING btree (empresa_id);


--
-- Name: idx_crm_notas_prospecto; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_crm_notas_prospecto ON joyeriaartesanos.crm_notas USING btree (prospecto_id);


--
-- Name: idx_crm_prospectos_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_crm_prospectos_empresa ON joyeriaartesanos.crm_prospectos USING btree (empresa_id);


--
-- Name: idx_crm_prospectos_empresa_origen; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_crm_prospectos_empresa_origen ON joyeriaartesanos.crm_prospectos USING btree (empresa_id, origen_creacion);


--
-- Name: idx_crm_prospectos_etapa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_crm_prospectos_etapa ON joyeriaartesanos.crm_prospectos USING btree (etapa);


--
-- Name: idx_dashboard_views_activo; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_dashboard_views_activo ON joyeriaartesanos.dashboard_views USING btree (activo);


--
-- Name: idx_edv_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_edv_empresa ON joyeriaartesanos.empresa_dashboard_views USING btree (empresa_id);


--
-- Name: idx_edv_view; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_edv_view ON joyeriaartesanos.empresa_dashboard_views USING btree (dashboard_view_id);


--
-- Name: idx_factura_electronica_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_factura_electronica_empresa ON joyeriaartesanos.factura_electronica USING btree (empresa_id);


--
-- Name: idx_factura_electronica_empresa_estado; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_factura_electronica_empresa_estado ON joyeriaartesanos.factura_electronica USING btree (empresa_id, estado_sifen);


--
-- Name: idx_factura_electronica_evento_de; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_factura_electronica_evento_de ON joyeriaartesanos.factura_electronica_evento USING btree (factura_electronica_id);


--
-- Name: idx_factura_electronica_evento_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_factura_electronica_evento_empresa ON joyeriaartesanos.factura_electronica_evento USING btree (empresa_id);


--
-- Name: idx_factura_electronica_evento_empresa_created; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_factura_electronica_evento_empresa_created ON joyeriaartesanos.factura_electronica_evento USING btree (empresa_id, created_at DESC);


--
-- Name: idx_factura_electronica_factura; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_factura_electronica_factura ON joyeriaartesanos.factura_electronica USING btree (factura_id);


--
-- Name: idx_factura_items_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_factura_items_empresa ON joyeriaartesanos.factura_items USING btree (empresa_id);


--
-- Name: idx_factura_items_factura; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_factura_items_factura ON joyeriaartesanos.factura_items USING btree (factura_id);


--
-- Name: idx_facturas_cliente; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_facturas_cliente ON joyeriaartesanos.facturas USING btree (cliente_id);


--
-- Name: idx_facturas_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_facturas_empresa ON joyeriaartesanos.facturas USING btree (empresa_id);


--
-- Name: idx_facturas_fecha; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_facturas_fecha ON joyeriaartesanos.facturas USING btree (fecha);


--
-- Name: idx_facturas_suscripcion; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_facturas_suscripcion ON joyeriaartesanos.facturas USING btree (suscripcion_id);


--
-- Name: idx_familias_olfativas_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_familias_olfativas_empresa ON joyeriaartesanos.familias_olfativas USING btree (empresa_id);


--
-- Name: idx_imports_audit_empresa_fecha; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_imports_audit_empresa_fecha ON joyeriaartesanos.imports_audit USING btree (empresa_id, created_at DESC);


--
-- Name: idx_imports_audit_entidad; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_imports_audit_entidad ON joyeriaartesanos.imports_audit USING btree (entidad);


--
-- Name: idx_marca_categorias_categoria; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_marca_categorias_categoria ON joyeriaartesanos.marca_categorias USING btree (categoria_id, orden);


--
-- Name: idx_marca_categorias_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_marca_categorias_empresa ON joyeriaartesanos.marca_categorias USING btree (empresa_id);


--
-- Name: idx_marca_categorias_marca; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_marca_categorias_marca ON joyeriaartesanos.marca_categorias USING btree (marca_id);


--
-- Name: idx_marcas_empresa_orden; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_marcas_empresa_orden ON joyeriaartesanos.marcas USING btree (empresa_id, orden_web, nombre) WHERE activo;


--
-- Name: idx_marketing_tasks_cliente; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_marketing_tasks_cliente ON joyeriaartesanos.marketing_tasks USING btree (cliente_id);


--
-- Name: idx_marketing_tasks_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_marketing_tasks_empresa ON joyeriaartesanos.marketing_tasks USING btree (empresa_id);


--
-- Name: idx_marketing_tasks_estado; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_marketing_tasks_estado ON joyeriaartesanos.marketing_tasks USING btree (estado);


--
-- Name: idx_marketing_tasks_fecha; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_marketing_tasks_fecha ON joyeriaartesanos.marketing_tasks USING btree (fecha_entrega);


--
-- Name: idx_marketing_tasks_plan; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_marketing_tasks_plan ON joyeriaartesanos.marketing_tasks USING btree (plan_id);


--
-- Name: idx_marketing_tasks_suscripcion; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_marketing_tasks_suscripcion ON joyeriaartesanos.marketing_tasks USING btree (suscripcion_id);


--
-- Name: idx_movimientos_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_movimientos_empresa ON joyeriaartesanos.movimientos_inventario USING btree (empresa_id);


--
-- Name: idx_movimientos_fecha; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_movimientos_fecha ON joyeriaartesanos.movimientos_inventario USING btree (fecha);


--
-- Name: idx_movimientos_inventario_created_by; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_movimientos_inventario_created_by ON joyeriaartesanos.movimientos_inventario USING btree (created_by);


--
-- Name: idx_movimientos_producto; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_movimientos_producto ON joyeriaartesanos.movimientos_inventario USING btree (producto_id);


--
-- Name: idx_movimientos_venta; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_movimientos_venta ON joyeriaartesanos.movimientos_inventario USING btree (venta_id);


--
-- Name: idx_nota_credito_electronica_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_nota_credito_electronica_empresa ON joyeriaartesanos.nota_credito_electronica USING btree (empresa_id);


--
-- Name: idx_nota_credito_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_nota_credito_empresa ON joyeriaartesanos.nota_credito USING btree (empresa_id);


--
-- Name: idx_nota_credito_empresa_created; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_nota_credito_empresa_created ON joyeriaartesanos.nota_credito USING btree (empresa_id, created_at DESC);


--
-- Name: idx_nota_credito_evento_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_nota_credito_evento_empresa ON joyeriaartesanos.nota_credito_evento USING btree (empresa_id);


--
-- Name: idx_nota_credito_evento_nc; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_nota_credito_evento_nc ON joyeriaartesanos.nota_credito_evento USING btree (nota_credito_id, created_at DESC);


--
-- Name: idx_nota_credito_factura; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_nota_credito_factura ON joyeriaartesanos.nota_credito USING btree (factura_id);


--
-- Name: idx_notas_olfativas_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_notas_olfativas_empresa ON joyeriaartesanos.notas_olfativas USING btree (empresa_id);


--
-- Name: idx_notas_olfativas_familia; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_notas_olfativas_familia ON joyeriaartesanos.notas_olfativas USING btree (familia_id);


--
-- Name: idx_omnichannel_routes_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_omnichannel_routes_empresa ON joyeriaartesanos.omnichannel_routes USING btree (empresa_id);


--
-- Name: idx_pagos_cliente; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_pagos_cliente ON joyeriaartesanos.pagos USING btree (cliente_id);


--
-- Name: idx_pagos_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_pagos_empresa ON joyeriaartesanos.pagos USING btree (empresa_id);


--
-- Name: idx_pagos_factura; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_pagos_factura ON joyeriaartesanos.pagos USING btree (factura_id);


--
-- Name: idx_pagos_fecha; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_pagos_fecha ON joyeriaartesanos.pagos USING btree (fecha_pago);


--
-- Name: idx_pagos_usuario; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_pagos_usuario ON joyeriaartesanos.pagos USING btree (usuario_id);


--
-- Name: idx_pedidos_web_empresa_created; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_pedidos_web_empresa_created ON joyeriaartesanos.pedidos_web USING btree (empresa_id, created_at DESC);


--
-- Name: idx_pedidos_web_empresa_estado; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_pedidos_web_empresa_estado ON joyeriaartesanos.pedidos_web USING btree (empresa_id, estado);


--
-- Name: idx_pedidos_web_items_pedido; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_pedidos_web_items_pedido ON joyeriaartesanos.pedidos_web_items USING btree (pedido_id);


--
-- Name: idx_pedidos_web_items_presentacion; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_pedidos_web_items_presentacion ON joyeriaartesanos.pedidos_web_items USING btree (presentacion_id) WHERE (presentacion_id IS NOT NULL);


--
-- Name: idx_planes_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_planes_empresa ON joyeriaartesanos.planes USING btree (empresa_id);


--
-- Name: idx_producto_acordes_acorde; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_producto_acordes_acorde ON joyeriaartesanos.producto_acordes USING btree (acorde_id);


--
-- Name: idx_producto_acordes_producto; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_producto_acordes_producto ON joyeriaartesanos.producto_acordes USING btree (producto_id, orden);


--
-- Name: idx_producto_categorias_categoria; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_producto_categorias_categoria ON joyeriaartesanos.producto_categorias USING btree (categoria_id);


--
-- Name: idx_producto_categorias_producto; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_producto_categorias_producto ON joyeriaartesanos.producto_categorias USING btree (producto_id);


--
-- Name: idx_producto_imagenes_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_producto_imagenes_empresa ON joyeriaartesanos.producto_imagenes USING btree (empresa_id);


--
-- Name: idx_producto_imagenes_producto_orden; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_producto_imagenes_producto_orden ON joyeriaartesanos.producto_imagenes USING btree (producto_id, orden);


--
-- Name: idx_producto_notas_nota; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_producto_notas_nota ON joyeriaartesanos.producto_notas USING btree (nota_id);


--
-- Name: idx_producto_notas_producto; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_producto_notas_producto ON joyeriaartesanos.producto_notas USING btree (producto_id);


--
-- Name: idx_producto_presentaciones_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_producto_presentaciones_empresa ON joyeriaartesanos.producto_presentaciones USING btree (empresa_id);


--
-- Name: idx_producto_presentaciones_producto; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_producto_presentaciones_producto ON joyeriaartesanos.producto_presentaciones USING btree (producto_id, orden, volumen_ml) WHERE activo;


--
-- Name: idx_productos_codigo_barras_trgm; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_productos_codigo_barras_trgm ON joyeriaartesanos.productos USING gin (codigo_barras extensions.gin_trgm_ops);


--
-- Name: idx_productos_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_productos_empresa ON joyeriaartesanos.productos USING btree (empresa_id);


--
-- Name: idx_productos_empresa_sku; Type: INDEX; Schema: elevate; Owner: -
--

CREATE UNIQUE INDEX idx_productos_empresa_sku ON joyeriaartesanos.productos USING btree (empresa_id, sku);


--
-- Name: idx_productos_es_decant; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_productos_es_decant ON joyeriaartesanos.productos USING btree (empresa_id) WHERE (es_decant = true);


--
-- Name: idx_productos_familia_olfativa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_productos_familia_olfativa ON joyeriaartesanos.productos USING btree (familia_olfativa_id);


--
-- Name: idx_productos_marca_id; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_productos_marca_id ON joyeriaartesanos.productos USING btree (marca_id) WHERE (marca_id IS NOT NULL);


--
-- Name: idx_productos_nombre_trgm; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_productos_nombre_trgm ON joyeriaartesanos.productos USING gin (nombre extensions.gin_trgm_ops);


--
-- Name: idx_productos_orden_web; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_productos_orden_web ON joyeriaartesanos.productos USING btree (orden_web, nombre);


--
-- Name: idx_productos_sku_trgm; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_productos_sku_trgm ON joyeriaartesanos.productos USING gin (sku extensions.gin_trgm_ops);


--
-- Name: idx_prov_cat_rel_categoria; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_prov_cat_rel_categoria ON joyeriaartesanos.proveedor_categoria_rel USING btree (categoria_id);


--
-- Name: idx_prov_cat_rel_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_prov_cat_rel_empresa ON joyeriaartesanos.proveedor_categoria_rel USING btree (empresa_id);


--
-- Name: idx_prov_cat_rel_proveedor; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_prov_cat_rel_proveedor ON joyeriaartesanos.proveedor_categoria_rel USING btree (proveedor_id);


--
-- Name: idx_proveedor_categorias_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_proveedor_categorias_empresa ON joyeriaartesanos.proveedor_categorias USING btree (empresa_id);


--
-- Name: idx_proveedor_productos_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_proveedor_productos_empresa ON joyeriaartesanos.proveedor_productos USING btree (empresa_id);


--
-- Name: idx_proveedor_productos_producto; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_proveedor_productos_producto ON joyeriaartesanos.proveedor_productos USING btree (producto_id);


--
-- Name: idx_proveedor_productos_proveedor; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_proveedor_productos_proveedor ON joyeriaartesanos.proveedor_productos USING btree (proveedor_id);


--
-- Name: idx_proveedores_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_proveedores_empresa ON joyeriaartesanos.proveedores USING btree (empresa_id);


--
-- Name: idx_resenas_videos_empresa_orden; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_resenas_videos_empresa_orden ON joyeriaartesanos.resenas_videos USING btree (empresa_id, orden, created_at);


--
-- Name: idx_resenas_videos_visible; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_resenas_videos_visible ON joyeriaartesanos.resenas_videos USING btree (empresa_id) WHERE ((activo = true) AND (visible_web = true));


--
-- Name: idx_sorteo_conv_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_sorteo_conv_empresa ON joyeriaartesanos.sorteo_conversaciones USING btree (empresa_id);


--
-- Name: idx_sorteo_conv_estado; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_sorteo_conv_estado ON joyeriaartesanos.sorteo_conversaciones USING btree (estado);


--
-- Name: idx_sorteo_conv_sorteo; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_sorteo_conv_sorteo ON joyeriaartesanos.sorteo_conversaciones USING btree (sorteo_id);


--
-- Name: idx_sorteo_conv_wa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_sorteo_conv_wa ON joyeriaartesanos.sorteo_conversaciones USING btree (whatsapp_numero);


--
-- Name: idx_sorteo_cup_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_sorteo_cup_empresa ON joyeriaartesanos.sorteo_cupones USING btree (empresa_id);


--
-- Name: idx_sorteo_cup_entrada; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_sorteo_cup_entrada ON joyeriaartesanos.sorteo_cupones USING btree (entrada_id);


--
-- Name: idx_sorteo_cup_sorteo; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_sorteo_cup_sorteo ON joyeriaartesanos.sorteo_cupones USING btree (sorteo_id);


--
-- Name: idx_sorteo_ent_cliente; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_sorteo_ent_cliente ON joyeriaartesanos.sorteo_entradas USING btree (cliente_id);


--
-- Name: idx_sorteo_ent_comp_val; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_sorteo_ent_comp_val ON joyeriaartesanos.sorteo_entradas USING btree (comprobante_validacion_id) WHERE (comprobante_validacion_id IS NOT NULL);


--
-- Name: idx_sorteo_ent_conv; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_sorteo_ent_conv ON joyeriaartesanos.sorteo_entradas USING btree (conversacion_id);


--
-- Name: idx_sorteo_ent_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_sorteo_ent_empresa ON joyeriaartesanos.sorteo_entradas USING btree (empresa_id);


--
-- Name: idx_sorteo_ent_sorteo; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_sorteo_ent_sorteo ON joyeriaartesanos.sorteo_entradas USING btree (sorteo_id);


--
-- Name: idx_sorteo_entradas_chat_conversation; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_sorteo_entradas_chat_conversation ON joyeriaartesanos.sorteo_entradas USING btree (chat_conversation_id) WHERE (chat_conversation_id IS NOT NULL);


--
-- Name: idx_sorteo_entradas_revendedor; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_sorteo_entradas_revendedor ON joyeriaartesanos.sorteo_entradas USING btree (revendedor_id) WHERE (revendedor_id IS NOT NULL);


--
-- Name: idx_sorteo_rev_clicks_revendedor; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_sorteo_rev_clicks_revendedor ON joyeriaartesanos.sorteo_revendedor_clicks USING btree (revendedor_id, created_at DESC);


--
-- Name: idx_sorteo_rev_clicks_sorteo; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_sorteo_rev_clicks_sorteo ON joyeriaartesanos.sorteo_revendedor_clicks USING btree (sorteo_id, created_at DESC);


--
-- Name: idx_sorteo_revendedores_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_sorteo_revendedores_empresa ON joyeriaartesanos.sorteo_revendedores USING btree (empresa_id);


--
-- Name: idx_sorteo_revendedores_sorteo; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_sorteo_revendedores_sorteo ON joyeriaartesanos.sorteo_revendedores USING btree (sorteo_id);


--
-- Name: idx_sorteo_ticket_empresa_sorteo; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_sorteo_ticket_empresa_sorteo ON joyeriaartesanos.sorteo_ticket_deliveries USING btree (empresa_id, sorteo_id);


--
-- Name: idx_sorteo_ticket_status; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_sorteo_ticket_status ON joyeriaartesanos.sorteo_ticket_deliveries USING btree (empresa_id, status);


--
-- Name: idx_sorteos_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_sorteos_empresa ON joyeriaartesanos.sorteos USING btree (empresa_id);


--
-- Name: idx_stock_ubic_producto; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_stock_ubic_producto ON joyeriaartesanos.inventario_stock_ubicacion USING btree (producto_id);


--
-- Name: idx_stock_ubic_ubicacion; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_stock_ubic_ubicacion ON joyeriaartesanos.inventario_stock_ubicacion USING btree (ubicacion_id);


--
-- Name: idx_suscripciones_cliente; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_suscripciones_cliente ON joyeriaartesanos.suscripciones USING btree (cliente_id);


--
-- Name: idx_suscripciones_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_suscripciones_empresa ON joyeriaartesanos.suscripciones USING btree (empresa_id);


--
-- Name: idx_suscripciones_plan; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_suscripciones_plan ON joyeriaartesanos.suscripciones USING btree (plan_id);


--
-- Name: idx_tipificaciones_cliente; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_tipificaciones_cliente ON joyeriaartesanos.tipificaciones USING btree (cliente_id);


--
-- Name: idx_tipificaciones_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_tipificaciones_empresa ON joyeriaartesanos.tipificaciones USING btree (empresa_id);


--
-- Name: idx_ubicaciones_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_ubicaciones_empresa ON joyeriaartesanos.inventario_ubicaciones USING btree (empresa_id);


--
-- Name: idx_ubicaciones_parent; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_ubicaciones_parent ON joyeriaartesanos.inventario_ubicaciones USING btree (parent_id);


--
-- Name: idx_ubicaciones_tipo; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_ubicaciones_tipo ON joyeriaartesanos.inventario_ubicaciones USING btree (tipo);


--
-- Name: idx_udv_usuario; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_udv_usuario ON joyeriaartesanos.usuario_dashboard_views USING btree (usuario_id);


--
-- Name: idx_usuario_modulos_usuario; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_usuario_modulos_usuario ON joyeriaartesanos.usuario_modulos USING btree (usuario_id);


--
-- Name: idx_usuarios_auth_user_id; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_usuarios_auth_user_id ON joyeriaartesanos.usuarios USING btree (auth_user_id);


--
-- Name: idx_ventas_cliente; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_ventas_cliente ON joyeriaartesanos.ventas USING btree (cliente_id);


--
-- Name: idx_ventas_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_ventas_empresa ON joyeriaartesanos.ventas USING btree (empresa_id);


--
-- Name: idx_ventas_fecha; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_ventas_fecha ON joyeriaartesanos.ventas USING btree (fecha);


--
-- Name: idx_ventas_items_empresa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_ventas_items_empresa ON joyeriaartesanos.ventas_items USING btree (empresa_id);


--
-- Name: idx_ventas_items_producto; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_ventas_items_producto ON joyeriaartesanos.ventas_items USING btree (producto_id);


--
-- Name: idx_ventas_items_venta; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_ventas_items_venta ON joyeriaartesanos.ventas_items USING btree (venta_id);


--
-- Name: idx_wpe_date; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_wpe_date ON joyeriaartesanos.web_product_events USING btree (created_at DESC);


--
-- Name: idx_wpe_event_date; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_wpe_event_date ON joyeriaartesanos.web_product_events USING btree (event_type, created_at DESC);


--
-- Name: idx_wpe_product_event_date; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX idx_wpe_product_event_date ON joyeriaartesanos.web_product_events USING btree (product_id, event_type, created_at DESC);


--
-- Name: ix_caj_c9ff055d5178c1e5686eb62017e3c4ff; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX ix_caj_c9ff055d5178c1e5686eb62017e3c4ff ON joyeriaartesanos.comision_ajustes USING btree (empresa_id, periodo_id);


--
-- Name: ix_ce_c9ff055d5178c1e5686eb62017e3c4ff; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX ix_ce_c9ff055d5178c1e5686eb62017e3c4ff ON joyeriaartesanos.comision_escalas USING btree (empresa_id, politica_id, orden);


--
-- Name: ix_ceq_c9ff055d5178c1e5686eb62017e3c4ff; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX ix_ceq_c9ff055d5178c1e5686eb62017e3c4ff ON joyeriaartesanos.comision_equipos USING btree (empresa_id, activo);


--
-- Name: ix_ceqm_c9ff055d5178c1e5686eb62017e3c4ff; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX ix_ceqm_c9ff055d5178c1e5686eb62017e3c4ff ON joyeriaartesanos.comision_equipo_miembros USING btree (empresa_id, equipo_id);


--
-- Name: ix_cli_vend_93405e10933cb8b99a0af6286dc9466b; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX ix_cli_vend_93405e10933cb8b99a0af6286dc9466b ON joyeriaartesanos.clientes USING btree (empresa_id, vendedor_usuario_id);


--
-- Name: ix_cli_vend_c9ff055d5178c1e5686eb62017e3c4ff; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX ix_cli_vend_c9ff055d5178c1e5686eb62017e3c4ff ON joyeriaartesanos.clientes USING btree (empresa_id, vendedor_usuario_id);


--
-- Name: ix_clin_c9ff055d5178c1e5686eb62017e3c4ff; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX ix_clin_c9ff055d5178c1e5686eb62017e3c4ff ON joyeriaartesanos.comision_lineas USING btree (empresa_id, periodo_id, usuario_vendedor_id);


--
-- Name: ix_cp_act_c9ff055d5178c1e5686eb62017e3c4ff; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX ix_cp_act_c9ff055d5178c1e5686eb62017e3c4ff ON joyeriaartesanos.comision_politicas USING btree (empresa_id, activo);


--
-- Name: ix_cper_c9ff055d5178c1e5686eb62017e3c4ff; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX ix_cper_c9ff055d5178c1e5686eb62017e3c4ff ON joyeriaartesanos.comision_periodos USING btree (empresa_id, fecha_inicio, fecha_fin);


--
-- Name: ix_cpv_c9ff055d5178c1e5686eb62017e3c4ff; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX ix_cpv_c9ff055d5178c1e5686eb62017e3c4ff ON joyeriaartesanos.comision_politica_versiones USING btree (empresa_id, politica_id);


--
-- Name: ix_mk_cal_c9ff055d5178c1e5686eb62017e3c4ff; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX ix_mk_cal_c9ff055d5178c1e5686eb62017e3c4ff ON joyeriaartesanos.marketing_calendarios USING btree (empresa_id, cliente_id, mes);


--
-- Name: ix_mk_com_c9ff055d5178c1e5686eb62017e3c4ff; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX ix_mk_com_c9ff055d5178c1e5686eb62017e3c4ff ON joyeriaartesanos.marketing_comentarios USING btree (empresa_id, pieza_id, created_at DESC);


--
-- Name: ix_mk_hist_c9ff055d5178c1e5686eb62017e3c4ff; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX ix_mk_hist_c9ff055d5178c1e5686eb62017e3c4ff ON joyeriaartesanos.marketing_historial_estados USING btree (empresa_id, pieza_id, changed_at DESC);


--
-- Name: ix_mk_pz_cli_c9ff055d5178c1e5686eb62017e3c4ff; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX ix_mk_pz_cli_c9ff055d5178c1e5686eb62017e3c4ff ON joyeriaartesanos.marketing_piezas USING btree (empresa_id, cliente_id);


--
-- Name: ix_mk_pz_lim_c9ff055d5178c1e5686eb62017e3c4ff; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX ix_mk_pz_lim_c9ff055d5178c1e5686eb62017e3c4ff ON joyeriaartesanos.marketing_piezas USING btree (empresa_id, fecha_limite);


--
-- Name: ix_mk_pz_prod_c9ff055d5178c1e5686eb62017e3c4ff; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX ix_mk_pz_prod_c9ff055d5178c1e5686eb62017e3c4ff ON joyeriaartesanos.marketing_piezas USING btree (empresa_id, estado_produccion);


--
-- Name: ix_mk_pz_resp_c9ff055d5178c1e5686eb62017e3c4ff; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX ix_mk_pz_resp_c9ff055d5178c1e5686eb62017e3c4ff ON joyeriaartesanos.marketing_piezas USING btree (empresa_id, responsable_id);


--
-- Name: ix_paf_c9ff055d5178c1e5686eb62017e3c4ff; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX ix_paf_c9ff055d5178c1e5686eb62017e3c4ff ON joyeriaartesanos.proyecto_archivos USING btree (empresa_id, proyecto_id);


--
-- Name: ix_pc_c9ff055d5178c1e5686eb62017e3c4ff; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX ix_pc_c9ff055d5178c1e5686eb62017e3c4ff ON joyeriaartesanos.proyecto_comentarios USING btree (empresa_id, proyecto_id, created_at DESC);


--
-- Name: ix_pe_c9ff055d5178c1e5686eb62017e3c4ff; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX ix_pe_c9ff055d5178c1e5686eb62017e3c4ff ON joyeriaartesanos.proyecto_estados USING btree (empresa_id, activo, sort_order);


--
-- Name: ix_peh_c9ff055d5178c1e5686eb62017e3c4ff; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX ix_peh_c9ff055d5178c1e5686eb62017e3c4ff ON joyeriaartesanos.proyecto_estado_historial USING btree (empresa_id, proyecto_id, entered_at);


--
-- Name: ix_ppc_c9ff055d5178c1e5686eb62017e3c4ff; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX ix_ppc_c9ff055d5178c1e5686eb62017e3c4ff ON joyeriaartesanos.proyecto_prioridades_config USING btree (empresa_id, activo, sort_order);


--
-- Name: ix_pr_cli_c9ff055d5178c1e5686eb62017e3c4ff; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX ix_pr_cli_c9ff055d5178c1e5686eb62017e3c4ff ON joyeriaartesanos.proyectos USING btree (empresa_id, cliente_id);


--
-- Name: ix_pr_est_c9ff055d5178c1e5686eb62017e3c4ff; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX ix_pr_est_c9ff055d5178c1e5686eb62017e3c4ff ON joyeriaartesanos.proyectos USING btree (empresa_id, estado_id, archivado);


--
-- Name: ix_pr_fp_c9ff055d5178c1e5686eb62017e3c4ff; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX ix_pr_fp_c9ff055d5178c1e5686eb62017e3c4ff ON joyeriaartesanos.proyectos USING btree (empresa_id, fecha_prometida);


--
-- Name: ix_pr_rc_c9ff055d5178c1e5686eb62017e3c4ff; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX ix_pr_rc_c9ff055d5178c1e5686eb62017e3c4ff ON joyeriaartesanos.proyectos USING btree (empresa_id, responsable_comercial_id);


--
-- Name: ix_pr_rt_c9ff055d5178c1e5686eb62017e3c4ff; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX ix_pr_rt_c9ff055d5178c1e5686eb62017e3c4ff ON joyeriaartesanos.proyectos USING btree (empresa_id, responsable_tecnico_id);


--
-- Name: ix_pr_tip_c9ff055d5178c1e5686eb62017e3c4ff; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX ix_pr_tip_c9ff055d5178c1e5686eb62017e3c4ff ON joyeriaartesanos.proyectos USING btree (empresa_id, tipo_id);


--
-- Name: ix_pt_c9ff055d5178c1e5686eb62017e3c4ff; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX ix_pt_c9ff055d5178c1e5686eb62017e3c4ff ON joyeriaartesanos.proyecto_tipos USING btree (empresa_id, activo);


--
-- Name: ix_ptar_c9ff055d5178c1e5686eb62017e3c4ff; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX ix_ptar_c9ff055d5178c1e5686eb62017e3c4ff ON joyeriaartesanos.proyecto_tareas USING btree (empresa_id, proyecto_id);


--
-- Name: ixctsc_c9ff055d5178c1e5686eb62017e3c4ff; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX ixctsc_c9ff055d5178c1e5686eb62017e3c4ff ON joyeriaartesanos.cliente_tipos_servicio_catalogo USING btree (empresa_id, activo, orden);


--
-- Name: productos_empresa_slug_web_uq; Type: INDEX; Schema: elevate; Owner: -
--

CREATE UNIQUE INDEX productos_empresa_slug_web_uq ON joyeriaartesanos.productos USING btree (empresa_id, slug_web) WHERE (slug_web IS NOT NULL);


--
-- Name: productos_web_listado_ix; Type: INDEX; Schema: elevate; Owner: -
--

CREATE INDEX productos_web_listado_ix ON joyeriaartesanos.productos USING btree (visible_web, activo, destacado_web) WHERE ((visible_web = true) AND (activo = true));


--
-- Name: proveedor_categorias_empresa_nombre_lower; Type: INDEX; Schema: elevate; Owner: -
--

CREATE UNIQUE INDEX proveedor_categorias_empresa_nombre_lower ON joyeriaartesanos.proveedor_categorias USING btree (empresa_id, lower(TRIM(BOTH FROM nombre)));


--
-- Name: proveedor_productos_un_principal; Type: INDEX; Schema: elevate; Owner: -
--

CREATE UNIQUE INDEX proveedor_productos_un_principal ON joyeriaartesanos.proveedor_productos USING btree (empresa_id, producto_id) WHERE es_principal;


--
-- Name: uq_acordes_empresa_nombre_ci; Type: INDEX; Schema: elevate; Owner: -
--

CREATE UNIQUE INDEX uq_acordes_empresa_nombre_ci ON joyeriaartesanos.acordes_olfativos USING btree (empresa_id, lower(btrim(nombre)));


--
-- Name: uq_categorias_productos_empresa_nombre; Type: INDEX; Schema: elevate; Owner: -
--

CREATE UNIQUE INDEX uq_categorias_productos_empresa_nombre ON joyeriaartesanos.categorias_productos USING btree (empresa_id, lower(TRIM(BOTH FROM nombre)));


--
-- Name: uq_categorias_productos_empresa_slug_web; Type: INDEX; Schema: elevate; Owner: -
--

CREATE UNIQUE INDEX uq_categorias_productos_empresa_slug_web ON joyeriaartesanos.categorias_productos USING btree (empresa_id, slug_web) WHERE (slug_web IS NOT NULL);


--
-- Name: uq_chat_campaign_recipients_phone; Type: INDEX; Schema: elevate; Owner: -
--

CREATE UNIQUE INDEX uq_chat_campaign_recipients_phone ON joyeriaartesanos.chat_campaign_recipients USING btree (campaign_id, phone_e164);


--
-- Name: uq_chat_campaign_templates_natural; Type: INDEX; Schema: elevate; Owner: -
--

CREATE UNIQUE INDEX uq_chat_campaign_templates_natural ON joyeriaartesanos.chat_campaign_templates USING btree (empresa_id, channel_id, provider, name, language);


--
-- Name: uq_chat_flow_data_conversation_field; Type: INDEX; Schema: elevate; Owner: -
--

CREATE UNIQUE INDEX uq_chat_flow_data_conversation_field ON joyeriaartesanos.chat_flow_data USING btree (conversation_id, field_name);


--
-- Name: uq_chat_flow_data_session_field; Type: INDEX; Schema: elevate; Owner: -
--

CREATE UNIQUE INDEX uq_chat_flow_data_session_field ON joyeriaartesanos.chat_flow_data USING btree (flow_session_id, field_name);


--
-- Name: uq_chat_flow_sessions_one_active_per_conversation; Type: INDEX; Schema: elevate; Owner: -
--

CREATE UNIQUE INDEX uq_chat_flow_sessions_one_active_per_conversation ON joyeriaartesanos.chat_flow_sessions USING btree (conversation_id) WHERE (status = 'active'::text);


--
-- Name: uq_chat_msg_wa_id; Type: INDEX; Schema: elevate; Owner: -
--

CREATE UNIQUE INDEX uq_chat_msg_wa_id ON joyeriaartesanos.chat_messages USING btree (wa_message_id) WHERE (wa_message_id IS NOT NULL);


--
-- Name: uq_compras_empresa_numero_control; Type: INDEX; Schema: elevate; Owner: -
--

CREATE UNIQUE INDEX uq_compras_empresa_numero_control ON joyeriaartesanos.compras USING btree (empresa_id, numero_control);


--
-- Name: uq_marcas_empresa_nombre_ci; Type: INDEX; Schema: elevate; Owner: -
--

CREATE UNIQUE INDEX uq_marcas_empresa_nombre_ci ON joyeriaartesanos.marcas USING btree (empresa_id, lower(btrim(nombre)));


--
-- Name: uq_nota_credito_factura_estado_activo; Type: INDEX; Schema: elevate; Owner: -
--

CREATE UNIQUE INDEX uq_nota_credito_factura_estado_activo ON joyeriaartesanos.nota_credito USING btree (factura_id) WHERE (estado_erp = ANY (ARRAY['borrador'::text, 'pendiente_envio_sifen'::text, 'aprobada'::text]));


--
-- Name: uq_producto_categoria_principal_unica; Type: INDEX; Schema: elevate; Owner: -
--

CREATE UNIQUE INDEX uq_producto_categoria_principal_unica ON joyeriaartesanos.producto_categorias USING btree (empresa_id, producto_id) WHERE (es_principal = true);


--
-- Name: uq_producto_categorias_triple; Type: INDEX; Schema: elevate; Owner: -
--

CREATE UNIQUE INDEX uq_producto_categorias_triple ON joyeriaartesanos.producto_categorias USING btree (empresa_id, producto_id, categoria_id);


--
-- Name: uq_producto_imagenes_principal; Type: INDEX; Schema: elevate; Owner: -
--

CREATE UNIQUE INDEX uq_producto_imagenes_principal ON joyeriaartesanos.producto_imagenes USING btree (producto_id) WHERE (es_principal = true);


--
-- Name: uq_productos_codigo_barras; Type: INDEX; Schema: elevate; Owner: -
--

CREATE UNIQUE INDEX uq_productos_codigo_barras ON joyeriaartesanos.productos USING btree (empresa_id, codigo_barras) WHERE (codigo_barras IS NOT NULL);


--
-- Name: uq_sorteo_conv_activa; Type: INDEX; Schema: elevate; Owner: -
--

CREATE UNIQUE INDEX uq_sorteo_conv_activa ON joyeriaartesanos.sorteo_conversaciones USING btree (sorteo_id, whatsapp_numero) WHERE (activa = true);


--
-- Name: uq_sorteo_cupones_sorteo_coupon_value; Type: INDEX; Schema: elevate; Owner: -
--

CREATE UNIQUE INDEX uq_sorteo_cupones_sorteo_coupon_value ON joyeriaartesanos.sorteo_cupones USING btree (sorteo_id, coupon_number_value) WHERE (coupon_number_value IS NOT NULL);


--
-- Name: uq_sorteo_entradas_idempotency_key; Type: INDEX; Schema: elevate; Owner: -
--

CREATE UNIQUE INDEX uq_sorteo_entradas_idempotency_key ON joyeriaartesanos.sorteo_entradas USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: uq_sorteo_rev_clicks_token; Type: INDEX; Schema: elevate; Owner: -
--

CREATE UNIQUE INDEX uq_sorteo_rev_clicks_token ON joyeriaartesanos.sorteo_revendedor_clicks USING btree (attribution_token);


--
-- Name: uq_sorteo_revendedores_sorteo_codigo_lower; Type: INDEX; Schema: elevate; Owner: -
--

CREATE UNIQUE INDEX uq_sorteo_revendedores_sorteo_codigo_lower ON joyeriaartesanos.sorteo_revendedores USING btree (sorteo_id, lower(TRIM(BOTH FROM codigo_referido)));


--
-- Name: uq_sorteo_ticket_entrada_current; Type: INDEX; Schema: elevate; Owner: -
--

CREATE UNIQUE INDEX uq_sorteo_ticket_entrada_current ON joyeriaartesanos.sorteo_ticket_deliveries USING btree (entrada_id) WHERE is_current;


--
-- Name: uq_sorteo_ticket_entrada_revision; Type: INDEX; Schema: elevate; Owner: -
--

CREATE UNIQUE INDEX uq_sorteo_ticket_entrada_revision ON joyeriaartesanos.sorteo_ticket_deliveries USING btree (entrada_id, template_revision);


--
-- Name: uq_stock_ubicacion_principal_unica; Type: INDEX; Schema: elevate; Owner: -
--

CREATE UNIQUE INDEX uq_stock_ubicacion_principal_unica ON joyeriaartesanos.inventario_stock_ubicacion USING btree (empresa_id, producto_id) WHERE (es_principal = true);


--
-- Name: uq_stock_ubicacion_triple; Type: INDEX; Schema: elevate; Owner: -
--

CREATE UNIQUE INDEX uq_stock_ubicacion_triple ON joyeriaartesanos.inventario_stock_ubicacion USING btree (empresa_id, producto_id, ubicacion_id);


--
-- Name: uq_ubicaciones_empresa_codigo; Type: INDEX; Schema: elevate; Owner: -
--

CREATE UNIQUE INDEX uq_ubicaciones_empresa_codigo ON joyeriaartesanos.inventario_ubicaciones USING btree (empresa_id, lower(TRIM(BOTH FROM codigo))) WHERE ((codigo IS NOT NULL) AND (TRIM(BOTH FROM codigo) <> ''::text));


--
-- Name: uq_udv_one_default_per_user; Type: INDEX; Schema: elevate; Owner: -
--

CREATE UNIQUE INDEX uq_udv_one_default_per_user ON joyeriaartesanos.usuario_dashboard_views USING btree (usuario_id) WHERE (es_default IS TRUE);


--
-- Name: cliente_perfil_tributario cliente_perfil_tributario_updated_at; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER cliente_perfil_tributario_updated_at BEFORE UPDATE ON joyeriaartesanos.cliente_perfil_tributario FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: cliente_tipos_servicio_catalogo cliente_tipos_servicio_catalogo_updated_at; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER cliente_tipos_servicio_catalogo_updated_at BEFORE UPDATE ON joyeriaartesanos.cliente_tipos_servicio_catalogo FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: compras compras_updated_at; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER compras_updated_at BEFORE UPDATE ON joyeriaartesanos.compras FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: crm_etapas crm_etapas_updated_at; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER crm_etapas_updated_at BEFORE UPDATE ON joyeriaartesanos.crm_etapas FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: crm_notas crm_notas_updated_at; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER crm_notas_updated_at BEFORE UPDATE ON joyeriaartesanos.crm_notas FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: crm_prospectos crm_prospectos_updated_at; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER crm_prospectos_updated_at BEFORE UPDATE ON joyeriaartesanos.crm_prospectos FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_crm_prospectos_updated();


--
-- Name: empresa_sifen_config empresa_sifen_config_updated_at; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER empresa_sifen_config_updated_at BEFORE UPDATE ON joyeriaartesanos.empresa_sifen_config FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: factura_electronica factura_electronica_updated_at; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER factura_electronica_updated_at BEFORE UPDATE ON joyeriaartesanos.factura_electronica FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: facturas facturas_updated_at; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER facturas_updated_at BEFORE UPDATE ON joyeriaartesanos.facturas FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: marketing_tasks marketing_tasks_updated_at; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER marketing_tasks_updated_at BEFORE UPDATE ON joyeriaartesanos.marketing_tasks FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: movimientos_inventario movimientos_updated_at; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER movimientos_updated_at BEFORE UPDATE ON joyeriaartesanos.movimientos_inventario FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: nota_credito_electronica nota_credito_electronica_updated_at; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER nota_credito_electronica_updated_at BEFORE UPDATE ON joyeriaartesanos.nota_credito_electronica FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: nota_credito nota_credito_updated_at; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER nota_credito_updated_at BEFORE UPDATE ON joyeriaartesanos.nota_credito FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: planes planes_updated_at; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER planes_updated_at BEFORE UPDATE ON joyeriaartesanos.planes FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: productos productos_updated_at; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER productos_updated_at BEFORE UPDATE ON joyeriaartesanos.productos FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: proveedor_categorias proveedor_categorias_updated_at; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER proveedor_categorias_updated_at BEFORE UPDATE ON joyeriaartesanos.proveedor_categorias FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: proveedor_productos proveedor_productos_updated_at; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER proveedor_productos_updated_at BEFORE UPDATE ON joyeriaartesanos.proveedor_productos FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: proveedores proveedores_updated_at; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER proveedores_updated_at BEFORE UPDATE ON joyeriaartesanos.proveedores FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: tipificaciones tipificaciones_updated_at; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tipificaciones_updated_at BEFORE UPDATE ON joyeriaartesanos.tipificaciones FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: chat_flow_recontact_rules tr_cfr_rules_updated; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tr_cfr_rules_updated BEFORE UPDATE ON joyeriaartesanos.chat_flow_recontact_rules FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: chat_agents tr_chat_agents_updated; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tr_chat_agents_updated BEFORE UPDATE ON joyeriaartesanos.chat_agents FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: chat_campaign_jobs tr_chat_campaign_jobs_updated; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tr_chat_campaign_jobs_updated BEFORE UPDATE ON joyeriaartesanos.chat_campaign_jobs FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: chat_campaign_recipients tr_chat_campaign_recipients_updated; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tr_chat_campaign_recipients_updated BEFORE UPDATE ON joyeriaartesanos.chat_campaign_recipients FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: chat_campaign_templates tr_chat_campaign_templates_updated; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tr_chat_campaign_templates_updated BEFORE UPDATE ON joyeriaartesanos.chat_campaign_templates FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: chat_campaigns tr_chat_campaigns_updated; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tr_chat_campaigns_updated BEFORE UPDATE ON joyeriaartesanos.chat_campaigns FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: chat_channel_quick_replies tr_chat_channel_quick_replies_updated; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tr_chat_channel_quick_replies_updated BEFORE UPDATE ON joyeriaartesanos.chat_channel_quick_replies FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: chat_channels tr_chat_channels_updated; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tr_chat_channels_updated BEFORE UPDATE ON joyeriaartesanos.chat_channels FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: chat_comprobante_validaciones tr_chat_comp_val_updated; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tr_chat_comp_val_updated BEFORE UPDATE ON joyeriaartesanos.chat_comprobante_validaciones FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: chat_contacts tr_chat_contacts_phone_normalized; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tr_chat_contacts_phone_normalized BEFORE INSERT OR UPDATE OF phone_number ON joyeriaartesanos.chat_contacts FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_chat_contact_phone_normalized();


--
-- Name: chat_contacts tr_chat_contacts_updated; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tr_chat_contacts_updated BEFORE UPDATE ON joyeriaartesanos.chat_contacts FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: chat_conversations tr_chat_conversations_updated; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tr_chat_conversations_updated BEFORE UPDATE ON joyeriaartesanos.chat_conversations FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: chat_empresa_operator_roles tr_chat_empresa_operator_roles_updated; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tr_chat_empresa_operator_roles_updated BEFORE UPDATE ON joyeriaartesanos.chat_empresa_operator_roles FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: chat_flows tr_chat_flows_updated; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tr_chat_flows_updated BEFORE UPDATE ON joyeriaartesanos.chat_flows FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: chat_omnicanal_work_schedules tr_chat_omn_sched_updated; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tr_chat_omn_sched_updated BEFORE UPDATE ON joyeriaartesanos.chat_omnicanal_work_schedules FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: chat_queues tr_chat_queues_updated; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tr_chat_queues_updated BEFORE UPDATE ON joyeriaartesanos.chat_queues FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: chat_usuario_omnicanal tr_chat_usuario_omnicanal_updated; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tr_chat_usuario_omnicanal_updated BEFORE UPDATE ON joyeriaartesanos.chat_usuario_omnicanal FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: comision_equipos tr_comision_equipos_updated; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tr_comision_equipos_updated BEFORE UPDATE ON joyeriaartesanos.comision_equipos FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: comision_escalas tr_comision_escalas_updated; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tr_comision_escalas_updated BEFORE UPDATE ON joyeriaartesanos.comision_escalas FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: comision_periodos tr_comision_periodos_updated; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tr_comision_periodos_updated BEFORE UPDATE ON joyeriaartesanos.comision_periodos FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: comision_politicas tr_comision_politicas_updated; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tr_comision_politicas_updated BEFORE UPDATE ON joyeriaartesanos.comision_politicas FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: empresas tr_elevate_block_other_empresas_ins; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tr_elevate_block_other_empresas_ins BEFORE INSERT ON joyeriaartesanos.empresas FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.neura_elevate_block_other_empresas();


--
-- Name: empresas tr_elevate_lock_data_schema_upd; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tr_elevate_lock_data_schema_upd BEFORE UPDATE OF data_schema ON joyeriaartesanos.empresas FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.neura_elevate_block_other_empresas();


--
-- Name: marketing_calendarios tr_marketing_calendarios_updated; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tr_marketing_calendarios_updated BEFORE UPDATE ON joyeriaartesanos.marketing_calendarios FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: marketing_piezas tr_marketing_piezas_updated; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tr_marketing_piezas_updated BEFORE UPDATE ON joyeriaartesanos.marketing_piezas FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: proyecto_comentarios tr_proyecto_comentarios_updated; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tr_proyecto_comentarios_updated BEFORE UPDATE ON joyeriaartesanos.proyecto_comentarios FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: proyecto_estados tr_proyecto_estados_updated; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tr_proyecto_estados_updated BEFORE UPDATE ON joyeriaartesanos.proyecto_estados FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: proyecto_prioridades_config tr_proyecto_prioridades_config_updated; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tr_proyecto_prioridades_config_updated BEFORE UPDATE ON joyeriaartesanos.proyecto_prioridades_config FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: proyecto_tareas tr_proyecto_tareas_updated; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tr_proyecto_tareas_updated BEFORE UPDATE ON joyeriaartesanos.proyecto_tareas FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: proyecto_tipos tr_proyecto_tipos_updated; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tr_proyecto_tipos_updated BEFORE UPDATE ON joyeriaartesanos.proyecto_tipos FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: proyectos tr_proyectos_updated; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tr_proyectos_updated BEFORE UPDATE ON joyeriaartesanos.proyectos FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: sorteo_conversaciones tr_sorteo_conv_updated; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tr_sorteo_conv_updated BEFORE UPDATE ON joyeriaartesanos.sorteo_conversaciones FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: sorteo_entradas tr_sorteo_ent_updated; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tr_sorteo_ent_updated BEFORE UPDATE ON joyeriaartesanos.sorteo_entradas FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: sorteo_revendedores tr_sorteo_revendedores_updated; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tr_sorteo_revendedores_updated BEFORE UPDATE ON joyeriaartesanos.sorteo_revendedores FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: sorteo_ticket_deliveries tr_sorteo_ticket_deliveries_updated; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tr_sorteo_ticket_deliveries_updated BEFORE UPDATE ON joyeriaartesanos.sorteo_ticket_deliveries FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: sorteos tr_sorteos_updated; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tr_sorteos_updated BEFORE UPDATE ON joyeriaartesanos.sorteos FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: usuario_modulos tr_usuario_modulos_validar_empresa; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER tr_usuario_modulos_validar_empresa BEFORE INSERT OR UPDATE OF modulo_id, usuario_id ON joyeriaartesanos.usuario_modulos FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.trg_usuario_modulos_validar_modulo_empresa();


--
-- Name: acordes_olfativos trg_acordes_updated_at; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER trg_acordes_updated_at BEFORE UPDATE ON joyeriaartesanos.acordes_olfativos FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos._acordes_set_updated_at();


--
-- Name: clientes trg_clientes_tipo_servicio_catalogo; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER trg_clientes_tipo_servicio_catalogo BEFORE INSERT OR UPDATE OF tipo_servicio_cliente ON joyeriaartesanos.clientes FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.trg_clientes_tipo_servicio_requiere_catalogo();


--
-- Name: marcas trg_marcas_updated_at; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER trg_marcas_updated_at BEFORE UPDATE ON joyeriaartesanos.marcas FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos._marcas_set_updated_at();


--
-- Name: producto_imagenes trg_pi_limite_5; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER trg_pi_limite_5 BEFORE INSERT ON joyeriaartesanos.producto_imagenes FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos._pi_limite_5();


--
-- Name: producto_imagenes trg_pi_unica_principal; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER trg_pi_unica_principal AFTER INSERT OR UPDATE OF es_principal ON joyeriaartesanos.producto_imagenes FOR EACH ROW WHEN ((new.es_principal = true)) EXECUTE FUNCTION joyeriaartesanos._pi_unica_principal();


--
-- Name: producto_imagenes trg_pi_updated_at; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER trg_pi_updated_at BEFORE UPDATE ON joyeriaartesanos.producto_imagenes FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos._pi_set_updated_at();


--
-- Name: producto_presentaciones trg_pp_updated_at; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER trg_pp_updated_at BEFORE UPDATE ON joyeriaartesanos.producto_presentaciones FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos._pp_set_updated_at();


--
-- Name: resenas_videos trg_rv_limite_4; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER trg_rv_limite_4 BEFORE INSERT OR UPDATE OF activo, visible_web ON joyeriaartesanos.resenas_videos FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos._rv_limite_4();


--
-- Name: resenas_videos trg_rv_updated_at; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER trg_rv_updated_at BEFORE UPDATE ON joyeriaartesanos.resenas_videos FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos._rv_set_updated_at();


--
-- Name: ventas_items ventas_items_updated_at; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER ventas_items_updated_at BEFORE UPDATE ON joyeriaartesanos.ventas_items FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: ventas ventas_updated_at; Type: TRIGGER; Schema: elevate; Owner: -
--

CREATE TRIGGER ventas_updated_at BEFORE UPDATE ON joyeriaartesanos.ventas FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at();


--
-- Name: acordes_olfativos acordes_olfativos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.acordes_olfativos
    ADD CONSTRAINT acordes_olfativos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id);


--
-- Name: categorias_productos categorias_productos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.categorias_productos
    ADD CONSTRAINT categorias_productos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: categorias_productos categorias_productos_parent_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.categorias_productos
    ADD CONSTRAINT categorias_productos_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES joyeriaartesanos.categorias_productos(id) ON DELETE SET NULL;


--
-- Name: chat_flow_recontact_rules cfr_rules_flow_fk; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_flow_recontact_rules
    ADD CONSTRAINT cfr_rules_flow_fk FOREIGN KEY (empresa_id, flow_code) REFERENCES joyeriaartesanos.chat_flows(empresa_id, flow_code) ON DELETE CASCADE;


--
-- Name: chat_agents chat_agents_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_agents
    ADD CONSTRAINT chat_agents_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: chat_agents chat_agents_queue_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_agents
    ADD CONSTRAINT chat_agents_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES joyeriaartesanos.chat_queues(id) ON DELETE CASCADE;


--
-- Name: chat_agents chat_agents_usuario_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_agents
    ADD CONSTRAINT chat_agents_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES joyeriaartesanos.usuarios(id) ON DELETE CASCADE;


--
-- Name: chat_campaign_events chat_campaign_events_campaign_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_campaign_events
    ADD CONSTRAINT chat_campaign_events_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES joyeriaartesanos.chat_campaigns(id) ON DELETE CASCADE;


--
-- Name: chat_campaign_events chat_campaign_events_recipient_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_campaign_events
    ADD CONSTRAINT chat_campaign_events_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES joyeriaartesanos.chat_campaign_recipients(id) ON DELETE SET NULL;


--
-- Name: chat_campaign_jobs chat_campaign_jobs_campaign_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_campaign_jobs
    ADD CONSTRAINT chat_campaign_jobs_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES joyeriaartesanos.chat_campaigns(id) ON DELETE CASCADE;


--
-- Name: chat_campaign_recipients chat_campaign_recipients_campaign_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_campaign_recipients
    ADD CONSTRAINT chat_campaign_recipients_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES joyeriaartesanos.chat_campaigns(id) ON DELETE CASCADE;


--
-- Name: chat_campaign_templates chat_campaign_templates_channel_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_campaign_templates
    ADD CONSTRAINT chat_campaign_templates_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES joyeriaartesanos.chat_channels(id) ON DELETE CASCADE;


--
-- Name: chat_campaigns chat_campaigns_channel_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_campaigns
    ADD CONSTRAINT chat_campaigns_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES joyeriaartesanos.chat_channels(id) ON DELETE CASCADE;


--
-- Name: chat_campaigns chat_campaigns_queue_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_campaigns
    ADD CONSTRAINT chat_campaigns_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES joyeriaartesanos.chat_queues(id) ON DELETE SET NULL;


--
-- Name: chat_campaigns chat_campaigns_template_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_campaigns
    ADD CONSTRAINT chat_campaigns_template_id_fkey FOREIGN KEY (template_id) REFERENCES joyeriaartesanos.chat_campaign_templates(id) ON DELETE SET NULL;


--
-- Name: chat_channel_quick_replies chat_channel_quick_replies_channel_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_channel_quick_replies
    ADD CONSTRAINT chat_channel_quick_replies_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES joyeriaartesanos.chat_channels(id) ON DELETE CASCADE;


--
-- Name: chat_channels chat_channels_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_channels
    ADD CONSTRAINT chat_channels_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: chat_comprobante_validaciones chat_comprobante_validaciones_channel_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_comprobante_validaciones
    ADD CONSTRAINT chat_comprobante_validaciones_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES joyeriaartesanos.chat_channels(id) ON DELETE SET NULL;


--
-- Name: chat_comprobante_validaciones chat_comprobante_validaciones_conversation_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_comprobante_validaciones
    ADD CONSTRAINT chat_comprobante_validaciones_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES joyeriaartesanos.chat_conversations(id) ON DELETE CASCADE;


--
-- Name: chat_comprobante_validaciones chat_comprobante_validaciones_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_comprobante_validaciones
    ADD CONSTRAINT chat_comprobante_validaciones_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: chat_comprobante_validaciones chat_comprobante_validaciones_flow_session_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_comprobante_validaciones
    ADD CONSTRAINT chat_comprobante_validaciones_flow_session_id_fkey FOREIGN KEY (flow_session_id) REFERENCES joyeriaartesanos.chat_flow_sessions(id) ON DELETE CASCADE;


--
-- Name: chat_comprobante_validaciones chat_comprobante_validaciones_sorteo_entrada_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_comprobante_validaciones
    ADD CONSTRAINT chat_comprobante_validaciones_sorteo_entrada_id_fkey FOREIGN KEY (sorteo_entrada_id) REFERENCES joyeriaartesanos.sorteo_entradas(id) ON DELETE SET NULL;


--
-- Name: chat_contacts chat_contacts_cliente_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_contacts
    ADD CONSTRAINT chat_contacts_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES joyeriaartesanos.clientes(id) ON DELETE SET NULL;


--
-- Name: chat_contacts chat_contacts_crm_prospecto_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_contacts
    ADD CONSTRAINT chat_contacts_crm_prospecto_id_fkey FOREIGN KEY (crm_prospecto_id) REFERENCES joyeriaartesanos.crm_prospectos(id) ON DELETE SET NULL;


--
-- Name: chat_contacts chat_contacts_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_contacts
    ADD CONSTRAINT chat_contacts_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: chat_conversation_closures chat_conversation_closures_closure_state_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_conversation_closures
    ADD CONSTRAINT chat_conversation_closures_closure_state_id_fkey FOREIGN KEY (closure_state_id) REFERENCES joyeriaartesanos.chat_queue_closure_states(id) ON DELETE SET NULL;


--
-- Name: chat_conversation_closures chat_conversation_closures_closure_substate_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_conversation_closures
    ADD CONSTRAINT chat_conversation_closures_closure_substate_id_fkey FOREIGN KEY (closure_substate_id) REFERENCES joyeriaartesanos.chat_queue_closure_substates(id) ON DELETE SET NULL;


--
-- Name: chat_conversation_closures chat_conversation_closures_conversation_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_conversation_closures
    ADD CONSTRAINT chat_conversation_closures_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES joyeriaartesanos.chat_conversations(id) ON DELETE CASCADE;


--
-- Name: chat_conversation_closures chat_conversation_closures_queue_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_conversation_closures
    ADD CONSTRAINT chat_conversation_closures_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES joyeriaartesanos.chat_queues(id) ON DELETE SET NULL;


--
-- Name: chat_conversations chat_conversations_active_flow_session_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_conversations
    ADD CONSTRAINT chat_conversations_active_flow_session_id_fkey FOREIGN KEY (active_flow_session_id) REFERENCES joyeriaartesanos.chat_flow_sessions(id) ON DELETE SET NULL;


--
-- Name: chat_conversations chat_conversations_assigned_agent_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_conversations
    ADD CONSTRAINT chat_conversations_assigned_agent_id_fkey FOREIGN KEY (assigned_agent_id) REFERENCES joyeriaartesanos.chat_agents(id) ON DELETE SET NULL;


--
-- Name: chat_conversations chat_conversations_channel_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_conversations
    ADD CONSTRAINT chat_conversations_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES joyeriaartesanos.chat_channels(id) ON DELETE CASCADE;


--
-- Name: chat_conversations chat_conversations_contact_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_conversations
    ADD CONSTRAINT chat_conversations_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES joyeriaartesanos.chat_contacts(id) ON DELETE CASCADE;


--
-- Name: chat_conversations chat_conversations_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_conversations
    ADD CONSTRAINT chat_conversations_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: chat_conversations chat_conversations_first_revendedor_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_conversations
    ADD CONSTRAINT chat_conversations_first_revendedor_id_fkey FOREIGN KEY (first_revendedor_id) REFERENCES joyeriaartesanos.sorteo_revendedores(id) ON DELETE SET NULL;


--
-- Name: chat_conversations chat_conversations_queue_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_conversations
    ADD CONSTRAINT chat_conversations_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES joyeriaartesanos.chat_queues(id) ON DELETE SET NULL;


--
-- Name: chat_empresa_operator_roles chat_empresa_operator_roles_usuario_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_empresa_operator_roles
    ADD CONSTRAINT chat_empresa_operator_roles_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES joyeriaartesanos.usuarios(id) ON DELETE CASCADE;


--
-- Name: chat_flow_data chat_flow_data_conversation_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_flow_data
    ADD CONSTRAINT chat_flow_data_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES joyeriaartesanos.chat_conversations(id) ON DELETE CASCADE;


--
-- Name: chat_flow_data chat_flow_data_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_flow_data
    ADD CONSTRAINT chat_flow_data_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: chat_flow_data chat_flow_data_flow_session_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_flow_data
    ADD CONSTRAINT chat_flow_data_flow_session_id_fkey FOREIGN KEY (flow_session_id) REFERENCES joyeriaartesanos.chat_flow_sessions(id) ON DELETE CASCADE;


--
-- Name: chat_flow_events chat_flow_events_conversation_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_flow_events
    ADD CONSTRAINT chat_flow_events_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES joyeriaartesanos.chat_conversations(id) ON DELETE CASCADE;


--
-- Name: chat_flow_events chat_flow_events_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_flow_events
    ADD CONSTRAINT chat_flow_events_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: chat_flow_events chat_flow_events_flow_session_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_flow_events
    ADD CONSTRAINT chat_flow_events_flow_session_id_fkey FOREIGN KEY (flow_session_id) REFERENCES joyeriaartesanos.chat_flow_sessions(id) ON DELETE SET NULL;


--
-- Name: chat_flow_events chat_flow_events_selected_option_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_flow_events
    ADD CONSTRAINT chat_flow_events_selected_option_id_fkey FOREIGN KEY (selected_option_id) REFERENCES joyeriaartesanos.chat_flow_options(id) ON DELETE SET NULL;


--
-- Name: chat_flow_node_blocks chat_flow_node_blocks_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_flow_node_blocks
    ADD CONSTRAINT chat_flow_node_blocks_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: chat_flow_node_blocks chat_flow_node_blocks_node_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_flow_node_blocks
    ADD CONSTRAINT chat_flow_node_blocks_node_id_fkey FOREIGN KEY (node_id) REFERENCES joyeriaartesanos.chat_flow_nodes(id) ON DELETE CASCADE;


--
-- Name: chat_flow_nodes chat_flow_nodes_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_flow_nodes
    ADD CONSTRAINT chat_flow_nodes_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: chat_flow_options chat_flow_options_node_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_flow_options
    ADD CONSTRAINT chat_flow_options_node_id_fkey FOREIGN KEY (node_id) REFERENCES joyeriaartesanos.chat_flow_nodes(id) ON DELETE CASCADE;


--
-- Name: chat_flow_recontact_runs chat_flow_recontact_runs_rule_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_flow_recontact_runs
    ADD CONSTRAINT chat_flow_recontact_runs_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES joyeriaartesanos.chat_flow_recontact_rules(id) ON DELETE CASCADE;


--
-- Name: chat_flow_sessions chat_flow_sessions_conversation_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_flow_sessions
    ADD CONSTRAINT chat_flow_sessions_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES joyeriaartesanos.chat_conversations(id) ON DELETE CASCADE;


--
-- Name: chat_flow_sessions chat_flow_sessions_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_flow_sessions
    ADD CONSTRAINT chat_flow_sessions_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: chat_flow_sessions chat_flow_sessions_revendedor_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_flow_sessions
    ADD CONSTRAINT chat_flow_sessions_revendedor_id_fkey FOREIGN KEY (revendedor_id) REFERENCES joyeriaartesanos.sorteo_revendedores(id) ON DELETE SET NULL;


--
-- Name: chat_flows chat_flows_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_flows
    ADD CONSTRAINT chat_flows_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: chat_flows chat_flows_sorteo_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_flows
    ADD CONSTRAINT chat_flows_sorteo_id_fkey FOREIGN KEY (sorteo_id) REFERENCES joyeriaartesanos.sorteos(id) ON DELETE SET NULL;


--
-- Name: chat_messages chat_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_messages
    ADD CONSTRAINT chat_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES joyeriaartesanos.chat_conversations(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_messages
    ADD CONSTRAINT chat_messages_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: chat_queue_channels chat_queue_channels_channel_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_queue_channels
    ADD CONSTRAINT chat_queue_channels_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES joyeriaartesanos.chat_channels(id) ON DELETE CASCADE;


--
-- Name: chat_queue_channels chat_queue_channels_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_queue_channels
    ADD CONSTRAINT chat_queue_channels_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: chat_queue_channels chat_queue_channels_queue_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_queue_channels
    ADD CONSTRAINT chat_queue_channels_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES joyeriaartesanos.chat_queues(id) ON DELETE CASCADE;


--
-- Name: chat_queue_closure_states chat_queue_closure_states_queue_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_queue_closure_states
    ADD CONSTRAINT chat_queue_closure_states_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES joyeriaartesanos.chat_queues(id) ON DELETE CASCADE;


--
-- Name: chat_queue_closure_substates chat_queue_closure_substates_closure_state_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_queue_closure_substates
    ADD CONSTRAINT chat_queue_closure_substates_closure_state_id_fkey FOREIGN KEY (closure_state_id) REFERENCES joyeriaartesanos.chat_queue_closure_states(id) ON DELETE CASCADE;


--
-- Name: chat_queue_supervisors chat_queue_supervisors_queue_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_queue_supervisors
    ADD CONSTRAINT chat_queue_supervisors_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES joyeriaartesanos.chat_queues(id) ON DELETE CASCADE;


--
-- Name: chat_queue_supervisors chat_queue_supervisors_usuario_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_queue_supervisors
    ADD CONSTRAINT chat_queue_supervisors_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES joyeriaartesanos.usuarios(id) ON DELETE CASCADE;


--
-- Name: chat_queues chat_queues_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_queues
    ADD CONSTRAINT chat_queues_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: chat_routing_events chat_routing_events_conversation_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_routing_events
    ADD CONSTRAINT chat_routing_events_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES joyeriaartesanos.chat_conversations(id) ON DELETE CASCADE;


--
-- Name: chat_routing_events chat_routing_events_queue_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_routing_events
    ADD CONSTRAINT chat_routing_events_queue_id_fkey FOREIGN KEY (queue_id) REFERENCES joyeriaartesanos.chat_queues(id) ON DELETE SET NULL;


--
-- Name: chat_supervisor_agents chat_supervisor_agents_agent_usuario_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_supervisor_agents
    ADD CONSTRAINT chat_supervisor_agents_agent_usuario_id_fkey FOREIGN KEY (agent_usuario_id) REFERENCES joyeriaartesanos.usuarios(id) ON DELETE CASCADE;


--
-- Name: chat_supervisor_agents chat_supervisor_agents_supervisor_usuario_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_supervisor_agents
    ADD CONSTRAINT chat_supervisor_agents_supervisor_usuario_id_fkey FOREIGN KEY (supervisor_usuario_id) REFERENCES joyeriaartesanos.usuarios(id) ON DELETE CASCADE;


--
-- Name: chat_usuario_omnicanal chat_usuario_omnicanal_usuario_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_usuario_omnicanal
    ADD CONSTRAINT chat_usuario_omnicanal_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES joyeriaartesanos.usuarios(id) ON DELETE CASCADE;


--
-- Name: chat_usuario_omnicanal chat_usuario_omnicanal_work_schedule_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.chat_usuario_omnicanal
    ADD CONSTRAINT chat_usuario_omnicanal_work_schedule_id_fkey FOREIGN KEY (work_schedule_id) REFERENCES joyeriaartesanos.chat_omnicanal_work_schedules(id) ON DELETE SET NULL;


--
-- Name: cliente_historial cliente_historial_cliente_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.cliente_historial
    ADD CONSTRAINT cliente_historial_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES joyeriaartesanos.clientes(id) ON DELETE CASCADE;


--
-- Name: cliente_historial cliente_historial_creado_por_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.cliente_historial
    ADD CONSTRAINT cliente_historial_creado_por_auth_user_id_fkey FOREIGN KEY (creado_por_auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: cliente_historial cliente_historial_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.cliente_historial
    ADD CONSTRAINT cliente_historial_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: cliente_obligaciones_tributarias cliente_obligaciones_tributarias_cliente_perfil_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.cliente_obligaciones_tributarias
    ADD CONSTRAINT cliente_obligaciones_tributarias_cliente_perfil_id_fkey FOREIGN KEY (cliente_perfil_id) REFERENCES joyeriaartesanos.cliente_perfil_tributario(id) ON DELETE CASCADE;


--
-- Name: cliente_obligaciones_tributarias cliente_obligaciones_tributarias_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.cliente_obligaciones_tributarias
    ADD CONSTRAINT cliente_obligaciones_tributarias_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: cliente_obligaciones_tributarias cliente_obligaciones_tributarias_obligacion_catalogo_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.cliente_obligaciones_tributarias
    ADD CONSTRAINT cliente_obligaciones_tributarias_obligacion_catalogo_id_fkey FOREIGN KEY (obligacion_catalogo_id) REFERENCES joyeriaartesanos.obligaciones_tributarias_catalogo(id) ON DELETE CASCADE;


--
-- Name: cliente_perfil_tributario cliente_perfil_tributario_cliente_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.cliente_perfil_tributario
    ADD CONSTRAINT cliente_perfil_tributario_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES joyeriaartesanos.clientes(id) ON DELETE CASCADE;


--
-- Name: cliente_perfil_tributario cliente_perfil_tributario_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.cliente_perfil_tributario
    ADD CONSTRAINT cliente_perfil_tributario_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: cliente_tipos_servicio_catalogo cliente_tipos_servicio_catalogo_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.cliente_tipos_servicio_catalogo
    ADD CONSTRAINT cliente_tipos_servicio_catalogo_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: clientes clientes_baja_operativa_by_user_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.clientes
    ADD CONSTRAINT clientes_baja_operativa_by_user_id_fkey FOREIGN KEY (baja_operativa_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: clientes clientes_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.clientes
    ADD CONSTRAINT clientes_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: clientes clientes_deleted_by_user_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.clientes
    ADD CONSTRAINT clientes_deleted_by_user_id_fkey FOREIGN KEY (deleted_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: clientes clientes_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.clientes
    ADD CONSTRAINT clientes_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: clientes clientes_plan_comercial_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.clientes
    ADD CONSTRAINT clientes_plan_comercial_id_fkey FOREIGN KEY (plan_comercial_id) REFERENCES joyeriaartesanos.planes(id) ON DELETE SET NULL;


--
-- Name: clientes clientes_vendedor_usuario_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.clientes
    ADD CONSTRAINT clientes_vendedor_usuario_id_fkey FOREIGN KEY (vendedor_usuario_id) REFERENCES joyeriaartesanos.usuarios(id) ON DELETE SET NULL;


--
-- Name: comision_ajustes comision_ajustes_created_by_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.comision_ajustes
    ADD CONSTRAINT comision_ajustes_created_by_fkey FOREIGN KEY (created_by) REFERENCES joyeriaartesanos.usuarios(id) ON DELETE SET NULL;


--
-- Name: comision_ajustes comision_ajustes_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.comision_ajustes
    ADD CONSTRAINT comision_ajustes_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: comision_ajustes comision_ajustes_linea_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.comision_ajustes
    ADD CONSTRAINT comision_ajustes_linea_id_fkey FOREIGN KEY (linea_id) REFERENCES joyeriaartesanos.comision_lineas(id) ON DELETE SET NULL;


--
-- Name: comision_ajustes comision_ajustes_periodo_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.comision_ajustes
    ADD CONSTRAINT comision_ajustes_periodo_id_fkey FOREIGN KEY (periodo_id) REFERENCES joyeriaartesanos.comision_periodos(id) ON DELETE SET NULL;


--
-- Name: comision_equipo_miembros comision_equipo_miembros_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.comision_equipo_miembros
    ADD CONSTRAINT comision_equipo_miembros_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: comision_equipo_miembros comision_equipo_miembros_equipo_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.comision_equipo_miembros
    ADD CONSTRAINT comision_equipo_miembros_equipo_id_fkey FOREIGN KEY (equipo_id) REFERENCES joyeriaartesanos.comision_equipos(id) ON DELETE CASCADE;


--
-- Name: comision_equipo_miembros comision_equipo_miembros_usuario_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.comision_equipo_miembros
    ADD CONSTRAINT comision_equipo_miembros_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES joyeriaartesanos.usuarios(id) ON DELETE CASCADE;


--
-- Name: comision_equipos comision_equipos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.comision_equipos
    ADD CONSTRAINT comision_equipos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: comision_equipos comision_equipos_supervisor_usuario_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.comision_equipos
    ADD CONSTRAINT comision_equipos_supervisor_usuario_id_fkey FOREIGN KEY (supervisor_usuario_id) REFERENCES joyeriaartesanos.usuarios(id) ON DELETE CASCADE;


--
-- Name: comision_escalas comision_escalas_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.comision_escalas
    ADD CONSTRAINT comision_escalas_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: comision_escalas comision_escalas_politica_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.comision_escalas
    ADD CONSTRAINT comision_escalas_politica_id_fkey FOREIGN KEY (politica_id) REFERENCES joyeriaartesanos.comision_politicas(id) ON DELETE CASCADE;


--
-- Name: comision_lineas comision_lineas_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.comision_lineas
    ADD CONSTRAINT comision_lineas_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: comision_lineas comision_lineas_periodo_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.comision_lineas
    ADD CONSTRAINT comision_lineas_periodo_id_fkey FOREIGN KEY (periodo_id) REFERENCES joyeriaartesanos.comision_periodos(id) ON DELETE CASCADE;


--
-- Name: comision_lineas comision_lineas_usuario_vendedor_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.comision_lineas
    ADD CONSTRAINT comision_lineas_usuario_vendedor_id_fkey FOREIGN KEY (usuario_vendedor_id) REFERENCES joyeriaartesanos.usuarios(id) ON DELETE RESTRICT;


--
-- Name: comision_periodos comision_periodos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.comision_periodos
    ADD CONSTRAINT comision_periodos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: comision_periodos comision_periodos_politica_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.comision_periodos
    ADD CONSTRAINT comision_periodos_politica_id_fkey FOREIGN KEY (politica_id) REFERENCES joyeriaartesanos.comision_politicas(id) ON DELETE RESTRICT;


--
-- Name: comision_politica_versiones comision_politica_versiones_created_by_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.comision_politica_versiones
    ADD CONSTRAINT comision_politica_versiones_created_by_fkey FOREIGN KEY (created_by) REFERENCES joyeriaartesanos.usuarios(id) ON DELETE SET NULL;


--
-- Name: comision_politica_versiones comision_politica_versiones_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.comision_politica_versiones
    ADD CONSTRAINT comision_politica_versiones_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: comision_politica_versiones comision_politica_versiones_politica_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.comision_politica_versiones
    ADD CONSTRAINT comision_politica_versiones_politica_id_fkey FOREIGN KEY (politica_id) REFERENCES joyeriaartesanos.comision_politicas(id) ON DELETE CASCADE;


--
-- Name: comision_politicas comision_politicas_created_by_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.comision_politicas
    ADD CONSTRAINT comision_politicas_created_by_fkey FOREIGN KEY (created_by) REFERENCES joyeriaartesanos.usuarios(id) ON DELETE SET NULL;


--
-- Name: comision_politicas comision_politicas_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.comision_politicas
    ADD CONSTRAINT comision_politicas_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: comision_politicas comision_politicas_updated_by_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.comision_politicas
    ADD CONSTRAINT comision_politicas_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES joyeriaartesanos.usuarios(id) ON DELETE SET NULL;


--
-- Name: compras compras_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.compras
    ADD CONSTRAINT compras_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: compras compras_producto_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.compras
    ADD CONSTRAINT compras_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES joyeriaartesanos.productos(id) ON DELETE RESTRICT;


--
-- Name: compras compras_proveedor_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.compras
    ADD CONSTRAINT compras_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES joyeriaartesanos.proveedores(id) ON DELETE RESTRICT;


--
-- Name: crm_etapas crm_etapas_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.crm_etapas
    ADD CONSTRAINT crm_etapas_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: crm_notas crm_notas_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.crm_notas
    ADD CONSTRAINT crm_notas_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: crm_notas crm_notas_prospecto_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.crm_notas
    ADD CONSTRAINT crm_notas_prospecto_id_fkey FOREIGN KEY (prospecto_id) REFERENCES joyeriaartesanos.crm_prospectos(id) ON DELETE CASCADE;


--
-- Name: crm_prospectos crm_prospectos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.crm_prospectos
    ADD CONSTRAINT crm_prospectos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: empresa_autoimpresor_config empresa_autoimpresor_config_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.empresa_autoimpresor_config
    ADD CONSTRAINT empresa_autoimpresor_config_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: empresa_dashboard_views empresa_dashboard_views_dashboard_view_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.empresa_dashboard_views
    ADD CONSTRAINT empresa_dashboard_views_dashboard_view_id_fkey FOREIGN KEY (dashboard_view_id) REFERENCES joyeriaartesanos.dashboard_views(id) ON DELETE CASCADE;


--
-- Name: empresa_dashboard_views empresa_dashboard_views_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.empresa_dashboard_views
    ADD CONSTRAINT empresa_dashboard_views_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: empresa_facturacion_modo empresa_facturacion_modo_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.empresa_facturacion_modo
    ADD CONSTRAINT empresa_facturacion_modo_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: empresa_modulos empresa_modulos_modulo_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.empresa_modulos
    ADD CONSTRAINT empresa_modulos_modulo_id_fkey FOREIGN KEY (modulo_id) REFERENCES joyeriaartesanos.modulos(id);


--
-- Name: empresa_sifen_config empresa_sifen_config_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.empresa_sifen_config
    ADD CONSTRAINT empresa_sifen_config_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: factura_electronica factura_electronica_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.factura_electronica
    ADD CONSTRAINT factura_electronica_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: factura_electronica_evento factura_electronica_evento_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.factura_electronica_evento
    ADD CONSTRAINT factura_electronica_evento_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: factura_electronica_evento factura_electronica_evento_factura_electronica_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.factura_electronica_evento
    ADD CONSTRAINT factura_electronica_evento_factura_electronica_id_fkey FOREIGN KEY (factura_electronica_id) REFERENCES joyeriaartesanos.factura_electronica(id) ON DELETE CASCADE;


--
-- Name: factura_electronica factura_electronica_factura_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.factura_electronica
    ADD CONSTRAINT factura_electronica_factura_id_fkey FOREIGN KEY (factura_id) REFERENCES joyeriaartesanos.facturas(id) ON DELETE CASCADE;


--
-- Name: factura_items factura_items_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.factura_items
    ADD CONSTRAINT factura_items_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: factura_items factura_items_factura_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.factura_items
    ADD CONSTRAINT factura_items_factura_id_fkey FOREIGN KEY (factura_id) REFERENCES joyeriaartesanos.facturas(id) ON DELETE CASCADE;


--
-- Name: facturas facturas_cliente_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.facturas
    ADD CONSTRAINT facturas_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES joyeriaartesanos.clientes(id) ON DELETE RESTRICT;


--
-- Name: facturas facturas_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.facturas
    ADD CONSTRAINT facturas_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: facturas facturas_suscripcion_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.facturas
    ADD CONSTRAINT facturas_suscripcion_id_fkey FOREIGN KEY (suscripcion_id) REFERENCES joyeriaartesanos.suscripciones(id) ON DELETE SET NULL;


--
-- Name: gastos gastos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.gastos
    ADD CONSTRAINT gastos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: imports_audit imports_audit_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.imports_audit
    ADD CONSTRAINT imports_audit_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: inventario_stock_ubicacion inventario_stock_ubicacion_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.inventario_stock_ubicacion
    ADD CONSTRAINT inventario_stock_ubicacion_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: inventario_stock_ubicacion inventario_stock_ubicacion_producto_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.inventario_stock_ubicacion
    ADD CONSTRAINT inventario_stock_ubicacion_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES joyeriaartesanos.productos(id) ON DELETE CASCADE;


--
-- Name: inventario_stock_ubicacion inventario_stock_ubicacion_ubicacion_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.inventario_stock_ubicacion
    ADD CONSTRAINT inventario_stock_ubicacion_ubicacion_id_fkey FOREIGN KEY (ubicacion_id) REFERENCES joyeriaartesanos.inventario_ubicaciones(id) ON DELETE CASCADE;


--
-- Name: inventario_ubicaciones inventario_ubicaciones_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.inventario_ubicaciones
    ADD CONSTRAINT inventario_ubicaciones_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: inventario_ubicaciones inventario_ubicaciones_parent_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.inventario_ubicaciones
    ADD CONSTRAINT inventario_ubicaciones_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES joyeriaartesanos.inventario_ubicaciones(id) ON DELETE SET NULL;


--
-- Name: marca_categorias marca_categorias_categoria_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.marca_categorias
    ADD CONSTRAINT marca_categorias_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES joyeriaartesanos.categorias_productos(id) ON DELETE CASCADE;


--
-- Name: marca_categorias marca_categorias_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.marca_categorias
    ADD CONSTRAINT marca_categorias_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id);


--
-- Name: marca_categorias marca_categorias_marca_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.marca_categorias
    ADD CONSTRAINT marca_categorias_marca_id_fkey FOREIGN KEY (marca_id) REFERENCES joyeriaartesanos.marcas(id) ON DELETE CASCADE;


--
-- Name: marcas marcas_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.marcas
    ADD CONSTRAINT marcas_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id);


--
-- Name: marketing_calendarios marketing_calendarios_cliente_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.marketing_calendarios
    ADD CONSTRAINT marketing_calendarios_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES joyeriaartesanos.clientes(id) ON DELETE SET NULL;


--
-- Name: marketing_calendarios marketing_calendarios_created_by_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.marketing_calendarios
    ADD CONSTRAINT marketing_calendarios_created_by_fkey FOREIGN KEY (created_by) REFERENCES joyeriaartesanos.usuarios(id) ON DELETE SET NULL;


--
-- Name: marketing_calendarios marketing_calendarios_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.marketing_calendarios
    ADD CONSTRAINT marketing_calendarios_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: marketing_calendarios marketing_calendarios_updated_by_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.marketing_calendarios
    ADD CONSTRAINT marketing_calendarios_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES joyeriaartesanos.usuarios(id) ON DELETE SET NULL;


--
-- Name: marketing_comentarios marketing_comentarios_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.marketing_comentarios
    ADD CONSTRAINT marketing_comentarios_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: marketing_comentarios marketing_comentarios_pieza_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.marketing_comentarios
    ADD CONSTRAINT marketing_comentarios_pieza_id_fkey FOREIGN KEY (pieza_id) REFERENCES joyeriaartesanos.marketing_piezas(id) ON DELETE CASCADE;


--
-- Name: marketing_comentarios marketing_comentarios_usuario_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.marketing_comentarios
    ADD CONSTRAINT marketing_comentarios_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES joyeriaartesanos.usuarios(id) ON DELETE SET NULL;


--
-- Name: marketing_historial_estados marketing_historial_estados_changed_by_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.marketing_historial_estados
    ADD CONSTRAINT marketing_historial_estados_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES joyeriaartesanos.usuarios(id) ON DELETE SET NULL;


--
-- Name: marketing_historial_estados marketing_historial_estados_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.marketing_historial_estados
    ADD CONSTRAINT marketing_historial_estados_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: marketing_historial_estados marketing_historial_estados_pieza_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.marketing_historial_estados
    ADD CONSTRAINT marketing_historial_estados_pieza_id_fkey FOREIGN KEY (pieza_id) REFERENCES joyeriaartesanos.marketing_piezas(id) ON DELETE CASCADE;


--
-- Name: marketing_piezas marketing_piezas_calendario_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.marketing_piezas
    ADD CONSTRAINT marketing_piezas_calendario_id_fkey FOREIGN KEY (calendario_id) REFERENCES joyeriaartesanos.marketing_calendarios(id) ON DELETE SET NULL;


--
-- Name: marketing_piezas marketing_piezas_cliente_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.marketing_piezas
    ADD CONSTRAINT marketing_piezas_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES joyeriaartesanos.clientes(id) ON DELETE SET NULL;


--
-- Name: marketing_piezas marketing_piezas_created_by_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.marketing_piezas
    ADD CONSTRAINT marketing_piezas_created_by_fkey FOREIGN KEY (created_by) REFERENCES joyeriaartesanos.usuarios(id) ON DELETE SET NULL;


--
-- Name: marketing_piezas marketing_piezas_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.marketing_piezas
    ADD CONSTRAINT marketing_piezas_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: marketing_piezas marketing_piezas_responsable_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.marketing_piezas
    ADD CONSTRAINT marketing_piezas_responsable_id_fkey FOREIGN KEY (responsable_id) REFERENCES joyeriaartesanos.usuarios(id) ON DELETE SET NULL;


--
-- Name: marketing_piezas marketing_piezas_updated_by_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.marketing_piezas
    ADD CONSTRAINT marketing_piezas_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES joyeriaartesanos.usuarios(id) ON DELETE SET NULL;


--
-- Name: marketing_tasks marketing_tasks_cliente_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.marketing_tasks
    ADD CONSTRAINT marketing_tasks_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES joyeriaartesanos.clientes(id) ON DELETE CASCADE;


--
-- Name: marketing_tasks marketing_tasks_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.marketing_tasks
    ADD CONSTRAINT marketing_tasks_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: marketing_tasks marketing_tasks_plan_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.marketing_tasks
    ADD CONSTRAINT marketing_tasks_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES joyeriaartesanos.planes(id) ON DELETE SET NULL;


--
-- Name: marketing_tasks marketing_tasks_responsable_user_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.marketing_tasks
    ADD CONSTRAINT marketing_tasks_responsable_user_id_fkey FOREIGN KEY (responsable_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: marketing_tasks marketing_tasks_suscripcion_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.marketing_tasks
    ADD CONSTRAINT marketing_tasks_suscripcion_id_fkey FOREIGN KEY (suscripcion_id) REFERENCES joyeriaartesanos.suscripciones(id) ON DELETE SET NULL;


--
-- Name: movimientos_inventario movimientos_inventario_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.movimientos_inventario
    ADD CONSTRAINT movimientos_inventario_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: movimientos_inventario movimientos_inventario_producto_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.movimientos_inventario
    ADD CONSTRAINT movimientos_inventario_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES joyeriaartesanos.productos(id) ON DELETE RESTRICT;


--
-- Name: movimientos_inventario movimientos_inventario_venta_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.movimientos_inventario
    ADD CONSTRAINT movimientos_inventario_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES joyeriaartesanos.ventas(id) ON DELETE SET NULL;


--
-- Name: nota_credito nota_credito_cliente_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.nota_credito
    ADD CONSTRAINT nota_credito_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES joyeriaartesanos.clientes(id) ON DELETE RESTRICT;


--
-- Name: nota_credito nota_credito_created_by_user_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.nota_credito
    ADD CONSTRAINT nota_credito_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: nota_credito_electronica nota_credito_electronica_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.nota_credito_electronica
    ADD CONSTRAINT nota_credito_electronica_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: nota_credito_electronica nota_credito_electronica_nota_credito_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.nota_credito_electronica
    ADD CONSTRAINT nota_credito_electronica_nota_credito_id_fkey FOREIGN KEY (nota_credito_id) REFERENCES joyeriaartesanos.nota_credito(id) ON DELETE CASCADE;


--
-- Name: nota_credito nota_credito_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.nota_credito
    ADD CONSTRAINT nota_credito_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: nota_credito_evento nota_credito_evento_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.nota_credito_evento
    ADD CONSTRAINT nota_credito_evento_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: nota_credito_evento nota_credito_evento_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.nota_credito_evento
    ADD CONSTRAINT nota_credito_evento_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: nota_credito_evento nota_credito_evento_nota_credito_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.nota_credito_evento
    ADD CONSTRAINT nota_credito_evento_nota_credito_id_fkey FOREIGN KEY (nota_credito_id) REFERENCES joyeriaartesanos.nota_credito(id) ON DELETE CASCADE;


--
-- Name: nota_credito nota_credito_factura_electronica_origen_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.nota_credito
    ADD CONSTRAINT nota_credito_factura_electronica_origen_id_fkey FOREIGN KEY (factura_electronica_origen_id) REFERENCES joyeriaartesanos.factura_electronica(id) ON DELETE SET NULL;


--
-- Name: nota_credito nota_credito_factura_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.nota_credito
    ADD CONSTRAINT nota_credito_factura_id_fkey FOREIGN KEY (factura_id) REFERENCES joyeriaartesanos.facturas(id) ON DELETE RESTRICT;


--
-- Name: notas_olfativas notas_olfativas_familia_fk; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.notas_olfativas
    ADD CONSTRAINT notas_olfativas_familia_fk FOREIGN KEY (familia_id) REFERENCES joyeriaartesanos.familias_olfativas(id) ON DELETE SET NULL;


--
-- Name: omnichannel_routes omnichannel_routes_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.omnichannel_routes
    ADD CONSTRAINT omnichannel_routes_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: pagos pagos_cliente_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.pagos
    ADD CONSTRAINT pagos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES joyeriaartesanos.clientes(id) ON DELETE SET NULL;


--
-- Name: pagos pagos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.pagos
    ADD CONSTRAINT pagos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: pagos pagos_factura_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.pagos
    ADD CONSTRAINT pagos_factura_id_fkey FOREIGN KEY (factura_id) REFERENCES joyeriaartesanos.facturas(id) ON DELETE CASCADE;


--
-- Name: pagos pagos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.pagos
    ADD CONSTRAINT pagos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: pedidos_web_items pedidos_web_items_pedido_fk; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.pedidos_web_items
    ADD CONSTRAINT pedidos_web_items_pedido_fk FOREIGN KEY (pedido_id) REFERENCES joyeriaartesanos.pedidos_web(id) ON DELETE CASCADE;


--
-- Name: pedidos_web_items pedidos_web_items_presentacion_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.pedidos_web_items
    ADD CONSTRAINT pedidos_web_items_presentacion_id_fkey FOREIGN KEY (presentacion_id) REFERENCES joyeriaartesanos.producto_presentaciones(id);


--
-- Name: pedidos_web_items pedidos_web_items_producto_fk; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.pedidos_web_items
    ADD CONSTRAINT pedidos_web_items_producto_fk FOREIGN KEY (producto_id) REFERENCES joyeriaartesanos.productos(id);


--
-- Name: planes planes_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.planes
    ADD CONSTRAINT planes_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: producto_acordes producto_acordes_acorde_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.producto_acordes
    ADD CONSTRAINT producto_acordes_acorde_id_fkey FOREIGN KEY (acorde_id) REFERENCES joyeriaartesanos.acordes_olfativos(id) ON DELETE CASCADE;


--
-- Name: producto_acordes producto_acordes_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.producto_acordes
    ADD CONSTRAINT producto_acordes_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id);


--
-- Name: producto_acordes producto_acordes_producto_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.producto_acordes
    ADD CONSTRAINT producto_acordes_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES joyeriaartesanos.productos(id) ON DELETE CASCADE;


--
-- Name: producto_categorias producto_categorias_categoria_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.producto_categorias
    ADD CONSTRAINT producto_categorias_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES joyeriaartesanos.categorias_productos(id) ON DELETE CASCADE;


--
-- Name: producto_categorias producto_categorias_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.producto_categorias
    ADD CONSTRAINT producto_categorias_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: producto_categorias producto_categorias_producto_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.producto_categorias
    ADD CONSTRAINT producto_categorias_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES joyeriaartesanos.productos(id) ON DELETE CASCADE;


--
-- Name: producto_imagenes producto_imagenes_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.producto_imagenes
    ADD CONSTRAINT producto_imagenes_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id);


--
-- Name: producto_imagenes producto_imagenes_producto_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.producto_imagenes
    ADD CONSTRAINT producto_imagenes_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES joyeriaartesanos.productos(id) ON DELETE CASCADE;


--
-- Name: producto_notas producto_notas_nota_fk; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.producto_notas
    ADD CONSTRAINT producto_notas_nota_fk FOREIGN KEY (nota_id) REFERENCES joyeriaartesanos.notas_olfativas(id) ON DELETE CASCADE;


--
-- Name: producto_notas producto_notas_producto_fk; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.producto_notas
    ADD CONSTRAINT producto_notas_producto_fk FOREIGN KEY (producto_id) REFERENCES joyeriaartesanos.productos(id) ON DELETE CASCADE;


--
-- Name: producto_presentaciones producto_presentaciones_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.producto_presentaciones
    ADD CONSTRAINT producto_presentaciones_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id);


--
-- Name: producto_presentaciones producto_presentaciones_producto_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.producto_presentaciones
    ADD CONSTRAINT producto_presentaciones_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES joyeriaartesanos.productos(id) ON DELETE CASCADE;


--
-- Name: productos productos_categoria_principal_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.productos
    ADD CONSTRAINT productos_categoria_principal_id_fkey FOREIGN KEY (categoria_principal_id) REFERENCES joyeriaartesanos.categorias_productos(id) ON DELETE SET NULL;


--
-- Name: productos productos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.productos
    ADD CONSTRAINT productos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: productos productos_familia_olfativa_fk; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.productos
    ADD CONSTRAINT productos_familia_olfativa_fk FOREIGN KEY (familia_olfativa_id) REFERENCES joyeriaartesanos.familias_olfativas(id) ON DELETE SET NULL;


--
-- Name: productos productos_marca_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.productos
    ADD CONSTRAINT productos_marca_id_fkey FOREIGN KEY (marca_id) REFERENCES joyeriaartesanos.marcas(id);


--
-- Name: productos productos_proveedor_principal_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.productos
    ADD CONSTRAINT productos_proveedor_principal_id_fkey FOREIGN KEY (proveedor_principal_id) REFERENCES joyeriaartesanos.proveedores(id) ON DELETE SET NULL;


--
-- Name: productos_sku_secuencia productos_sku_secuencia_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.productos_sku_secuencia
    ADD CONSTRAINT productos_sku_secuencia_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id);


--
-- Name: productos productos_ubicacion_principal_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.productos
    ADD CONSTRAINT productos_ubicacion_principal_id_fkey FOREIGN KEY (ubicacion_principal_id) REFERENCES joyeriaartesanos.inventario_ubicaciones(id) ON DELETE SET NULL;


--
-- Name: proveedor_categoria_rel proveedor_categoria_rel_categoria_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proveedor_categoria_rel
    ADD CONSTRAINT proveedor_categoria_rel_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES joyeriaartesanos.proveedor_categorias(id) ON DELETE CASCADE;


--
-- Name: proveedor_categoria_rel proveedor_categoria_rel_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proveedor_categoria_rel
    ADD CONSTRAINT proveedor_categoria_rel_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: proveedor_categoria_rel proveedor_categoria_rel_proveedor_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proveedor_categoria_rel
    ADD CONSTRAINT proveedor_categoria_rel_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES joyeriaartesanos.proveedores(id) ON DELETE CASCADE;


--
-- Name: proveedor_categorias proveedor_categorias_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proveedor_categorias
    ADD CONSTRAINT proveedor_categorias_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: proveedor_productos proveedor_productos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proveedor_productos
    ADD CONSTRAINT proveedor_productos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: proveedor_productos proveedor_productos_producto_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proveedor_productos
    ADD CONSTRAINT proveedor_productos_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES joyeriaartesanos.productos(id) ON DELETE CASCADE;


--
-- Name: proveedor_productos proveedor_productos_proveedor_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proveedor_productos
    ADD CONSTRAINT proveedor_productos_proveedor_id_fkey FOREIGN KEY (proveedor_id) REFERENCES joyeriaartesanos.proveedores(id) ON DELETE CASCADE;


--
-- Name: proveedores proveedores_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proveedores
    ADD CONSTRAINT proveedores_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: proyecto_archivos proyecto_archivos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyecto_archivos
    ADD CONSTRAINT proyecto_archivos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: proyecto_archivos proyecto_archivos_proyecto_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyecto_archivos
    ADD CONSTRAINT proyecto_archivos_proyecto_id_fkey FOREIGN KEY (proyecto_id) REFERENCES joyeriaartesanos.proyectos(id) ON DELETE CASCADE;


--
-- Name: proyecto_archivos proyecto_archivos_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyecto_archivos
    ADD CONSTRAINT proyecto_archivos_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES joyeriaartesanos.usuarios(id) ON DELETE SET NULL;


--
-- Name: proyecto_comentarios proyecto_comentarios_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyecto_comentarios
    ADD CONSTRAINT proyecto_comentarios_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: proyecto_comentarios proyecto_comentarios_proyecto_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyecto_comentarios
    ADD CONSTRAINT proyecto_comentarios_proyecto_id_fkey FOREIGN KEY (proyecto_id) REFERENCES joyeriaartesanos.proyectos(id) ON DELETE CASCADE;


--
-- Name: proyecto_comentarios proyecto_comentarios_usuario_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyecto_comentarios
    ADD CONSTRAINT proyecto_comentarios_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES joyeriaartesanos.usuarios(id) ON DELETE CASCADE;


--
-- Name: proyecto_estado_historial proyecto_estado_historial_changed_by_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyecto_estado_historial
    ADD CONSTRAINT proyecto_estado_historial_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES joyeriaartesanos.usuarios(id) ON DELETE SET NULL;


--
-- Name: proyecto_estado_historial proyecto_estado_historial_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyecto_estado_historial
    ADD CONSTRAINT proyecto_estado_historial_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: proyecto_estado_historial proyecto_estado_historial_estado_anterior_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyecto_estado_historial
    ADD CONSTRAINT proyecto_estado_historial_estado_anterior_id_fkey FOREIGN KEY (estado_anterior_id) REFERENCES joyeriaartesanos.proyecto_estados(id) ON DELETE SET NULL;


--
-- Name: proyecto_estado_historial proyecto_estado_historial_estado_nuevo_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyecto_estado_historial
    ADD CONSTRAINT proyecto_estado_historial_estado_nuevo_id_fkey FOREIGN KEY (estado_nuevo_id) REFERENCES joyeriaartesanos.proyecto_estados(id) ON DELETE RESTRICT;


--
-- Name: proyecto_estado_historial proyecto_estado_historial_proyecto_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyecto_estado_historial
    ADD CONSTRAINT proyecto_estado_historial_proyecto_id_fkey FOREIGN KEY (proyecto_id) REFERENCES joyeriaartesanos.proyectos(id) ON DELETE CASCADE;


--
-- Name: proyecto_estados proyecto_estados_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyecto_estados
    ADD CONSTRAINT proyecto_estados_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: proyecto_prioridades_config proyecto_prioridades_config_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyecto_prioridades_config
    ADD CONSTRAINT proyecto_prioridades_config_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: proyecto_tareas proyecto_tareas_created_by_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyecto_tareas
    ADD CONSTRAINT proyecto_tareas_created_by_fkey FOREIGN KEY (created_by) REFERENCES joyeriaartesanos.usuarios(id) ON DELETE SET NULL;


--
-- Name: proyecto_tareas proyecto_tareas_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyecto_tareas
    ADD CONSTRAINT proyecto_tareas_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: proyecto_tareas proyecto_tareas_proyecto_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyecto_tareas
    ADD CONSTRAINT proyecto_tareas_proyecto_id_fkey FOREIGN KEY (proyecto_id) REFERENCES joyeriaartesanos.proyectos(id) ON DELETE CASCADE;


--
-- Name: proyecto_tareas proyecto_tareas_responsable_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyecto_tareas
    ADD CONSTRAINT proyecto_tareas_responsable_id_fkey FOREIGN KEY (responsable_id) REFERENCES joyeriaartesanos.usuarios(id) ON DELETE SET NULL;


--
-- Name: proyecto_tipos proyecto_tipos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyecto_tipos
    ADD CONSTRAINT proyecto_tipos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: proyectos proyectos_cliente_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyectos
    ADD CONSTRAINT proyectos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES joyeriaartesanos.clientes(id) ON DELETE SET NULL;


--
-- Name: proyectos proyectos_created_by_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyectos
    ADD CONSTRAINT proyectos_created_by_fkey FOREIGN KEY (created_by) REFERENCES joyeriaartesanos.usuarios(id) ON DELETE SET NULL;


--
-- Name: proyectos proyectos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyectos
    ADD CONSTRAINT proyectos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: proyectos proyectos_estado_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyectos
    ADD CONSTRAINT proyectos_estado_id_fkey FOREIGN KEY (estado_id) REFERENCES joyeriaartesanos.proyecto_estados(id) ON DELETE RESTRICT;


--
-- Name: proyectos proyectos_responsable_comercial_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyectos
    ADD CONSTRAINT proyectos_responsable_comercial_id_fkey FOREIGN KEY (responsable_comercial_id) REFERENCES joyeriaartesanos.usuarios(id) ON DELETE SET NULL;


--
-- Name: proyectos proyectos_responsable_tecnico_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyectos
    ADD CONSTRAINT proyectos_responsable_tecnico_id_fkey FOREIGN KEY (responsable_tecnico_id) REFERENCES joyeriaartesanos.usuarios(id) ON DELETE SET NULL;


--
-- Name: proyectos proyectos_tipo_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyectos
    ADD CONSTRAINT proyectos_tipo_id_fkey FOREIGN KEY (tipo_id) REFERENCES joyeriaartesanos.proyecto_tipos(id) ON DELETE RESTRICT;


--
-- Name: proyectos proyectos_updated_by_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.proyectos
    ADD CONSTRAINT proyectos_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES joyeriaartesanos.usuarios(id) ON DELETE SET NULL;


--
-- Name: resenas_videos resenas_videos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.resenas_videos
    ADD CONSTRAINT resenas_videos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: sorteo_conversaciones sorteo_conversaciones_cliente_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.sorteo_conversaciones
    ADD CONSTRAINT sorteo_conversaciones_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES joyeriaartesanos.clientes(id) ON DELETE SET NULL;


--
-- Name: sorteo_conversaciones sorteo_conversaciones_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.sorteo_conversaciones
    ADD CONSTRAINT sorteo_conversaciones_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: sorteo_conversaciones sorteo_conversaciones_sorteo_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.sorteo_conversaciones
    ADD CONSTRAINT sorteo_conversaciones_sorteo_id_fkey FOREIGN KEY (sorteo_id) REFERENCES joyeriaartesanos.sorteos(id) ON DELETE CASCADE;


--
-- Name: sorteo_cupones sorteo_cupones_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.sorteo_cupones
    ADD CONSTRAINT sorteo_cupones_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: sorteo_cupones sorteo_cupones_entrada_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.sorteo_cupones
    ADD CONSTRAINT sorteo_cupones_entrada_id_fkey FOREIGN KEY (entrada_id) REFERENCES joyeriaartesanos.sorteo_entradas(id) ON DELETE CASCADE;


--
-- Name: sorteo_cupones sorteo_cupones_sorteo_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.sorteo_cupones
    ADD CONSTRAINT sorteo_cupones_sorteo_id_fkey FOREIGN KEY (sorteo_id) REFERENCES joyeriaartesanos.sorteos(id) ON DELETE CASCADE;


--
-- Name: sorteo_entradas sorteo_entradas_chat_conversation_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.sorteo_entradas
    ADD CONSTRAINT sorteo_entradas_chat_conversation_id_fkey FOREIGN KEY (chat_conversation_id) REFERENCES joyeriaartesanos.chat_conversations(id) ON DELETE SET NULL;


--
-- Name: sorteo_entradas sorteo_entradas_cliente_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.sorteo_entradas
    ADD CONSTRAINT sorteo_entradas_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES joyeriaartesanos.clientes(id) ON DELETE SET NULL;


--
-- Name: sorteo_entradas sorteo_entradas_comprobante_validacion_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.sorteo_entradas
    ADD CONSTRAINT sorteo_entradas_comprobante_validacion_id_fkey FOREIGN KEY (comprobante_validacion_id) REFERENCES joyeriaartesanos.chat_comprobante_validaciones(id) ON DELETE SET NULL;


--
-- Name: sorteo_entradas sorteo_entradas_conversacion_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.sorteo_entradas
    ADD CONSTRAINT sorteo_entradas_conversacion_id_fkey FOREIGN KEY (conversacion_id) REFERENCES joyeriaartesanos.sorteo_conversaciones(id) ON DELETE SET NULL;


--
-- Name: sorteo_entradas sorteo_entradas_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.sorteo_entradas
    ADD CONSTRAINT sorteo_entradas_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: sorteo_entradas sorteo_entradas_revendedor_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.sorteo_entradas
    ADD CONSTRAINT sorteo_entradas_revendedor_id_fkey FOREIGN KEY (revendedor_id) REFERENCES joyeriaartesanos.sorteo_revendedores(id) ON DELETE SET NULL;


--
-- Name: sorteo_entradas sorteo_entradas_sorteo_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.sorteo_entradas
    ADD CONSTRAINT sorteo_entradas_sorteo_id_fkey FOREIGN KEY (sorteo_id) REFERENCES joyeriaartesanos.sorteos(id) ON DELETE CASCADE;


--
-- Name: sorteo_revendedor_clicks sorteo_revendedor_clicks_conversation_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.sorteo_revendedor_clicks
    ADD CONSTRAINT sorteo_revendedor_clicks_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES joyeriaartesanos.chat_conversations(id) ON DELETE SET NULL;


--
-- Name: sorteo_revendedor_clicks sorteo_revendedor_clicks_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.sorteo_revendedor_clicks
    ADD CONSTRAINT sorteo_revendedor_clicks_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: sorteo_revendedor_clicks sorteo_revendedor_clicks_flow_session_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.sorteo_revendedor_clicks
    ADD CONSTRAINT sorteo_revendedor_clicks_flow_session_id_fkey FOREIGN KEY (flow_session_id) REFERENCES joyeriaartesanos.chat_flow_sessions(id) ON DELETE SET NULL;


--
-- Name: sorteo_revendedor_clicks sorteo_revendedor_clicks_revendedor_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.sorteo_revendedor_clicks
    ADD CONSTRAINT sorteo_revendedor_clicks_revendedor_id_fkey FOREIGN KEY (revendedor_id) REFERENCES joyeriaartesanos.sorteo_revendedores(id) ON DELETE CASCADE;


--
-- Name: sorteo_revendedor_clicks sorteo_revendedor_clicks_sorteo_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.sorteo_revendedor_clicks
    ADD CONSTRAINT sorteo_revendedor_clicks_sorteo_id_fkey FOREIGN KEY (sorteo_id) REFERENCES joyeriaartesanos.sorteos(id) ON DELETE CASCADE;


--
-- Name: sorteo_revendedores sorteo_revendedores_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.sorteo_revendedores
    ADD CONSTRAINT sorteo_revendedores_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: sorteo_revendedores sorteo_revendedores_sorteo_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.sorteo_revendedores
    ADD CONSTRAINT sorteo_revendedores_sorteo_id_fkey FOREIGN KEY (sorteo_id) REFERENCES joyeriaartesanos.sorteos(id) ON DELETE CASCADE;


--
-- Name: sorteo_ticket_deliveries sorteo_ticket_deliveries_conversation_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.sorteo_ticket_deliveries
    ADD CONSTRAINT sorteo_ticket_deliveries_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES joyeriaartesanos.chat_conversations(id) ON DELETE SET NULL;


--
-- Name: sorteo_ticket_deliveries sorteo_ticket_deliveries_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.sorteo_ticket_deliveries
    ADD CONSTRAINT sorteo_ticket_deliveries_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: sorteo_ticket_deliveries sorteo_ticket_deliveries_entrada_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.sorteo_ticket_deliveries
    ADD CONSTRAINT sorteo_ticket_deliveries_entrada_id_fkey FOREIGN KEY (entrada_id) REFERENCES joyeriaartesanos.sorteo_entradas(id) ON DELETE CASCADE;


--
-- Name: sorteo_ticket_deliveries sorteo_ticket_deliveries_sorteo_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.sorteo_ticket_deliveries
    ADD CONSTRAINT sorteo_ticket_deliveries_sorteo_id_fkey FOREIGN KEY (sorteo_id) REFERENCES joyeriaartesanos.sorteos(id) ON DELETE CASCADE;


--
-- Name: sorteos sorteos_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.sorteos
    ADD CONSTRAINT sorteos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: suscripciones suscripciones_cliente_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.suscripciones
    ADD CONSTRAINT suscripciones_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES joyeriaartesanos.clientes(id) ON DELETE CASCADE;


--
-- Name: suscripciones suscripciones_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.suscripciones
    ADD CONSTRAINT suscripciones_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: suscripciones suscripciones_plan_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.suscripciones
    ADD CONSTRAINT suscripciones_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES joyeriaartesanos.planes(id) ON DELETE SET NULL;


--
-- Name: tipificaciones tipificaciones_cliente_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.tipificaciones
    ADD CONSTRAINT tipificaciones_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES joyeriaartesanos.clientes(id) ON DELETE CASCADE;


--
-- Name: tipificaciones tipificaciones_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.tipificaciones
    ADD CONSTRAINT tipificaciones_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: usuario_dashboard_views usuario_dashboard_views_dashboard_view_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.usuario_dashboard_views
    ADD CONSTRAINT usuario_dashboard_views_dashboard_view_id_fkey FOREIGN KEY (dashboard_view_id) REFERENCES joyeriaartesanos.dashboard_views(id) ON DELETE CASCADE;


--
-- Name: usuario_dashboard_views usuario_dashboard_views_usuario_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.usuario_dashboard_views
    ADD CONSTRAINT usuario_dashboard_views_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES joyeriaartesanos.usuarios(id) ON DELETE CASCADE;


--
-- Name: usuario_modulos usuario_modulos_modulo_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.usuario_modulos
    ADD CONSTRAINT usuario_modulos_modulo_id_fkey FOREIGN KEY (modulo_id) REFERENCES joyeriaartesanos.modulos(id) ON DELETE CASCADE;


--
-- Name: usuario_modulos usuario_modulos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.usuario_modulos
    ADD CONSTRAINT usuario_modulos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES joyeriaartesanos.usuarios(id) ON DELETE CASCADE;


--
-- Name: usuarios usuarios_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.usuarios
    ADD CONSTRAINT usuarios_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: usuarios usuarios_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.usuarios
    ADD CONSTRAINT usuarios_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: ventas ventas_cliente_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.ventas
    ADD CONSTRAINT ventas_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES joyeriaartesanos.clientes(id) ON DELETE SET NULL;


--
-- Name: ventas ventas_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.ventas
    ADD CONSTRAINT ventas_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: ventas_items ventas_items_empresa_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.ventas_items
    ADD CONSTRAINT ventas_items_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE;


--
-- Name: ventas_items ventas_items_producto_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.ventas_items
    ADD CONSTRAINT ventas_items_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES joyeriaartesanos.productos(id) ON DELETE RESTRICT;


--
-- Name: ventas_items ventas_items_venta_id_fkey; Type: FK CONSTRAINT; Schema: elevate; Owner: -
--

ALTER TABLE ONLY joyeriaartesanos.ventas_items
    ADD CONSTRAINT ventas_items_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES joyeriaartesanos.ventas(id) ON DELETE CASCADE;


--
-- Name: acordes_olfativos acordes_delete_authenticated; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY acordes_delete_authenticated ON joyeriaartesanos.acordes_olfativos FOR DELETE TO authenticated USING (true);


--
-- Name: acordes_olfativos acordes_insert_authenticated; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY acordes_insert_authenticated ON joyeriaartesanos.acordes_olfativos FOR INSERT TO authenticated WITH CHECK ((length(btrim(nombre)) > 0));


--
-- Name: acordes_olfativos; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.acordes_olfativos ENABLE ROW LEVEL SECURITY;

--
-- Name: acordes_olfativos acordes_select_anon; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY acordes_select_anon ON joyeriaartesanos.acordes_olfativos FOR SELECT TO anon USING (((visible_web = true) AND (activo = true)));


--
-- Name: acordes_olfativos acordes_select_authenticated; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY acordes_select_authenticated ON joyeriaartesanos.acordes_olfativos FOR SELECT TO authenticated USING (true);


--
-- Name: acordes_olfativos acordes_update_authenticated; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY acordes_update_authenticated ON joyeriaartesanos.acordes_olfativos FOR UPDATE TO authenticated USING (true) WITH CHECK ((length(btrim(nombre)) > 0));


--
-- Name: chat_agents; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.chat_agents ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_agents chat_agents_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_agents_delete ON joyeriaartesanos.chat_agents FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_agents chat_agents_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_agents_insert ON joyeriaartesanos.chat_agents FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_agents chat_agents_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_agents_select ON joyeriaartesanos.chat_agents FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_agents chat_agents_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_agents_update ON joyeriaartesanos.chat_agents FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_campaign_events; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.chat_campaign_events ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_campaign_events chat_campaign_events_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_campaign_events_delete ON joyeriaartesanos.chat_campaign_events FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_campaign_events chat_campaign_events_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_campaign_events_insert ON joyeriaartesanos.chat_campaign_events FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_campaign_events chat_campaign_events_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_campaign_events_select ON joyeriaartesanos.chat_campaign_events FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_campaign_events chat_campaign_events_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_campaign_events_update ON joyeriaartesanos.chat_campaign_events FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_campaign_jobs; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.chat_campaign_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_campaign_jobs chat_campaign_jobs_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_campaign_jobs_delete ON joyeriaartesanos.chat_campaign_jobs FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_campaign_jobs chat_campaign_jobs_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_campaign_jobs_insert ON joyeriaartesanos.chat_campaign_jobs FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_campaign_jobs chat_campaign_jobs_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_campaign_jobs_select ON joyeriaartesanos.chat_campaign_jobs FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_campaign_jobs chat_campaign_jobs_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_campaign_jobs_update ON joyeriaartesanos.chat_campaign_jobs FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_campaign_recipients; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.chat_campaign_recipients ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_campaign_recipients chat_campaign_recipients_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_campaign_recipients_delete ON joyeriaartesanos.chat_campaign_recipients FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_campaign_recipients chat_campaign_recipients_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_campaign_recipients_insert ON joyeriaartesanos.chat_campaign_recipients FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_campaign_recipients chat_campaign_recipients_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_campaign_recipients_select ON joyeriaartesanos.chat_campaign_recipients FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_campaign_recipients chat_campaign_recipients_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_campaign_recipients_update ON joyeriaartesanos.chat_campaign_recipients FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_campaign_templates; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.chat_campaign_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_campaign_templates chat_campaign_templates_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_campaign_templates_delete ON joyeriaartesanos.chat_campaign_templates FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_campaign_templates chat_campaign_templates_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_campaign_templates_insert ON joyeriaartesanos.chat_campaign_templates FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_campaign_templates chat_campaign_templates_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_campaign_templates_select ON joyeriaartesanos.chat_campaign_templates FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_campaign_templates chat_campaign_templates_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_campaign_templates_update ON joyeriaartesanos.chat_campaign_templates FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_campaigns; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.chat_campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_campaigns chat_campaigns_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_campaigns_delete ON joyeriaartesanos.chat_campaigns FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_campaigns chat_campaigns_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_campaigns_insert ON joyeriaartesanos.chat_campaigns FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_campaigns chat_campaigns_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_campaigns_select ON joyeriaartesanos.chat_campaigns FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_campaigns chat_campaigns_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_campaigns_update ON joyeriaartesanos.chat_campaigns FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_channel_quick_replies; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.chat_channel_quick_replies ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_channel_quick_replies chat_channel_quick_replies_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_channel_quick_replies_delete ON joyeriaartesanos.chat_channel_quick_replies FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_channel_quick_replies chat_channel_quick_replies_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_channel_quick_replies_insert ON joyeriaartesanos.chat_channel_quick_replies FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_channel_quick_replies chat_channel_quick_replies_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_channel_quick_replies_select ON joyeriaartesanos.chat_channel_quick_replies FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_channel_quick_replies chat_channel_quick_replies_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_channel_quick_replies_update ON joyeriaartesanos.chat_channel_quick_replies FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_channels; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.chat_channels ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_channels chat_channels_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_channels_delete ON joyeriaartesanos.chat_channels FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_channels chat_channels_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_channels_insert ON joyeriaartesanos.chat_channels FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_channels chat_channels_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_channels_select ON joyeriaartesanos.chat_channels FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_channels chat_channels_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_channels_update ON joyeriaartesanos.chat_channels FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_comprobante_validaciones chat_comp_val_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_comp_val_delete ON joyeriaartesanos.chat_comprobante_validaciones FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_comprobante_validaciones chat_comp_val_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_comp_val_insert ON joyeriaartesanos.chat_comprobante_validaciones FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_comprobante_validaciones chat_comp_val_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_comp_val_select ON joyeriaartesanos.chat_comprobante_validaciones FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_comprobante_validaciones chat_comp_val_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_comp_val_update ON joyeriaartesanos.chat_comprobante_validaciones FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_comprobante_validaciones; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.chat_comprobante_validaciones ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_contacts; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.chat_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_contacts chat_contacts_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_contacts_delete ON joyeriaartesanos.chat_contacts FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_contacts chat_contacts_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_contacts_insert ON joyeriaartesanos.chat_contacts FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_contacts chat_contacts_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_contacts_select ON joyeriaartesanos.chat_contacts FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_contacts chat_contacts_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_contacts_update ON joyeriaartesanos.chat_contacts FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_conversation_closures; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.chat_conversation_closures ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_conversation_closures chat_conversation_closures_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_conversation_closures_insert ON joyeriaartesanos.chat_conversation_closures FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_conversation_closures chat_conversation_closures_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_conversation_closures_select ON joyeriaartesanos.chat_conversation_closures FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_conversations; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.chat_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_conversations chat_conversations_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_conversations_delete ON joyeriaartesanos.chat_conversations FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_conversations chat_conversations_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_conversations_insert ON joyeriaartesanos.chat_conversations FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_conversations chat_conversations_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_conversations_select ON joyeriaartesanos.chat_conversations FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_conversations chat_conversations_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_conversations_update ON joyeriaartesanos.chat_conversations FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_empresa_operator_roles; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.chat_empresa_operator_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_empresa_operator_roles chat_empresa_operator_roles_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_empresa_operator_roles_delete ON joyeriaartesanos.chat_empresa_operator_roles FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_empresa_operator_roles chat_empresa_operator_roles_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_empresa_operator_roles_insert ON joyeriaartesanos.chat_empresa_operator_roles FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_empresa_operator_roles chat_empresa_operator_roles_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_empresa_operator_roles_select ON joyeriaartesanos.chat_empresa_operator_roles FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_empresa_operator_roles chat_empresa_operator_roles_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_empresa_operator_roles_update ON joyeriaartesanos.chat_empresa_operator_roles FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_flow_data; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.chat_flow_data ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_flow_data chat_flow_data_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_flow_data_delete ON joyeriaartesanos.chat_flow_data FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_flow_data chat_flow_data_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_flow_data_insert ON joyeriaartesanos.chat_flow_data FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_flow_data chat_flow_data_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_flow_data_select ON joyeriaartesanos.chat_flow_data FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_flow_data chat_flow_data_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_flow_data_update ON joyeriaartesanos.chat_flow_data FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_flow_events; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.chat_flow_events ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_flow_events chat_flow_events_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_flow_events_delete ON joyeriaartesanos.chat_flow_events FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_flow_events chat_flow_events_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_flow_events_insert ON joyeriaartesanos.chat_flow_events FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_flow_events chat_flow_events_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_flow_events_select ON joyeriaartesanos.chat_flow_events FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_flow_events chat_flow_events_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_flow_events_update ON joyeriaartesanos.chat_flow_events FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_flow_node_blocks; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.chat_flow_node_blocks ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_flow_node_blocks chat_flow_node_blocks_delete_empresa; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_flow_node_blocks_delete_empresa ON joyeriaartesanos.chat_flow_node_blocks FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_flow_node_blocks chat_flow_node_blocks_insert_empresa; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_flow_node_blocks_insert_empresa ON joyeriaartesanos.chat_flow_node_blocks FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_flow_node_blocks chat_flow_node_blocks_select_empresa; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_flow_node_blocks_select_empresa ON joyeriaartesanos.chat_flow_node_blocks FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_flow_node_blocks chat_flow_node_blocks_update_empresa; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_flow_node_blocks_update_empresa ON joyeriaartesanos.chat_flow_node_blocks FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_flow_nodes; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.chat_flow_nodes ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_flow_nodes chat_flow_nodes_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_flow_nodes_delete ON joyeriaartesanos.chat_flow_nodes FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_flow_nodes chat_flow_nodes_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_flow_nodes_insert ON joyeriaartesanos.chat_flow_nodes FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_flow_nodes chat_flow_nodes_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_flow_nodes_select ON joyeriaartesanos.chat_flow_nodes FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_flow_nodes chat_flow_nodes_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_flow_nodes_update ON joyeriaartesanos.chat_flow_nodes FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_flow_options; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.chat_flow_options ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_flow_options chat_flow_options_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_flow_options_delete ON joyeriaartesanos.chat_flow_options FOR DELETE USING ((EXISTS ( SELECT 1
   FROM joyeriaartesanos.chat_flow_nodes n
  WHERE ((n.id = chat_flow_options.node_id) AND joyeriaartesanos.puede_acceder_empresa(n.empresa_id)))));


--
-- Name: chat_flow_options chat_flow_options_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_flow_options_insert ON joyeriaartesanos.chat_flow_options FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM joyeriaartesanos.chat_flow_nodes n
  WHERE ((n.id = chat_flow_options.node_id) AND joyeriaartesanos.puede_acceder_empresa(n.empresa_id)))));


--
-- Name: chat_flow_options chat_flow_options_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_flow_options_select ON joyeriaartesanos.chat_flow_options FOR SELECT USING ((EXISTS ( SELECT 1
   FROM joyeriaartesanos.chat_flow_nodes n
  WHERE ((n.id = chat_flow_options.node_id) AND joyeriaartesanos.puede_acceder_empresa(n.empresa_id)))));


--
-- Name: chat_flow_options chat_flow_options_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_flow_options_update ON joyeriaartesanos.chat_flow_options FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM joyeriaartesanos.chat_flow_nodes n
  WHERE ((n.id = chat_flow_options.node_id) AND joyeriaartesanos.puede_acceder_empresa(n.empresa_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM joyeriaartesanos.chat_flow_nodes n
  WHERE ((n.id = chat_flow_options.node_id) AND joyeriaartesanos.puede_acceder_empresa(n.empresa_id)))));


--
-- Name: chat_flow_recontact_rules; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.chat_flow_recontact_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_flow_recontact_rules chat_flow_recontact_rules_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_flow_recontact_rules_delete ON joyeriaartesanos.chat_flow_recontact_rules FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_flow_recontact_rules chat_flow_recontact_rules_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_flow_recontact_rules_insert ON joyeriaartesanos.chat_flow_recontact_rules FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_flow_recontact_rules chat_flow_recontact_rules_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_flow_recontact_rules_select ON joyeriaartesanos.chat_flow_recontact_rules FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_flow_recontact_rules chat_flow_recontact_rules_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_flow_recontact_rules_update ON joyeriaartesanos.chat_flow_recontact_rules FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_flow_recontact_runs; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.chat_flow_recontact_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_flow_recontact_runs chat_flow_recontact_runs_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_flow_recontact_runs_delete ON joyeriaartesanos.chat_flow_recontact_runs FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_flow_recontact_runs chat_flow_recontact_runs_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_flow_recontact_runs_insert ON joyeriaartesanos.chat_flow_recontact_runs FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_flow_recontact_runs chat_flow_recontact_runs_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_flow_recontact_runs_select ON joyeriaartesanos.chat_flow_recontact_runs FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_flow_recontact_runs chat_flow_recontact_runs_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_flow_recontact_runs_update ON joyeriaartesanos.chat_flow_recontact_runs FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_flow_sessions; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.chat_flow_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_flow_sessions chat_flow_sessions_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_flow_sessions_delete ON joyeriaartesanos.chat_flow_sessions FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_flow_sessions chat_flow_sessions_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_flow_sessions_insert ON joyeriaartesanos.chat_flow_sessions FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_flow_sessions chat_flow_sessions_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_flow_sessions_select ON joyeriaartesanos.chat_flow_sessions FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_flow_sessions chat_flow_sessions_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_flow_sessions_update ON joyeriaartesanos.chat_flow_sessions FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_flows; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.chat_flows ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_flows chat_flows_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_flows_delete ON joyeriaartesanos.chat_flows FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_flows chat_flows_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_flows_insert ON joyeriaartesanos.chat_flows FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_flows chat_flows_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_flows_select ON joyeriaartesanos.chat_flows FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_flows chat_flows_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_flows_update ON joyeriaartesanos.chat_flows FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_messages; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.chat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_messages chat_messages_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_messages_delete ON joyeriaartesanos.chat_messages FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_messages chat_messages_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_messages_insert ON joyeriaartesanos.chat_messages FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_messages chat_messages_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_messages_select ON joyeriaartesanos.chat_messages FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_messages chat_messages_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_messages_update ON joyeriaartesanos.chat_messages FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_omnicanal_work_schedules chat_omn_sched_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_omn_sched_delete ON joyeriaartesanos.chat_omnicanal_work_schedules FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_omnicanal_work_schedules chat_omn_sched_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_omn_sched_insert ON joyeriaartesanos.chat_omnicanal_work_schedules FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_omnicanal_work_schedules chat_omn_sched_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_omn_sched_select ON joyeriaartesanos.chat_omnicanal_work_schedules FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_omnicanal_work_schedules chat_omn_sched_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_omn_sched_update ON joyeriaartesanos.chat_omnicanal_work_schedules FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_omnicanal_work_schedules; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.chat_omnicanal_work_schedules ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_queue_channels; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.chat_queue_channels ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_queue_channels chat_queue_channels_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_queue_channels_delete ON joyeriaartesanos.chat_queue_channels FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_queue_channels chat_queue_channels_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_queue_channels_insert ON joyeriaartesanos.chat_queue_channels FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_queue_channels chat_queue_channels_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_queue_channels_select ON joyeriaartesanos.chat_queue_channels FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_queue_channels chat_queue_channels_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_queue_channels_update ON joyeriaartesanos.chat_queue_channels FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_queue_closure_states; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.chat_queue_closure_states ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_queue_closure_states chat_queue_closure_states_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_queue_closure_states_delete ON joyeriaartesanos.chat_queue_closure_states FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_queue_closure_states chat_queue_closure_states_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_queue_closure_states_insert ON joyeriaartesanos.chat_queue_closure_states FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_queue_closure_states chat_queue_closure_states_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_queue_closure_states_select ON joyeriaartesanos.chat_queue_closure_states FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_queue_closure_states chat_queue_closure_states_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_queue_closure_states_update ON joyeriaartesanos.chat_queue_closure_states FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_queue_closure_substates; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.chat_queue_closure_substates ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_queue_closure_substates chat_queue_closure_substates_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_queue_closure_substates_delete ON joyeriaartesanos.chat_queue_closure_substates FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_queue_closure_substates chat_queue_closure_substates_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_queue_closure_substates_insert ON joyeriaartesanos.chat_queue_closure_substates FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_queue_closure_substates chat_queue_closure_substates_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_queue_closure_substates_select ON joyeriaartesanos.chat_queue_closure_substates FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_queue_closure_substates chat_queue_closure_substates_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_queue_closure_substates_update ON joyeriaartesanos.chat_queue_closure_substates FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_queue_supervisors; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.chat_queue_supervisors ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_queue_supervisors chat_queue_supervisors_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_queue_supervisors_delete ON joyeriaartesanos.chat_queue_supervisors FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_queue_supervisors chat_queue_supervisors_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_queue_supervisors_insert ON joyeriaartesanos.chat_queue_supervisors FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_queue_supervisors chat_queue_supervisors_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_queue_supervisors_select ON joyeriaartesanos.chat_queue_supervisors FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_queue_supervisors chat_queue_supervisors_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_queue_supervisors_update ON joyeriaartesanos.chat_queue_supervisors FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_queues; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.chat_queues ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_queues chat_queues_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_queues_delete ON joyeriaartesanos.chat_queues FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_queues chat_queues_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_queues_insert ON joyeriaartesanos.chat_queues FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_queues chat_queues_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_queues_select ON joyeriaartesanos.chat_queues FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_queues chat_queues_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_queues_update ON joyeriaartesanos.chat_queues FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_routing_events; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.chat_routing_events ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_routing_events chat_routing_events_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_routing_events_insert ON joyeriaartesanos.chat_routing_events FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_routing_events chat_routing_events_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_routing_events_select ON joyeriaartesanos.chat_routing_events FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_supervisor_agents; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.chat_supervisor_agents ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_supervisor_agents chat_supervisor_agents_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_supervisor_agents_delete ON joyeriaartesanos.chat_supervisor_agents FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_supervisor_agents chat_supervisor_agents_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_supervisor_agents_insert ON joyeriaartesanos.chat_supervisor_agents FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_supervisor_agents chat_supervisor_agents_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_supervisor_agents_select ON joyeriaartesanos.chat_supervisor_agents FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_supervisor_agents chat_supervisor_agents_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_supervisor_agents_update ON joyeriaartesanos.chat_supervisor_agents FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_usuario_omnicanal; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.chat_usuario_omnicanal ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_usuario_omnicanal chat_usuario_omnicanal_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_usuario_omnicanal_delete ON joyeriaartesanos.chat_usuario_omnicanal FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_usuario_omnicanal chat_usuario_omnicanal_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_usuario_omnicanal_insert ON joyeriaartesanos.chat_usuario_omnicanal FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_usuario_omnicanal chat_usuario_omnicanal_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_usuario_omnicanal_select ON joyeriaartesanos.chat_usuario_omnicanal FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: chat_usuario_omnicanal chat_usuario_omnicanal_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY chat_usuario_omnicanal_update ON joyeriaartesanos.chat_usuario_omnicanal FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: cliente_historial; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.cliente_historial ENABLE ROW LEVEL SECURITY;

--
-- Name: cliente_historial cliente_historial_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY cliente_historial_insert ON joyeriaartesanos.cliente_historial FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: cliente_historial cliente_historial_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY cliente_historial_select ON joyeriaartesanos.cliente_historial FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: cliente_obligaciones_tributarias; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.cliente_obligaciones_tributarias ENABLE ROW LEVEL SECURITY;

--
-- Name: cliente_obligaciones_tributarias cliente_obligaciones_tributarias_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY cliente_obligaciones_tributarias_delete ON joyeriaartesanos.cliente_obligaciones_tributarias FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: cliente_obligaciones_tributarias cliente_obligaciones_tributarias_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY cliente_obligaciones_tributarias_insert ON joyeriaartesanos.cliente_obligaciones_tributarias FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: cliente_obligaciones_tributarias cliente_obligaciones_tributarias_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY cliente_obligaciones_tributarias_select ON joyeriaartesanos.cliente_obligaciones_tributarias FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: cliente_obligaciones_tributarias cliente_obligaciones_tributarias_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY cliente_obligaciones_tributarias_update ON joyeriaartesanos.cliente_obligaciones_tributarias FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: cliente_perfil_tributario; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.cliente_perfil_tributario ENABLE ROW LEVEL SECURITY;

--
-- Name: cliente_perfil_tributario cliente_perfil_tributario_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY cliente_perfil_tributario_delete ON joyeriaartesanos.cliente_perfil_tributario FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: cliente_perfil_tributario cliente_perfil_tributario_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY cliente_perfil_tributario_insert ON joyeriaartesanos.cliente_perfil_tributario FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: cliente_perfil_tributario cliente_perfil_tributario_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY cliente_perfil_tributario_select ON joyeriaartesanos.cliente_perfil_tributario FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: cliente_perfil_tributario cliente_perfil_tributario_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY cliente_perfil_tributario_update ON joyeriaartesanos.cliente_perfil_tributario FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: cliente_tipos_servicio_catalogo; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.cliente_tipos_servicio_catalogo ENABLE ROW LEVEL SECURITY;

--
-- Name: cliente_tipos_servicio_catalogo cliente_tipos_servicio_catalogo_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY cliente_tipos_servicio_catalogo_delete ON joyeriaartesanos.cliente_tipos_servicio_catalogo FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: cliente_tipos_servicio_catalogo cliente_tipos_servicio_catalogo_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY cliente_tipos_servicio_catalogo_insert ON joyeriaartesanos.cliente_tipos_servicio_catalogo FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: cliente_tipos_servicio_catalogo cliente_tipos_servicio_catalogo_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY cliente_tipos_servicio_catalogo_select ON joyeriaartesanos.cliente_tipos_servicio_catalogo FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: cliente_tipos_servicio_catalogo cliente_tipos_servicio_catalogo_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY cliente_tipos_servicio_catalogo_update ON joyeriaartesanos.cliente_tipos_servicio_catalogo FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: clientes; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.clientes ENABLE ROW LEVEL SECURITY;

--
-- Name: clientes clientes_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY clientes_delete ON joyeriaartesanos.clientes FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: clientes clientes_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY clientes_insert ON joyeriaartesanos.clientes FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: clientes clientes_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY clientes_select ON joyeriaartesanos.clientes FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: clientes clientes_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY clientes_update ON joyeriaartesanos.clientes FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: comision_ajustes; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.comision_ajustes ENABLE ROW LEVEL SECURITY;

--
-- Name: comision_ajustes comision_ajustes_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY comision_ajustes_delete ON joyeriaartesanos.comision_ajustes FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: comision_ajustes comision_ajustes_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY comision_ajustes_insert ON joyeriaartesanos.comision_ajustes FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: comision_ajustes comision_ajustes_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY comision_ajustes_select ON joyeriaartesanos.comision_ajustes FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: comision_ajustes comision_ajustes_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY comision_ajustes_update ON joyeriaartesanos.comision_ajustes FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: comision_equipo_miembros; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.comision_equipo_miembros ENABLE ROW LEVEL SECURITY;

--
-- Name: comision_equipo_miembros comision_equipo_miembros_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY comision_equipo_miembros_delete ON joyeriaartesanos.comision_equipo_miembros FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: comision_equipo_miembros comision_equipo_miembros_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY comision_equipo_miembros_insert ON joyeriaartesanos.comision_equipo_miembros FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: comision_equipo_miembros comision_equipo_miembros_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY comision_equipo_miembros_select ON joyeriaartesanos.comision_equipo_miembros FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: comision_equipo_miembros comision_equipo_miembros_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY comision_equipo_miembros_update ON joyeriaartesanos.comision_equipo_miembros FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: comision_equipos; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.comision_equipos ENABLE ROW LEVEL SECURITY;

--
-- Name: comision_equipos comision_equipos_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY comision_equipos_delete ON joyeriaartesanos.comision_equipos FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: comision_equipos comision_equipos_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY comision_equipos_insert ON joyeriaartesanos.comision_equipos FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: comision_equipos comision_equipos_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY comision_equipos_select ON joyeriaartesanos.comision_equipos FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: comision_equipos comision_equipos_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY comision_equipos_update ON joyeriaartesanos.comision_equipos FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: comision_escalas; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.comision_escalas ENABLE ROW LEVEL SECURITY;

--
-- Name: comision_escalas comision_escalas_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY comision_escalas_delete ON joyeriaartesanos.comision_escalas FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: comision_escalas comision_escalas_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY comision_escalas_insert ON joyeriaartesanos.comision_escalas FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: comision_escalas comision_escalas_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY comision_escalas_select ON joyeriaartesanos.comision_escalas FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: comision_escalas comision_escalas_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY comision_escalas_update ON joyeriaartesanos.comision_escalas FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: comision_lineas; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.comision_lineas ENABLE ROW LEVEL SECURITY;

--
-- Name: comision_lineas comision_lineas_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY comision_lineas_delete ON joyeriaartesanos.comision_lineas FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: comision_lineas comision_lineas_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY comision_lineas_insert ON joyeriaartesanos.comision_lineas FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: comision_lineas comision_lineas_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY comision_lineas_select ON joyeriaartesanos.comision_lineas FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: comision_lineas comision_lineas_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY comision_lineas_update ON joyeriaartesanos.comision_lineas FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: comision_periodos; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.comision_periodos ENABLE ROW LEVEL SECURITY;

--
-- Name: comision_periodos comision_periodos_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY comision_periodos_delete ON joyeriaartesanos.comision_periodos FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: comision_periodos comision_periodos_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY comision_periodos_insert ON joyeriaartesanos.comision_periodos FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: comision_periodos comision_periodos_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY comision_periodos_select ON joyeriaartesanos.comision_periodos FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: comision_periodos comision_periodos_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY comision_periodos_update ON joyeriaartesanos.comision_periodos FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: comision_politica_versiones; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.comision_politica_versiones ENABLE ROW LEVEL SECURITY;

--
-- Name: comision_politica_versiones comision_politica_versiones_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY comision_politica_versiones_delete ON joyeriaartesanos.comision_politica_versiones FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: comision_politica_versiones comision_politica_versiones_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY comision_politica_versiones_insert ON joyeriaartesanos.comision_politica_versiones FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: comision_politica_versiones comision_politica_versiones_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY comision_politica_versiones_select ON joyeriaartesanos.comision_politica_versiones FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: comision_politica_versiones comision_politica_versiones_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY comision_politica_versiones_update ON joyeriaartesanos.comision_politica_versiones FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: comision_politicas; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.comision_politicas ENABLE ROW LEVEL SECURITY;

--
-- Name: comision_politicas comision_politicas_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY comision_politicas_delete ON joyeriaartesanos.comision_politicas FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: comision_politicas comision_politicas_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY comision_politicas_insert ON joyeriaartesanos.comision_politicas FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: comision_politicas comision_politicas_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY comision_politicas_select ON joyeriaartesanos.comision_politicas FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: comision_politicas comision_politicas_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY comision_politicas_update ON joyeriaartesanos.comision_politicas FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: compras; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.compras ENABLE ROW LEVEL SECURITY;

--
-- Name: compras compras_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY compras_delete ON joyeriaartesanos.compras FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: compras compras_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY compras_insert ON joyeriaartesanos.compras FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: compras compras_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY compras_select ON joyeriaartesanos.compras FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: compras compras_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY compras_update ON joyeriaartesanos.compras FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: cotizaciones_dolar; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.cotizaciones_dolar ENABLE ROW LEVEL SECURITY;

--
-- Name: cotizaciones_dolar cotizaciones_dolar_insert_authenticated; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY cotizaciones_dolar_insert_authenticated ON joyeriaartesanos.cotizaciones_dolar FOR INSERT TO authenticated WITH CHECK ((cotizacion > (0)::numeric));


--
-- Name: cotizaciones_dolar cotizaciones_dolar_select_authenticated; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY cotizaciones_dolar_select_authenticated ON joyeriaartesanos.cotizaciones_dolar FOR SELECT TO authenticated USING (true);


--
-- Name: crm_etapas; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.crm_etapas ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_etapas crm_etapas_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY crm_etapas_delete ON joyeriaartesanos.crm_etapas FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: crm_etapas crm_etapas_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY crm_etapas_insert ON joyeriaartesanos.crm_etapas FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: crm_etapas crm_etapas_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY crm_etapas_select ON joyeriaartesanos.crm_etapas FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: crm_etapas crm_etapas_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY crm_etapas_update ON joyeriaartesanos.crm_etapas FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: crm_notas; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.crm_notas ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_notas crm_notas_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY crm_notas_delete ON joyeriaartesanos.crm_notas FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: crm_notas crm_notas_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY crm_notas_insert ON joyeriaartesanos.crm_notas FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: crm_notas crm_notas_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY crm_notas_select ON joyeriaartesanos.crm_notas FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: crm_notas crm_notas_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY crm_notas_update ON joyeriaartesanos.crm_notas FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: crm_prospectos; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.crm_prospectos ENABLE ROW LEVEL SECURITY;

--
-- Name: crm_prospectos crm_prospectos_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY crm_prospectos_delete ON joyeriaartesanos.crm_prospectos FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: crm_prospectos crm_prospectos_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY crm_prospectos_insert ON joyeriaartesanos.crm_prospectos FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: crm_prospectos crm_prospectos_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY crm_prospectos_select ON joyeriaartesanos.crm_prospectos FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: crm_prospectos crm_prospectos_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY crm_prospectos_update ON joyeriaartesanos.crm_prospectos FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: dashboard_views; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.dashboard_views ENABLE ROW LEVEL SECURITY;

--
-- Name: dashboard_views dashboard_views_all_super; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY dashboard_views_all_super ON joyeriaartesanos.dashboard_views USING (joyeriaartesanos.es_super_admin()) WITH CHECK (joyeriaartesanos.es_super_admin());


--
-- Name: dashboard_views dashboard_views_select_auth; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY dashboard_views_select_auth ON joyeriaartesanos.dashboard_views FOR SELECT TO authenticated USING (true);


--
-- Name: empresa_dashboard_views edv_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY edv_delete ON joyeriaartesanos.empresa_dashboard_views FOR DELETE USING ((joyeriaartesanos.es_super_admin() OR joyeriaartesanos.puede_acceder_empresa(empresa_id)));


--
-- Name: empresa_dashboard_views edv_mutate; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY edv_mutate ON joyeriaartesanos.empresa_dashboard_views FOR INSERT WITH CHECK ((joyeriaartesanos.es_super_admin() OR joyeriaartesanos.puede_acceder_empresa(empresa_id)));


--
-- Name: empresa_dashboard_views edv_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY edv_select ON joyeriaartesanos.empresa_dashboard_views FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: empresa_dashboard_views edv_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY edv_update ON joyeriaartesanos.empresa_dashboard_views FOR UPDATE USING ((joyeriaartesanos.es_super_admin() OR joyeriaartesanos.puede_acceder_empresa(empresa_id))) WITH CHECK ((joyeriaartesanos.es_super_admin() OR joyeriaartesanos.puede_acceder_empresa(empresa_id)));


--
-- Name: empresa_dashboard_views; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.empresa_dashboard_views ENABLE ROW LEVEL SECURITY;

--
-- Name: empresa_modulos; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.empresa_modulos ENABLE ROW LEVEL SECURITY;

--
-- Name: empresa_modulos empresa_modulos_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY empresa_modulos_delete ON joyeriaartesanos.empresa_modulos FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: empresa_modulos empresa_modulos_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY empresa_modulos_insert ON joyeriaartesanos.empresa_modulos FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: empresa_modulos empresa_modulos_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY empresa_modulos_select ON joyeriaartesanos.empresa_modulos FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: empresa_modulos empresa_modulos_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY empresa_modulos_update ON joyeriaartesanos.empresa_modulos FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: empresa_sifen_config; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.empresa_sifen_config ENABLE ROW LEVEL SECURITY;

--
-- Name: empresa_sifen_config empresa_sifen_config_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY empresa_sifen_config_delete ON joyeriaartesanos.empresa_sifen_config FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: empresa_sifen_config empresa_sifen_config_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY empresa_sifen_config_insert ON joyeriaartesanos.empresa_sifen_config FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: empresa_sifen_config empresa_sifen_config_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY empresa_sifen_config_select ON joyeriaartesanos.empresa_sifen_config FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: empresa_sifen_config empresa_sifen_config_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY empresa_sifen_config_update ON joyeriaartesanos.empresa_sifen_config FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: empresas; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.empresas ENABLE ROW LEVEL SECURITY;

--
-- Name: empresas empresas_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY empresas_delete ON joyeriaartesanos.empresas FOR DELETE USING (joyeriaartesanos.es_super_admin());


--
-- Name: empresas empresas_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY empresas_insert ON joyeriaartesanos.empresas FOR INSERT WITH CHECK (joyeriaartesanos.es_super_admin());


--
-- Name: empresas empresas_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY empresas_select ON joyeriaartesanos.empresas FOR SELECT USING ((joyeriaartesanos.es_super_admin() OR (id = joyeriaartesanos.empresa_id_actual())));


--
-- Name: empresas empresas_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY empresas_update ON joyeriaartesanos.empresas FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(id));


--
-- Name: factura_electronica; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.factura_electronica ENABLE ROW LEVEL SECURITY;

--
-- Name: factura_electronica factura_electronica_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY factura_electronica_delete ON joyeriaartesanos.factura_electronica FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: factura_electronica_evento; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.factura_electronica_evento ENABLE ROW LEVEL SECURITY;

--
-- Name: factura_electronica_evento factura_electronica_evento_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY factura_electronica_evento_delete ON joyeriaartesanos.factura_electronica_evento FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: factura_electronica_evento factura_electronica_evento_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY factura_electronica_evento_insert ON joyeriaartesanos.factura_electronica_evento FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: factura_electronica_evento factura_electronica_evento_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY factura_electronica_evento_select ON joyeriaartesanos.factura_electronica_evento FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: factura_electronica_evento factura_electronica_evento_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY factura_electronica_evento_update ON joyeriaartesanos.factura_electronica_evento FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: factura_electronica factura_electronica_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY factura_electronica_insert ON joyeriaartesanos.factura_electronica FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: factura_electronica factura_electronica_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY factura_electronica_select ON joyeriaartesanos.factura_electronica FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: factura_electronica factura_electronica_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY factura_electronica_update ON joyeriaartesanos.factura_electronica FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: factura_items; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.factura_items ENABLE ROW LEVEL SECURITY;

--
-- Name: factura_items factura_items_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY factura_items_delete ON joyeriaartesanos.factura_items FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: factura_items factura_items_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY factura_items_insert ON joyeriaartesanos.factura_items FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: factura_items factura_items_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY factura_items_select ON joyeriaartesanos.factura_items FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: factura_items factura_items_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY factura_items_update ON joyeriaartesanos.factura_items FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: facturas; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.facturas ENABLE ROW LEVEL SECURITY;

--
-- Name: facturas facturas_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY facturas_delete ON joyeriaartesanos.facturas FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: facturas facturas_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY facturas_insert ON joyeriaartesanos.facturas FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: facturas facturas_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY facturas_select ON joyeriaartesanos.facturas FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: facturas facturas_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY facturas_update ON joyeriaartesanos.facturas FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: familias_olfativas; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.familias_olfativas ENABLE ROW LEVEL SECURITY;

--
-- Name: familias_olfativas familias_olfativas_admin; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY familias_olfativas_admin ON joyeriaartesanos.familias_olfativas TO authenticated USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: familias_olfativas familias_olfativas_select_public; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY familias_olfativas_select_public ON joyeriaartesanos.familias_olfativas FOR SELECT TO anon USING ((activo = true));


--
-- Name: gastos; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.gastos ENABLE ROW LEVEL SECURITY;

--
-- Name: gastos gastos_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY gastos_delete ON joyeriaartesanos.gastos FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: gastos gastos_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY gastos_insert ON joyeriaartesanos.gastos FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: gastos gastos_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY gastos_select ON joyeriaartesanos.gastos FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: gastos gastos_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY gastos_update ON joyeriaartesanos.gastos FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: marca_categorias; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.marca_categorias ENABLE ROW LEVEL SECURITY;

--
-- Name: marcas; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.marcas ENABLE ROW LEVEL SECURITY;

--
-- Name: marcas marcas_insert_authenticated; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY marcas_insert_authenticated ON joyeriaartesanos.marcas FOR INSERT TO authenticated WITH CHECK ((length(btrim(nombre)) > 0));


--
-- Name: marcas marcas_select_anon; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY marcas_select_anon ON joyeriaartesanos.marcas FOR SELECT TO anon USING (((visible_web = true) AND (activo = true)));


--
-- Name: marcas marcas_select_authenticated; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY marcas_select_authenticated ON joyeriaartesanos.marcas FOR SELECT TO authenticated USING (true);


--
-- Name: marcas marcas_update_authenticated; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY marcas_update_authenticated ON joyeriaartesanos.marcas FOR UPDATE TO authenticated USING (true) WITH CHECK ((length(btrim(nombre)) > 0));


--
-- Name: marketing_calendarios; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.marketing_calendarios ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_calendarios marketing_calendarios_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY marketing_calendarios_delete ON joyeriaartesanos.marketing_calendarios FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: marketing_calendarios marketing_calendarios_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY marketing_calendarios_insert ON joyeriaartesanos.marketing_calendarios FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: marketing_calendarios marketing_calendarios_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY marketing_calendarios_select ON joyeriaartesanos.marketing_calendarios FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: marketing_calendarios marketing_calendarios_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY marketing_calendarios_update ON joyeriaartesanos.marketing_calendarios FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: marketing_comentarios; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.marketing_comentarios ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_comentarios marketing_comentarios_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY marketing_comentarios_delete ON joyeriaartesanos.marketing_comentarios FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: marketing_comentarios marketing_comentarios_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY marketing_comentarios_insert ON joyeriaartesanos.marketing_comentarios FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: marketing_comentarios marketing_comentarios_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY marketing_comentarios_select ON joyeriaartesanos.marketing_comentarios FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: marketing_comentarios marketing_comentarios_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY marketing_comentarios_update ON joyeriaartesanos.marketing_comentarios FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: marketing_historial_estados; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.marketing_historial_estados ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_historial_estados marketing_historial_estados_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY marketing_historial_estados_delete ON joyeriaartesanos.marketing_historial_estados FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: marketing_historial_estados marketing_historial_estados_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY marketing_historial_estados_insert ON joyeriaartesanos.marketing_historial_estados FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: marketing_historial_estados marketing_historial_estados_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY marketing_historial_estados_select ON joyeriaartesanos.marketing_historial_estados FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: marketing_historial_estados marketing_historial_estados_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY marketing_historial_estados_update ON joyeriaartesanos.marketing_historial_estados FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: marketing_piezas; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.marketing_piezas ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_piezas marketing_piezas_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY marketing_piezas_delete ON joyeriaartesanos.marketing_piezas FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: marketing_piezas marketing_piezas_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY marketing_piezas_insert ON joyeriaartesanos.marketing_piezas FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: marketing_piezas marketing_piezas_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY marketing_piezas_select ON joyeriaartesanos.marketing_piezas FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: marketing_piezas marketing_piezas_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY marketing_piezas_update ON joyeriaartesanos.marketing_piezas FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: marketing_tasks; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.marketing_tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_tasks marketing_tasks_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY marketing_tasks_delete ON joyeriaartesanos.marketing_tasks FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: marketing_tasks marketing_tasks_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY marketing_tasks_insert ON joyeriaartesanos.marketing_tasks FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: marketing_tasks marketing_tasks_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY marketing_tasks_select ON joyeriaartesanos.marketing_tasks FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: marketing_tasks marketing_tasks_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY marketing_tasks_update ON joyeriaartesanos.marketing_tasks FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: marca_categorias mc_select_anon; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY mc_select_anon ON joyeriaartesanos.marca_categorias FOR SELECT TO anon USING (true);


--
-- Name: marca_categorias mc_select_authenticated; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY mc_select_authenticated ON joyeriaartesanos.marca_categorias FOR SELECT TO authenticated USING (true);


--
-- Name: marca_categorias mc_write_authenticated; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY mc_write_authenticated ON joyeriaartesanos.marca_categorias TO authenticated USING (true) WITH CHECK (true);


--
-- Name: modulos; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.modulos ENABLE ROW LEVEL SECURITY;

--
-- Name: modulos modulos_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY modulos_delete ON joyeriaartesanos.modulos FOR DELETE USING (joyeriaartesanos.es_super_admin());


--
-- Name: modulos modulos_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY modulos_insert ON joyeriaartesanos.modulos FOR INSERT WITH CHECK (joyeriaartesanos.es_super_admin());


--
-- Name: modulos modulos_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY modulos_select ON joyeriaartesanos.modulos FOR SELECT TO authenticated USING (true);


--
-- Name: modulos modulos_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY modulos_update ON joyeriaartesanos.modulos FOR UPDATE USING (joyeriaartesanos.es_super_admin()) WITH CHECK (joyeriaartesanos.es_super_admin());


--
-- Name: movimientos_inventario movimientos_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY movimientos_delete ON joyeriaartesanos.movimientos_inventario FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: movimientos_inventario movimientos_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY movimientos_insert ON joyeriaartesanos.movimientos_inventario FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: movimientos_inventario; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.movimientos_inventario ENABLE ROW LEVEL SECURITY;

--
-- Name: movimientos_inventario movimientos_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY movimientos_select ON joyeriaartesanos.movimientos_inventario FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: movimientos_inventario movimientos_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY movimientos_update ON joyeriaartesanos.movimientos_inventario FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: nota_credito; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.nota_credito ENABLE ROW LEVEL SECURITY;

--
-- Name: nota_credito nota_credito_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY nota_credito_delete ON joyeriaartesanos.nota_credito FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: nota_credito_electronica; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.nota_credito_electronica ENABLE ROW LEVEL SECURITY;

--
-- Name: nota_credito_electronica nota_credito_electronica_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY nota_credito_electronica_delete ON joyeriaartesanos.nota_credito_electronica FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: nota_credito_electronica nota_credito_electronica_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY nota_credito_electronica_insert ON joyeriaartesanos.nota_credito_electronica FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: nota_credito_electronica nota_credito_electronica_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY nota_credito_electronica_select ON joyeriaartesanos.nota_credito_electronica FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: nota_credito_electronica nota_credito_electronica_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY nota_credito_electronica_update ON joyeriaartesanos.nota_credito_electronica FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: nota_credito_evento; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.nota_credito_evento ENABLE ROW LEVEL SECURITY;

--
-- Name: nota_credito_evento nota_credito_evento_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY nota_credito_evento_delete ON joyeriaartesanos.nota_credito_evento FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: nota_credito_evento nota_credito_evento_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY nota_credito_evento_insert ON joyeriaartesanos.nota_credito_evento FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: nota_credito_evento nota_credito_evento_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY nota_credito_evento_select ON joyeriaartesanos.nota_credito_evento FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: nota_credito_evento nota_credito_evento_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY nota_credito_evento_update ON joyeriaartesanos.nota_credito_evento FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: nota_credito nota_credito_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY nota_credito_insert ON joyeriaartesanos.nota_credito FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: nota_credito nota_credito_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY nota_credito_select ON joyeriaartesanos.nota_credito FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: nota_credito nota_credito_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY nota_credito_update ON joyeriaartesanos.nota_credito FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: notas_olfativas; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.notas_olfativas ENABLE ROW LEVEL SECURITY;

--
-- Name: notas_olfativas notas_olfativas_admin; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY notas_olfativas_admin ON joyeriaartesanos.notas_olfativas TO authenticated USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: notas_olfativas notas_olfativas_select_public; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY notas_olfativas_select_public ON joyeriaartesanos.notas_olfativas FOR SELECT TO anon USING ((activo = true));


--
-- Name: obligaciones_tributarias_catalogo; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.obligaciones_tributarias_catalogo ENABLE ROW LEVEL SECURITY;

--
-- Name: obligaciones_tributarias_catalogo obligaciones_tributarias_catalogo_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY obligaciones_tributarias_catalogo_select ON joyeriaartesanos.obligaciones_tributarias_catalogo FOR SELECT TO authenticated USING (true);


--
-- Name: obligaciones_tributarias_catalogo obligaciones_tributarias_catalogo_select_sr; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY obligaciones_tributarias_catalogo_select_sr ON joyeriaartesanos.obligaciones_tributarias_catalogo FOR SELECT TO service_role USING (true);


--
-- Name: pagos; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.pagos ENABLE ROW LEVEL SECURITY;

--
-- Name: pagos pagos_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY pagos_delete ON joyeriaartesanos.pagos FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: pagos pagos_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY pagos_insert ON joyeriaartesanos.pagos FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: pagos pagos_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY pagos_select ON joyeriaartesanos.pagos FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: pagos pagos_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY pagos_update ON joyeriaartesanos.pagos FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: pedidos_web; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.pedidos_web ENABLE ROW LEVEL SECURITY;

--
-- Name: pedidos_web pedidos_web_admin; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY pedidos_web_admin ON joyeriaartesanos.pedidos_web TO authenticated USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: pedidos_web_items; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.pedidos_web_items ENABLE ROW LEVEL SECURITY;

--
-- Name: pedidos_web_items pedidos_web_items_admin; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY pedidos_web_items_admin ON joyeriaartesanos.pedidos_web_items TO authenticated USING ((EXISTS ( SELECT 1
   FROM joyeriaartesanos.pedidos_web p
  WHERE ((p.id = pedidos_web_items.pedido_id) AND joyeriaartesanos.puede_acceder_empresa(p.empresa_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM joyeriaartesanos.pedidos_web p
  WHERE ((p.id = pedidos_web_items.pedido_id) AND joyeriaartesanos.puede_acceder_empresa(p.empresa_id)))));


--
-- Name: pedidos_web_secuencia; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.pedidos_web_secuencia ENABLE ROW LEVEL SECURITY;

--
-- Name: planes; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.planes ENABLE ROW LEVEL SECURITY;

--
-- Name: planes planes_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY planes_delete ON joyeriaartesanos.planes FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: planes planes_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY planes_insert ON joyeriaartesanos.planes FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: planes planes_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY planes_select ON joyeriaartesanos.planes FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: planes planes_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY planes_update ON joyeriaartesanos.planes FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: producto_presentaciones pp_select_anon; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY pp_select_anon ON joyeriaartesanos.producto_presentaciones FOR SELECT TO anon USING (((activo = true) AND (visible_web = true) AND (EXISTS ( SELECT 1
   FROM joyeriaartesanos.productos p
  WHERE ((p.id = producto_presentaciones.producto_id) AND (p.activo = true) AND (p.visible_web = true))))));


--
-- Name: producto_presentaciones pp_select_authenticated; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY pp_select_authenticated ON joyeriaartesanos.producto_presentaciones FOR SELECT TO authenticated USING (true);


--
-- Name: producto_presentaciones pp_write_authenticated; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY pp_write_authenticated ON joyeriaartesanos.producto_presentaciones TO authenticated USING (true) WITH CHECK (true);


--
-- Name: producto_acordes; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.producto_acordes ENABLE ROW LEVEL SECURITY;

--
-- Name: producto_acordes producto_acordes_delete_authenticated; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY producto_acordes_delete_authenticated ON joyeriaartesanos.producto_acordes FOR DELETE TO authenticated USING (true);


--
-- Name: producto_acordes producto_acordes_insert_authenticated; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY producto_acordes_insert_authenticated ON joyeriaartesanos.producto_acordes FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: producto_acordes producto_acordes_select_anon; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY producto_acordes_select_anon ON joyeriaartesanos.producto_acordes FOR SELECT TO anon USING (true);


--
-- Name: producto_acordes producto_acordes_select_authenticated; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY producto_acordes_select_authenticated ON joyeriaartesanos.producto_acordes FOR SELECT TO authenticated USING (true);


--
-- Name: producto_acordes producto_acordes_update_authenticated; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY producto_acordes_update_authenticated ON joyeriaartesanos.producto_acordes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: producto_imagenes; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.producto_imagenes ENABLE ROW LEVEL SECURITY;

--
-- Name: producto_imagenes producto_imagenes_delete_authenticated; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY producto_imagenes_delete_authenticated ON joyeriaartesanos.producto_imagenes FOR DELETE TO authenticated USING (true);


--
-- Name: producto_imagenes producto_imagenes_insert_authenticated; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY producto_imagenes_insert_authenticated ON joyeriaartesanos.producto_imagenes FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: producto_imagenes producto_imagenes_select_anon; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY producto_imagenes_select_anon ON joyeriaartesanos.producto_imagenes FOR SELECT TO anon USING ((EXISTS ( SELECT 1
   FROM joyeriaartesanos.productos p
  WHERE ((p.id = producto_imagenes.producto_id) AND (p.activo = true) AND (p.visible_web = true)))));


--
-- Name: producto_imagenes producto_imagenes_select_authenticated; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY producto_imagenes_select_authenticated ON joyeriaartesanos.producto_imagenes FOR SELECT TO authenticated USING (true);


--
-- Name: producto_imagenes producto_imagenes_update_authenticated; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY producto_imagenes_update_authenticated ON joyeriaartesanos.producto_imagenes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: producto_notas; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.producto_notas ENABLE ROW LEVEL SECURITY;

--
-- Name: producto_notas producto_notas_admin; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY producto_notas_admin ON joyeriaartesanos.producto_notas TO authenticated USING ((EXISTS ( SELECT 1
   FROM joyeriaartesanos.productos p
  WHERE ((p.id = producto_notas.producto_id) AND joyeriaartesanos.puede_acceder_empresa(p.empresa_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM joyeriaartesanos.productos p
  WHERE ((p.id = producto_notas.producto_id) AND joyeriaartesanos.puede_acceder_empresa(p.empresa_id)))));


--
-- Name: producto_notas producto_notas_select_public; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY producto_notas_select_public ON joyeriaartesanos.producto_notas FOR SELECT TO anon USING ((EXISTS ( SELECT 1
   FROM joyeriaartesanos.productos p
  WHERE ((p.id = producto_notas.producto_id) AND (p.activo = true) AND (p.visible_web = true)))));


--
-- Name: producto_presentaciones; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.producto_presentaciones ENABLE ROW LEVEL SECURITY;

--
-- Name: productos; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.productos ENABLE ROW LEVEL SECURITY;

--
-- Name: productos productos_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY productos_delete ON joyeriaartesanos.productos FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: productos productos_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY productos_insert ON joyeriaartesanos.productos FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: productos productos_public_select_visible; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY productos_public_select_visible ON joyeriaartesanos.productos FOR SELECT TO anon USING (((activo = true) AND (visible_web = true)));


--
-- Name: productos productos_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY productos_select ON joyeriaartesanos.productos FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: productos productos_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY productos_update ON joyeriaartesanos.productos FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proveedor_categoria_rel; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.proveedor_categoria_rel ENABLE ROW LEVEL SECURITY;

--
-- Name: proveedor_categoria_rel proveedor_categoria_rel_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proveedor_categoria_rel_delete ON joyeriaartesanos.proveedor_categoria_rel FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proveedor_categoria_rel proveedor_categoria_rel_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proveedor_categoria_rel_insert ON joyeriaartesanos.proveedor_categoria_rel FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proveedor_categoria_rel proveedor_categoria_rel_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proveedor_categoria_rel_select ON joyeriaartesanos.proveedor_categoria_rel FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proveedor_categoria_rel proveedor_categoria_rel_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proveedor_categoria_rel_update ON joyeriaartesanos.proveedor_categoria_rel FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proveedor_categorias; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.proveedor_categorias ENABLE ROW LEVEL SECURITY;

--
-- Name: proveedor_categorias proveedor_categorias_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proveedor_categorias_delete ON joyeriaartesanos.proveedor_categorias FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proveedor_categorias proveedor_categorias_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proveedor_categorias_insert ON joyeriaartesanos.proveedor_categorias FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proveedor_categorias proveedor_categorias_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proveedor_categorias_select ON joyeriaartesanos.proveedor_categorias FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proveedor_categorias proveedor_categorias_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proveedor_categorias_update ON joyeriaartesanos.proveedor_categorias FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proveedor_productos; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.proveedor_productos ENABLE ROW LEVEL SECURITY;

--
-- Name: proveedor_productos proveedor_productos_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proveedor_productos_delete ON joyeriaartesanos.proveedor_productos FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proveedor_productos proveedor_productos_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proveedor_productos_insert ON joyeriaartesanos.proveedor_productos FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proveedor_productos proveedor_productos_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proveedor_productos_select ON joyeriaartesanos.proveedor_productos FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proveedor_productos proveedor_productos_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proveedor_productos_update ON joyeriaartesanos.proveedor_productos FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proveedores; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.proveedores ENABLE ROW LEVEL SECURITY;

--
-- Name: proveedores proveedores_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proveedores_delete ON joyeriaartesanos.proveedores FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proveedores proveedores_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proveedores_insert ON joyeriaartesanos.proveedores FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proveedores proveedores_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proveedores_select ON joyeriaartesanos.proveedores FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proveedores proveedores_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proveedores_update ON joyeriaartesanos.proveedores FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proyecto_archivos; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.proyecto_archivos ENABLE ROW LEVEL SECURITY;

--
-- Name: proyecto_archivos proyecto_archivos_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proyecto_archivos_delete ON joyeriaartesanos.proyecto_archivos FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proyecto_archivos proyecto_archivos_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proyecto_archivos_insert ON joyeriaartesanos.proyecto_archivos FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proyecto_archivos proyecto_archivos_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proyecto_archivos_select ON joyeriaartesanos.proyecto_archivos FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proyecto_archivos proyecto_archivos_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proyecto_archivos_update ON joyeriaartesanos.proyecto_archivos FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proyecto_comentarios; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.proyecto_comentarios ENABLE ROW LEVEL SECURITY;

--
-- Name: proyecto_comentarios proyecto_comentarios_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proyecto_comentarios_delete ON joyeriaartesanos.proyecto_comentarios FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proyecto_comentarios proyecto_comentarios_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proyecto_comentarios_insert ON joyeriaartesanos.proyecto_comentarios FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proyecto_comentarios proyecto_comentarios_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proyecto_comentarios_select ON joyeriaartesanos.proyecto_comentarios FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proyecto_comentarios proyecto_comentarios_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proyecto_comentarios_update ON joyeriaartesanos.proyecto_comentarios FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proyecto_estado_historial; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.proyecto_estado_historial ENABLE ROW LEVEL SECURITY;

--
-- Name: proyecto_estado_historial proyecto_estado_historial_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proyecto_estado_historial_delete ON joyeriaartesanos.proyecto_estado_historial FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proyecto_estado_historial proyecto_estado_historial_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proyecto_estado_historial_insert ON joyeriaartesanos.proyecto_estado_historial FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proyecto_estado_historial proyecto_estado_historial_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proyecto_estado_historial_select ON joyeriaartesanos.proyecto_estado_historial FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proyecto_estado_historial proyecto_estado_historial_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proyecto_estado_historial_update ON joyeriaartesanos.proyecto_estado_historial FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proyecto_estados; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.proyecto_estados ENABLE ROW LEVEL SECURITY;

--
-- Name: proyecto_estados proyecto_estados_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proyecto_estados_delete ON joyeriaartesanos.proyecto_estados FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proyecto_estados proyecto_estados_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proyecto_estados_insert ON joyeriaartesanos.proyecto_estados FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proyecto_estados proyecto_estados_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proyecto_estados_select ON joyeriaartesanos.proyecto_estados FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proyecto_estados proyecto_estados_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proyecto_estados_update ON joyeriaartesanos.proyecto_estados FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proyecto_prioridades_config; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.proyecto_prioridades_config ENABLE ROW LEVEL SECURITY;

--
-- Name: proyecto_prioridades_config proyecto_prioridades_config_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proyecto_prioridades_config_delete ON joyeriaartesanos.proyecto_prioridades_config FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proyecto_prioridades_config proyecto_prioridades_config_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proyecto_prioridades_config_insert ON joyeriaartesanos.proyecto_prioridades_config FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proyecto_prioridades_config proyecto_prioridades_config_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proyecto_prioridades_config_select ON joyeriaartesanos.proyecto_prioridades_config FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proyecto_prioridades_config proyecto_prioridades_config_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proyecto_prioridades_config_update ON joyeriaartesanos.proyecto_prioridades_config FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proyecto_tareas; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.proyecto_tareas ENABLE ROW LEVEL SECURITY;

--
-- Name: proyecto_tareas proyecto_tareas_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proyecto_tareas_delete ON joyeriaartesanos.proyecto_tareas FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proyecto_tareas proyecto_tareas_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proyecto_tareas_insert ON joyeriaartesanos.proyecto_tareas FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proyecto_tareas proyecto_tareas_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proyecto_tareas_select ON joyeriaartesanos.proyecto_tareas FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proyecto_tareas proyecto_tareas_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proyecto_tareas_update ON joyeriaartesanos.proyecto_tareas FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proyecto_tipos; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.proyecto_tipos ENABLE ROW LEVEL SECURITY;

--
-- Name: proyecto_tipos proyecto_tipos_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proyecto_tipos_delete ON joyeriaartesanos.proyecto_tipos FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proyecto_tipos proyecto_tipos_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proyecto_tipos_insert ON joyeriaartesanos.proyecto_tipos FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proyecto_tipos proyecto_tipos_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proyecto_tipos_select ON joyeriaartesanos.proyecto_tipos FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proyecto_tipos proyecto_tipos_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proyecto_tipos_update ON joyeriaartesanos.proyecto_tipos FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proyectos; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.proyectos ENABLE ROW LEVEL SECURITY;

--
-- Name: proyectos proyectos_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proyectos_delete ON joyeriaartesanos.proyectos FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proyectos proyectos_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proyectos_insert ON joyeriaartesanos.proyectos FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proyectos proyectos_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proyectos_select ON joyeriaartesanos.proyectos FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: proyectos proyectos_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY proyectos_update ON joyeriaartesanos.proyectos FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: resenas_videos; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.resenas_videos ENABLE ROW LEVEL SECURITY;

--
-- Name: resenas_videos resenas_videos_delete_authenticated; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY resenas_videos_delete_authenticated ON joyeriaartesanos.resenas_videos FOR DELETE TO authenticated USING (true);


--
-- Name: resenas_videos resenas_videos_insert_authenticated; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY resenas_videos_insert_authenticated ON joyeriaartesanos.resenas_videos FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: resenas_videos resenas_videos_select_anon; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY resenas_videos_select_anon ON joyeriaartesanos.resenas_videos FOR SELECT TO anon USING (((activo = true) AND (visible_web = true)));


--
-- Name: resenas_videos resenas_videos_select_authenticated; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY resenas_videos_select_authenticated ON joyeriaartesanos.resenas_videos FOR SELECT TO authenticated USING (true);


--
-- Name: resenas_videos resenas_videos_update_authenticated; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY resenas_videos_update_authenticated ON joyeriaartesanos.resenas_videos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: sorteo_conversaciones sorteo_conv_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY sorteo_conv_delete ON joyeriaartesanos.sorteo_conversaciones FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: sorteo_conversaciones sorteo_conv_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY sorteo_conv_insert ON joyeriaartesanos.sorteo_conversaciones FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: sorteo_conversaciones sorteo_conv_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY sorteo_conv_select ON joyeriaartesanos.sorteo_conversaciones FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: sorteo_conversaciones sorteo_conv_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY sorteo_conv_update ON joyeriaartesanos.sorteo_conversaciones FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: sorteo_conversaciones; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.sorteo_conversaciones ENABLE ROW LEVEL SECURITY;

--
-- Name: sorteo_cupones sorteo_cup_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY sorteo_cup_delete ON joyeriaartesanos.sorteo_cupones FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: sorteo_cupones sorteo_cup_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY sorteo_cup_insert ON joyeriaartesanos.sorteo_cupones FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: sorteo_cupones sorteo_cup_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY sorteo_cup_select ON joyeriaartesanos.sorteo_cupones FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: sorteo_cupones sorteo_cup_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY sorteo_cup_update ON joyeriaartesanos.sorteo_cupones FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: sorteo_cupones; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.sorteo_cupones ENABLE ROW LEVEL SECURITY;

--
-- Name: sorteo_entradas sorteo_ent_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY sorteo_ent_delete ON joyeriaartesanos.sorteo_entradas FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: sorteo_entradas sorteo_ent_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY sorteo_ent_insert ON joyeriaartesanos.sorteo_entradas FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: sorteo_entradas sorteo_ent_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY sorteo_ent_select ON joyeriaartesanos.sorteo_entradas FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: sorteo_entradas sorteo_ent_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY sorteo_ent_update ON joyeriaartesanos.sorteo_entradas FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: sorteo_entradas; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.sorteo_entradas ENABLE ROW LEVEL SECURITY;

--
-- Name: sorteo_revendedor_clicks sorteo_rev_clicks_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY sorteo_rev_clicks_delete ON joyeriaartesanos.sorteo_revendedor_clicks FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: sorteo_revendedor_clicks sorteo_rev_clicks_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY sorteo_rev_clicks_insert ON joyeriaartesanos.sorteo_revendedor_clicks FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: sorteo_revendedor_clicks sorteo_rev_clicks_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY sorteo_rev_clicks_select ON joyeriaartesanos.sorteo_revendedor_clicks FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: sorteo_revendedor_clicks sorteo_rev_clicks_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY sorteo_rev_clicks_update ON joyeriaartesanos.sorteo_revendedor_clicks FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: sorteo_revendedores sorteo_rev_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY sorteo_rev_delete ON joyeriaartesanos.sorteo_revendedores FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: sorteo_revendedores sorteo_rev_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY sorteo_rev_insert ON joyeriaartesanos.sorteo_revendedores FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: sorteo_revendedores sorteo_rev_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY sorteo_rev_select ON joyeriaartesanos.sorteo_revendedores FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: sorteo_revendedores sorteo_rev_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY sorteo_rev_update ON joyeriaartesanos.sorteo_revendedores FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: sorteo_revendedor_clicks; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.sorteo_revendedor_clicks ENABLE ROW LEVEL SECURITY;

--
-- Name: sorteo_revendedores; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.sorteo_revendedores ENABLE ROW LEVEL SECURITY;

--
-- Name: sorteo_ticket_deliveries; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.sorteo_ticket_deliveries ENABLE ROW LEVEL SECURITY;

--
-- Name: sorteo_ticket_deliveries sorteo_ticket_deliveries_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY sorteo_ticket_deliveries_delete ON joyeriaartesanos.sorteo_ticket_deliveries FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: sorteo_ticket_deliveries sorteo_ticket_deliveries_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY sorteo_ticket_deliveries_insert ON joyeriaartesanos.sorteo_ticket_deliveries FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: sorteo_ticket_deliveries sorteo_ticket_deliveries_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY sorteo_ticket_deliveries_select ON joyeriaartesanos.sorteo_ticket_deliveries FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: sorteo_ticket_deliveries sorteo_ticket_deliveries_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY sorteo_ticket_deliveries_update ON joyeriaartesanos.sorteo_ticket_deliveries FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: sorteos; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.sorteos ENABLE ROW LEVEL SECURITY;

--
-- Name: sorteos sorteos_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY sorteos_delete ON joyeriaartesanos.sorteos FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: sorteos sorteos_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY sorteos_insert ON joyeriaartesanos.sorteos FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: sorteos sorteos_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY sorteos_select ON joyeriaartesanos.sorteos FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: sorteos sorteos_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY sorteos_update ON joyeriaartesanos.sorteos FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: suscripciones; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.suscripciones ENABLE ROW LEVEL SECURITY;

--
-- Name: suscripciones suscripciones_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY suscripciones_delete ON joyeriaartesanos.suscripciones FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: suscripciones suscripciones_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY suscripciones_insert ON joyeriaartesanos.suscripciones FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: suscripciones suscripciones_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY suscripciones_select ON joyeriaartesanos.suscripciones FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: suscripciones suscripciones_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY suscripciones_update ON joyeriaartesanos.suscripciones FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: tipificaciones; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.tipificaciones ENABLE ROW LEVEL SECURITY;

--
-- Name: tipificaciones tipificaciones_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY tipificaciones_delete ON joyeriaartesanos.tipificaciones FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: tipificaciones tipificaciones_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY tipificaciones_insert ON joyeriaartesanos.tipificaciones FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: tipificaciones tipificaciones_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY tipificaciones_select ON joyeriaartesanos.tipificaciones FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: tipificaciones tipificaciones_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY tipificaciones_update ON joyeriaartesanos.tipificaciones FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: usuario_dashboard_views udv_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY udv_delete ON joyeriaartesanos.usuario_dashboard_views FOR DELETE USING ((joyeriaartesanos.es_super_admin() OR (EXISTS ( SELECT 1
   FROM (joyeriaartesanos.usuarios ua
     JOIN joyeriaartesanos.usuarios ut ON ((ut.id = usuario_dashboard_views.usuario_id)))
  WHERE ((lower(TRIM(BOTH FROM COALESCE(ua.email, ''::text))) = lower(TRIM(BOTH FROM COALESCE((auth.jwt() ->> 'email'::text), ''::text)))) AND (ua.empresa_id IS NOT NULL) AND (ua.empresa_id = ut.empresa_id) AND (COALESCE(ua.rol, ''::text) = ANY (ARRAY['admin'::text, 'administrador'::text])))))));


--
-- Name: usuario_dashboard_views udv_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY udv_insert ON joyeriaartesanos.usuario_dashboard_views FOR INSERT WITH CHECK ((joyeriaartesanos.es_super_admin() OR (EXISTS ( SELECT 1
   FROM (joyeriaartesanos.usuarios ua
     JOIN joyeriaartesanos.usuarios ut ON ((ut.id = usuario_dashboard_views.usuario_id)))
  WHERE ((lower(TRIM(BOTH FROM COALESCE(ua.email, ''::text))) = lower(TRIM(BOTH FROM COALESCE((auth.jwt() ->> 'email'::text), ''::text)))) AND (ua.empresa_id IS NOT NULL) AND (ua.empresa_id = ut.empresa_id) AND (COALESCE(ua.rol, ''::text) = ANY (ARRAY['admin'::text, 'administrador'::text])))))));


--
-- Name: usuario_dashboard_views udv_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY udv_select ON joyeriaartesanos.usuario_dashboard_views FOR SELECT USING ((joyeriaartesanos.es_super_admin() OR (usuario_id IN ( SELECT usuarios.id
   FROM joyeriaartesanos.usuarios
  WHERE (lower(TRIM(BOTH FROM COALESCE(usuarios.email, ''::text))) = lower(TRIM(BOTH FROM COALESCE((auth.jwt() ->> 'email'::text), ''::text))))))));


--
-- Name: usuario_dashboard_views udv_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY udv_update ON joyeriaartesanos.usuario_dashboard_views FOR UPDATE USING ((joyeriaartesanos.es_super_admin() OR (EXISTS ( SELECT 1
   FROM (joyeriaartesanos.usuarios ua
     JOIN joyeriaartesanos.usuarios ut ON ((ut.id = usuario_dashboard_views.usuario_id)))
  WHERE ((lower(TRIM(BOTH FROM COALESCE(ua.email, ''::text))) = lower(TRIM(BOTH FROM COALESCE((auth.jwt() ->> 'email'::text), ''::text)))) AND (ua.empresa_id IS NOT NULL) AND (ua.empresa_id = ut.empresa_id) AND (COALESCE(ua.rol, ''::text) = ANY (ARRAY['admin'::text, 'administrador'::text]))))))) WITH CHECK ((joyeriaartesanos.es_super_admin() OR (EXISTS ( SELECT 1
   FROM (joyeriaartesanos.usuarios ua
     JOIN joyeriaartesanos.usuarios ut ON ((ut.id = usuario_dashboard_views.usuario_id)))
  WHERE ((lower(TRIM(BOTH FROM COALESCE(ua.email, ''::text))) = lower(TRIM(BOTH FROM COALESCE((auth.jwt() ->> 'email'::text), ''::text)))) AND (ua.empresa_id IS NOT NULL) AND (ua.empresa_id = ut.empresa_id) AND (COALESCE(ua.rol, ''::text) = ANY (ARRAY['admin'::text, 'administrador'::text])))))));


--
-- Name: usuario_dashboard_views; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.usuario_dashboard_views ENABLE ROW LEVEL SECURITY;

--
-- Name: usuario_modulos; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.usuario_modulos ENABLE ROW LEVEL SECURITY;

--
-- Name: usuario_modulos usuario_modulos_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY usuario_modulos_delete ON joyeriaartesanos.usuario_modulos FOR DELETE USING ((joyeriaartesanos.es_super_admin() OR (EXISTS ( SELECT 1
   FROM (joyeriaartesanos.usuarios ua
     JOIN joyeriaartesanos.usuarios ut ON ((ut.id = usuario_modulos.usuario_id)))
  WHERE ((lower(TRIM(BOTH FROM COALESCE(ua.email, ''::text))) = joyeriaartesanos.jwt_email_normalized()) AND (ua.empresa_id IS NOT NULL) AND (ua.empresa_id = ut.empresa_id) AND (COALESCE(ua.rol, ''::text) = ANY (ARRAY['admin'::text, 'administrador'::text])))))));


--
-- Name: usuario_modulos usuario_modulos_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY usuario_modulos_insert ON joyeriaartesanos.usuario_modulos FOR INSERT WITH CHECK ((joyeriaartesanos.es_super_admin() OR (EXISTS ( SELECT 1
   FROM (joyeriaartesanos.usuarios ua
     JOIN joyeriaartesanos.usuarios ut ON ((ut.id = usuario_modulos.usuario_id)))
  WHERE ((lower(TRIM(BOTH FROM COALESCE(ua.email, ''::text))) = joyeriaartesanos.jwt_email_normalized()) AND (ua.empresa_id IS NOT NULL) AND (ua.empresa_id = ut.empresa_id) AND (COALESCE(ua.rol, ''::text) = ANY (ARRAY['admin'::text, 'administrador'::text])))))));


--
-- Name: usuario_modulos usuario_modulos_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY usuario_modulos_select ON joyeriaartesanos.usuario_modulos FOR SELECT USING ((joyeriaartesanos.es_super_admin() OR (usuario_id IN ( SELECT usuarios.id
   FROM joyeriaartesanos.usuarios
  WHERE (lower(TRIM(BOTH FROM COALESCE(usuarios.email, ''::text))) = joyeriaartesanos.jwt_email_normalized())))));


--
-- Name: usuario_modulos usuario_modulos_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY usuario_modulos_update ON joyeriaartesanos.usuario_modulos FOR UPDATE USING ((joyeriaartesanos.es_super_admin() OR (EXISTS ( SELECT 1
   FROM (joyeriaartesanos.usuarios ua
     JOIN joyeriaartesanos.usuarios ut ON ((ut.id = usuario_modulos.usuario_id)))
  WHERE ((lower(TRIM(BOTH FROM COALESCE(ua.email, ''::text))) = joyeriaartesanos.jwt_email_normalized()) AND (ua.empresa_id IS NOT NULL) AND (ua.empresa_id = ut.empresa_id) AND (COALESCE(ua.rol, ''::text) = ANY (ARRAY['admin'::text, 'administrador'::text]))))))) WITH CHECK ((joyeriaartesanos.es_super_admin() OR (EXISTS ( SELECT 1
   FROM (joyeriaartesanos.usuarios ua
     JOIN joyeriaartesanos.usuarios ut ON ((ut.id = usuario_modulos.usuario_id)))
  WHERE ((lower(TRIM(BOTH FROM COALESCE(ua.email, ''::text))) = joyeriaartesanos.jwt_email_normalized()) AND (ua.empresa_id IS NOT NULL) AND (ua.empresa_id = ut.empresa_id) AND (COALESCE(ua.rol, ''::text) = ANY (ARRAY['admin'::text, 'administrador'::text])))))));


--
-- Name: usuarios; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.usuarios ENABLE ROW LEVEL SECURITY;

--
-- Name: usuarios usuarios_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY usuarios_delete ON joyeriaartesanos.usuarios FOR DELETE USING (joyeriaartesanos.es_super_admin());


--
-- Name: usuarios usuarios_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY usuarios_insert ON joyeriaartesanos.usuarios FOR INSERT WITH CHECK ((joyeriaartesanos.es_super_admin() OR ((empresa_id = joyeriaartesanos.empresa_id_actual()) AND (empresa_id IS NOT NULL))));


--
-- Name: usuarios usuarios_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY usuarios_select ON joyeriaartesanos.usuarios FOR SELECT USING ((joyeriaartesanos.es_super_admin() OR (empresa_id = joyeriaartesanos.empresa_id_actual()) OR ((empresa_id IS NULL) AND (rol = 'super_admin'::text)) OR (auth_user_id = auth.uid())));


--
-- Name: usuarios usuarios_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY usuarios_update ON joyeriaartesanos.usuarios FOR UPDATE USING ((joyeriaartesanos.es_super_admin() OR (empresa_id = joyeriaartesanos.empresa_id_actual()) OR ((empresa_id IS NULL) AND (rol = 'super_admin'::text)))) WITH CHECK ((joyeriaartesanos.es_super_admin() OR (empresa_id = joyeriaartesanos.empresa_id_actual()) OR ((empresa_id IS NULL) AND (rol = 'super_admin'::text))));


--
-- Name: ventas; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.ventas ENABLE ROW LEVEL SECURITY;

--
-- Name: ventas ventas_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY ventas_delete ON joyeriaartesanos.ventas FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: ventas ventas_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY ventas_insert ON joyeriaartesanos.ventas FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: ventas_items; Type: ROW SECURITY; Schema: elevate; Owner: -
--

ALTER TABLE joyeriaartesanos.ventas_items ENABLE ROW LEVEL SECURITY;

--
-- Name: ventas_items ventas_items_delete; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY ventas_items_delete ON joyeriaartesanos.ventas_items FOR DELETE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: ventas_items ventas_items_insert; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY ventas_items_insert ON joyeriaartesanos.ventas_items FOR INSERT WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: ventas_items ventas_items_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY ventas_items_select ON joyeriaartesanos.ventas_items FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: ventas_items ventas_items_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY ventas_items_update ON joyeriaartesanos.ventas_items FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: ventas ventas_select; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY ventas_select ON joyeriaartesanos.ventas FOR SELECT USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- Name: ventas ventas_update; Type: POLICY; Schema: elevate; Owner: -
--

CREATE POLICY ventas_update ON joyeriaartesanos.ventas FOR UPDATE USING (joyeriaartesanos.puede_acceder_empresa(empresa_id)) WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));


--
-- PostgreSQL database dump complete
--

