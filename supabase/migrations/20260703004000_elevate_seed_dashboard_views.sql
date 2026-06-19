-- Elevate · Seed de empresa_dashboard_views
--
-- El dashboard mostraba "Sin vistas asignadas" porque elevate.empresa_dashboard_views
-- estaba vacía y el resolver, aunque tiene fallback "catálogo completo cuando no hay
-- filas", no llegaba bien en runtime. Esta migración fija el problema declarando
-- explícitamente las 4 vistas como activas para la empresa Elevate.
--
-- Idempotente: ON CONFLICT DO UPDATE.
-- Solo schema elevate. Solo empresa Elevate.

BEGIN;

DO $$
DECLARE
  v_empresa_id uuid := '00000000-0000-0000-0000-00000000e1e7';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM elevate.empresas WHERE id = v_empresa_id) THEN
    RAISE NOTICE 'Empresa Elevate no encontrada; salto seed dashboard';
    RETURN;
  END IF;

  INSERT INTO elevate.empresa_dashboard_views (empresa_id, dashboard_view_id, activo)
  SELECT v_empresa_id, dv.id, true
    FROM elevate.dashboard_views dv
   WHERE dv.activo = true
     AND dv.slug IN ('inventario', 'ventas', 'financiero', 'comercial')
  ON CONFLICT (empresa_id, dashboard_view_id) DO UPDATE
    SET activo = EXCLUDED.activo;
END $$;

COMMIT;
