-- PR 2 paso 8: módulos visibles para sucursal2@joyeriaartesanos.com.
--
-- Sucursal2 sólo debe ver en su sidebar: Caja (ventas), Inventario y Consulta.
-- Para que el ítem "Consulta" se renderice, el slug debe existir en `modulos`
-- y figurar en `empresa_modulos` + `usuario_modulos`.

BEGIN;

-- 1. Asegurar slug 'consulta' en catálogo de módulos (idempotente).
INSERT INTO joyeriaartesanos.modulos (nombre, slug)
SELECT 'Consulta', 'consulta'
WHERE NOT EXISTS (
  SELECT 1 FROM joyeriaartesanos.modulos WHERE slug = 'consulta'
);

-- 2. Habilitar los 3 módulos a nivel empresa (idempotente).
INSERT INTO joyeriaartesanos.empresa_modulos (empresa_id, modulo_id, activo)
SELECT e.id, m.id, true
FROM joyeriaartesanos.empresas e
CROSS JOIN joyeriaartesanos.modulos m
WHERE m.slug IN ('ventas', 'inventario', 'consulta')
  AND NOT EXISTS (
    SELECT 1 FROM joyeriaartesanos.empresa_modulos em
    WHERE em.empresa_id = e.id AND em.modulo_id = m.id
  );

-- 3. Borrar cualquier asignación previa de módulos a sucursal2@ (limpiar antes
-- de reasignar, así si tenía permisos extra quedan al ras).
DELETE FROM joyeriaartesanos.usuario_modulos
WHERE usuario_id IN (
  SELECT id FROM joyeriaartesanos.usuarios WHERE email = 'sucursal2@joyeriaartesanos.com'
);

-- 4. Asignar SOLO los 3 módulos al usuario sucursal2.
INSERT INTO joyeriaartesanos.usuario_modulos (usuario_id, modulo_id)
SELECT u.id, m.id
FROM joyeriaartesanos.usuarios u
JOIN joyeriaartesanos.modulos m ON m.slug IN ('ventas', 'inventario', 'consulta')
WHERE u.email = 'sucursal2@joyeriaartesanos.com';

COMMIT;
