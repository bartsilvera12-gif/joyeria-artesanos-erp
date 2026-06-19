-- =============================================================================
-- Elevate · Reseñas videos · ampliar a 200 MB y aceptar MOV
--
-- Pequeño ajuste al bucket creado en 20260728120000_elevate_resenas_videos.sql:
--   - file_size_limit: 100 MB → 200 MB
--   - allowed_mime_types: + video/quicktime (.mov)
--
-- Nota de compatibilidad: MOV reproduce nativo en Safari; en Chrome/Edge solo
-- los MOV cuyo contenedor lleva H.264 (común en iPhone moderno) reproducen
-- correctamente; Firefox no reproduce MOV. Por eso la UI sigue recomendando
-- MP4 como formato más compatible. MOV se acepta para evitar conversión previa.
--
-- Solo bucket resenas-videos. No toca otros buckets, schemas ni clientes.
-- Idempotente: ON CONFLICT DO UPDATE.
-- =============================================================================

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'resenas-videos',
  'resenas-videos',
  true,
  209715200,
  ARRAY['video/mp4', 'video/webm', 'video/quicktime']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMIT;
