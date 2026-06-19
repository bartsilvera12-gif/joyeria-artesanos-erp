-- =============================================================================
-- ELEVATE BOOTSTRAP — Paso 3: bloquear lógica multiempresa
-- =============================================================================
-- Esta instancia es monocliente. Se cierran a nivel DB las puertas que podrían
-- crear otra empresa o reapuntar el data_schema:
--
--   1. Trigger BEFORE INSERT en elevate.empresas: solo permite el UUID Elevate.
--   2. Trigger BEFORE UPDATE en elevate.empresas: bloquea cambios a data_schema
--      (debe quedar 'elevate' permanentemente).
--   3. Las RPC de provisioning (neura_provision_empresa_data_schema /
--      neura_clone_zentra_erp_to_tenant / neura_teardown_provision_failed)
--      se reemplazan por stubs que siempre fallan.
--
-- El endpoint /api/admin/crear-empresa también debe responder 410 — eso vive
-- en el código TS, no en esta migración.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Bloquear INSERT de empresas distintas a Elevate
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION elevate.neura_elevate_block_other_empresas()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_elevate_id uuid := '00000000-0000-0000-0000-00000000e1e7'::uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.id IS DISTINCT FROM v_elevate_id THEN
      RAISE EXCEPTION
        'ELEVATE: instancia monocliente, solo se permite la empresa Elevate (id=%)',
        v_elevate_id
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.data_schema IS DISTINCT FROM 'elevate' THEN
      RAISE EXCEPTION
        'ELEVATE: data_schema de la empresa debe permanecer ''elevate'' (intento: %)',
        NEW.data_schema
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_elevate_block_other_empresas_ins ON elevate.empresas;
CREATE TRIGGER tr_elevate_block_other_empresas_ins
  BEFORE INSERT ON elevate.empresas
  FOR EACH ROW
  EXECUTE FUNCTION elevate.neura_elevate_block_other_empresas();

DROP TRIGGER IF EXISTS tr_elevate_lock_data_schema_upd ON elevate.empresas;
CREATE TRIGGER tr_elevate_lock_data_schema_upd
  BEFORE UPDATE OF data_schema ON elevate.empresas
  FOR EACH ROW
  EXECUTE FUNCTION elevate.neura_elevate_block_other_empresas();

-- -----------------------------------------------------------------------------
-- 2) Neutralizar RPCs de provisioning (no eliminar para no romper firmas
--    referenciadas en código; reemplazar cuerpo por error explícito).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION elevate.neura_provision_empresa_data_schema(
  p_empresa_id uuid,
  p_schema_slug text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = elevate, pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION
    'ELEVATE: provisioning multiempresa deshabilitado en esta instancia monocliente';
END;
$$;

CREATE OR REPLACE FUNCTION elevate.neura_clone_zentra_erp_to_tenant(p_target_schema text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = elevate, pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION
    'ELEVATE: clonado de schema tenant deshabilitado (instancia monocliente)';
END;
$$;

CREATE OR REPLACE FUNCTION elevate.neura_teardown_provision_failed(p_empresa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = elevate, pg_catalog
AS $$
BEGIN
  -- No-op: en monocliente no hay cleanup de schemas tenant.
  RETURN;
END;
$$;

NOTIFY pgrst, 'reload schema';
