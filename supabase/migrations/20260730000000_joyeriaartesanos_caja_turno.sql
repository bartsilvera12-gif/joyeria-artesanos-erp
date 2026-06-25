-- =============================================================================
-- Módulo CAJA por turno (joyería artesanos) — schema `joyeriaartesanos`.
--
-- Una "caja" es un turno: apertura + cierre. Ventas se asocian por caja_id,
-- NO por fecha calendario. El cierre calcula efectivo esperado vs contado y
-- persiste la diferencia (arqueo).
--
-- Crea:
--   · joyeriaartesanos.cajas              (turnos: apertura/cierre/arqueo)
--   · joyeriaartesanos.caja_movimientos   (ingresos/egresos/retiros/ajustes manuales)
--   · joyeriaartesanos.ventas.caja_id     (FK a cajas; NULL en ventas históricas)
--   · joyeriaartesanos.ventas.metodo_pago (efectivo/tarjeta/transferencia, opcional)
--
-- Idempotente: CREATE ... IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / DROP+CREATE
-- POLICY. NO reasigna ventas previas: caja_id queda NULL.
-- =============================================================================

BEGIN;

-- ── 1) Tabla cajas ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS joyeriaartesanos.cajas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE,
  numero_caja bigint NOT NULL,
  estado text NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','cerrada')),
  abierta_por uuid REFERENCES joyeriaartesanos.usuarios(id) ON DELETE SET NULL,
  cerrada_por uuid REFERENCES joyeriaartesanos.usuarios(id) ON DELETE SET NULL,
  fecha_apertura timestamptz NOT NULL DEFAULT now(),
  fecha_cierre timestamptz,
  monto_apertura numeric(14,2) NOT NULL DEFAULT 0,
  monto_cierre_contado numeric(14,2),
  monto_esperado_efectivo numeric(14,2),
  diferencia numeric(14,2),
  observacion_apertura text,
  observacion_cierre text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_cajas_empresa_numero UNIQUE (empresa_id, numero_caja)
);

CREATE INDEX IF NOT EXISTS ix_cajas_empresa_estado
  ON joyeriaartesanos.cajas (empresa_id, estado);
CREATE INDEX IF NOT EXISTS ix_cajas_empresa_apertura
  ON joyeriaartesanos.cajas (empresa_id, fecha_apertura DESC);
-- Una sola caja ABIERTA por empresa a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cajas_una_abierta
  ON joyeriaartesanos.cajas (empresa_id) WHERE estado = 'abierta';

ALTER TABLE joyeriaartesanos.cajas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cajas_select ON joyeriaartesanos.cajas;
CREATE POLICY cajas_select ON joyeriaartesanos.cajas FOR SELECT
  USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));
DROP POLICY IF EXISTS cajas_insert ON joyeriaartesanos.cajas;
CREATE POLICY cajas_insert ON joyeriaartesanos.cajas FOR INSERT
  WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));
DROP POLICY IF EXISTS cajas_update ON joyeriaartesanos.cajas;
CREATE POLICY cajas_update ON joyeriaartesanos.cajas FOR UPDATE
  USING (joyeriaartesanos.puede_acceder_empresa(empresa_id))
  WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));
DROP POLICY IF EXISTS cajas_delete ON joyeriaartesanos.cajas;
CREATE POLICY cajas_delete ON joyeriaartesanos.cajas FOR DELETE
  USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));

-- Trigger updated_at: usa la función del schema si existe, sino fallback.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'joyeriaartesanos' AND p.proname = 'set_updated_at') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS tr_cajas_updated ON joyeriaartesanos.cajas';
    EXECUTE 'CREATE TRIGGER tr_cajas_updated BEFORE UPDATE ON joyeriaartesanos.cajas
             FOR EACH ROW EXECUTE FUNCTION joyeriaartesanos.set_updated_at()';
  END IF;
END $$;

-- ── 2) Tabla caja_movimientos ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS joyeriaartesanos.caja_movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE,
  caja_id uuid NOT NULL REFERENCES joyeriaartesanos.cajas(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('ingreso','egreso','retiro','ajuste')),
  concepto text NOT NULL,
  monto numeric(14,2) NOT NULL,
  medio_pago text NOT NULL DEFAULT 'efectivo',
  usuario_id uuid REFERENCES joyeriaartesanos.usuarios(id) ON DELETE SET NULL,
  observacion text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_caja_mov_concepto_non_empty CHECK (length(trim(concepto)) > 0)
);

CREATE INDEX IF NOT EXISTS ix_caja_mov_caja
  ON joyeriaartesanos.caja_movimientos (empresa_id, caja_id, created_at);

ALTER TABLE joyeriaartesanos.caja_movimientos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS caja_mov_select ON joyeriaartesanos.caja_movimientos;
CREATE POLICY caja_mov_select ON joyeriaartesanos.caja_movimientos FOR SELECT
  USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));
DROP POLICY IF EXISTS caja_mov_insert ON joyeriaartesanos.caja_movimientos;
CREATE POLICY caja_mov_insert ON joyeriaartesanos.caja_movimientos FOR INSERT
  WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));
DROP POLICY IF EXISTS caja_mov_update ON joyeriaartesanos.caja_movimientos;
CREATE POLICY caja_mov_update ON joyeriaartesanos.caja_movimientos FOR UPDATE
  USING (joyeriaartesanos.puede_acceder_empresa(empresa_id))
  WITH CHECK (joyeriaartesanos.puede_acceder_empresa(empresa_id));
DROP POLICY IF EXISTS caja_mov_delete ON joyeriaartesanos.caja_movimientos;
CREATE POLICY caja_mov_delete ON joyeriaartesanos.caja_movimientos FOR DELETE
  USING (joyeriaartesanos.puede_acceder_empresa(empresa_id));

-- ── 3) ventas: caja_id + metodo_pago (no reasignar histórico) ───────────────
ALTER TABLE joyeriaartesanos.ventas
  ADD COLUMN IF NOT EXISTS caja_id uuid;
ALTER TABLE joyeriaartesanos.ventas
  ADD COLUMN IF NOT EXISTS metodo_pago text;

CREATE INDEX IF NOT EXISTS ix_ventas_caja
  ON joyeriaartesanos.ventas (empresa_id, caja_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ventas_caja_id_fkey'
  ) THEN
    BEGIN
      ALTER TABLE joyeriaartesanos.ventas
        ADD CONSTRAINT ventas_caja_id_fkey
        FOREIGN KEY (caja_id) REFERENCES joyeriaartesanos.cajas(id) ON DELETE SET NULL;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '[caja] no se pudo crear FK ventas.caja_id: %', SQLERRM;
    END;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ventas_metodo_pago_check'
  ) THEN
    BEGIN
      ALTER TABLE joyeriaartesanos.ventas
        ADD CONSTRAINT ventas_metodo_pago_check
        CHECK (metodo_pago IS NULL OR metodo_pago IN ('efectivo','tarjeta','transferencia'));
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '[caja] no se pudo crear CHECK ventas.metodo_pago: %', SQLERRM;
    END;
  END IF;
END $$;

COMMIT;
