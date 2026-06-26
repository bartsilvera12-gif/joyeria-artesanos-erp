-- Sucursales para Joyería Artesanos.
--
-- PR 1: solo agrega tablas/columnas y backfill. NO cambia lógica de
-- ventas/caja/web — esos siguen leyendo productos.stock_actual como hoy.
-- PR 2 va a:
--   * Hacer que ventas/caja descuenten producto_stock_sucursal por sucursal.
--   * Filtrar la web pública por sucursal principal.
--   * UI de inventario con dos columnas (Principal / Sucursal 2).

BEGIN;

-- 1. Tabla de sucursales (catálogo, dentro de la misma empresa).
CREATE TABLE IF NOT EXISTS joyeriaartesanos.sucursales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES joyeriaartesanos.empresas(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  slug text NOT NULL,
  es_principal boolean NOT NULL DEFAULT false,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, slug)
);

-- Solo una sucursal principal por empresa.
CREATE UNIQUE INDEX IF NOT EXISTS sucursales_una_principal_por_empresa
  ON joyeriaartesanos.sucursales (empresa_id)
  WHERE es_principal;

-- 2. Seed: para cada empresa existente, crear "Principal" + "Sucursal 2".
-- En el modelo de Joyería Artesanos hay una sola empresa, pero esto es seguro.
INSERT INTO joyeriaartesanos.sucursales (empresa_id, nombre, slug, es_principal)
SELECT e.id, 'Principal', 'principal', true
FROM joyeriaartesanos.empresas e
WHERE NOT EXISTS (
  SELECT 1 FROM joyeriaartesanos.sucursales s
  WHERE s.empresa_id = e.id AND s.slug = 'principal'
);

INSERT INTO joyeriaartesanos.sucursales (empresa_id, nombre, slug, es_principal)
SELECT e.id, 'Sucursal 2', 'sucursal-2', false
FROM joyeriaartesanos.empresas e
WHERE NOT EXISTS (
  SELECT 1 FROM joyeriaartesanos.sucursales s
  WHERE s.empresa_id = e.id AND s.slug = 'sucursal-2'
);

-- 3. Stock por sucursal. Mantiene productos.stock_actual como agregado
-- legado hasta que PR 2 cambie las lecturas.
CREATE TABLE IF NOT EXISTS joyeriaartesanos.producto_stock_sucursal (
  producto_id uuid NOT NULL REFERENCES joyeriaartesanos.productos(id) ON DELETE CASCADE,
  sucursal_id uuid NOT NULL REFERENCES joyeriaartesanos.sucursales(id) ON DELETE CASCADE,
  stock_actual numeric NOT NULL DEFAULT 0,
  stock_minimo numeric,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (producto_id, sucursal_id)
);

CREATE INDEX IF NOT EXISTS pss_sucursal_idx
  ON joyeriaartesanos.producto_stock_sucursal (sucursal_id);

-- 4. Backfill: todo el stock actual va a "Principal", "Sucursal 2" arranca en 0.
INSERT INTO joyeriaartesanos.producto_stock_sucursal (producto_id, sucursal_id, stock_actual, stock_minimo)
SELECT p.id, s.id, p.stock_actual, p.stock_minimo
FROM joyeriaartesanos.productos p
JOIN joyeriaartesanos.sucursales s
  ON s.empresa_id = p.empresa_id AND s.slug = 'principal'
ON CONFLICT (producto_id, sucursal_id) DO NOTHING;

INSERT INTO joyeriaartesanos.producto_stock_sucursal (producto_id, sucursal_id, stock_actual, stock_minimo)
SELECT p.id, s.id, 0, p.stock_minimo
FROM joyeriaartesanos.productos p
JOIN joyeriaartesanos.sucursales s
  ON s.empresa_id = p.empresa_id AND s.slug = 'sucursal-2'
ON CONFLICT (producto_id, sucursal_id) DO NOTHING;

-- 5. Vínculo usuario → sucursal (NULL = ve todas las sucursales, p.ej. admin).
ALTER TABLE joyeriaartesanos.usuarios
  ADD COLUMN IF NOT EXISTS sucursal_id uuid
  REFERENCES joyeriaartesanos.sucursales(id) ON DELETE SET NULL;

-- Asignar sucursal2@joyeriaartesanos.com a "Sucursal 2" (si ya existe).
UPDATE joyeriaartesanos.usuarios u
SET sucursal_id = s.id
FROM joyeriaartesanos.sucursales s
WHERE u.email = 'sucursal2@joyeriaartesanos.com'
  AND s.empresa_id = u.empresa_id
  AND s.slug = 'sucursal-2'
  AND u.sucursal_id IS NULL;

-- 6. Cajas y ventas: trazar en qué sucursal ocurrieron.
ALTER TABLE joyeriaartesanos.cajas
  ADD COLUMN IF NOT EXISTS sucursal_id uuid
  REFERENCES joyeriaartesanos.sucursales(id);

ALTER TABLE joyeriaartesanos.ventas
  ADD COLUMN IF NOT EXISTS sucursal_id uuid
  REFERENCES joyeriaartesanos.sucursales(id);

-- Backfill: cajas y ventas existentes quedan en "Principal".
UPDATE joyeriaartesanos.cajas c
SET sucursal_id = s.id
FROM joyeriaartesanos.sucursales s
WHERE c.sucursal_id IS NULL
  AND s.empresa_id = c.empresa_id
  AND s.es_principal;

UPDATE joyeriaartesanos.ventas v
SET sucursal_id = s.id
FROM joyeriaartesanos.sucursales s
WHERE v.sucursal_id IS NULL
  AND s.empresa_id = v.empresa_id
  AND s.es_principal;

COMMIT;
