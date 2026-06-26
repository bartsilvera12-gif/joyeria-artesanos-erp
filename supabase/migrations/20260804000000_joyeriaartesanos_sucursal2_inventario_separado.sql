-- Inventario por sucursal: separación real.
--
-- Hasta acá, el backfill de la migración 20260802000000 había creado una
-- fila en producto_stock_sucursal para cada (producto, Sucursal 2) con
-- stock_actual=0. Resultado: sucursal 2 veía TODOS los productos aunque
-- el admin no le hubiera asignado nada. El usuario sucursal2 además
-- estaba como admin/super_admin → veía todos los módulos.
--
-- Esta migración:
--   1. Vacía las filas auto-backfilladas de Sucursal 2 (stock=0).
--   2. Fuerza el rol del usuario sucursal2 a "usuario" para que las
--      restricciones de módulos se apliquen (los admin saltan el filtro).
--   3. Reafirma los módulos visibles para sucursal 2.

BEGIN;

-- 1. Limpiar el backfill de Sucursal 2 (mantenemos solo los que hayan tenido
-- stock real cargado por el admin o por un import per-sucursal posterior).
DELETE FROM joyeriaartesanos.producto_stock_sucursal pss
USING joyeriaartesanos.sucursales s
WHERE pss.sucursal_id = s.id
  AND s.slug = 'sucursal-2'
  AND pss.stock_actual = 0;

-- 2. Bajar el rol del usuario sucursal2 a "usuario" (no admin) — así el
-- resolutor de módulos aplica la intersección con usuario_modulos.
-- Nota: el schema public.usuarios no se usa en este deploy, solo
-- joyeriaartesanos.usuarios.
UPDATE joyeriaartesanos.usuarios
   SET rol = 'usuario'
 WHERE email = 'sucursal2@joyeriaartesanos.com'
   AND COALESCE(rol, '') IN ('admin', 'administrador', 'super_admin', 'super admin', 'superadmin');

-- 3. Asegurar slugs en catálogo de módulos (idempotente).
INSERT INTO joyeriaartesanos.modulos (nombre, slug)
SELECT v.nombre, v.slug
FROM (VALUES
  ('Clientes',   'clientes'),
  ('Consulta',   'consulta'),
  ('Inventario', 'inventario'),
  ('Ventas',     'ventas')
) AS v(nombre, slug)
WHERE NOT EXISTS (
  SELECT 1 FROM joyeriaartesanos.modulos m WHERE m.slug = v.slug
);

-- 4. Habilitar los módulos a nivel empresa (idempotente).
INSERT INTO joyeriaartesanos.empresa_modulos (empresa_id, modulo_id, activo)
SELECT e.id, m.id, true
FROM joyeriaartesanos.empresas e
CROSS JOIN joyeriaartesanos.modulos m
WHERE m.slug IN ('ventas', 'inventario', 'consulta', 'clientes')
  AND NOT EXISTS (
    SELECT 1 FROM joyeriaartesanos.empresa_modulos em
    WHERE em.empresa_id = e.id AND em.modulo_id = m.id
  );

-- 5. Reasignar SOLO esos 4 módulos al usuario sucursal2.
DELETE FROM joyeriaartesanos.usuario_modulos
 WHERE usuario_id IN (
   SELECT id FROM joyeriaartesanos.usuarios WHERE email = 'sucursal2@joyeriaartesanos.com'
 );

INSERT INTO joyeriaartesanos.usuario_modulos (usuario_id, modulo_id)
SELECT u.id, m.id
FROM joyeriaartesanos.usuarios u
JOIN joyeriaartesanos.modulos m ON m.slug IN ('ventas', 'inventario', 'consulta', 'clientes')
WHERE u.email = 'sucursal2@joyeriaartesanos.com';

COMMIT;
