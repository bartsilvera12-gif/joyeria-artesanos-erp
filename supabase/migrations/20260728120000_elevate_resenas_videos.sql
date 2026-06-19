-- =============================================================================
-- Elevate · Videos de reseñas (testimonios) para la web pública
--
-- Estructura para que la empresa Elevate cargue hasta 4 videos de reseñas
-- desde el ERP y los muestre como cards en la home pública
-- (perfumeriaelevate.com). Reemplaza los testimonios estáticos de texto.
--
-- Alcance:
--   - Tabla elevate.resenas_videos (solo schema elevate).
--   - Bucket Storage `resenas-videos` (público, para reproducción directa
--     desde la web sin firmas SSR).
--   - Policies de Storage para uploads/borrado autenticados.
--   - Trigger que impide tener más de 4 videos visibles+activos por empresa.
--   - RLS + grants ANON SELECT por columnas seguras (para /api/public/...).
--
-- No toca: productos, ventas, pedidos_web, stock, marcas, ningún otro módulo.
-- Idempotente: IF NOT EXISTS + DROP POLICY IF EXISTS + ON CONFLICT.
-- =============================================================================

BEGIN;

-- ── Tabla ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS elevate.resenas_videos (
  id              uuid         PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  empresa_id      uuid         NOT NULL REFERENCES elevate.empresas(id) ON DELETE CASCADE,
  titulo          text,
  descripcion     text,
  video_path      text         NOT NULL,
  video_url       text         NOT NULL,
  poster_path     text,
  poster_url      text,
  orden           int          NOT NULL DEFAULT 0,
  visible_web     boolean      NOT NULL DEFAULT true,
  activo          boolean      NOT NULL DEFAULT true,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT resenas_videos_orden_range CHECK (orden >= 0 AND orden <= 3)
);

COMMENT ON TABLE elevate.resenas_videos IS
  'Hasta 4 videos de reseñas por empresa, mostrados en la home pública Elevate.';

CREATE INDEX IF NOT EXISTS idx_resenas_videos_empresa_orden
  ON elevate.resenas_videos (empresa_id, orden ASC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_resenas_videos_visible
  ON elevate.resenas_videos (empresa_id)
  WHERE activo = true AND visible_web = true;

-- ── Trigger: máx 4 videos visibles+activos por empresa ──────────────────────
CREATE OR REPLACE FUNCTION elevate._rv_limite_4()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_count int;
BEGIN
  -- Solo se cuenta cuando la nueva fila queda visible+activa.
  IF NEW.activo = true AND NEW.visible_web = true THEN
    SELECT COUNT(*) INTO v_count
      FROM elevate.resenas_videos
     WHERE empresa_id = NEW.empresa_id
       AND activo = true
       AND visible_web = true
       AND (TG_OP = 'INSERT' OR id <> NEW.id);
    IF v_count >= 4 THEN
      RAISE EXCEPTION 'No se pueden tener más de 4 videos de reseñas visibles por empresa';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rv_limite_4 ON elevate.resenas_videos;
CREATE TRIGGER trg_rv_limite_4
  BEFORE INSERT OR UPDATE OF activo, visible_web ON elevate.resenas_videos
  FOR EACH ROW
  EXECUTE FUNCTION elevate._rv_limite_4();

-- ── Trigger: mantener updated_at ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION elevate._rv_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rv_updated_at ON elevate.resenas_videos;
CREATE TRIGGER trg_rv_updated_at
  BEFORE UPDATE ON elevate.resenas_videos
  FOR EACH ROW
  EXECUTE FUNCTION elevate._rv_set_updated_at();

-- ── Grants ──────────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA elevate TO anon, authenticated;

-- anon: solo columnas seguras para la home pública. NO empresa_id, NO timestamps,
-- NO paths internos del bucket.
GRANT SELECT
  (id, titulo, descripcion, video_url, poster_url, orden)
  ON elevate.resenas_videos
  TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON elevate.resenas_videos TO authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE elevate.resenas_videos ENABLE ROW LEVEL SECURITY;

-- anon: solo videos visibles+activos. La home pública pasa por esta policy.
DROP POLICY IF EXISTS resenas_videos_select_anon ON elevate.resenas_videos;
CREATE POLICY resenas_videos_select_anon
  ON elevate.resenas_videos
  FOR SELECT
  TO anon
  USING (activo = true AND visible_web = true);

DROP POLICY IF EXISTS resenas_videos_select_authenticated ON elevate.resenas_videos;
CREATE POLICY resenas_videos_select_authenticated
  ON elevate.resenas_videos
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS resenas_videos_insert_authenticated ON elevate.resenas_videos;
CREATE POLICY resenas_videos_insert_authenticated
  ON elevate.resenas_videos
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS resenas_videos_update_authenticated ON elevate.resenas_videos;
CREATE POLICY resenas_videos_update_authenticated
  ON elevate.resenas_videos
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS resenas_videos_delete_authenticated ON elevate.resenas_videos;
CREATE POLICY resenas_videos_delete_authenticated
  ON elevate.resenas_videos
  FOR DELETE
  TO authenticated
  USING (true);

-- ── Storage: bucket público `resenas-videos` ────────────────────────────────
-- 100 MB por archivo. mp4 + webm soportados nativamente por <video> en
-- navegadores modernos. MOV/quicktime queda fuera (uso reportado: el usuario
-- debe convertir antes de subir; mp4 cubre el caso iPhone con conversión web).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'resenas-videos',
  'resenas-videos',
  true,
  104857600,
  ARRAY['video/mp4', 'video/webm']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── Storage policies ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS resenas_videos_authenticated_select ON storage.objects;
CREATE POLICY resenas_videos_authenticated_select
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'resenas-videos');

DROP POLICY IF EXISTS resenas_videos_authenticated_insert ON storage.objects;
CREATE POLICY resenas_videos_authenticated_insert
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'resenas-videos');

DROP POLICY IF EXISTS resenas_videos_authenticated_update ON storage.objects;
CREATE POLICY resenas_videos_authenticated_update
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'resenas-videos')
  WITH CHECK (bucket_id = 'resenas-videos');

DROP POLICY IF EXISTS resenas_videos_authenticated_delete ON storage.objects;
CREATE POLICY resenas_videos_authenticated_delete
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'resenas-videos');

-- anon SELECT: el bucket es público, el endpoint público no necesita firma.
-- Policy explícita defensiva por si flippean public en el futuro.
DROP POLICY IF EXISTS resenas_videos_anon_select ON storage.objects;
CREATE POLICY resenas_videos_anon_select
  ON storage.objects FOR SELECT
  TO anon
  USING (bucket_id = 'resenas-videos');

COMMIT;
