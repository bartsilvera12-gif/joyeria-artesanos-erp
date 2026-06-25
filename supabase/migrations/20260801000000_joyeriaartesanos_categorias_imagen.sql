-- =============================================================================
-- Agrega imagen_path / imagen_url a joyeriaartesanos.categorias_productos.
--
-- Para que la web pueda mostrar la foto de cada categoría (Anillos, Cadenas,
-- etc.) y el ERP la pueda editar desde /inventario/categorias.
--
-- Reusa el bucket `productos-imagenes` con sub-prefijo `categorias/`:
--   Path: {empresa_id}/categorias/{categoria_id}/principal.{ext}
-- =============================================================================

BEGIN;

ALTER TABLE joyeriaartesanos.categorias_productos
  ADD COLUMN IF NOT EXISTS imagen_path text,
  ADD COLUMN IF NOT EXISTS imagen_url text;

COMMENT ON COLUMN joyeriaartesanos.categorias_productos.imagen_path IS
  'Path en bucket productos-imagenes: {empresa_id}/categorias/{id}/principal.{ext}';
COMMENT ON COLUMN joyeriaartesanos.categorias_productos.imagen_url IS
  'URL pública snapshot de imagen_path. Se recalcula al subir/borrar.';

COMMIT;
