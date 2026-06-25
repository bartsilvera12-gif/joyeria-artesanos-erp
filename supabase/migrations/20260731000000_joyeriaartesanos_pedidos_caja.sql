-- =============================================================================
-- Tabla `pedidos_caja` — schema `joyeriaartesanos`.
--
-- Flujo: el vendedor arma un pedido en /buscador (Consulta) → fila aquí en
-- estado 'pendiente' → el cajero lo ve en /ventas → al cobrar pasa a
-- 'facturado' con venta_id.
--
-- Aditiva, idempotente. Sin RLS (mismo patrón de seguridad por empresa_id
-- usado en otras tablas del schema).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS joyeriaartesanos.pedidos_caja (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  titulo text NOT NULL,
  cliente_id uuid,
  cliente_nombre text,
  cliente_telefono text,
  observacion text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_estimado numeric(14,2) NOT NULL DEFAULT 0,
  estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','facturado','cancelado')),
  venta_id uuid,
  venta_numero text,
  armado_por_id uuid,
  armado_por_email text,
  cancelado_por_id uuid,
  cancelado_motivo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  facturado_at timestamptz,
  cancelado_at timestamptz
);

CREATE INDEX IF NOT EXISTS ix_pedidos_caja_empresa_estado
  ON joyeriaartesanos.pedidos_caja (empresa_id, estado, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_pedidos_caja_empresa_armado
  ON joyeriaartesanos.pedidos_caja (empresa_id, armado_por_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_pedidos_caja_venta
  ON joyeriaartesanos.pedidos_caja (empresa_id, venta_id) WHERE venta_id IS NOT NULL;

-- RLS por empresa, usando la función del schema (mismo patrón que el resto).
ALTER TABLE joyeriaartesanos.pedidos_caja ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pedidos_caja_select ON joyeriaartesanos.pedidos_caja;
CREATE POLICY pedidos_caja_select ON joyeriaartesanos.pedidos_caja FOR SELECT
  USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));
DROP POLICY IF EXISTS pedidos_caja_insert ON joyeriaartesanos.pedidos_caja;
CREATE POLICY pedidos_caja_insert ON joyeriaartesanos.pedidos_caja FOR INSERT
  WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));
DROP POLICY IF EXISTS pedidos_caja_update ON joyeriaartesanos.pedidos_caja;
CREATE POLICY pedidos_caja_update ON joyeriaartesanos.pedidos_caja FOR UPDATE
  USING (joyeriaartesanos.puede_acceder_empresa(empresa_id))
  WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));
DROP POLICY IF EXISTS pedidos_caja_delete ON joyeriaartesanos.pedidos_caja;
CREATE POLICY pedidos_caja_delete ON joyeriaartesanos.pedidos_caja FOR DELETE
  USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));

-- Trigger updated_at: reutiliza joyeriaartesanos.set_updated_at si existe.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'joyeriaartesanos' AND p.proname = 'set_updated_at') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS tr_pedidos_caja_updated ON joyeriaartesanos.pedidos_caja';
    EXECUTE 'CREATE TRIGGER tr_pedidos_caja_updated BEFORE UPDATE ON joyeriaartesanos.pedidos_caja
             FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at()';
  END IF;
END $$;

COMMIT;
