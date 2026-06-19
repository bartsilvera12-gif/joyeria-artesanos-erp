-- =============================================================================
-- ELEVATE CATALOG BOOTSTRAP — Paso 0 (no destructivo)
-- =============================================================================
-- Crea el schema `elevate` y las tablas de catálogo que el resto del ERP
-- presupone existentes pero NO están definidas en supabase/migrations/.
--
-- Origen de la estructura: extraído manualmente desde Supabase Cloud
-- (information_schema.columns + pg_constraint + pg_indexes para zentra_erp).
-- Sin acceso ni conexión al Cloud desde aquí.
--
-- NO se insertan datos. NO se crean usuarios auth. NO se toca public ni
-- zentra_erp. Solo se referencia auth.users (Supabase Auth, schema oficial).
--
-- FKs hacia tablas creadas por migraciones posteriores (facturas,
-- suscripciones, planes) se POSPONEN: ver TODO marcado abajo.
-- =============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS elevate;
GRANT USAGE ON SCHEMA elevate TO postgres, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 1) elevate.empresas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS elevate.empresas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
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
  gestion_tributaria_clientes boolean NOT NULL DEFAULT false,
  CONSTRAINT empresas_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS empresas_data_schema_unique
ON elevate.empresas USING btree (data_schema)
WHERE data_schema IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2) elevate.modulos
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS elevate.modulos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  nombre text,
  descripcion text,
  slug text,
  CONSTRAINT modulos_pkey PRIMARY KEY (id)
);

-- -----------------------------------------------------------------------------
-- 3) elevate.usuarios
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS elevate.usuarios (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text,
  nombre text,
  rol text,
  empresa_id uuid,
  auth_user_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  activo boolean DEFAULT true,
  porcentaje_comision numeric,
  CONSTRAINT usuarios_pkey PRIMARY KEY (id),
  CONSTRAINT usuarios_email_key UNIQUE (email),
  CONSTRAINT usuarios_empresa_id_fkey FOREIGN KEY (empresa_id)
    REFERENCES elevate.empresas(id) ON DELETE CASCADE,
  CONSTRAINT usuarios_auth_user_id_fkey FOREIGN KEY (auth_user_id)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT usuarios_porcentaje_comision_check
    CHECK (porcentaje_comision IS NULL OR porcentaje_comision >= 0::numeric AND porcentaje_comision <= 100::numeric)
);

CREATE INDEX IF NOT EXISTS idx_usuarios_auth_user_id
ON elevate.usuarios USING btree (auth_user_id);

-- -----------------------------------------------------------------------------
-- 4) elevate.empresa_modulos
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS elevate.empresa_modulos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  empresa_id uuid NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  modulo_id uuid,
  CONSTRAINT empresa_modulos_pkey PRIMARY KEY (id),
  CONSTRAINT empresa_modulos_modulo_id_fkey FOREIGN KEY (modulo_id)
    REFERENCES elevate.modulos(id)
);

-- -----------------------------------------------------------------------------
-- 5) elevate.usuario_modulos
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS elevate.usuario_modulos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL,
  modulo_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT usuario_modulos_pkey PRIMARY KEY (id),
  CONSTRAINT usuario_modulos_usuario_id_modulo_id_key UNIQUE (usuario_id, modulo_id),
  CONSTRAINT usuario_modulos_usuario_id_fkey FOREIGN KEY (usuario_id)
    REFERENCES elevate.usuarios(id) ON DELETE CASCADE,
  CONSTRAINT usuario_modulos_modulo_id_fkey FOREIGN KEY (modulo_id)
    REFERENCES elevate.modulos(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_usuario_modulos_usuario
ON elevate.usuario_modulos USING btree (usuario_id);

-- -----------------------------------------------------------------------------
-- 6) elevate.clientes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS elevate.clientes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
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
  sifen_receptor_extranjero boolean NOT NULL DEFAULT false,
  sifen_codigo_pais text,
  sifen_tipo_doc_receptor smallint,
  sifen_receptor_manual boolean NOT NULL DEFAULT false,
  sifen_receptor_naturaleza text,
  sifen_ti_ope smallint,
  sifen_num_id_de text,
  sifen_direccion_de text,
  sifen_num_casa_de integer,
  sifen_descripcion_tipo_doc text,
  CONSTRAINT clientes_pkey PRIMARY KEY (id),
  CONSTRAINT clientes_empresa_id_fkey FOREIGN KEY (empresa_id)
    REFERENCES elevate.empresas(id) ON DELETE CASCADE,
  CONSTRAINT clientes_vendedor_usuario_id_fkey FOREIGN KEY (vendedor_usuario_id)
    REFERENCES elevate.usuarios(id) ON DELETE SET NULL,
  CONSTRAINT clientes_created_by_user_id_fkey FOREIGN KEY (created_by_user_id)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT clientes_deleted_by_user_id_fkey FOREIGN KEY (deleted_by_user_id)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT clientes_baja_operativa_by_user_id_fkey FOREIGN KEY (baja_operativa_by_user_id)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT clientes_sifen_receptor_naturaleza_check
    CHECK (
      sifen_receptor_naturaleza IS NULL
      OR sifen_receptor_naturaleza = ANY (
        ARRAY[
          'contribuyente_paraguayo'::text,
          'no_contribuyente'::text,
          'extranjero'::text
        ]
      )
    ),
  CONSTRAINT clientes_sifen_ti_ope_check
    CHECK (sifen_ti_ope IS NULL OR sifen_ti_ope >= 1 AND sifen_ti_ope <= 4)
);

CREATE INDEX IF NOT EXISTS idx_clientes_baja_operativa_at
ON elevate.clientes USING btree (baja_operativa_at)
WHERE baja_operativa_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clientes_created_by
ON elevate.clientes USING btree (created_by_user_id);

CREATE INDEX IF NOT EXISTS idx_clientes_deleted_at
ON elevate.clientes USING btree (deleted_at)
WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clientes_tipo_servicio
ON elevate.clientes USING btree (tipo_servicio_cliente)
WHERE tipo_servicio_cliente IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_cli_vend_93405e10933cb8b99a0af6286dc9466b
ON elevate.clientes USING btree (empresa_id, vendedor_usuario_id);

-- -----------------------------------------------------------------------------
-- 7) elevate.cliente_historial
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS elevate.cliente_historial (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
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
  detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT cliente_historial_pkey PRIMARY KEY (id),
  CONSTRAINT cliente_historial_empresa_id_fkey FOREIGN KEY (empresa_id)
    REFERENCES elevate.empresas(id) ON DELETE CASCADE,
  CONSTRAINT cliente_historial_cliente_id_fkey FOREIGN KEY (cliente_id)
    REFERENCES elevate.clientes(id) ON DELETE CASCADE,
  CONSTRAINT cliente_historial_creado_por_auth_user_id_fkey FOREIGN KEY (creado_por_auth_user_id)
    REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT cliente_historial_modo_check
    CHECK (
      modo IS NULL
      OR modo = ANY (
        ARRAY[
          'inmediato'::text,
          'proximo_mes'::text,
          'actualizar_factura_pendiente'::text
        ]
      )
    )
);

-- TODO POSTERGADO — FKs hacia tablas que se crean después en el ERP consolidado.
-- Agregar en una migración posterior al consolidado, cuando elevate.facturas y
-- elevate.suscripciones ya existan:
--   ALTER TABLE elevate.cliente_historial ADD CONSTRAINT cliente_historial_factura_id_fkey
--     FOREIGN KEY (factura_id) REFERENCES elevate.facturas(id) ON DELETE SET NULL;
--   ALTER TABLE elevate.cliente_historial ADD CONSTRAINT cliente_historial_suscripcion_id_fkey
--     FOREIGN KEY (suscripcion_id) REFERENCES elevate.suscripciones(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cliente_historial_cliente_at
ON elevate.cliente_historial USING btree (cliente_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cliente_historial_empresa_at
ON elevate.cliente_historial USING btree (empresa_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 8) elevate.omnichannel_routes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS elevate.omnichannel_routes (
  meta_phone_number_id text NOT NULL,
  empresa_id uuid NOT NULL,
  channel_id uuid NOT NULL,
  data_schema text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT omnichannel_routes_pkey PRIMARY KEY (meta_phone_number_id),
  CONSTRAINT omnichannel_routes_empresa_id_fkey FOREIGN KEY (empresa_id)
    REFERENCES elevate.empresas(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_omnichannel_routes_empresa
ON elevate.omnichannel_routes USING btree (empresa_id);

-- -----------------------------------------------------------------------------
-- Grants finales
-- -----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA elevate TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA elevate TO postgres, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA elevate TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA elevate TO postgres, service_role;
GRANT EXECUTE ON ALL ROUTINES IN SCHEMA elevate TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
