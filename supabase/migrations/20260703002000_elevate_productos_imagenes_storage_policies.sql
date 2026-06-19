-- =============================================================================
-- Elevate · Storage policies para bucket productos-imagenes
--
-- Permite que usuarios autenticados (rol `authenticated` de Supabase Auth)
-- suban, lean, actualicen y borren objetos en el bucket productos-imagenes.
--
-- Por qué: el runtime Hostinger del ERP tiene una SUPABASE_SERVICE_ROLE_KEY
-- desfasada respecto al JWT_SECRET de los containers Supabase de la VPS, así
-- que las llamadas a Storage con service_role fallan con
--   "signature verification failed".
-- Solución: hacer las operaciones de Storage con el JWT del usuario logueado.
-- El JWT del usuario sí pasa verificación porque Supabase Auth lo emite con
-- el JWT_SECRET correcto.
--
-- Idempotente: DROP POLICY IF EXISTS antes de CREATE.
-- Solo storage.objects, solo bucket productos-imagenes. No toca otros buckets.
-- =============================================================================

BEGIN;

-- Lectura: ya el bucket es public=true, pero la policy queda explícita por
-- si alguna config futura flipea public a false sin previo aviso.
DROP POLICY IF EXISTS productos_imagenes_authenticated_select ON storage.objects;
CREATE POLICY productos_imagenes_authenticated_select
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'productos-imagenes');

DROP POLICY IF EXISTS productos_imagenes_authenticated_insert ON storage.objects;
CREATE POLICY productos_imagenes_authenticated_insert
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'productos-imagenes');

DROP POLICY IF EXISTS productos_imagenes_authenticated_update ON storage.objects;
CREATE POLICY productos_imagenes_authenticated_update
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'productos-imagenes')
  WITH CHECK (bucket_id = 'productos-imagenes');

DROP POLICY IF EXISTS productos_imagenes_authenticated_delete ON storage.objects;
CREATE POLICY productos_imagenes_authenticated_delete
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'productos-imagenes');

COMMIT;
