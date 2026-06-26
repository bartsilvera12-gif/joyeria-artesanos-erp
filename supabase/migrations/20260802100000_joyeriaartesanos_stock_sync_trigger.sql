-- PR 2 paso 2: trigger que mantiene productos.stock_actual = SUM(producto_stock_sucursal)
--
-- Razón: el ERP tiene muchísimos lectores de productos.stock_actual (UI inventario,
-- búsqueda, reportes, web pública, dashboards). Cambiarlos todos en un solo PR es
-- riesgoso. Estrategia: el escritor canónico pasa a ser producto_stock_sucursal,
-- y un trigger mantiene productos.stock_actual sincronizado como el agregado total.
--
-- Los reads existentes siguen funcionando sin cambios. Pasos posteriores van a
-- empezar a leer per-sucursal donde corresponda (caja, web pública).

BEGIN;

-- Función que recalcula stock_actual del producto afectado.
CREATE OR REPLACE FUNCTION joyeriaartesanos.sync_producto_stock_total()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_producto_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_producto_id := OLD.producto_id;
  ELSE
    v_producto_id := NEW.producto_id;
  END IF;

  UPDATE joyeriaartesanos.productos p
  SET stock_actual = COALESCE((
    SELECT SUM(pss.stock_actual)
    FROM joyeriaartesanos.producto_stock_sucursal pss
    WHERE pss.producto_id = v_producto_id
  ), 0),
  updated_at = now()
  WHERE p.id = v_producto_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_producto_stock_total_aiud
  ON joyeriaartesanos.producto_stock_sucursal;

CREATE TRIGGER trg_sync_producto_stock_total_aiud
AFTER INSERT OR UPDATE OR DELETE ON joyeriaartesanos.producto_stock_sucursal
FOR EACH ROW
EXECUTE FUNCTION joyeriaartesanos.sync_producto_stock_total();

-- Recalcular ahora una vez para asegurar consistencia post-backfill (idempotente).
UPDATE joyeriaartesanos.productos p
SET stock_actual = COALESCE((
  SELECT SUM(pss.stock_actual)
  FROM joyeriaartesanos.producto_stock_sucursal pss
  WHERE pss.producto_id = p.id
), 0);

COMMIT;
