-- =============================================================================
-- ELEVATE BOOTSTRAP — Paso 2: seed de la empresa única "Elevate"
-- =============================================================================
-- Esta instancia es monocliente. Se inserta UNA fila en elevate.empresas con
-- UUID fijo y data_schema = 'elevate' (apunta a sí misma).
--
-- UUID fijo:  00000000-0000-0000-0000-00000000e1e7  ("elevate" parcial)
--
-- Idempotente: ON CONFLICT no hace nada si ya existe.
-- Defensivo: solo setea columnas que sabemos existen en el modelo actual.
-- Si tu instalación tiene columnas adicionales NOT NULL sin default, ajustá.
-- =============================================================================

DO $seed_empresa$
DECLARE
  v_id          uuid := '00000000-0000-0000-0000-00000000e1e7'::uuid;
  v_nombre      text := 'Elevate';
  v_data_schema text := 'elevate';
  v_plan        text := 'pro';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'elevate') THEN
    RAISE EXCEPTION 'elevate seed: schema elevate no existe (correr 20260701000000 primero)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'elevate' AND c.relname = 'empresas'
  ) THEN
    RAISE EXCEPTION 'elevate seed: tabla elevate.empresas no existe';
  END IF;

  -- INSERT defensivo: usa solo columnas mínimas conocidas.
  -- Si el modelo cambia, esta migración debe actualizarse.
  INSERT INTO elevate.empresas (id, nombre_empresa, data_schema, plan)
  VALUES (v_id, v_nombre, v_data_schema, v_plan)
  ON CONFLICT (id) DO UPDATE
    SET data_schema = EXCLUDED.data_schema,
        nombre_empresa = COALESCE(elevate.empresas.nombre_empresa, EXCLUDED.nombre_empresa);

  RAISE NOTICE 'elevate seed: empresa única registrada (id=%, data_schema=%)', v_id, v_data_schema;
END;
$seed_empresa$;

-- -----------------------------------------------------------------------------
-- Activar módulos Fase 1 para la empresa Elevate.
-- Solo se activan módulos cuyo slug exista en elevate.modulos.
-- Lista Fase 1: dashboard, ventas, inventario, clientes, compras, usuarios,
--               configuracion, planes, gestion-clientes, crm, pagos, gastos.
-- Omnicanal/sorteos/notas-credito quedan disponibles pero NO se activan acá.
-- -----------------------------------------------------------------------------
DO $seed_modulos$
DECLARE
  v_empresa_id uuid := '00000000-0000-0000-0000-00000000e1e7'::uuid;
  v_slugs text[] := ARRAY[
    'dashboard', 'ventas', 'inventario', 'clientes', 'compras',
    'usuarios', 'configuracion', 'planes', 'gestion-clientes', 'crm',
    'pagos', 'gastos'
  ];
  v_count int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'elevate' AND c.relname = 'empresa_modulos'
  ) THEN
    RAISE NOTICE 'elevate seed: empresa_modulos no existe, omitido';
    RETURN;
  END IF;

  -- Idempotente sin depender de UNIQUE (empresa_id, modulo_id):
  -- 1) Reactivar los ya existentes (activo=true).
  UPDATE elevate.empresa_modulos
  SET activo = true
  WHERE empresa_id = v_empresa_id
    AND modulo_id IN (SELECT id FROM elevate.modulos WHERE slug = ANY (v_slugs));

  -- 2) Insertar solo los faltantes.
  INSERT INTO elevate.empresa_modulos (empresa_id, modulo_id, activo)
  SELECT v_empresa_id, m.id, true
  FROM elevate.modulos m
  WHERE m.slug = ANY (v_slugs)
    AND NOT EXISTS (
      SELECT 1 FROM elevate.empresa_modulos em
      WHERE em.empresa_id = v_empresa_id AND em.modulo_id = m.id
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'elevate seed: % módulos activados (insertados nuevos)', v_count;
END;
$seed_modulos$;
