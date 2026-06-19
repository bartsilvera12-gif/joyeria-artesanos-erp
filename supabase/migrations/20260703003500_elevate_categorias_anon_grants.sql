-- Elevate · Grants públicos para categorias_productos
--
-- El endpoint público /api/public/elevate/categorias y el embed
-- categoria:categoria_principal_id(...) en el listado/detalle de productos
-- usan el rol `anon` de PostgREST. Sin grants explícitos, anon recibe
-- 42501 "permission denied for table categorias_productos".
--
-- Solo se exponen columnas seguras del catálogo público:
--   id, nombre, slug_web, visible_web, orden_web, descripcion_web, activo
-- NO se exponen: empresa_id, codigo, descripcion (interna), parent_id,
--   created_at, updated_at.
--
-- Idempotente. Solo schema elevate.

BEGIN;

GRANT USAGE ON SCHEMA elevate TO anon;

GRANT SELECT
  (id, nombre, slug_web, visible_web, orden_web, descripcion_web, activo)
  ON elevate.categorias_productos
  TO anon;

-- Para que el embed `categoria:categoria_principal_id(...)` en el listado/
-- detalle público de productos funcione, anon necesita leer la columna FK.
GRANT SELECT (categoria_principal_id) ON elevate.productos TO anon;

COMMIT;
