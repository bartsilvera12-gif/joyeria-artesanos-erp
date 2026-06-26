-- Agrega el módulo `clientes` al usuario sucursal2@joyeriaartesanos.com.
--
-- A pedido: la sucursal 2 debe operar con caja (ventas), inventario,
-- consulta y clientes. La página web pública NO se administra desde acá:
-- el guard de WEB_ONLY_FIELDS en /api/productos y /api/productos/[id] ya
-- lo bloquea a nivel API, y el sidebar oculta los módulos web/admin
-- porque no están en su `usuario_modulos`.

BEGIN;

-- 1. Asegurar slug 'clientes' en catálogo de módulos (idempotente).
INSERT INTO joyeriaartesanos.modulos (nombre, slug)
SELECT 'Clientes', 'clientes'
WHERE NOT EXISTS (
  SELECT 1 FROM joyeriaartesanos.modulos WHERE slug = 'clientes'
);

-- 2. Habilitar el módulo a nivel empresa (idempotente).
INSERT INTO joyeriaartesanos.empresa_modulos (empresa_id, modulo_id, activo)
SELECT e.id, m.id, true
FROM joyeriaartesanos.empresas e
CROSS JOIN joyeriaartesanos.modulos m
WHERE m.slug = 'clientes'
  AND NOT EXISTS (
    SELECT 1 FROM joyeriaartesanos.empresa_modulos em
    WHERE em.empresa_id = e.id AND em.modulo_id = m.id
  );

-- 3. Asignar el módulo al usuario sucursal2 si no lo tiene.
INSERT INTO joyeriaartesanos.usuario_modulos (usuario_id, modulo_id)
SELECT u.id, m.id
FROM joyeriaartesanos.usuarios u
JOIN joyeriaartesanos.modulos m ON m.slug = 'clientes'
WHERE u.email = 'sucursal2@joyeriaartesanos.com'
  AND NOT EXISTS (
    SELECT 1 FROM joyeriaartesanos.usuario_modulos um
    WHERE um.usuario_id = u.id AND um.modulo_id = m.id
  );

COMMIT;
